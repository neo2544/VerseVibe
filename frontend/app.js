/**
 * VerseVibe - 실시간 싱크 가사 앱
 */

class VerseVibe {
    constructor() {
        // 상태
        this.ws = null;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.isRecording = false;
        this.lyrics = [];
        this.currentOffset = 0;
        this.offsetTimer = null;
        this.recordingInterval = null;
        this.attemptCount = 0;
        this.whisperEnabled = false;

        // 싱크 보정
        this.syncAdjust = 0; // 사용자 수동 보정값 (초)

        // 곡 고정
        this.songLocked = false;

        // 자동 스크롤 제어
        this.userScrolling = false;
        this._userScrollTimeout = null;

        // 인식 일시정지
        this.paused = false;

        // WebSocket 재연결
        this.wsReconnectAttempts = 0;
        this.wsMaxReconnectAttempts = 3;
        this.wsReconnecting = false;

        // 오디오 시각화
        this.audioContext = null;
        this.analyser = null;
        this.animationId = null;

        // DOM 요소
        this.screens = {
            initial: document.getElementById('initial-screen'),
            listening: document.getElementById('listening-screen'),
            lyrics: document.getElementById('lyrics-screen'),
            error: document.getElementById('error-screen'),
            history: document.getElementById('history-screen')
        };

        this.elements = {
            startBtn: document.getElementById('start-btn'),
            cancelBtn: document.getElementById('cancel-btn'),
            stopBtn: document.getElementById('stop-btn'),
            retryBtn: document.getElementById('retry-btn'),
            retryErrorBtn: document.getElementById('retry-error-btn'),
            progressFill: document.getElementById('progress-fill'),
            songTitle: document.getElementById('song-title'),
            songArtist: document.getElementById('song-artist'),
            lyricsContainer: document.getElementById('lyrics-container'),
            errorMessage: document.getElementById('error-message'),
            listeningStatus: document.getElementById('listening-status'),
            attemptCount: document.getElementById('attempt-count'),
            waveform: document.getElementById('waveform'),
            whisperInfo: document.getElementById('whisper-info'),
            whisperStatus: document.getElementById('whisper-status'),
            whisperTranscription: document.getElementById('whisper-transcription'),
            whisperText: document.getElementById('whisper-text'),
            whisperToggle: document.getElementById('whisper-toggle'),
            whisperToggleDesc: document.getElementById('whisper-toggle-desc'),
            whisperToggleLyrics: document.getElementById('whisper-toggle-lyrics'),
            whisperToggleLyricsLabel: document.getElementById('whisper-toggle-lyrics-label'),
            whisperModeBadge: document.getElementById('whisper-mode-badge'),
            syncMinusBtn: document.getElementById('sync-minus-btn'),
            syncPlusBtn: document.getElementById('sync-plus-btn'),
            syncIndicator: document.getElementById('sync-indicator'),
            lockBtn: document.getElementById('lock-btn'),
            scrollToCurrentBtn: document.getElementById('scroll-to-current-btn'),
            pauseBtn: document.getElementById('pause-btn'),
            youtubeLink: document.getElementById('youtube-link'),
            songProgressBar: document.getElementById('song-progress-bar'),
            songProgressFill: document.getElementById('song-progress-fill'),
            songCandidateToast: document.getElementById('song-candidate-toast'),
            toastText: document.getElementById('toast-text'),
            historyBtn: document.getElementById('history-btn'),
            historyBackBtn: document.getElementById('history-back-btn'),
            historyClearBtn: document.getElementById('history-clear-btn'),
            historyList: document.getElementById('history-list'),
            historyEmpty: document.getElementById('history-empty')
        };

        // 히스토리 중복 방지
        this._lastRecordedSongKey = null;

        this.init();
    }

    init() {
        // 이벤트 리스너 등록
        this.elements.startBtn.addEventListener('click', () => this.startRecognition());
        this.elements.cancelBtn.addEventListener('click', () => this.stopRecognition());
        this.elements.stopBtn.addEventListener('click', () => this.stopRecognition());
        this.elements.retryBtn.addEventListener('click', () => this.startRecognition());
        this.elements.retryErrorBtn.addEventListener('click', () => this.startRecognition());

        // Whisper 토글 이벤트
        this.elements.whisperToggle.addEventListener('change', (e) => {
            this.setWhisperEnabled(e.target.checked);
        });
        if (this.elements.whisperToggleLyrics) {
            this.elements.whisperToggleLyrics.addEventListener('change', (e) => {
                this.setWhisperEnabled(e.target.checked);
            });
        }

        // 싱크 보정 버튼
        this.elements.syncMinusBtn.addEventListener('click', () => this.adjustSync(-0.5));
        this.elements.syncPlusBtn.addEventListener('click', () => this.adjustSync(0.5));

        // 곡 고정 버튼
        this.elements.lockBtn.addEventListener('click', () => this.toggleSongLock());

        // 가사 스크롤 감지 — 사용자가 직접 스크롤하면 자동 스크롤 일시정지
        this.elements.lyricsContainer.addEventListener('touchstart', () => this.onUserScroll(), { passive: true });
        this.elements.lyricsContainer.addEventListener('mousedown', () => this.onUserScroll());
        this.elements.lyricsContainer.addEventListener('wheel', () => this.onUserScroll(), { passive: true });

        // "현재 가사로" 버튼
        this.elements.scrollToCurrentBtn.addEventListener('click', () => this.resumeAutoScroll());

        // 인식 일시정지/재개 버튼
        this.elements.pauseBtn.addEventListener('click', () => this.togglePause());

        // 히스토리 버튼
        this.elements.historyBtn.addEventListener('click', () => this.showHistory());
        this.elements.historyBackBtn.addEventListener('click', () => this.showScreen('initial'));
        this.elements.historyClearBtn.addEventListener('click', () => this.clearHistory());
    }

    setWhisperEnabled(enabled) {
        this.whisperEnabled = enabled;

        // 초기 화면 토글 동기화
        this.elements.whisperToggle.checked = enabled;
        this.elements.whisperToggleDesc.textContent = enabled
            ? 'ON - Shazam + Whisper 폴백 (넓은 커버리지)'
            : 'OFF - Shazam만 사용 (빠름)';

        // 가사 화면 토글 동기화
        if (this.elements.whisperToggleLyrics) {
            this.elements.whisperToggleLyrics.checked = enabled;
        }
        if (this.elements.whisperToggleLyricsLabel) {
            this.elements.whisperToggleLyricsLabel.textContent = enabled
                ? 'Whisper ON'
                : 'Whisper OFF';
        }

        // 인식 중 화면 배지
        if (this.elements.whisperModeBadge) {
            this.elements.whisperModeBadge.style.display = enabled ? 'inline-flex' : 'none';
        }

        // 녹음 중이면 다음 사이클부터 반영
        if (this.isRecording) {
            this.recordingDuration = enabled ? 15000 : 10000;
        }
    }

    showScreen(screenName) {
        Object.values(this.screens).forEach(screen => {
            screen.classList.remove('active');
        });
        this.screens[screenName].classList.add('active');
    }

    async startRecognition() {
        try {
            // 상태 초기화
            this.attemptCount = 0;
            if (this.elements.attemptCount) {
                this.elements.attemptCount.textContent = '';
            }
            if (this.elements.listeningStatus) {
                this.elements.listeningStatus.textContent = '듣는 중...';
            }
            this.resetWhisperInfo();

            // 마이크 권한 요청
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            // WebSocket 연결
            this.connectWebSocket();

            // 녹음 시작
            this.startRecording(stream);

            this.showScreen('listening');
        } catch (error) {
            console.error('마이크 접근 실패:', error);
            this.showError('마이크 접근 권한이 필요합니다.');
        }
    }

    connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;

        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            console.log('WebSocket 연결됨');
            if (this.wsReconnecting) {
                this.wsReconnecting = false;
                this.wsReconnectAttempts = 0;
                this.showCandidateToast('서버 재연결 성공');
            }
        };

        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.handleServerMessage(data);
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket 오류:', error);
        };

        this.ws.onclose = () => {
            console.log('WebSocket 연결 종료');
            // 인식 중이었으면 재연결 시도
            if (this.isRecording && !this.paused) {
                this.attemptReconnect();
            }
        };
    }

    attemptReconnect() {
        if (this.wsReconnectAttempts >= this.wsMaxReconnectAttempts) {
            this.showError('서버 연결이 끊어졌습니다. 다시 시도해주세요.');
            return;
        }

        this.wsReconnecting = true;
        this.wsReconnectAttempts++;
        const delay = Math.pow(2, this.wsReconnectAttempts) * 1000; // 2s, 4s, 8s

        console.log(`WebSocket 재연결 시도 ${this.wsReconnectAttempts}/${this.wsMaxReconnectAttempts} (${delay/1000}초 후)`);
        this.showCandidateToast(`재연결 중... (${this.wsReconnectAttempts}/${this.wsMaxReconnectAttempts})`);

        setTimeout(() => {
            if (this.isRecording) {
                this.connectWebSocket();
            }
        }, delay);
    }

    startRecording(stream) {
        this.isRecording = true;
        this.audioChunks = [];
        this.stream = stream;

        // 오디오 시각화 설정
        this.setupAudioVisualizer(stream);

        // MediaRecorder 설정
        this.mimeType = 'audio/webm;codecs=opus';
        if (!MediaRecorder.isTypeSupported(this.mimeType)) {
            this.mimeType = 'audio/webm';
        }

        // 녹음 사이클 시작 (Whisper OFF: 10초, ON: 15초)
        this.recordingDuration = this.whisperEnabled ? 15000 : 10000;
        this.songRecognized = false;
        this.startRecordingCycle();
    }

    startRecordingCycle() {
        if (!this.isRecording) return;

        this.audioChunks = [];
        this.cycleStartTime = Date.now();

        this.mediaRecorder = new MediaRecorder(this.stream, { mimeType: this.mimeType });

        this.mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                this.audioChunks.push(event.data);
            }
        };

        // stop() 호출 시: ondataavailable(마지막 데이터) → onstop 순서 보장
        this.mediaRecorder.onstop = () => {
            this.sendAudioChunk();
            if (this.isRecording) {
                this.startRecordingCycle();
            }
        };

        // 인자 없이 start → stop 시 한 덩어리로 완전한 WebM 생성
        this.mediaRecorder.start();

        // 프로그레스 바
        let progress = 0;
        const recordingDuration = this.recordingDuration;

        this.progressInterval = setInterval(() => {
            progress += 100;
            const percent = (progress / recordingDuration) * 100;
            this.elements.progressFill.style.width = `${Math.min(percent, 100)}%`;
        }, 100);

        // recordingDuration 후 녹음 중지 → onstop에서 전송 + 다음 사이클
        this.recordingTimeout = setTimeout(() => {
            clearInterval(this.progressInterval);
            this.elements.progressFill.style.width = '0%';
            if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
                this.mediaRecorder.stop();
            }
        }, recordingDuration);
    }

    async sendAudioChunk() {
        if (this.audioChunks.length === 0) return;

        // 완전한 WebM Blob 생성 (헤더 포함)
        const audioBlob = new Blob(this.audioChunks, { type: this.mimeType });
        this.audioChunks = [];
        console.log(`오디오 전송: ${audioBlob.size} bytes`);

        // Base64로 인코딩
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64data = reader.result.split(',')[1];

            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({
                    type: 'audio',
                    data: base64data,
                    whisper_enabled: this.whisperEnabled
                }));
            }
        };
        reader.readAsDataURL(audioBlob);
    }

    handleServerMessage(data) {
        console.log('서버 메시지:', data.type, data);

        switch (data.type) {
            case 'recognized':
                this.handleRecognized(data);
                break;
            case 'position':
                this.handlePositionUpdate(data);
                break;
            case 'song_candidate':
                this.handleSongCandidate(data);
                break;
            case 'retrying':
                // 재시도 중 - 상태 메시지 업데이트
                this.updateListeningStatus(data.message);
                break;
            case 'whisper_status':
                this.handleWhisperStatus(data);
                break;
            case 'whisper_transcription':
                this.handleWhisperTranscription(data);
                break;
            case 'error':
                // 가사가 이미 표시된 상태면 에러 무시
                if (this.lyrics.length > 0) {
                    console.log('에러 무시 (가사 표시 중):', data.message);
                } else {
                    this.showError(data.message);
                }
                break;
            case 'stopped':
                this.showScreen('initial');
                break;
        }
    }

    updateListeningStatus(message) {
        // 듣기 화면의 상태 메시지 업데이트
        this.attemptCount++;

        if (this.elements.listeningStatus) {
            this.elements.listeningStatus.textContent = message;
        }
        if (this.elements.attemptCount) {
            this.elements.attemptCount.textContent = `시도 ${this.attemptCount}회`;
        }
    }

    handleWhisperStatus(data) {
        console.log('Whisper 상태:', data.status, data.message);

        // Whisper 정보 영역 표시
        this.elements.whisperInfo.style.display = 'block';
        this.elements.whisperStatus.textContent = data.message;

        // 상태별 스타일 적용
        this.elements.whisperStatus.className = 'whisper-status';
        if (data.status === 'loading') {
            this.elements.whisperStatus.classList.add('loading');
        } else if (data.status === 'loaded') {
            this.elements.whisperStatus.classList.add('loaded');
        } else if (data.status === 'processing') {
            this.elements.whisperStatus.classList.add('processing');
        }

        // 듣기 화면 상태도 업데이트
        if (this.elements.listeningStatus) {
            this.elements.listeningStatus.textContent = data.message;
        }
    }

    handleWhisperTranscription(data) {
        console.log('Whisper 인식 텍스트:', data.text);

        // Whisper 인식 텍스트 표시
        this.elements.whisperInfo.style.display = 'block';
        this.elements.whisperTranscription.style.display = 'block';
        this.elements.whisperText.textContent = data.text;
    }

    resetWhisperInfo() {
        if (this.elements.whisperInfo) {
            this.elements.whisperInfo.style.display = 'none';
        }
        if (this.elements.whisperTranscription) {
            this.elements.whisperTranscription.style.display = 'none';
        }
        if (this.elements.whisperText) {
            this.elements.whisperText.textContent = '';
        }
        if (this.elements.whisperStatus) {
            this.elements.whisperStatus.textContent = '';
        }
    }

    handleRecognized(data) {
        console.log(`새 곡 인식: ${data.title} - ${data.artist} (offset: ${data.offset})`);

        const isNewSong = this.songRecognized && this.elements.songTitle.textContent !== data.title;

        // 인식 기록 저장
        this.recordSong(data.title, data.artist);

        // 곡 인식 후 위치 업데이트 간격을 늘림 (Shazam 호출 빈도 감소)
        if (!this.songRecognized) {
            this.songRecognized = true;
            this.recordingDuration = 20000; // 인식 후 20초 간격으로 위치 보정
        }

        // 싱크 보정값 리셋 (새 곡이면)
        if (isNewSong) {
            this.syncAdjust = 0;
        }

        const applyNewSong = () => {
            // 곡 정보 표시
            this.elements.songTitle.textContent = data.title;
            this.elements.songArtist.textContent = data.artist;

            // YouTube 검색 링크
            const query = encodeURIComponent(`${data.title} ${data.artist}`);
            this.elements.youtubeLink.href = `https://www.youtube.com/results?search_query=${query}`;
            this.elements.youtubeLink.style.display = 'inline-flex';

            // 가사 저장 및 표시
            this.lyrics = data.lyrics || [];
            this.renderLyrics();

            // 현재 위치 설정 (녹음~결과수신 지연 보정)
            const elapsed = this.cycleStartTime ? (Date.now() - this.cycleStartTime) / 1000 : 0;
            this.currentOffset = (data.offset || 0) + elapsed;
            console.log(`⏱️ 싱크 보정: offset ${data.offset?.toFixed(1)}s + 지연 ${elapsed.toFixed(1)}s = ${this.currentOffset.toFixed(1)}s`);
            this.startOffsetTimer();

            // 곡 변경 시 애니메이션 효과
            const songInfo = document.querySelector('.song-info');
            if (songInfo) {
                songInfo.classList.add('song-changed');
                setTimeout(() => songInfo.classList.remove('song-changed'), 500);
            }
        };

        if (isNewSong) {
            // 곡 전환 토스트
            this.showCandidateToast(`새로운 곡: ${data.title} - ${data.artist}`);

            // fade-out → 데이터 교체 → fade-in
            this.elements.lyricsContainer.classList.add('lyrics-fade-out');
            setTimeout(() => {
                applyNewSong();
                this.elements.lyricsContainer.classList.remove('lyrics-fade-out');
                this.elements.lyricsContainer.classList.add('lyrics-fade-in');
                setTimeout(() => {
                    this.elements.lyricsContainer.classList.remove('lyrics-fade-in');
                }, 300);
            }, 250);
        } else {
            applyNewSong();
        }

        this.showScreen('lyrics');
    }

    handlePositionUpdate(data) {
        // 서버에서 받은 위치로 보정 (녹음~결과수신 지연 보정)
        const elapsed = this.cycleStartTime ? (Date.now() - this.cycleStartTime) / 1000 : 0;
        this.currentOffset = data.offset + elapsed;
        console.log(`⏱️ 위치 보정: offset ${data.offset.toFixed(1)}s + 지연 ${elapsed.toFixed(1)}s = ${this.currentOffset.toFixed(1)}s`);
        this.updateCurrentLyric();
    }

    togglePause() {
        this.paused = !this.paused;

        if (this.paused) {
            // 마이크 녹음 중지 (타이머는 유지)
            if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
                this.mediaRecorder.onstop = null; // 다음 사이클 방지
                this.mediaRecorder.stop();
            }
            if (this.recordingTimeout) {
                clearTimeout(this.recordingTimeout);
            }
            if (this.progressInterval) {
                clearInterval(this.progressInterval);
            }
            if (this.stream) {
                this.stream.getTracks().forEach(track => track.stop());
            }

            this.elements.pauseBtn.textContent = '⏸ PAUSED';
            this.elements.pauseBtn.classList.add('paused');
        } else {
            // 녹음 재개
            this.resumeRecording();
            this.elements.pauseBtn.textContent = '🔴 LIVE';
            this.elements.pauseBtn.classList.remove('paused');
        }
    }

    async resumeRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.stream = stream;
            this.setupAudioVisualizer(stream);

            this.mimeType = 'audio/webm;codecs=opus';
            if (!MediaRecorder.isTypeSupported(this.mimeType)) {
                this.mimeType = 'audio/webm';
            }
            this.startRecordingCycle();
        } catch (error) {
            console.error('마이크 재연결 실패:', error);
        }
    }

    toggleSongLock() {
        this.songLocked = !this.songLocked;
        this.elements.lockBtn.textContent = this.songLocked ? '🔒' : '🔓';
        this.elements.lockBtn.classList.toggle('lock-active', this.songLocked);

        // 서버에 곡 고정 상태 전달
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'lock_song',
                locked: this.songLocked
            }));
        }
    }

    handleSongCandidate(data) {
        console.log(`곡 전환 후보: ${data.title} - ${data.artist}`);
        const msg = data.message ? `\n${data.message}` : '';
        this.showCandidateToast(`${data.title} - ${data.artist}${msg}`);
    }

    showCandidateToast(text) {
        const toast = this.elements.songCandidateToast;
        this.elements.toastText.textContent = text;
        toast.classList.add('show');

        clearTimeout(this._toastTimeout);
        this._toastTimeout = setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

    adjustSync(delta) {
        this.syncAdjust += delta;
        // 피드백 표시
        const sign = this.syncAdjust >= 0 ? '+' : '';
        this.elements.syncIndicator.textContent = `싱크 보정: ${sign}${this.syncAdjust.toFixed(1)}s`;
        // 즉시 가사 위치 반영
        this.updateCurrentLyric();
        // 3초 후 표시 숨김
        clearTimeout(this._syncIndicatorTimeout);
        this._syncIndicatorTimeout = setTimeout(() => {
            this.elements.syncIndicator.textContent = '';
        }, 3000);
    }

    renderLyrics() {
        this.elements.lyricsContainer.innerHTML = '';

        if (this.lyrics.length === 0) {
            this.elements.lyricsContainer.innerHTML =
                '<div class="no-lyrics-info">' +
                '<p class="no-lyrics-icon">🎶</p>' +
                '<p class="no-lyrics-text">싱크 가사를 찾을 수 없습니다</p>' +
                '<p class="no-lyrics-sub">곡 정보만 표시됩니다</p>' +
                '</div>';
            return;
        }

        // 상단 여백 (첫 가사가 중앙에 올 수 있도록)
        const topSpacer = document.createElement('div');
        topSpacer.className = 'lyrics-spacer';
        this.elements.lyricsContainer.appendChild(topSpacer);

        this.lyrics.forEach((lyric, index) => {
            const div = document.createElement('div');
            div.className = 'lyric-line';
            if (lyric.text === '♪') {
                div.classList.add('interlude');
            }
            div.textContent = lyric.text;
            div.dataset.index = index;
            div.dataset.time = lyric.time;
            this.elements.lyricsContainer.appendChild(div);
        });

        // 하단 여백 (마지막 가사가 중앙에 올 수 있도록)
        const bottomSpacer = document.createElement('div');
        bottomSpacer.className = 'lyrics-spacer';
        this.elements.lyricsContainer.appendChild(bottomSpacer);

        // 스페이서 높이를 컨테이너 높이의 절반으로 설정
        requestAnimationFrame(() => {
            const containerHeight = this.elements.lyricsContainer.clientHeight;
            const spacerHeight = containerHeight / 2;
            topSpacer.style.height = `${spacerHeight}px`;
            bottomSpacer.style.height = `${spacerHeight}px`;
        });
    }

    startOffsetTimer() {
        // 기존 타이머 정리
        if (this.offsetTimer) {
            clearInterval(this.offsetTimer);
        }

        // 100ms마다 offset 증가 및 가사 업데이트
        this.offsetTimer = setInterval(() => {
            this.currentOffset += 0.1;
            this.updateCurrentLyric();
        }, 100);
    }

    updateCurrentLyric() {
        const lines = this.elements.lyricsContainer.querySelectorAll('.lyric-line');

        let activeIndex = -1;

        // syncAdjust 적용한 보정 시간
        const adjustedOffset = this.currentOffset + this.syncAdjust;

        // 현재 시간에 해당하는 가사 찾기
        for (let i = 0; i < this.lyrics.length; i++) {
            if (this.lyrics[i].time <= adjustedOffset) {
                activeIndex = i;
            } else {
                break;
            }
        }

        // 스타일 업데이트
        lines.forEach((line, index) => {
            line.classList.remove('active', 'past');

            if (index === activeIndex) {
                line.classList.add('active');
                // 활성 가사로 스크롤
                this.scrollToLine(line);
            } else if (index < activeIndex) {
                line.classList.add('past');
            }
        });

        // 진행률 바 업데이트
        if (this.lyrics.length > 0) {
            const lastTime = this.lyrics[this.lyrics.length - 1].time;
            if (lastTime > 0) {
                const percent = Math.min((adjustedOffset / lastTime) * 100, 100);
                this.elements.songProgressFill.style.width = `${Math.max(percent, 0)}%`;
            }
        }
    }

    scrollToLine(element) {
        // 사용자가 스크롤 중이면 자동 스크롤 건너뛰기
        if (this.userScrolling) return;

        const container = this.elements.lyricsContainer;
        const containerHeight = container.clientHeight;
        const elementTop = element.offsetTop;
        const elementHeight = element.clientHeight;

        // 가사를 컨테이너 중앙에 위치
        const scrollPosition = elementTop - (containerHeight / 2) + (elementHeight / 2);

        container.scrollTo({
            top: scrollPosition,
            behavior: 'smooth'
        });
    }

    onUserScroll() {
        this.userScrolling = true;
        this.elements.scrollToCurrentBtn.classList.add('show');

        // 5초 후 자동 스크롤 복귀
        clearTimeout(this._userScrollTimeout);
        this._userScrollTimeout = setTimeout(() => {
            this.resumeAutoScroll();
        }, 5000);
    }

    resumeAutoScroll() {
        this.userScrolling = false;
        this.elements.scrollToCurrentBtn.classList.remove('show');
        clearTimeout(this._userScrollTimeout);

        // 즉시 현재 가사로 스크롤
        const activeLine = this.elements.lyricsContainer.querySelector('.lyric-line.active');
        if (activeLine) {
            this.scrollToLine(activeLine);
        }
    }

    setupAudioVisualizer(stream) {
        // AudioContext 생성
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.analyser = this.audioContext.createAnalyser();

        // 마이크 입력을 분석기에 연결
        const source = this.audioContext.createMediaStreamSource(stream);
        source.connect(this.analyser);

        // 분석기 설정
        this.analyser.fftSize = 256;

        // 시각화 시작
        this.drawWaveform();
    }

    drawWaveform() {
        if (!this.isRecording || !this.analyser) return;

        this.animationId = requestAnimationFrame(() => this.drawWaveform());

        const canvas = this.elements.waveform;
        const ctx = canvas.getContext('2d');
        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        this.analyser.getByteFrequencyData(dataArray);

        // 캔버스 크기 조정 (고해상도 지원)
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);

        const width = rect.width;
        const height = rect.height;

        // 배경 클리어
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, width, height);

        // 바 그리기
        const barCount = 40;
        const barWidth = (width / barCount) * 0.7;
        const gap = (width / barCount) * 0.3;
        const step = Math.floor(bufferLength / barCount);

        for (let i = 0; i < barCount; i++) {
            // 주파수 데이터에서 샘플링
            let sum = 0;
            for (let j = 0; j < step; j++) {
                sum += dataArray[i * step + j];
            }
            const average = sum / step;

            // 바 높이 계산 (최소 높이 보장)
            const barHeight = Math.max(3, (average / 255) * height * 0.8);

            // 그라데이션 색상
            const hue = 260 + (i / barCount) * 60; // 보라색 -> 청록색
            ctx.fillStyle = `hsl(${hue}, 70%, 60%)`;

            // 중앙 정렬로 바 그리기
            const x = i * (barWidth + gap) + gap / 2;
            const y = (height - barHeight) / 2;

            ctx.beginPath();
            ctx.roundRect(x, y, barWidth, barHeight, 2);
            ctx.fill();
        }
    }

    stopAudioVisualizer() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
        this.analyser = null;
    }

    stopRecognition() {
        this.isRecording = false;

        // 오디오 시각화 중지
        this.stopAudioVisualizer();

        // 녹음 중지
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.onstop = null; // 다음 사이클 방지
            this.mediaRecorder.stop();
        }
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }

        // 타이머 정리
        if (this.recordingTimeout) {
            clearTimeout(this.recordingTimeout);
        }
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
        }
        if (this.offsetTimer) {
            clearInterval(this.offsetTimer);
        }

        // WebSocket 종료
        if (this.ws) {
            this.ws.send(JSON.stringify({ type: 'stop' }));
            this.ws.close();
        }

        // 상태 초기화
        this.lyrics = [];
        this.currentOffset = 0;
        this.audioChunks = [];
        this.syncAdjust = 0;
        this.songLocked = false;
        this._lastRecordedSongKey = null;

        // 곡 고정 버튼 시각 상태 리셋
        this.elements.lockBtn.textContent = '🔓';
        this.elements.lockBtn.classList.remove('lock-active');

        // 자동 스크롤 상태 리셋
        this.userScrolling = false;
        this.elements.scrollToCurrentBtn.classList.remove('show');
        clearTimeout(this._userScrollTimeout);

        // 일시정지 상태 리셋
        this.paused = false;
        this.elements.pauseBtn.textContent = '🔴 LIVE';
        this.elements.pauseBtn.classList.remove('paused');

        // 재연결 상태 리셋
        this.wsReconnectAttempts = 0;
        this.wsReconnecting = false;

        this.showScreen('initial');
    }

    showError(message) {
        this.elements.errorMessage.textContent = message;
        this.stopRecognition();
        this.showScreen('error');
    }

    // --- 인식 기록 (History) ---

    loadHistory() {
        try {
            const raw = localStorage.getItem('versevibe_history');
            if (!raw) return { version: 1, songs: {} };
            const data = JSON.parse(raw);
            if (data && data.songs) return data;
            return { version: 1, songs: {} };
        } catch (e) {
            console.error('히스토리 로드 실패:', e);
            return { version: 1, songs: {} };
        }
    }

    saveHistory(data) {
        try {
            localStorage.setItem('versevibe_history', JSON.stringify(data));
        } catch (e) {
            console.error('히스토리 저장 실패:', e);
        }
    }

    recordSong(title, artist) {
        const songKey = `${title}|${artist}`;

        // 같은 세션 내 중복 카운트 방지
        if (this._lastRecordedSongKey === songKey) return;
        this._lastRecordedSongKey = songKey;

        const data = this.loadHistory();
        if (data.songs[songKey]) {
            data.songs[songKey].playCount++;
            data.songs[songKey].lastHeard = Date.now();
        } else {
            data.songs[songKey] = {
                title: title,
                artist: artist,
                playCount: 1,
                lastHeard: Date.now()
            };
        }
        this.saveHistory(data);
    }

    showHistory() {
        this.renderHistory();
        this.showScreen('history');
    }

    renderHistory() {
        const data = this.loadHistory();
        const songs = Object.values(data.songs);

        // lastHeard 내림차순 정렬
        songs.sort((a, b) => b.lastHeard - a.lastHeard);

        this.elements.historyList.innerHTML = '';

        if (songs.length === 0) {
            this.elements.historyList.style.display = 'none';
            this.elements.historyEmpty.style.display = 'flex';
            this.elements.historyClearBtn.style.display = 'none';
            return;
        }

        this.elements.historyList.style.display = 'flex';
        this.elements.historyEmpty.style.display = 'none';
        this.elements.historyClearBtn.style.display = '';

        songs.forEach(song => {
            const item = document.createElement('div');
            item.className = 'history-item';
            item.innerHTML = `
                <span class="history-item-icon">🎵</span>
                <div class="history-item-info">
                    <div class="history-item-title">${this.escapeHtml(song.title)}</div>
                    <div class="history-item-artist">${this.escapeHtml(song.artist)}</div>
                    <div class="history-item-time">${this.formatRelativeTime(song.lastHeard)}</div>
                </div>
                <span class="history-item-count">${song.playCount}회</span>
                <button class="history-item-delete" title="삭제">✕</button>
            `;

            // 아이템 탭 → 가사 보기
            item.querySelector('.history-item-info').addEventListener('click', () => {
                this.viewHistoryLyrics(song.title, song.artist);
            });

            // 삭제 버튼
            item.querySelector('.history-item-delete').addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteHistoryItem(song.title, song.artist);
            });

            this.elements.historyList.appendChild(item);
        });
    }

    async viewHistoryLyrics(title, artist) {
        try {
            const params = new URLSearchParams({ title, artist });
            const response = await fetch(`/api/lyrics?${params}`);
            if (!response.ok) throw new Error('가사 조회 실패');

            const data = await response.json();

            // 가사 화면에 표시 (싱크 없이 정적으로)
            this.elements.songTitle.textContent = data.title;
            this.elements.songArtist.textContent = data.artist;

            // YouTube 검색 링크
            const query = encodeURIComponent(`${data.title} ${data.artist}`);
            this.elements.youtubeLink.href = `https://www.youtube.com/results?search_query=${query}`;
            this.elements.youtubeLink.style.display = 'inline-flex';
            this.elements.pauseBtn.textContent = '📖 가사';
            this.elements.pauseBtn.classList.add('paused');

            this.lyrics = data.lyrics || [];
            this.renderLyrics();

            // 진행률 바 숨김
            this.elements.songProgressFill.style.width = '0%';

            this.showScreen('lyrics');
        } catch (error) {
            console.error('가사 조회 실패:', error);
        }
    }

    deleteHistoryItem(title, artist) {
        const songKey = `${title}|${artist}`;
        const data = this.loadHistory();
        delete data.songs[songKey];
        this.saveHistory(data);
        this.renderHistory();
    }

    clearHistory() {
        if (!confirm('인식 기록을 모두 삭제하시겠습니까?')) return;
        localStorage.removeItem('versevibe_history');
        this.renderHistory();
    }

    formatRelativeTime(ts) {
        const diff = Date.now() - ts;
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (seconds < 60) return '방금 전';
        if (minutes < 60) return `${minutes}분 전`;
        if (hours < 24) return `${hours}시간 전`;
        return `${days}일 전`;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// 앱 시작
document.addEventListener('DOMContentLoaded', () => {
    window.app = new VerseVibe();
});
