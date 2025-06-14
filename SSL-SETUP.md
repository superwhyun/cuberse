# 🔒 SSL/HTTPS 설정 가이드

Cuberse에서 HTTPS를 설정하는 방법을 안내합니다.

## 🚀 빠른 시작

### 개발환경 (로컬)
```bash
# 1. 자체 서명 인증서 생성
npm run generate-ssl

# 2. HTTPS로 개발 서버 실행
npm run dev-https
```

### 프로덕션환경 (실제 서비스)
```bash
# 1. Let's Encrypt 설정 (대화형)
npm run setup-letsencrypt

# 2. 환경변수 설정 후 서버 실행
npm run start-https
```

## 📋 상세 설정

### 환경변수
| 변수 | 설명 | 기본값 |
|------|------|--------|
| `USE_HTTPS` | HTTPS 활성화 | `false` |
| `HTTPS_PORT` | HTTPS 포트 | 개발: 3443, 프로덕션: 443 |
| `SSL_CERT_PATH` | 인증서 파일 경로 | `./ssl/cert.pem` |
| `SSL_KEY_PATH` | 개인키 파일 경로 | `./ssl/key.pem` |
| `SSL_CA_PATH` | 중간 인증서 경로 | (선택사항) |

### 프로덕션 SSL 인증서 설정

#### 1. Let's Encrypt (무료, 권장)
```bash
# Certbot 설치 (Ubuntu/Debian)
sudo apt update
sudo apt install certbot python3-certbot-nginx

# 인증서 발급
sudo certbot --nginx -d yourdomain.com

# 환경변수 설정
export SSL_CERT_PATH=/etc/letsencrypt/live/yourdomain.com/fullchain.pem
export SSL_KEY_PATH=/etc/letsencrypt/live/yourdomain.com/privkey.pem
export USE_HTTPS=true

# 서버 실행
npm run start-https
```

#### 2. 상용 SSL 인증서
```bash
# 인증서 파일을 서버에 업로드 후
export SSL_CERT_PATH=/path/to/your/certificate.crt
export SSL_KEY_PATH=/path/to/your/private.key
export SSL_CA_PATH=/path/to/your/ca-bundle.crt  # 중간 인증서
export USE_HTTPS=true

npm run start-https
```

### 자동 인증서 갱신 (Let's Encrypt)
```bash
# crontab 편집
sudo crontab -e

# 다음 줄 추가 (매일 정오에 갱신 시도)
0 12 * * * /usr/bin/certbot renew --quiet
```

## 🔧 스크립트 설명

### `generate-ssl.sh`
- 개발용 자체 서명 인증서 생성
- `ssl/` 디렉토리에 `cert.pem`, `key.pem` 생성
- 브라우저에서 보안 경고 나타남 (정상)

### `setup-letsencrypt.sh`
- Let's Encrypt 설정 가이드
- Nginx, Certbot 설치 도움
- 환경변수 설정 안내

## 🌍 배포 플랫폼별 설정

### Vercel
Vercel은 자동으로 HTTPS를 제공하므로 별도 설정 불필요

### AWS EC2
1. 도메인 설정
2. Let's Encrypt 또는 AWS Certificate Manager 사용
3. Load Balancer 또는 직접 서버 설정

### DigitalOcean
1. 도메인 연결
2. Let's Encrypt 설정
3. 방화벽에서 443 포트 허용

## ⚠️  주의사항

1. **개발환경**: 자체 서명 인증서는 브라우저 경고 발생 (정상)
2. **프로덕션**: 반드시 신뢰할 수 있는 CA에서 발급받은 인증서 사용
3. **포트**: 443 포트는 root 권한 필요 (Linux)
4. **방화벽**: HTTPS 포트(443) 허용 필요
5. **갱신**: Let's Encrypt 인증서는 90일마다 갱신 필요

## 🔍 문제해결

### 인증서 로드 실패
```
❌ SSL 인증서 로드 실패: ENOENT: no such file or directory
```
→ 인증서 파일 경로 확인 및 파일 존재 여부 확인

### 권한 오류
```
❌ Error: listen EACCES: permission denied :::443
```
→ root 권한으로 실행하거나 포트 변경

### 브라우저 보안 경고
개발환경에서는 "고급" → "안전하지 않음으로 이동" 클릭