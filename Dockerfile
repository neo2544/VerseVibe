FROM python:3.12-slim

# ffmpeg 설치 (오디오 변환용)
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 의존성 설치
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt openai-whisper

# 소스 복사
COPY backend/ ./backend/
COPY frontend/ ./frontend/

# 컨테이너 내부에서 인증서 생성
RUN mkdir -p /app/certs && openssl req -x509 -newkey rsa:2048 \
    -keyout /app/certs/key.pem -out /app/certs/cert.pem \
    -days 365 -nodes -subj "/CN=versevibe" \
    -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:0.0.0.0"

WORKDIR /app/backend

EXPOSE 8000

CMD ["python", "main.py"]
