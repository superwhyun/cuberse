#!/bin/bash

# Let's Encrypt SSL 인증서 설정 스크립트

echo "🔒 Let's Encrypt SSL 인증서 설정"
echo "====================================="

# 도메인 입력 받기
read -p "도메인을 입력하세요 (예: cuberse.com): " DOMAIN

if [ -z "$DOMAIN" ]; then
    echo "❌ 도메인이 입력되지 않았습니다."
    exit 1
fi

echo "📋 설정 단계:"
echo "1. Nginx 설치 (필요한 경우)"
echo "2. Certbot 설치"
echo "3. SSL 인증서 발급"
echo "4. 환경변수 설정"
echo ""

# Nginx 설치 확인
if ! command -v nginx &> /dev/null; then
    echo "📦 Nginx 설치 중..."
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        sudo apt update
        sudo apt install -y nginx
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        brew install nginx
    else
        echo "⚠️  수동으로 Nginx를 설치해주세요."
    fi
fi

# Certbot 설치 확인
if ! command -v certbot &> /dev/null; then
    echo "📦 Certbot 설치 중..."
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        sudo apt install -y certbot python3-certbot-nginx
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        brew install certbot
    else
        echo "⚠️  수동으로 Certbot을 설치해주세요."
    fi
fi

echo ""
echo "🔑 SSL 인증서 발급 명령어:"
echo "sudo certbot --nginx -d $DOMAIN"
echo ""
echo "📝 발급 후 환경변수 설정:"
echo "export SSL_CERT_PATH=/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
echo "export SSL_KEY_PATH=/etc/letsencrypt/live/$DOMAIN/privkey.pem"
echo "export USE_HTTPS=true"
echo ""
echo "🔄 자동 갱신 설정:"
echo "sudo crontab -e"
echo "# 다음 줄 추가:"
echo "0 12 * * * /usr/bin/certbot renew --quiet"
echo ""
echo "✅ 설정이 완료되면 다음 명령어로 서버를 시작하세요:"
echo "npm run start-https"