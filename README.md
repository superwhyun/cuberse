# Cuberse - 3D 큐브 빌딩 애플리케이션

## 🚀 빠른 시작

### 의존성 설치
```bash
npm install
```

### HTTP 서버 실행
```bash
# 개발환경 (포트 3001)
npm run dev

# 프로덕션환경 (포트 3000)  
npm start
```

### HTTPS 서버 실행

#### 1. 개발환경 (자체 서명 인증서)
```bash
# SSL 인증서 생성
npm run generate-ssl

# HTTPS 개발 서버 실행 (포트 3443)
npm run dev-https
```

#### 2. 프로덕션환경 (Let's Encrypt)
```bash
# Let's Encrypt 설정 가이드 실행
npm run setup-letsencrypt

# 환경변수 설정 후 HTTPS 서버 실행 (포트 443)
USE_HTTPS=true npm run start-https
```

## 🔒 SSL/HTTPS 설정

### 개발용 (로컬)
자체 서명 인증서로 HTTPS 테스트 가능:
- 브라우저에서 보안 경고 발생 (정상)
- "고급" → "안전하지 않음으로 이동" 클릭

### 프로덕션용 (실제 서비스)
Let's Encrypt 무료 SSL 인증서 사용:
```bash
# 1. 도메인 연결 후 Let's Encrypt 설정
sudo certbot --nginx -d yourdomain.com

# 2. 환경변수 설정
export SSL_CERT_PATH=/etc/letsencrypt/live/yourdomain.com/fullchain.pem
export SSL_KEY_PATH=/etc/letsencrypt/live/yourdomain.com/privkey.pem
export USE_HTTPS=true

# 3. HTTPS 서버 실행
npm run start-https
```

자세한 SSL 설정은 [SSL-SETUP.md](./SSL-SETUP.md) 참조

## Vercel 배포

### 1. Vercel CLI 설치 및 로그인
```bash
npm install -g vercel
vercel login
```

### 2. 프로젝트 배포
```bash
# 첫 배포 시 (프로젝트 설정)
vercel

# 프로덕션 배포
npm run deploy
```

### 3. 자동 배포 설정
GitHub 연동 시 main 브랜치 푸시마다 자동 배포

## 🛠 기술 스택

- **백엔드**: Express.js + Socket.IO (실시간 통신)
- **프론트엔드**: Three.js, HTML5, CSS3, JavaScript ES6
- **보안**: SSL/TLS (HTTPS 지원)
- **배포**: Vercel Serverless Functions
- **데이터**: LocalStorage (클라이언트 사이드)

## 📋 사용 가능한 스크립트

| 명령어 | 설명 |
|--------|------|
| `npm run dev` | 개발 서버 (HTTP, 포트 3001) |
| `npm run dev-https` | 개발 서버 (HTTPS, 포트 3443) |
| `npm start` | 프로덕션 서버 (HTTP, 포트 3000) |
| `npm run start-https` | 프로덕션 서버 (HTTPS, 포트 443) |
| `npm run generate-ssl` | 개발용 SSL 인증서 생성 |
| `npm run setup-letsencrypt` | Let's Encrypt 설정 가이드 |
| `npm run deploy` | Vercel 프로덕션 배포 |

## 주요 기능

- Zone 기반 무한 3D 월드
- FPS 스타일 카메라 시스템  
- 실시간 큐브 편집
- 멀티 워크스페이스 관리
- 사용자 인증 및 세션
- JSON 파일 백업/복원
- 모바일 반응형 UI

## 배포 구조

```
로컬 개발: Express.js (server.js)
├── /public → 정적 파일 서빙
├── /src → 소스 코드
└── 포트 3000

Vercel 배포: Serverless
├── /api → API Routes
├── /public → 정적 파일
├── /src → 소스 코드  
└── 도메인 자동 할당
```