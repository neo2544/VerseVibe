FROM python:3.13-slim

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

WORKDIR /app/backend

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
