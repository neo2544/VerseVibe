#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "========================================="
echo "  VerseVibe - 실시간 싱크 가사"
echo "========================================="

# 인증서 확인/생성
if [ ! -f certs/cert.pem ] || [ ! -f certs/key.pem ]; then
    echo ""
    echo "[1/3] HTTPS 인증서 생성 중..."
    mkdir -p certs
    openssl req -x509 -newkey rsa:2048 \
        -keyout certs/key.pem -out certs/cert.pem \
        -days 365 -nodes \
        -subj "/CN=versevibe" \
        -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:0.0.0.0" \
        2>/dev/null
    echo "  인증서 생성 완료"
else
    echo ""
    echo "[1/3] HTTPS 인증서 확인 완료"
fi

# venv 확인/생성 + 의존성 설치
if [ ! -d venv ]; then
    echo "[2/3] 가상환경 생성 및 의존성 설치 중..."
    python3 -m venv venv
    source venv/bin/activate
    pip install -r backend/requirements.txt --quiet
    echo "  설치 완료"
else
    echo "[2/3] 가상환경 확인 완료"
    source venv/bin/activate
fi

# ffmpeg 확인
if ! command -v ffmpeg &>/dev/null; then
    echo ""
    echo "⚠️  ffmpeg가 설치되어 있지 않습니다."
    echo "   brew install ffmpeg (macOS)"
    echo "   sudo apt install ffmpeg (Ubuntu)"
    exit 1
fi

# 서버 실행
echo "[3/3] 서버 시작 중..."
echo ""
echo "  https://localhost:8000"
echo "  (Ctrl+C로 종료)"
echo "========================================="
echo ""

cd backend
python main.py
