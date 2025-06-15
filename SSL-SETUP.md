# 🔒 SSL/HTTPS 설정 가이드

Cuberse에서 Nginx 프록시를 통한 HTTPS 설정 방법을 안내합니다.

## 🚀 빠른 시작

### 개발환경 (로컬)
```bash
# HTTP로 개발 (HTTPS 불필요)
npm run dev
# → http://localhost:3001
```

### 프로덕션환경 (Nginx + Let's Encrypt)
```bash
# 1. Nginx + SSL 자동 설정
npm run setup-nginx

# 2. SSL 인증서 발급 (가이드에 따라)
sudo certbot --nginx -d yourdomain.com

# 3. Node.js HTTP 서버 실행
npm start
# → https://yourdomain.com (Nginx가 HTTPS 처리)
```

## 📋 Nginx 프록시 구조

```
인터넷 → Nginx (443) → Node.js (3000)
         ↑
    Let's Encrypt SSL
```

### 환경변수 (Node.js)
| 변수 | 설명 | 기본값 |
|------|------|--------|
| `NODE_ENV` | 환경 설정 | `development` |
| `PORT` | HTTP 포트 | 개발: 3001, 프로덕션: 3000 |

### Nginx + SSL 설정

#### 1. 자동 설정 (권장)
```bash
# 모든 설정을 자동으로 처리
npm run setup-nginx

# 스크립트가 수행하는 작업:
# - Nginx 설치
# - Certbot 설치  
# - Nginx 설정 파일 생성
# - SSL 인증서 발급 가이드
```

#### 2. 수동 설정
```bash
# 1. Nginx 설치
sudo apt update
sudo apt install nginx certbot python3-certbot-nginx

# 2. Nginx 설정 파일 생성
sudo nano /etc/nginx/sites-available/yourdomain

# 3. 사이트 활성화
sudo ln -s /etc/nginx/sites-available/yourdomain /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 4. SSL 인증서 발급
sudo certbot --nginx -d yourdomain.com
```

### 자동 인증서 갱신 (Let's Encrypt)
```bash
# crontab 편집
sudo crontab -e

# 다음 줄 추가 (매달 1일 새벽 2시에 갱신 및 Nginx 재시작)
0 2 1 * * /usr/bin/certbot renew --quiet --post-hook 'systemctl reload nginx'
```

## 🔧 스크립트 설명

### `setup-letsencrypt.sh` → `setup-nginx.sh`
- Nginx 자동 설치 및 설정
- Let's Encrypt Certbot 설치
- Nginx 설정 파일 자동 생성
- SSL 인증서 발급 가이드 제공
- 단일 도메인 및 멀티 도메인 지원

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

1. **개발환경**: HTTP로 개발 (HTTPS 불필요)
2. **프로덕션**: Nginx가 HTTPS 처리, Node.js는 HTTP만
3. **포트**: Nginx(80,443), Node.js(3000) 포트 필요
4. **방화벽**: 80, 443 포트 허용 필요
5. **갱신**: Let's Encrypt 인증서는 90일마다 자동 갱신
6. **멀티 도메인**: 여러 도메인 사용 시 `setup-multi-domain.sh` 활용

## 🔍 문제해결

### Nginx 설정 오류
```bash
# Nginx 설정 테스트
sudo nginx -t

# Nginx 상태 확인
sudo systemctl status nginx
```

### 포트 충돌
```bash
# 포트 사용 확인
sudo netstat -tlnp | grep :80
sudo netstat -tlnp | grep :443
sudo netstat -tlnp | grep :3000
```

### SSL 인증서 문제
```bash
# 인증서 상태 확인
sudo certbot certificates

# 수동 갱신 테스트
sudo certbot renew --dry-run
```

### Node.js 연결 문제
- Node.js가 3000포트에서 실행 중인지 확인
- 방화벽에서 내부 포트(3000) 허용 여부 확인