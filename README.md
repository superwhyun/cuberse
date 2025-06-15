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

### HTTPS 서버 설정 (프로덕션)

#### Nginx 프록시 방식 (권장)
```bash
# 1. Nginx + Let's Encrypt 설정
npm run setup-nginx

# 2. Node.js HTTP 서버 실행 (포트 3000)
npm start

# 3. Nginx가 HTTPS 처리
# → https://yourdomain.com (Nginx:443) → Node.js (localhost:3000)
```

#### 개발환경
```bash
# HTTP로 개발 (포트 3001)
npm run dev
```

## 🔒 SSL/HTTPS 설정

### 개발용 (로컬)
```bash
# HTTP로 개발 (HTTPS 불필요)
npm run dev
# → http://localhost:3001
```

### 프로덕션용 (Nginx 프록시)
```bash
# 1. Nginx + SSL 자동 설정
npm run setup-nginx

# 2. 스크립트 가이드에 따라 SSL 인증서 발급
sudo certbot --nginx -d yourdomain.com

# 3. Node.js 서버 실행 (HTTP)
npm start
# → Nginx가 HTTPS 처리: https://yourdomain.com
```

자세한 설정은 [SSL-SETUP.md](./SSL-SETUP.md) 참조

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
| `npm start` | 프로덕션 서버 (HTTP, 포트 3000) |
| `npm run setup-nginx` | Nginx + Let's Encrypt 설정 가이드 |
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
로컬 개발: Node.js HTTP
├── Express.js (server.js)
├── /src → 소스 코드
└── 포트 3001 (개발) / 3000 (프로덕션)

프로덕션: Nginx + Node.js
├── Nginx (443) → HTTPS/SSL 처리
├── Node.js (3000) → HTTP API/Socket.IO
├── Let's Encrypt → 자동 SSL 인증서
└── 도메인 연결

Vercel 배포: Serverless (HTTPS 자동)
├── /api → API Routes
├── /public → 정적 파일
├── /src → 소스 코드  
└── 도메인 자동 할당
```