/**
 * 간단한 Express 웹 서버
 * 1. 먼저 터미널에서 아래 명령어로 express를 설치하세요:
 *    npm install express
 * 2. 서버 실행:
 *    node server.js
 * 3. 브라우저에서 http://localhost:3000 접속
 */
const express = require('express');
const path = require('path');
const app = express();
const PORT = 3000;

// public, src 폴더 정적 서빙
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/src', express.static(path.join(__dirname, 'src')));

// 루트로 접속 시 index.html 제공
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
});