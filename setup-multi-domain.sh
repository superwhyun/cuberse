#!/bin/bash

# 멀티 도메인 Nginx + SSL 설정 스크립트

echo "🌐 멀티 도메인 Nginx + SSL 설정"
echo "=================================="
echo ""

# 도메인 설정
DOMAIN1="xtandards.is-an.ai"
DOMAIN2="cuberse.is-an.ai"
PORT1="6910"
PORT2="5910"

echo "📋 설정 도메인:"
echo "• $DOMAIN1 → localhost:$PORT1"
echo "• $DOMAIN2 → localhost:$PORT2"
echo ""

# 필수 패키지 설치
echo "📦 필수 패키지 설치 중..."
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    sudo apt update
    sudo apt install -y nginx certbot python3-certbot-nginx
elif [[ "$OSTYPE" == "darwin"* ]]; then
    brew install nginx certbot
else
    echo "⚠️  수동으로 Nginx와 Certbot을 설치해주세요."
    exit 1
fi

# Nginx 설정 파일 복사
echo "📝 Nginx 설정 파일 생성 중..."
sudo cp nginx-multi-domain.conf /etc/nginx/sites-available/multi-domain

# 기본 사이트 비활성화 (필요시)
if [ -f /etc/nginx/sites-enabled/default ]; then
    sudo rm /etc/nginx/sites-enabled/default
    echo "📌 기본 Nginx 사이트 비활성화됨"
fi

# 사이트 활성화
sudo ln -sf /etc/nginx/sites-available/multi-domain /etc/nginx/sites-enabled/

# Nginx 설정 테스트
echo "🔍 Nginx 설정 테스트 중..."
if sudo nginx -t; then
    echo "✅ Nginx 설정 테스트 통과"
    sudo systemctl reload nginx
    echo "🔄 Nginx 재로드 완료"
else
    echo "❌ Nginx 설정 오류! 설정을 확인하세요."
    exit 1
fi

echo ""
echo "⚠️  SSL 인증서 발급 전 확인사항:"
echo "1. DNS A 레코드가 설정되어 있는지 확인:"
echo "   $DOMAIN1 → 현재 서버 IP"
echo "   $DOMAIN2 → 현재 서버 IP"
echo "2. 방화벽에서 80, 443 포트가 열려있는지 확인"
echo "3. Node.js 서버들이 실행 중인지 확인:"
echo "   - $DOMAIN1용 서버: localhost:$PORT1"
echo "   - $DOMAIN2용 서버: localhost:$PORT2"
echo ""

echo "🔑 SSL 인증서 발급 명령어:"
echo "sudo certbot --nginx -d $DOMAIN1 -d $DOMAIN2"
echo ""

echo "🔄 자동 갱신 설정 (인증서 발급 후):"
echo "sudo crontab -e"
echo "# 다음 줄 추가:"
echo "0 2 1 * * /usr/bin/certbot renew --quiet --post-hook 'systemctl reload nginx'"
echo ""

echo "📖 서버 실행 방법:"
echo "# 터미널 1 - xtandards 서버"
echo "cd /path/to/xtandards && PORT=$PORT1 npm start"
echo ""
echo "# 터미널 2 - cuberse 서버" 
echo "cd /path/to/cuberse && PORT=$PORT2 npm start"
echo ""

echo "🚀 서비스 관리 명령어:"
echo "sudo systemctl start nginx     # Nginx 시작"
echo "sudo systemctl stop nginx      # Nginx 중지"
echo "sudo systemctl reload nginx    # Nginx 재로드"
echo "sudo nginx -t                  # Nginx 설정 테스트"
echo ""

echo "✅ 설정 완료!"
echo "📡 접속 주소:"
echo "🔒 https://$DOMAIN1 → localhost:$PORT1"
echo "🔒 https://$DOMAIN2 → localhost:$PORT2"