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
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const PORT = 3001;

// 정적 파일 서빙 - 루트에서 HTML 파일들과 src 폴더
app.use(express.static(__dirname));
app.use('/src', express.static(path.join(__dirname, 'src')));

// 루트로 접속 시 index.html 제공
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const httpServer = http.createServer(app);
const io = new Server(httpServer);

// --- 접속자 목록 관리 ---
let userList = [];

io.on('connection', (socket) => {
  console.log('새 클라이언트 접속:', socket.id);

  // --- userId 기준으로만 접속자 목록 관리 ---
  if (!global.userIdSet) global.userIdSet = new Set();
  if (!global.socketIdToUserId) global.socketIdToUserId = new Map();

  // 각 소켓별 사용자 정보 저장용
  if (!global.socketUserInfo) global.socketUserInfo = new Map();

  socket.on('login', ({ userId, userSpaces, spaceId }) => {
    if (!userId) return;
    global.userIdSet.add(userId);
    global.socketIdToUserId.set(socket.id, userId);
    // 소켓별 사용자 정보 저장
    global.socketUserInfo.set(socket.id, { userId, userSpaces, spaceId });

    // 현재 방의 spaceId를 소유한 userId가 owner
    let ownerId = null;
    let ownerSocketId = null;
    for (const [sid, info] of global.socketUserInfo.entries()) {
      if (info && info.spaceId === spaceId && Array.isArray(info.userSpaces) && info.userSpaces.includes(spaceId)) {
        ownerId = info.userId;
        ownerSocketId = sid;
        break;
      }
    }
    const userIdArr = Array.from(global.userIdSet);
    const userListWithOwnerInfo = userIdArr.map(uid => ({
      userId: uid,
      isOwner: uid === ownerId
    }));
    io.emit('user list', userListWithOwnerInfo);

    // 소켓별 ownerSocketId도 저장 (방별로 여러 owner가 있을 수 있으나, 여기선 1명만)
    if (!global.spaceIdToOwnerSocketId) global.spaceIdToOwnerSocketId = new Map();
    if (spaceId && ownerSocketId) {
      global.spaceIdToOwnerSocketId.set(spaceId, ownerSocketId);
    }
  });

  // --- 신규 참가자: 방 정보 요청 relay ---
  socket.on('request room info', ({ spaceId }) => {
    if (!spaceId) return;
    if (!global.spaceIdToOwnerSocketId) return;
    const ownerSocketId = global.spaceIdToOwnerSocketId.get(spaceId);
    if (ownerSocketId) {
      // 주인에게 요청자 소켓 id와 spaceId 전달
      io.to(ownerSocketId).emit('request room info', { requesterSocketId: socket.id, spaceId });
    }
  });

  // --- 주인: 방 정보 전송 시 요청자에게 relay ---
  socket.on('send room info', ({ to, spaceId, sceneData }) => {
    if (to && sceneData) {
      io.to(to).emit('room info', { sceneData });
    }
  });

  // 예시: 클라이언트로부터 받은 메시지를 전체 브로드캐스트
  socket.on('chat message', (msg) => {
    io.emit('chat message', msg);
  });

  // --- 큐브 추가 이벤트 브로드캐스트 ---
  socket.on('add cube', (cubeData) => {
    console.log('[Socket.IO] 서버에서 add cube 수신:', cubeData);
    io.emit('add cube', cubeData);
    console.log('[Socket.IO] 서버에서 add cube 브로드캐스트:', cubeData);
  });

  // --- 큐브 삭제 이벤트 브로드캐스트 ---
  socket.on('remove cube', (data) => {
    console.log('[Socket.IO] 서버에서 remove cube 수신:', data);
    io.emit('remove cube', data);
    console.log('[Socket.IO] 서버에서 remove cube 브로드캐스트:', data);
  });

  socket.on('disconnect', () => {
    console.log('클라이언트 연결 해제:', socket.id);
    const userId = global.socketIdToUserId.get(socket.id);
    global.socketIdToUserId.delete(socket.id);

    // 남아있는 소켓 중에 같은 userId가 없으면 userIdSet에서 제거
    const stillConnected = Array.from(global.socketIdToUserId.values()).includes(userId);
    if (!stillConnected && userId) {
      global.userIdSet.delete(userId);
    }
    io.emit('user list', Array.from(global.userIdSet));
  });
});

httpServer.listen(PORT, () => {
  console.log(`서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
});