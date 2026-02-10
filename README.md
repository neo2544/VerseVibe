# VerseVibe 🎵

실시간 음악 인식 및 싱크 가사 표시 애플리케이션

## 📋 프로젝트 소개

VerseVibe는 마이크로 입력된 음악을 실시간으로 인식하고, 해당 곡의 싱크 가사를 자동으로 표시하는 웹 애플리케이션입니다. Shazam API를 활용한 음악 인식과 LRCLIB를 통한 싱크 가사 조회를 지원합니다.

### 주요 기능

- 🎤 **실시간 음악 인식**: 마이크 입력을 통한 실시간 음악 인식
- 📝 **싱크 가사 표시**: 재생 시점에 맞춘 가사 하이라이트
- 🔄 **자동 곡 전환**: 다른 곡 감지 시 자동으로 가사 전환
- 🔒 **곡 고정 모드**: 현재 곡을 고정하여 자동 전환 방지
- ⏱️ **싱크 조정**: 가사와 음악의 싱크를 수동으로 조정 가능
- 📋 **인식 기록**: 이전에 인식한 곡들의 히스토리 관리
- 🎯 **Whisper 폴백**: Shazam 실패 시 Whisper 음성인식으로 가사 매칭 시도

## 🛠️ 기술 스택

### Backend
- **FastAPI**: 비동기 웹 프레임워크
- **WebSocket**: 실시간 오디오 스트리밍
- **shazamio**: Shazam API 클라이언트 (음악 인식)
- **OpenAI Whisper**: 음성 인식 (폴백)
- **LRCLIB API**: 싱크 가사 조회

### Frontend
- **HTML5/CSS3/JavaScript**: 바닐라 JS 기반
- **Web Audio API**: 마이크 입력 및 오디오 처리
- **Canvas API**: 웨이브폼 시각화

### Infrastructure
- **Docker**: 컨테이너화
- **Docker Compose**: 서비스 오케스트레이션

## 📦 설치 방법

### 사전 요구사항

- Python 3.12 이상
- Docker 및 Docker Compose (Docker 실행 시)
- ffmpeg (로컬 실행 시)

### 1. 저장소 클론

```bash
git clone <repository-url>
cd VerseVibe
```

### 2. 의존성 설치 (로컬 실행 시)

```bash
cd backend
pip install -r requirements.txt
pip install openai-whisper  # Whisper 폴백 기능 사용 시
```

## 🚀 실행 방법

### 방법 1: Docker를 사용한 실행 (권장)

가장 간단한 방법입니다. Docker가 설치되어 있다면 다음 명령어로 실행할 수 있습니다.

```bash
# 빌드 및 실행
docker compose up -d --build

# 로그 확인
docker compose logs -f

# 중지
docker compose down
```

애플리케이션은 `https://localhost:50260`에서 실행됩니다.

**참고**: Docker 이미지는 자동으로 자체 서명 인증서를 생성하여 HTTPS를 활성화합니다.

### 방법 2: 배포 스크립트 사용

```bash
chmod +x deploy.sh
./deploy.sh
```

이 스크립트는 최신 코드를 가져오고 Docker 컨테이너를 빌드/실행합니다.

### 방법 3: 로컬 Python 실행

#### 3-1. HTTPS 인증서 생성 (마이크 접근 필수)

마이크 접근을 위해서는 HTTPS가 필요합니다. 자체 서명 인증서를 생성하세요:

```bash
mkdir -p certs
cd certs
openssl req -x509 -newkey rsa:2048 \
  -keyout key.pem -out cert.pem \
  -days 365 -nodes \
  -subj "/CN=versevibe" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:0.0.0.0"
cd ..
```

#### 3-2. 백엔드 서버 실행

```bash
cd backend
python main.py
```

서버는 다음 주소에서 실행됩니다:
- **HTTPS**: `https://localhost:8000` (인증서가 있는 경우)
- **HTTP**: `http://localhost:8000` (인증서가 없는 경우, 마이크 사용 불가)

#### 3-3. 브라우저에서 접속

브라우저에서 `https://localhost:8000` (또는 `http://localhost:8000`)에 접속하세요.

**주의**: 자체 서명 인증서를 사용하는 경우 브라우저에서 보안 경고가 표시될 수 있습니다. "고급" → "안전하지 않음으로 이동"을 클릭하여 진행하세요.

## 📖 사용 방법

### 기본 사용법

1. **인식 시작**
   - 메인 화면에서 "🎤 인식 시작" 버튼 클릭
   - 브라우저에서 마이크 권한 요청 시 "허용" 선택

2. **음악 재생**
   - 스피�어나 이어폰으로 음악을 재생
   - 마이크가 음악을 감지하면 자동으로 인식 시작

3. **가사 확인**
   - 곡이 인식되면 자동으로 싱크 가사가 표시됨
   - 현재 재생 중인 가사가 하이라이트됨

### 고급 기능

#### 곡 고정 모드
- 가사 화면에서 🔓 버튼을 클릭하여 🔒로 변경
- 다른 곡이 감지되어도 자동 전환되지 않음

#### 싱크 조정
- 가사가 음악보다 빠르거나 느릴 때 사용
- `-0.5s` / `+0.5s` 버튼으로 싱크 조정

#### Whisper 음성인식
- 초기 화면에서 "Whisper 음성인식" 토글 활성화
- Shazam 실패 시 Whisper로 가사 매칭 시도 (처음 실행 시 모델 다운로드 필요)

#### 인식 기록
- "📋 인식 기록" 버튼으로 이전에 인식한 곡 확인
- 기록을 클릭하여 가사 다시 보기

## 🔧 설정

### 환경 변수

Docker Compose를 사용하는 경우 `docker-compose.yml`에 환경 변수를 추가할 수 있습니다:

```yaml
services:
  versevibe:
    environment:
      - PYTHONUNBUFFERED=1
      # 추가 환경 변수
```

### 포트 변경

기본 포트는 `50260`입니다. `docker-compose.yml`에서 변경 가능:

```yaml
ports:
  - "YOUR_PORT:8000"
```

## 📡 API 문서

### WebSocket 엔드포인트

#### 연결
```
ws://localhost:8000/ws
wss://localhost:8000/ws  (HTTPS)
```

#### 메시지 형식

**클라이언트 → 서버**:
```json
{
  "type": "audio",
  "data": "<base64_encoded_audio>",
  "whisper_enabled": false
}
```

```json
{
  "type": "lock_song",
  "locked": true
}
```

```json
{
  "type": "stop"
}
```

**서버 → 클라이언트**:
```json
{
  "type": "recognized",
  "title": "곡 제목",
  "artist": "아티스트",
  "offset": 0.0,
  "lyrics": [...]
}
```

```json
{
  "type": "position",
  "offset": 12.5
}
```

### REST API

#### 가사 조회
```
GET /api/lyrics?title={title}&artist={artist}
```

#### 헬스 체크
```
GET /health
```

## ⚠️ 주의사항

### 마이크 접근
- 브라우저의 마이크 접근은 **HTTPS 환경에서만** 가능합니다
- HTTP 환경에서는 마이크를 사용할 수 없습니다
- Docker 실행 시 자동으로 HTTPS가 활성화됩니다

### 저작권
- 가사는 저작권 보호 대상입니다
- 개인 사용 목적으로만 사용하세요
- 상업적 사용 시 적절한 라이선스가 필요합니다
- 가사는 외부 API를 통해 실시간으로 조회하며, 로컬에 저장하지 않습니다

### 음악 인식 정확도
- 주변 소음이 적을수록 인식 정확도가 높아집니다
- Shazam API는 네트워크 연결이 필요합니다
- 인식 실패 시 Whisper 폴백이 자동으로 시도됩니다

## 🐛 문제 해결

### 마이크가 작동하지 않음
- HTTPS로 접속했는지 확인하세요
- 브라우저의 마이크 권한을 확인하세요
- 다른 애플리케이션에서 마이크를 사용 중인지 확인하세요

### 곡 인식이 안 됨
- 음악 소리가 충분히 큰지 확인하세요
- 주변 소음을 줄이세요
- Whisper 모드를 활성화하여 재시도하세요

### Docker 컨테이너가 시작되지 않음
- Docker가 실행 중인지 확인하세요
- 포트가 이미 사용 중인지 확인하세요 (`docker compose down` 후 재시도)
- 로그 확인: `docker compose logs versevibe`

## 📝 라이선스

이 프로젝트는 개인 사용 목적으로 개발되었습니다. 가사 데이터는 외부 API를 통해 실시간으로 조회되며, 프로젝트에 포함되지 않습니다.

## 🤝 기여

이슈 및 풀 리퀘스트를 환영합니다!

## 📚 참고 자료

- [기술 검토 문서](./docs/01_technical_review.md)
- [기술 검증 문서](./docs/02_tech_validation.md)
- [프로토타입 설계](./docs/plans/2025-02-09-prototype-design.md)
- [UX 개선 설계](./docs/plans/2026-02-10-ux-improvements-design.md)

## 📞 문의

프로젝트 관련 문의사항이 있으시면 이슈를 생성해주세요.
