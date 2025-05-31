# Cuberse - 3D 큐브 빌딩 애플리케이션

## 로컬 개발 환경 실행

```bash
# 의존성 설치
npm install

# 로컬 서버 실행 (포트 3000)
npm run dev
```

브라우저에서 `http://localhost:3000` 접속

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

## 기술 스택

- **로컬**: Express.js 서버
- **배포**: Vercel Serverless Functions
- **프론트엔드**: Three.js, HTML5, CSS3, JavaScript ES6
- **데이터**: LocalStorage (클라이언트 사이드)

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