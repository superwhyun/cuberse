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
echo "1. Nginx 설치 및 설정"
echo "2. Certbot 설치"
echo "3. SSL 인증서 발급"
echo "4. Nginx 설정 파일 생성"
echo "5. 서비스 시작"
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
        exit 1
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
        exit 1
    fi
fi

echo ""
echo "⚠️  중요: SSL 인증서 발급 전에 다음을 확인하세요:"
echo "1. 도메인 $DOMAIN 이 현재 서버 IP를 가리키고 있는지 확인"
echo "2. 80, 443 포트가 열려있는지 확인"
echo "3. Node.js 서버가 3000포트에서 실행 중인지 확인"
echo ""

# 기본 Nginx 설정 생성
echo "📝 기본 Nginx 설정 생성 중..."
sudo tee /etc/nginx/sites-available/$DOMAIN > /dev/null <<EOF
server {
    listen 80;
    server_name $DOMAIN;
    
    # Let's Encrypt 인증을 위한 경로
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }
    
    # 나머지는 HTTPS로 리다이렉트
    location / {
        return 301 https://\$server_name\$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name $DOMAIN;
    
    # SSL 인증서 (certbot이 자동으로 추가)
    # ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    
    # 정적 파일 캐싱
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)\$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        root $(pwd);
        try_files \$uri @proxy;
    }
    
    # Node.js로 프록시
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
    
    # 정적 파일 fallback
    location @proxy {
        proxy_pass http://localhost:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

# 사이트 활성화
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    sudo ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/
    sudo nginx -t
    sudo systemctl reload nginx
fi

echo "🔑 SSL 인증서 발급 명령어:"
echo "sudo certbot --nginx -d $DOMAIN"
echo ""
echo ""
echo "🔄 자동 갱신 설정 (인증서 발급 후):"
echo "sudo crontab -e"
echo "# 다음 줄 추가 (매달 1일 새벽 2시에 갱신 및 Nginx 재시작):"
echo "0 2 1 * * /usr/bin/certbot renew --quiet --post-hook 'systemctl reload nginx'"
echo ""
echo "📖 사용법:"
echo "1. Node.js 서버를 시작하세요: npm start (포트 3000)"
echo "2. 위의 certbot 명령어로 SSL 인증서를 발급하세요"
echo "3. 브라우저에서 https://$DOMAIN 으로 접속하세요"
echo ""
echo "🚀 서비스 관리:"
echo "sudo systemctl start nginx    # Nginx 시작"
echo "sudo systemctl stop nginx     # Nginx 중지"
echo "sudo systemctl reload nginx   # Nginx 설정 재로드"
echo "sudo nginx -t                 # Nginx 설정 테스트"
echo ""
echo "✅ 설정 완료!"
echo "📡 HTTP: http://$DOMAIN → HTTPS로 자동 리다이렉트"
echo "🔒 HTTPS: https://$DOMAIN → Node.js (localhost:3000)"