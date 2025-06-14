#!/bin/bash

# SSL 인증서 생성 스크립트
echo "🔒 SSL 인증서 생성 중..."

# ssl 디렉토리 생성
mkdir -p ssl

# 자체 서명 인증서 생성 (개발용)
openssl req -x509 -newkey rsa:4096 -keyout ssl/key.pem -out ssl/cert.pem -days 365 -nodes -subj "/C=KR/ST=Seoul/L=Seoul/O=Cuberse/OU=Development/CN=localhost"

echo "✅ SSL 인증서가 생성되었습니다!"
echo "   - 개인키: ssl/key.pem"
echo "   - 인증서: ssl/cert.pem"
echo ""
echo "🚀 HTTPS로 서버를 시작하려면:"
echo "   USE_HTTPS=true npm start"