# VerseVibe 웹 프로토타입 설계

**작성일**: 2025-02-09

---

## 1. 개요

실시간 음악 인식 + 싱크 가사 표시 웹 앱 프로토타입

### 목표
- 마이크로 주변 음악 인식
- 실시간 싱크 가사 표시 (연속 인식 방식)
- 모바일 브라우저 지원 (반응형)

---

## 2. 아키텍처

```
┌─────────────────────────────────────────────────────────┐
│                      브라우저 (Frontend)                  │
│  ┌─────────────┐   ┌─────────────┐   ┌───────────────┐  │
│  │ 마이크 녹음  │ → │  오디오 전송  │ → │ 가사 실시간 표시 │  │
│  └─────────────┘   └─────────────┘   └───────────────┘  │
└────────────────────────┬────────────────────────────────┘
                         │ WebSocket
                         ▼
┌─────────────────────────────────────────────────────────┐
│                    서버 (Backend - Python)               │
│  ┌─────────────┐   ┌─────────────┐   ┌───────────────┐  │
│  │  shazamio   │ → │ LRCLIB API  │ → │  가사 반환     │  │
│  │  음악 인식   │   │ 싱크가사 조회 │   │  (LRC 파싱)   │  │
│  └─────────────┘   └─────────────┘   └───────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## 3. 연속 인식 방식

### 동작 흐름

1. 최초 5초 녹음 → 곡 인식 + 가사 조회
2. 5초마다 오디오 전송 → 현재 위치(offset) 감지
3. 위치 기반으로 가사 하이라이트 업데이트
4. 인식 사이 구간은 로컬 타이머로 보간

### 시퀀스

```
Browser                          Server                    External
   │                               │                          │
   │──── WebSocket 연결 ──────────▶│                          │
   │──── audio (5초) ─────────────▶│───── shazamio ──────────▶│
   │                               │◀──── 곡 + offset ────────│
   │                               │───── LRCLIB ────────────▶│
   │◀─── recognized + lyrics ──────│◀──── 싱크 가사 ───────────│
   │                               │                          │
   │     [5초마다 반복]             │                          │
   │──── audio (5초) ─────────────▶│───── shazamio ──────────▶│
   │◀─── position: offset ─────────│◀──── offset ─────────────│
```

---

## 4. 기술 스택

| 영역 | 기술 | 선택 이유 |
|------|------|----------|
| Frontend | Vanilla JS + HTML/CSS | 빠른 프로토타입, 의존성 최소화 |
| Backend | FastAPI (Python) | 비동기 지원, shazamio 호환 |
| 통신 | WebSocket | 실시간 양방향 통신 |
| 음악 인식 | shazamio | 무료, Shazam 내부 API |
| 가사 조회 | LRCLIB + Netease | 무료, 한국곡 커버리지 |

---

## 5. 파일 구조

```
VerseVibe/
├── docs/
│   ├── 01_technical_review.md
│   ├── 02_tech_validation.md
│   └── plans/
│       └── 2025-02-09-prototype-design.md
├── backend/
│   ├── main.py              # FastAPI 서버 + WebSocket
│   ├── recognizer.py        # shazamio 음악 인식
│   ├── lyrics.py            # LRCLIB + Netease 가사 조회
│   ├── lrc_parser.py        # LRC 포맷 파싱
│   └── requirements.txt
├── frontend/
│   ├── index.html           # 메인 페이지
│   ├── style.css            # 스타일
│   └── app.js               # 마이크 녹음 + WebSocket + UI
└── tests/
    └── test_lyrics.py
```

---

## 6. API 프로토콜

### WebSocket 메시지

**클라이언트 → 서버**
```json
{
  "type": "audio",
  "data": "base64_encoded_audio_chunk"
}
```

**서버 → 클라이언트**
```json
// 곡 인식 완료
{
  "type": "recognized",
  "title": "APT.",
  "artist": "ROSÉ & Bruno Mars",
  "lyrics": [
    {"time": 0.35, "text": "채영이가 좋아하는 랜덤 게임"},
    {"time": 5.00, "text": "Game start"}
  ]
}

// 위치 업데이트
{
  "type": "position",
  "offset": 42.5
}

// 에러
{
  "type": "error",
  "message": "곡을 인식할 수 없습니다"
}
```

---

## 7. UI 화면

### 초기 화면
- 앱 로고/제목
- "인식 시작" 버튼

### 인식 중
- "듣는 중..." 표시
- 프로그레스 표시
- "취소" 버튼

### 가사 표시
- 곡 제목 + 아티스트
- 🔴 LIVE 표시
- 가사 목록 (현재 라인 하이라이트)
- 자동 스크롤
- "중지" 버튼

---

## 8. 구현 우선순위

1. **Phase 1**: Backend 기본 구조 (FastAPI + WebSocket)
2. **Phase 2**: 음악 인식 모듈 (shazamio 연동)
3. **Phase 3**: 가사 조회 모듈 (LRCLIB + Netease + LRC 파싱)
4. **Phase 4**: Frontend UI (마이크 녹음 + 가사 표시)
5. **Phase 5**: 연속 인식 + 실시간 싱크
6. **Phase 6**: 모바일 최적화 + 테스트

---

## 9. 향후 고려사항

- HTTPS 배포 (마이크 권한 필수)
- 오프라인 캐싱 (PWA)
- 다크 모드
- 가사 번역 기능
