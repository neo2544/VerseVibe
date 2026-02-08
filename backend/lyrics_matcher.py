"""가사 매칭 모듈 - Whisper 음성인식 + 가사 텍스트 매칭"""
import whisper
import tempfile
import os
import subprocess
import requests
from typing import Optional, Dict, List, Tuple
from difflib import SequenceMatcher

# Whisper 모델 (lazy loading)
_whisper_model = None
_last_transcription = None


def is_model_loaded() -> bool:
    """Whisper 모델이 이미 로드되었는지 확인"""
    return _whisper_model is not None


def get_last_transcription() -> Optional[str]:
    """마지막 Whisper 인식 텍스트 반환"""
    return _last_transcription


def get_whisper_model():
    """Whisper 모델 로드 (최초 1회)"""
    global _whisper_model
    if _whisper_model is None:
        print("Whisper 모델 로딩 중 (small)...")
        _whisper_model = whisper.load_model("small")
        print("Whisper 모델 로드 완료")
    return _whisper_model


def transcribe_audio(audio_path: str) -> str:
    """오디오 파일을 텍스트로 변환"""
    global _last_transcription
    model = get_whisper_model()
    result = model.transcribe(audio_path, language="ko")
    _last_transcription = result["text"].strip()
    return _last_transcription


def search_lyrics_by_text(query: str, limit: int = 5) -> List[Dict]:
    """LRCLIB에서 가사 텍스트로 검색"""
    try:
        # LRCLIB 검색 API
        response = requests.get(
            "https://lrclib.net/api/search",
            params={"q": query},
            timeout=10
        )
        if response.status_code == 200:
            return response.json()[:limit]
    except Exception as e:
        print(f"가사 검색 실패: {e}")
    return []


# 자주 사용하는 아티스트의 곡 목록 캐시
_artist_songs_cache = {}


def get_artist_songs(artist: str) -> List[Dict]:
    """아티스트의 모든 곡과 가사 가져오기"""
    if artist in _artist_songs_cache:
        return _artist_songs_cache[artist]

    try:
        # q 파라미터로 검색 (artist_name보다 잘 동작)
        response = requests.get(
            "https://lrclib.net/api/search",
            params={"q": artist},
            timeout=15
        )
        if response.status_code == 200:
            songs = response.json()
            # 해당 아티스트의 곡만 필터링
            filtered = [s for s in songs if artist.lower() in s.get("artistName", "").lower()
                       or artist in s.get("artistName", "")]
            _artist_songs_cache[artist] = filtered if filtered else songs
            return _artist_songs_cache[artist]
    except Exception as e:
        print(f"아티스트 곡 검색 실패: {e}")

    return []


def match_lyrics_from_artist_songs(transcribed: str, artist: str) -> Optional[Dict]:
    """아티스트의 곡 목록에서 가사 매칭"""
    songs = get_artist_songs(artist)

    if not songs:
        return None

    best_match = None
    best_score = 0.0

    # 인식된 텍스트 정규화 (공백, 특수문자 제거)
    import re
    transcribed_clean = re.sub(r'[^\w가-힣]', '', transcribed.lower())

    for song in songs:
        lyrics = song.get("plainLyrics", "") or ""
        synced = song.get("syncedLyrics", "")

        if not lyrics and not synced:
            continue

        # 싱크 가사에서 텍스트만 추출
        if synced and not lyrics:
            lyrics = re.sub(r'\[\d+:\d+[.:]\d+\]', '', synced)

        lyrics_clean = re.sub(r'[^\w가-힣]', '', lyrics.lower())

        # 여러 매칭 전략 시도
        score = 0.0

        # 전략 1: 인식된 텍스트가 가사에 포함
        if transcribed_clean in lyrics_clean:
            score = 0.8

        # 전략 2: 부분 매칭 (슬라이딩 윈도우)
        if score < 0.5:
            window_size = len(transcribed_clean)
            for i in range(0, len(lyrics_clean) - window_size + 1, 10):
                window = lyrics_clean[i:i + window_size]
                sim = calculate_similarity(transcribed_clean, window)
                if sim > score:
                    score = sim

        # 전략 3: 키워드 매칭 (한글 단어 기준)
        if score < 0.5:
            transcribed_words = set(re.findall(r'[가-힣]{2,}', transcribed))
            lyrics_words = set(re.findall(r'[가-힣]{2,}', lyrics))
            if transcribed_words and lyrics_words:
                common = transcribed_words & lyrics_words
                keyword_score = len(common) / len(transcribed_words) if transcribed_words else 0
                score = max(score, keyword_score * 0.7)

        if score > best_score:
            best_score = score
            best_match = {
                "title": song.get("trackName", "Unknown"),
                "artist": song.get("artistName", artist),
                "score": score,
                "syncedLyrics": song.get("syncedLyrics")
            }

    # 최소 60% 이상 매칭되어야 함 (오매칭 방지)
    if best_match and best_score >= 0.6:
        return best_match

    return None


def calculate_similarity(text1: str, text2: str) -> float:
    """두 텍스트의 유사도 계산 (0~1)"""
    # 공백/특수문자 정규화
    t1 = ''.join(text1.lower().split())
    t2 = ''.join(text2.lower().split())
    return SequenceMatcher(None, t1, t2).ratio()


def find_song_by_lyrics(transcribed_text: str, candidates: List[Dict]) -> Optional[Dict]:
    """인식된 텍스트와 가장 유사한 가사를 가진 곡 찾기"""
    best_match = None
    best_score = 0.0

    for song in candidates:
        lyrics = song.get("plainLyrics", "") or song.get("syncedLyrics", "")
        if not lyrics:
            continue

        # 가사에서 인식된 텍스트와 유사한 부분 찾기
        score = 0.0
        lyrics_normalized = ' '.join(lyrics.split())

        # 전체 유사도
        score = calculate_similarity(transcribed_text, lyrics_normalized)

        # 부분 매칭 (인식된 텍스트가 가사에 포함되는지)
        if transcribed_text.replace(" ", "") in lyrics_normalized.replace(" ", ""):
            score = max(score, 0.8)

        if score > best_score:
            best_score = score
            best_match = {
                "title": song.get("trackName", "Unknown"),
                "artist": song.get("artistName", "Unknown"),
                "score": score,
                "syncedLyrics": song.get("syncedLyrics")
            }

    # 최소 유사도 30% 이상이어야 매칭
    if best_match and best_score >= 0.3:
        return best_match
    return None


def recognize_by_lyrics(audio_data: bytes, known_artists: List[str] = None) -> Optional[Dict]:
    """
    Whisper + 가사 매칭으로 곡 인식

    1. 오디오를 텍스트로 변환 (Whisper)
    2. 알려진 아티스트의 곡들과 가사 매칭
    3. 가장 유사한 곡 반환
    """
    # 기본 아티스트 목록 (자주 검색되는 K-pop 아티스트)
    if known_artists is None:
        known_artists = [
            "성시경", "IU", "아이유", "BTS", "방탄소년단",
            "NewJeans", "뉴진스", "BLACKPINK", "블랙핑크",
            "김광석", "이문세", "ROSÉ", "로제", "aespa", "에스파"
        ]

    # 임시 파일에 오디오 저장
    with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as f:
        f.write(audio_data)
        webm_path = f.name

    wav_path = webm_path.replace(".webm", ".wav")

    try:
        # WebM → WAV 변환 (Whisper용)
        subprocess.run([
            'ffmpeg', '-y', '-i', webm_path,
            '-ar', '16000', '-ac', '1', '-f', 'wav', wav_path
        ], capture_output=True, check=True)

        # 음성 → 텍스트
        transcribed = transcribe_audio(wav_path)
        print(f"🎤 Whisper 인식: {transcribed[:60]}...")

        if len(transcribed) < 5:
            print("인식된 텍스트가 너무 짧음")
            return None

        # 각 아티스트의 곡들과 매칭 시도
        best_overall = None
        best_overall_score = 0.0

        for artist in known_artists:
            match = match_lyrics_from_artist_songs(transcribed, artist)
            if match and match["score"] > best_overall_score:
                best_overall = match
                best_overall_score = match["score"]

        if best_overall:
            print(f"🎵 가사 매칭 성공: {best_overall['title']} - {best_overall['artist']} (유사도: {best_overall['score']:.0%})")
            return {
                "title": best_overall["title"],
                "artist": best_overall["artist"],
                "offset": 0.0,  # 가사 매칭은 정확한 offset 알 수 없음
                "method": "lyrics_match"
            }

        print("가사 매칭 실패")
        return None

    except Exception as e:
        print(f"가사 매칭 실패: {e}")
        return None

    finally:
        if os.path.exists(webm_path):
            os.unlink(webm_path)
        if os.path.exists(wav_path):
            os.unlink(wav_path)


if __name__ == "__main__":
    # 테스트
    import asyncio

    # 킬링보이스 테스트
    subprocess.run([
        'ffmpeg', '-y', '-i', '../killing_voice.mp3',
        '-ss', '480', '-t', '15',
        '-f', 'webm', 'test_segment.webm'
    ], capture_output=True)

    with open("test_segment.webm", "rb") as f:
        audio_data = f.read()

    result = recognize_by_lyrics(audio_data)
    print(f"\n결과: {result}")

    os.unlink("test_segment.webm")
