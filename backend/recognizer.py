"""음악 인식 모듈 (shazamio + Whisper 폴백)"""
import asyncio
import tempfile
import os
import subprocess
from typing import Optional, Dict
from shazamio import Shazam

# Whisper 폴백을 위한 가사 매칭 모듈
from lyrics_matcher import recognize_by_lyrics, is_model_loaded, get_last_transcription

shazam = Shazam()


def convert_webm_to_wav(input_path: str, output_path: str) -> bool:
    """ffmpeg를 사용해 WebM을 WAV로 변환"""
    try:
        file_size = os.path.getsize(input_path)
        print(f"🔧 ffmpeg 변환: {input_path} ({file_size} bytes)")
        result = subprocess.run([
            'ffmpeg', '-y', '-i', input_path,
            '-ar', '44100', '-ac', '1', '-f', 'wav', output_path
        ], capture_output=True, text=True)
        if result.returncode != 0:
            print(f"ffmpeg stderr: {result.stderr[-200:]}")
            return False
        return True
    except Exception as e:
        print(f"오디오 변환 실패: {e}")
        return False


async def recognize_audio(audio_data: bytes, status_callback=None, whisper_enabled=False) -> Optional[Dict]:
    """
    오디오 데이터에서 곡 인식

    Args:
        audio_data: 오디오 바이트 데이터
        status_callback: Whisper 상태를 프론트에 전달할 async 콜백 함수
        whisper_enabled: Whisper 폴백 사용 여부 (기본 OFF)

    반환:
    {
        "title": "APT.",
        "artist": "ROSÉ & Bruno Mars",
        "offset": 42.5  # 현재 재생 위치 (초)
    }
    """
    # 임시 파일에 원본 오디오 저장 (WebM)
    with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as f:
        f.write(audio_data)
        webm_path = f.name

    # WAV로 변환
    wav_path = webm_path.replace(".webm", ".wav")

    if not convert_webm_to_wav(webm_path, wav_path):
        os.unlink(webm_path)
        return None

    shazam_result = None

    try:
        result = await asyncio.wait_for(shazam.recognize(wav_path), timeout=15)

        if result and "track" in result:
            track = result["track"]

            # offset 추출 - matches 배열에서 가져옴
            offset = 0.0
            if "matches" in result and len(result["matches"]) > 0:
                # 첫 번째 match의 offset 사용 (초 단위)
                offset = result["matches"][0].get("offset", 0.0)
                print(f"🎵 Shazam 인식 성공: {track.get('title')} - offset: {offset:.2f}초")

            shazam_result = {
                "title": track.get("title", "Unknown"),
                "artist": track.get("subtitle", "Unknown"),
                "offset": offset,
                "shazam_key": track.get("key", ""),
                "method": "shazam"
            }

    except asyncio.TimeoutError:
        print("⏱️ Shazam 타임아웃 (15초)")
        if status_callback:
            await status_callback({
                "type": "retrying",
                "message": "Shazam 응답 지연 - 재시도 중..."
            })

    except Exception as e:
        print(f"Shazam 인식 오류: {e}")

    finally:
        # 임시 파일 삭제
        if os.path.exists(wav_path):
            os.unlink(wav_path)

    # Shazam 성공 시 반환
    if shazam_result:
        if os.path.exists(webm_path):
            os.unlink(webm_path)
        return shazam_result

    # Whisper 비활성화 시 바로 반환
    if not whisper_enabled:
        print("🔄 Shazam 실패 (Whisper OFF - 스킵)")
        if os.path.exists(webm_path):
            os.unlink(webm_path)
        return None

    # Shazam 실패 시 Whisper + 가사 매칭 폴백
    print("🔄 Shazam 실패, Whisper 가사 매칭 시도...")

    try:
        # Whisper 모델 로딩 상태를 프론트에 알림
        model_was_loaded = is_model_loaded()
        if status_callback:
            if not model_was_loaded:
                await status_callback({
                    "type": "whisper_status",
                    "status": "loading",
                    "message": "Whisper 모델 로딩 중..."
                })
            else:
                await status_callback({
                    "type": "whisper_status",
                    "status": "processing",
                    "message": "음성을 텍스트로 변환 중..."
                })

        # webm 파일로 가사 매칭 시도 (별도 스레드에서 실행)
        with open(webm_path, "rb") as f:
            audio_data_for_whisper = f.read()

        lyrics_result = await asyncio.to_thread(recognize_by_lyrics, audio_data_for_whisper)

        # Whisper 이벤트를 프론트에 전달
        if status_callback:
            # 모델이 처음 로드된 경우 알림
            if not model_was_loaded and is_model_loaded():
                await status_callback({
                    "type": "whisper_status",
                    "status": "loaded",
                    "message": "Whisper 모델 로드 완료"
                })

            # 인식된 텍스트 전달
            transcription = get_last_transcription()
            if transcription:
                await status_callback({
                    "type": "whisper_transcription",
                    "text": transcription
                })

        if lyrics_result:
            return lyrics_result

    except Exception as e:
        print(f"Whisper 가사 매칭 오류: {e}")

    finally:
        if os.path.exists(webm_path):
            os.unlink(webm_path)

    return None


async def recognize_and_get_offset(audio_data: bytes) -> Optional[float]:
    """
    오디오에서 현재 재생 위치(offset)만 반환
    이미 곡을 알고 있을 때 위치 업데이트용
    """
    result = await recognize_audio(audio_data)
    if result:
        return result.get("offset", 0.0)
    return None


if __name__ == "__main__":
    # 테스트
    async def test():
        with open("../test_audio.mp3", "rb") as f:
            audio = f.read()
        result = await recognize_audio(audio)
        print(result)

    asyncio.run(test())
