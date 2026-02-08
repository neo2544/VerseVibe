"""VerseVibe Backend - FastAPI + WebSocket"""
import asyncio
import base64
import json
import sys
import time
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path

from recognizer import recognize_audio
from lyrics import get_synced_lyrics

# stdout 버퍼링 비활성화 (로그 즉시 출력)
sys.stdout.reconfigure(line_buffering=True)

app = FastAPI(title="VerseVibe API")

# Frontend 정적 파일 서빙
frontend_path = Path(__file__).parent.parent / "frontend"
if frontend_path.exists():
    app.mount("/static", StaticFiles(directory=frontend_path), name="static")


@app.get("/")
async def root():
    """메인 페이지"""
    index_path = frontend_path / "index.html"
    if index_path.exists():
        return FileResponse(index_path)
    return {"message": "VerseVibe API", "status": "running"}


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket 엔드포인트 - 수신/처리 분리로 항상 최신 오디오 처리"""
    await websocket.accept()
    print("✅ WebSocket 연결됨")

    # 공유 상태
    current_song = None
    lyrics_cache = []
    running = True
    whisper_enabled = False

    # 최신 오디오만 유지 (Event + 변수)
    latest_audio = None
    audio_ready = asyncio.Event()

    async def receive_loop():
        """오디오 수신 루프 - 항상 최신 오디오만 보관"""
        nonlocal latest_audio, running, whisper_enabled
        try:
            while running:
                data = await websocket.receive_text()
                message = json.loads(data)

                if message["type"] == "audio":
                    latest_audio = base64.b64decode(message["data"])
                    whisper_enabled = message.get("whisper_enabled", False)
                    audio_ready.set()  # 처리 루프에 알림

                elif message["type"] == "stop":
                    running = False
                    audio_ready.set()  # 블로킹 해제
                    try:
                        await websocket.send_json({"type": "stopped"})
                    except Exception:
                        pass
                    break

        except WebSocketDisconnect:
            print("클라이언트 연결 종료")
            running = False
            audio_ready.set()

    async def process_loop():
        """오디오 처리 루프 - 처리 완료 후 최신 오디오만 처리"""
        nonlocal current_song, lyrics_cache, latest_audio, running

        consecutive_failures = 0
        last_shazam_time = 0.0
        MIN_SHAZAM_INTERVAL = 8.0  # Shazam 호출 간 최소 8초 간격

        while running:
            # 새 오디오가 올 때까지 대기
            await audio_ready.wait()
            audio_ready.clear()

            if not running:
                break

            # 최신 오디오 가져오기 (이전 쌓인 것은 자동 폐기)
            audio_bytes = latest_audio
            latest_audio = None

            if audio_bytes is None:
                continue

            # Shazam 호출 쿨다운 - 최소 간격 보장
            elapsed = time.monotonic() - last_shazam_time
            if elapsed < MIN_SHAZAM_INTERVAL:
                wait_time = MIN_SHAZAM_INTERVAL - elapsed
                print(f"⏳ Shazam 쿨다운: {wait_time:.1f}초 대기")
                await asyncio.sleep(wait_time)
                if not running:
                    break

            # 연속 실패 시 백오프 (3회 이상이면 대기 후 재시도)
            if consecutive_failures >= 3:
                delay = min(consecutive_failures * 2, 10)  # 최대 10초
                print(f"⏳ API 제한 의심 - {delay}초 대기 후 재시도")
                try:
                    await websocket.send_json({
                        "type": "retrying",
                        "message": f"API 응답 지연 - {delay}초 후 재시도..."
                    })
                except Exception:
                    break
                await asyncio.sleep(delay)

                if not running:
                    break

            print(f"🎧 오디오 처리 시작 ({len(audio_bytes)} bytes)")

            # Whisper 상태 콜백
            async def whisper_status_callback(event):
                try:
                    await websocket.send_json(event)
                except Exception:
                    pass

            # 음악 인식
            try:
                last_shazam_time = time.monotonic()
                result = await recognize_audio(audio_bytes, status_callback=whisper_status_callback, whisper_enabled=whisper_enabled)
            except Exception as e:
                print(f"인식 오류: {e}")
                consecutive_failures += 1
                continue

            if not running:
                break

            if result:
                consecutive_failures = 0  # 성공 시 리셋
                title = result["title"]
                artist = result["artist"]
                offset = result.get("offset", 0.0)

                song_key = f"{title}|{artist}"
                if current_song != song_key:
                    print(f"🎵 새 곡 감지: {title} - {artist}")
                    current_song = song_key
                    lyrics_cache = get_synced_lyrics(title, artist)
                    print(f"   가사 {len(lyrics_cache)}줄 로드됨")

                    try:
                        await websocket.send_json({
                            "type": "recognized",
                            "title": title,
                            "artist": artist,
                            "offset": offset,
                            "lyrics": lyrics_cache
                        })
                    except Exception:
                        break
                else:
                    print(f"📍 위치 업데이트: {title} - {offset:.1f}초")
                    try:
                        await websocket.send_json({
                            "type": "position",
                            "offset": offset
                        })
                    except Exception:
                        break
            else:
                consecutive_failures += 1
                if current_song is None:
                    try:
                        msg = "음악을 찾는 중..."
                        if consecutive_failures >= 3:
                            msg = f"인식 어려움 (시도 {consecutive_failures}회) - 계속 시도 중..."
                        await websocket.send_json({
                            "type": "retrying",
                            "message": msg
                        })
                    except Exception:
                        break
                else:
                    print(f"인식 실패 (무시됨) - 현재 곡: {current_song}")

    # 수신/처리 동시 실행
    try:
        await asyncio.gather(
            receive_loop(),
            process_loop()
        )
    except Exception as e:
        print(f"WebSocket 오류: {e}")


@app.get("/health")
async def health():
    """헬스 체크"""
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    import os
    import ssl

    cert_dir = os.path.join(os.path.dirname(__file__), "..", "certs")
    cert_file = os.path.join(cert_dir, "cert.pem")
    key_file = os.path.join(cert_dir, "key.pem")

    if os.path.exists(cert_file) and os.path.exists(key_file):
        print("🔒 HTTPS 모드로 시작합니다 (https://0.0.0.0:8000)")
        uvicorn.run(app, host="0.0.0.0", port=8000,
                    ssl_keyfile=key_file, ssl_certfile=cert_file)
    else:
        print("⚠️  인증서 없음 - HTTP 모드로 시작합니다 (마이크 사용 불가할 수 있음)")
        uvicorn.run(app, host="0.0.0.0", port=8000)
