/**
 * Cuberse 웹 서버 - 스페이스 기반 실시간 협업 지원
 */
const express = require('express');
const path = require('path');
const http = require('http');
const https = require('https');
const fs = require('fs');
const { Server } = require('socket.io');

const app = express();

// 환경별 포트 설정
const isDev = process.env.NODE_ENV !== 'production';
const PORT = process.env.PORT || (isDev ? 3001 : 3000); // dev: 3001, production: 3000
const HTTPS_PORT = process.env.HTTPS_PORT || (isDev ? 3443 : 443); // HTTPS 포트
const USE_HTTPS = process.env.USE_HTTPS === 'true' || false; // HTTPS 사용 여부

console.log(`🚀 환경: ${isDev ? 'DEVELOPMENT' : 'PRODUCTION'}`);
console.log(`📡 HTTP 포트: ${PORT}`);
console.log(`🔒 HTTPS 포트: ${HTTPS_PORT}`);
console.log(`🔐 HTTPS 사용: ${USE_HTTPS}`);

// 정적 파일 서빙
app.use(express.static(__dirname));
app.use('/src', express.static(path.join(__dirname, 'src')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// SSL 인증서 설정 (HTTPS 사용시)
let httpsOptions = {};
if (USE_HTTPS) {
  try {
    // SSL 인증서 파일 경로 설정
    const certPath = process.env.SSL_CERT_PATH || './ssl/cert.pem';
    const keyPath = process.env.SSL_KEY_PATH || './ssl/key.pem';
    const caPath = process.env.SSL_CA_PATH; // 중간 인증서 (선택사항)
    
    httpsOptions = {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath)
    };
    
    // 중간 인증서가 있는 경우 추가 (Let's Encrypt 등에서 필요)
    if (caPath && fs.existsSync(caPath)) {
      httpsOptions.ca = fs.readFileSync(caPath);
      console.log('🔗 중간 인증서 로드 완료');
    }
    
    console.log('🔒 SSL 인증서 로드 완료');
    
    if (isDev) {
      console.log('⚠️  개발환경에서 자체 서명 인증서 사용 중');
      console.log('   브라우저에서 "고급" → "안전하지 않음으로 이동" 클릭');
    }
  } catch (error) {
    console.error('❌ SSL 인증서 로드 실패:', error.message);
    
    if (isDev) {
      console.log('💡 개발용 자체 서명 인증서를 생성하세요:');
      console.log('   npm run generate-ssl');
    } else {
      console.log('💡 프로덕션용 SSL 인증서 설정:');
      console.log('   1. Let\'s Encrypt: certbot --nginx -d yourdomain.com');
      console.log('   2. 환경변수 설정:');
      console.log('      SSL_CERT_PATH=/etc/letsencrypt/live/yourdomain.com/fullchain.pem');
      console.log('      SSL_KEY_PATH=/etc/letsencrypt/live/yourdomain.com/privkey.pem');
    }
    process.exit(1);
  }
}

// HTTP/HTTPS 서버 생성
const httpServer = http.createServer(app);
let httpsServer = null;
if (USE_HTTPS) {
  httpsServer = https.createServer(httpsOptions, app);
}

// Socket.IO 서버 설정 - HTTP와 HTTPS 모두 지원
const io = new Server({
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// HTTP 서버에 Socket.IO 연결
io.attach(httpServer);

// HTTPS 서버가 있으면 추가로 연결
if (USE_HTTPS && httpsServer) {
  io.attach(httpsServer);
}

// --- 스페이스 기반 방 관리 시스템 ---
class SpaceManager {
  constructor() {
    this.spaces = new Map(); // spaceId -> { users: Set, sockets: Set, owner: userId }
    this.socketToSpace = new Map(); // socketId -> spaceId
    this.socketToUser = new Map(); // socketId -> userId
  }

  // 사용자가 스페이스에 입장
  joinSpace(socketId, userId, spaceId, userSpaces = []) {
    // 기존 스페이스에서 나가기
    this.leaveSpace(socketId);

    // 스페이스 초기화
    if (!this.spaces.has(spaceId)) {
      this.spaces.set(spaceId, {
        users: new Set(),
        sockets: new Set(),
        owner: null
      });
    }

    const space = this.spaces.get(spaceId);
    
    // 소켓과 사용자 추가
    space.sockets.add(socketId);
    space.users.add(userId);
    this.socketToSpace.set(socketId, spaceId);
    this.socketToUser.set(socketId, userId);

    // 소유자 설정: userSpaces에 spaceId가 있으면 소유자
    const isOwner = Array.isArray(userSpaces) && userSpaces.includes(spaceId);
    if (isOwner || !space.owner) {
      space.owner = userId;
    }

    return this.getSpaceUserList(spaceId);
  }

  // 사용자가 스페이스에서 나가기
  leaveSpace(socketId) {
    const spaceId = this.socketToSpace.get(socketId);
    const userId = this.socketToUser.get(socketId);
    
    if (!spaceId) return null;

    const space = this.spaces.get(spaceId);
    if (space) {
      // 소켓 제거
      space.sockets.delete(socketId);
      
      // 같은 사용자의 다른 소켓이 있는지 확인
      const userStillInSpace = Array.from(space.sockets).some(sid => 
        this.socketToUser.get(sid) === userId
      );
      
      // 다른 소켓이 없으면 사용자도 제거
      if (!userStillInSpace) {
        space.users.delete(userId);
        
        // 소유자가 나간 경우 다른 사용자를 소유자로 지정
        if (space.owner === userId) {
          space.owner = space.users.size > 0 ? Array.from(space.users)[0] : null;
        }
      }
      
      // 스페이스가 비어있으면 제거
      if (space.sockets.size === 0) {
        this.spaces.delete(spaceId);
      }
    }

    this.socketToSpace.delete(socketId);
    this.socketToUser.delete(socketId);
    
    return spaceId;
  }

  // 스페이스 사용자 목록 가져오기
  getSpaceUserList(spaceId) {
    const space = this.spaces.get(spaceId);
    if (!space) return [];

    return Array.from(space.users).map(userId => ({
      userId,
      isOwner: userId === space.owner
    }));
  }

  // 스페이스의 모든 소켓에 이벤트 전송
  emitToSpace(spaceId, event, data) {
    const space = this.spaces.get(spaceId);
    if (space) {
      space.sockets.forEach(socketId => {
        io.to(socketId).emit(event, data);
      });
    }
  }

  // 소켓이 속한 스페이스 ID 반환
  getSocketSpace(socketId) {
    return this.socketToSpace.get(socketId);
  }
}

const spaceManager = new SpaceManager();

// --- Socket.IO 연결 처리 ---
io.on('connection', (socket) => {
  console.log(`새 클라이언트 접속: ${socket.id}`);

  // 사용자가 스페이스에 로그인
  socket.on('login', ({ userId, spaceId, userSpaces }) => {
    if (!userId || !spaceId) {
      console.log(`로그인 실패: userId=${userId}, spaceId=${spaceId}`);
      return;
    }

    console.log(`${userId}가 스페이스 ${spaceId}에 입장, userSpaces:`, userSpaces);
    
    const userList = spaceManager.joinSpace(socket.id, userId, spaceId, userSpaces);
    
    // 스페이스 사용자들에게 입장 알림
    spaceManager.emitToSpace(spaceId, 'user joined', { userId, userList });
    spaceManager.emitToSpace(spaceId, 'user list', { spaceId, userList });
  });

  // 큐브 추가 이벤트 (스페이스 내 브로드캐스트)
  socket.on('add cube', (data) => {
    const spaceId = spaceManager.getSocketSpace(socket.id);
    if (spaceId && data.spaceId === spaceId) {
      spaceManager.emitToSpace(spaceId, 'add cube', data);
    }
  });

  // 큐브 삭제 이벤트 (스페이스 내 브로드캐스트)
  socket.on('remove cube', (data) => {
    const spaceId = spaceManager.getSocketSpace(socket.id);
    if (spaceId && data.spaceId === spaceId) {
      spaceManager.emitToSpace(spaceId, 'remove cube', data);
    }
  });

  // 모델 배치 이벤트 (스페이스 내 브로드캐스트)
  socket.on('place model', (data) => {
    const spaceId = spaceManager.getSocketSpace(socket.id);
    if (spaceId && data.spaceId === spaceId) {
      console.log(`[MODEL] 모델 배치: ${data.cubes.length}개 큐브, spaceId=${spaceId}`);
      spaceManager.emitToSpace(spaceId, 'place model', data);
    }
  });

  // 방 정보 요청 (게스트 → 호스트)
  socket.on('request room info', ({ spaceId }) => {
    console.log(`[ROOM] 방 정보 요청: spaceId=${spaceId}, 요청자=${socket.id}`);
    
    if (!spaceId) return;
    
    const space = spaceManager.spaces.get(spaceId);
    if (space && space.owner) {
      // 호스트에게 방 정보 요청 전달
      const ownerSockets = Array.from(space.sockets).filter(sid => 
        spaceManager.socketToUser.get(sid) === space.owner
      );
      
      if (ownerSockets.length > 0) {
        const ownerSocketId = ownerSockets[0]; // 첫 번째 호스트 소켓
        console.log(`[ROOM] 호스트 ${space.owner}(${ownerSocketId})에게 방 정보 요청 전달`);
        io.to(ownerSocketId).emit('request room info', { 
          requesterSocketId: socket.id, 
          spaceId 
        });
      } else {
        console.log(`[ROOM] 호스트 ${space.owner}를 찾을 수 없음`);
      }
    } else {
      console.log(`[ROOM] 스페이스 ${spaceId} 또는 호스트가 없음`);
    }
  });

  // 방 정보 전달 (호스트 → 게스트)
  socket.on('send room info', ({ to, spaceId, sceneData }) => {
    console.log(`[ROOM] 방 정보 전달: ${socket.id} → ${to}, spaceId=${spaceId}`);
    
    if (to && sceneData) {
      io.to(to).emit('room info', { sceneData });
      console.log(`[ROOM] 방 정보 전달 완료`);
    } else {
      console.log(`[ROOM] 방 정보 전달 실패: to=${to}, sceneData=${!!sceneData}`);
    }
  });

  // 전체 씬 리셋 이벤트 (스페이스 내 브로드캐스트)
  socket.on('reset scene', (data) => {
    const spaceId = spaceManager.getSocketSpace(socket.id);
    if (spaceId && data.spaceId === spaceId) {
      console.log(`[SCENE] 씬 리셋: spaceId=${spaceId}, 발신자=${socket.id}`);
      spaceManager.emitToSpace(spaceId, 'reset scene', data);
    }
  });

  // 새 씬 로드 이벤트 (스페이스 내 브로드캐스트)
  socket.on('load new scene', (data) => {
    const spaceId = spaceManager.getSocketSpace(socket.id);
    if (spaceId && data.spaceId === spaceId) {
      console.log(`[SCENE] 새 씬 로드: spaceId=${spaceId}, 발신자=${socket.id}`);
      spaceManager.emitToSpace(spaceId, 'load new scene', data);
    }
  });

  // WebRTC 신호 처리
  socket.on('webrtc offer', (data) => {
    console.log('[WebRTC] Offer 수신:', spaceManager.socketToUser.get(socket.id), '→', data.targetUserId);
    const spaceId = spaceManager.getSocketSpace(socket.id);
    if (spaceId && data.spaceId === spaceId) {
      // 특정 사용자에게 offer 전달
      const space = spaceManager.spaces.get(spaceId);
      if (space) {
        const targetSockets = Array.from(space.sockets).filter(sid => 
          spaceManager.socketToUser.get(sid) === data.targetUserId
        );
        console.log('[WebRTC] 대상 소켓 찾기:', data.targetUserId, '→', targetSockets.length, '개');
        if (targetSockets.length > 0) {
          io.to(targetSockets[0]).emit('webrtc offer', {
            fromUserId: spaceManager.socketToUser.get(socket.id),
            offer: data.offer
          });
          console.log('[WebRTC] Offer 전달 완료:', targetSockets[0]);
        } else {
          console.log('[WebRTC] 대상 사용자 소켓을 찾을 수 없음:', data.targetUserId);
        }
      }
    } else {
      console.log('[WebRTC] 스페이스 불일치:', spaceId, 'vs', data.spaceId);
    }
  });

  socket.on('webrtc answer', (data) => {
    const spaceId = spaceManager.getSocketSpace(socket.id);
    if (spaceId && data.spaceId === spaceId) {
      // 특정 사용자에게 answer 전달
      const space = spaceManager.spaces.get(spaceId);
      if (space) {
        const targetSockets = Array.from(space.sockets).filter(sid => 
          spaceManager.socketToUser.get(sid) === data.targetUserId
        );
        if (targetSockets.length > 0) {
          io.to(targetSockets[0]).emit('webrtc answer', {
            fromUserId: spaceManager.socketToUser.get(socket.id),
            answer: data.answer
          });
        }
      }
    }
  });

  socket.on('webrtc ice-candidate', (data) => {
    const spaceId = spaceManager.getSocketSpace(socket.id);
    if (spaceId && data.spaceId === spaceId) {
      // 특정 사용자에게 ICE candidate 전달
      const space = spaceManager.spaces.get(spaceId);
      if (space) {
        const targetSockets = Array.from(space.sockets).filter(sid => 
          spaceManager.socketToUser.get(sid) === data.targetUserId
        );
        if (targetSockets.length > 0) {
          io.to(targetSockets[0]).emit('webrtc ice-candidate', {
            fromUserId: spaceManager.socketToUser.get(socket.id),
            candidate: data.candidate
          });
        }
      }
    }
  });

  // 연결 해제 처리
  socket.on('disconnect', () => {
    const userId = spaceManager.socketToUser.get(socket.id);
    const leftSpaceId = spaceManager.leaveSpace(socket.id);
    
    if (leftSpaceId && userId) {
      console.log(`${userId}가 스페이스 ${leftSpaceId}에서 나감`);
      
      const userList = spaceManager.getSpaceUserList(leftSpaceId);
      
      // 스페이스 사용자들에게 퇴장 알림
      spaceManager.emitToSpace(leftSpaceId, 'user left', { userId, userList });
      spaceManager.emitToSpace(leftSpaceId, 'user list', { spaceId: leftSpaceId, userList });
    }
    
    console.log(`클라이언트 연결 해제: ${socket.id}`);
  });
});

// 서버 시작
httpServer.listen(PORT, () => {
  console.log(`🌐 HTTP 서버가 http://localhost:${PORT}에서 실행 중입니다.`);
});

if (USE_HTTPS && httpsServer) {
  httpsServer.listen(HTTPS_PORT, () => {
    console.log(`🔒 HTTPS 서버가 https://localhost:${HTTPS_PORT}에서 실행 중입니다.`);
  });
}