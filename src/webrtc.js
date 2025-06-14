// WebRTC 관리 클래스
export class WebRTCManager {
  constructor(socket, spaceId, userId) {
    this.socket = socket;
    this.spaceId = spaceId;
    this.userId = userId;
    this.peerConnections = new Map(); // userId -> RTCPeerConnection
    this.localStream = null;
    this.videoFaceMappings = new Map(); // userId -> { cubeId, faceIndex }
    this.isVideoPlacementMode = false;
    this.placementTargetUserId = null;
    
    this.setupSocketHandlers();
    this.loadVideoMappings();
  }

  // 로컬 저장소에서 비디오 배치 정보 로드
  loadVideoMappings() {
    const saved = localStorage.getItem(`videoCubeMappings_${this.spaceId}`);
    if (saved) {
      const data = JSON.parse(saved);
      Object.entries(data).forEach(([userId, mapping]) => {
        this.videoFaceMappings.set(userId, mapping);
      });
    }
  }

  // 로컬 저장소에 비디오 배치 정보 저장
  saveVideoMappings() {
    const data = {};
    this.videoFaceMappings.forEach((mapping, userId) => {
      data[userId] = mapping;
    });
    localStorage.setItem(`videoCubeMappings_${this.spaceId}`, JSON.stringify(data));
  }

  // Socket.IO 이벤트 핸들러 설정
  setupSocketHandlers() {
    this.socket.on('webrtc offer', async (data) => {
      console.log('=== Offer 수신 ===', data);
      await this.handleOffer(data.fromUserId, data.offer);
    });

    this.socket.on('webrtc answer', async (data) => {
      console.log('=== Answer 수신 ===', data);
      await this.handleAnswer(data.fromUserId, data.answer);
    });

    this.socket.on('webrtc ice-candidate', async (data) => {
      console.log('=== ICE Candidate 수신 ===', data);
      await this.handleIceCandidate(data.fromUserId, data.candidate);
    });

    this.socket.on('user joined', (data) => {
      console.log('사용자 입장:', data.userId, '내 ID:', this.userId);
      // 새 사용자가 들어오면 기존 비디오 사용자들과 연결 시도
      if (data.userId !== this.userId && this.localStream) {
        console.log('통화 시작 시도:', data.userId);
        setTimeout(() => this.initiateCall(data.userId), 1000); // 1초 지연
      }
    });

    this.socket.on('user left', (data) => {
      this.closePeerConnection(data.userId);
      this.removeVideoFromSidebar(data.userId);
    });
  }

  // 로컬 비디오 스트림 시작
  async startLocalVideo() {
    console.log('로컬 비디오 시작 시도');
    try {
      console.log('카메라 권한 요청 중...');
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240 },
        audio: true
      });
      
      console.log('카메라 스트림 획득 성공:', this.localStream);
      console.log('userId:', this.userId);
      
      // 로컬 비디오를 사이드바에 추가
      this.addVideoToSidebar(this.userId, this.localStream);
      
      document.getElementById('start-video-btn').style.display = 'none';
      document.getElementById('stop-video-btn').style.display = 'inline-block';
      
      this.showToast('카메라가 시작되었습니다.');
      return true;
    } catch (error) {
      console.error('카메라 접근 실패:', error);
      this.showToast('카메라 접근에 실패했습니다: ' + error.message, true);
      return false;
    }
  }

  // 로컬 비디오 스트림 정지
  stopLocalVideo() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
      
      // 로컬 비디오를 사이드바에서 제거
      this.removeVideoFromSidebar(this.userId);
      
      // 모든 피어 연결 종료
      this.peerConnections.forEach((pc, userId) => {
        this.closePeerConnection(userId);
      });
      
      document.getElementById('start-video-btn').style.display = 'inline-block';
      document.getElementById('stop-video-btn').style.display = 'none';
      
      this.showToast('카메라가 정지되었습니다.');
    }
  }

  // 다른 사용자와 통화 시작
  async initiateCall(targetUserId) {
    if (!this.localStream) {
      console.log('로컬 스트림이 없음, 통화 시작 불가');
      return;
    }

    console.log('통화 시작:', targetUserId);
    const pc = this.createPeerConnection(targetUserId);
    this.peerConnections.set(targetUserId, pc);

    // 로컬 스트림을 피어 연결에 추가
    this.localStream.getTracks().forEach(track => {
      console.log('트랙 추가:', track.kind);
      pc.addTrack(track, this.localStream);
    });

    try {
      // Offer 생성 및 전송
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      console.log('Offer 전송:', targetUserId, 'spaceId:', this.spaceId);
      console.log('Socket 연결 상태:', this.socket.connected);
      
      this.socket.emit('webrtc offer', {
        spaceId: this.spaceId,
        targetUserId: targetUserId,
        offer: offer
      });
      console.log('Offer 전송 완료');
    } catch (error) {
      console.error('Offer 생성 실패:', error);
    }
  }

  // Offer 처리
  async handleOffer(fromUserId, offer) {
    console.log('Offer 수신:', fromUserId);
    const pc = this.createPeerConnection(fromUserId);
    this.peerConnections.set(fromUserId, pc);

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        console.log('응답용 트랙 추가:', track.kind);
        pc.addTrack(track, this.localStream);
      });
    }

    try {
      await pc.setRemoteDescription(offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      console.log('Answer 전송:', fromUserId);
      this.socket.emit('webrtc answer', {
        spaceId: this.spaceId,
        targetUserId: fromUserId,
        answer: answer
      });
    } catch (error) {
      console.error('Answer 생성 실패:', error);
    }
  }

  // Answer 처리
  async handleAnswer(fromUserId, answer) {
    console.log('Answer 수신:', fromUserId);
    const pc = this.peerConnections.get(fromUserId);
    if (pc) {
      try {
        await pc.setRemoteDescription(answer);
        console.log('Answer 설정 완료:', fromUserId);
      } catch (error) {
        console.error('Answer 설정 실패:', error);
      }
    }
  }

  // ICE Candidate 처리
  async handleIceCandidate(fromUserId, candidate) {
    const pc = this.peerConnections.get(fromUserId);
    if (pc) {
      await pc.addIceCandidate(candidate);
    }
  }

  // RTCPeerConnection 생성
  createPeerConnection(userId) {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
      ]
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit('webrtc ice-candidate', {
          spaceId: this.spaceId,
          targetUserId: userId,
          candidate: event.candidate
        });
      }
    };

    pc.ontrack = (event) => {
      console.log('원격 스트림 수신:', userId);
      this.handleRemoteStream(userId, event.streams[0]);
    };

    pc.onconnectionstatechange = () => {
      console.log(`연결 상태 (${userId}):`, pc.connectionState);
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        this.closePeerConnection(userId);
      }
    };

    return pc;
  }

  // 원격 스트림 처리
  handleRemoteStream(userId, stream) {
    console.log('원격 스트림 수신:', userId, stream);
    this.addVideoToSidebar(userId, stream);
    
    // 저장된 배치 정보가 있으면 자동 배치
    const mapping = this.videoFaceMappings.get(userId);
    if (mapping) {
      const cube = this.findCubeById(mapping.cubeId);
      if (cube) {
        this.applyVideoToFace(cube, mapping.faceIndex, stream, userId);
      } else {
        // 큐브가 없으면 사이드바에만 표시
        this.promptVideoPlacement(userId);
      }
    } else {
      // 처음 접속한 사용자면 배치 요청
      this.promptVideoPlacement(userId);
    }
  }

  // 사이드바에 비디오 추가
  addVideoToSidebar(userId, stream) {
    const videoList = document.getElementById('video-list');
    if (!videoList) {
      console.error('video-list 요소를 찾을 수 없습니다');
      return;
    }
    
    // 기존 비디오 제거
    const existing = document.getElementById(`video-item-${userId}`);
    if (existing) existing.remove();
    
    const videoItem = document.createElement('div');
    videoItem.id = `video-item-${userId}`;
    videoItem.className = 'video-item unplaced';
    
    // 로컬 비디오인지 확인
    const isLocal = userId === this.userId;
    const muteAttr = isLocal ? 'muted' : '';
    
    videoItem.innerHTML = `
      <video autoplay ${muteAttr} style="width:100%;height:80px;border-radius:4px;margin-bottom:5px;background:#000;"></video>
      <div style="font-size:12px;text-align:center;color:#333;">${userId}${isLocal ? ' (나)' : ''}</div>
      <button class="place-video-btn" style="width:100%;padding:3px;font-size:11px;background:#2196F3;color:white;border:none;border-radius:3px;cursor:pointer;margin-top:3px;">배치하기</button>
    `;
    
    const video = videoItem.querySelector('video');
    video.srcObject = stream;
    
    // 비디오 로드 이벤트 추가
    video.addEventListener('loadedmetadata', () => {
      console.log(`비디오 로드됨: ${userId}`, video.videoWidth, 'x', video.videoHeight);
    });
    
    video.addEventListener('error', (e) => {
      console.error(`비디오 오류: ${userId}`, e);
    });
    
    const placeBtn = videoItem.querySelector('.place-video-btn');
    placeBtn.onclick = () => this.startVideoPlacement(userId);
    
    videoList.appendChild(videoItem);
    console.log(`비디오 추가됨: ${userId}`);
  }

  // 사이드바에서 비디오 제거 (사용자 퇴장 시)
  removeVideoFromSidebar(userId) {
    // 3D 공간에서 해당 사용자의 비디오 찾아서 리소스 정리
    this.cleanupUserVideoResources(userId);
    
    const videoItem = document.getElementById(`video-item-${userId}`);
    if (videoItem) videoItem.remove();
  }
  
  // 특정 사용자의 모든 비디오 리소스 정리
  cleanupUserVideoResources(userId) {
    if (window.zoneData) {
      for (const [zoneKey, zoneCubes] of Object.entries(window.zoneData)) {
        zoneCubes.forEach(cube => {
          if (cube.userData.videos) {
            Object.keys(cube.userData.videos).forEach(faceIndex => {
              const videoInfo = cube.userData.videos[faceIndex];
              if (videoInfo.userId === userId) {
                // 비디오 리소스 정리
                this.cleanupVideoResources(videoInfo);
                
                // 원래 머티리얼로 복원
                if (Array.isArray(cube.material) && cube.userData.originalMaterials) {
                  cube.material[faceIndex] = cube.userData.originalMaterials[faceIndex];
                }
                
                delete cube.userData.videos[faceIndex];
              }
            });
          }
        });
      }
    }
    
    // 비디오 매핑에서도 제거
    this.videoFaceMappings.delete(userId);
    this.saveVideoMappings();
  }

  // 비디오 배치 요청
  promptVideoPlacement(userId) {
    this.showToast(`${userId}님의 비디오를 배치할 위치를 선택하세요.`);
  }

  // 비디오 배치 모드 시작
  startVideoPlacement(userId) {
    this.isVideoPlacementMode = true;
    this.placementTargetUserId = userId;
    document.body.style.cursor = 'crosshair';
    this.showToast('큐브 면을 클릭하여 비디오를 배치하세요. (ESC로 취소)');
  }

  // 비디오 배치 모드 종료
  exitVideoPlacement() {
    this.isVideoPlacementMode = false;
    this.placementTargetUserId = null;
    document.body.style.cursor = 'default';
    
    // 드래그 상태 강제 초기화
    this.resetDragState();
  }
  
  // 드래그 상태 초기화 함수
  resetDragState() {
    // DOM 이벤트로 mouseup을 시뮬레이션하여 드래그 상태 초기화
    const event = new MouseEvent('mouseup', {
      bubbles: true,
      cancelable: true,
      button: 0
    });
    
    // 렌더러 캔버스에 mouseup 이벤트 발생
    if (window.renderer && window.renderer.domElement) {
      window.renderer.domElement.dispatchEvent(event);
      console.log('🔴 비디오 배치 완료 - 드래그 상태 초기화 (mouseup 시뮬레이션)');
    }
  }

  // 큐브 면에 비디오 배치
  async placeVideoOnFace(cube, faceIndex, userId) {
    const videoItem = document.getElementById(`video-item-${userId}`);
    if (!videoItem) {
      console.error('비디오 아이템을 찾을 수 없음:', userId);
      return;
    }
    
    // 이미 배치된 비디오인지 확인 - 실제 큐브 존재 여부도 체크
    console.log('🔍 배치 체크:', { userId, hasMapping: this.videoFaceMappings.has(userId), mappings: Array.from(this.videoFaceMappings.keys()) });
    if (this.videoFaceMappings.has(userId)) {
      // 매핑이 있지만 실제 큐브가 존재하는지 확인
      const mapping = this.videoFaceMappings.get(userId);
      const actualCube = this.findCubeById(mapping.cubeId);
      
      if (actualCube && actualCube.userData.videos && actualCube.userData.videos[mapping.faceIndex]) {
        // 실제로 배치되어 있음
        console.log('🔍 실제로 배치되어 있음');
        this.showToast(`${userId}님의 비디오는 이미 배치되어 있습니다.`);
        this.exitVideoPlacement();
        return;
      } else {
        // 매핑은 있지만 실제 큐브는 없음 - 매핑 정리
        console.log('🔍 고아 매핑 발견, 정리 중:', { mapping, actualCube: !!actualCube });
        this.videoFaceMappings.delete(userId);
        this.saveVideoMappings();
        
        // 사이드바 상태도 업데이트
        videoItem.className = 'video-item unplaced';
        const placeBtn = videoItem.querySelector('.place-video-btn');
        if (placeBtn) {
          placeBtn.style.display = 'block';
          placeBtn.textContent = '배치하기';
        }
        const statusDiv = videoItem.querySelector('.placement-status');
        if (statusDiv) {
          statusDiv.remove();
        }
      }
    }
    
    const video = videoItem.querySelector('video');
    const stream = video.srcObject;
    
    await this.applyVideoToFace(cube, faceIndex, stream, userId);
    
    // 배치 정보 저장
    const cubeId = this.getCubeId(cube);
    this.videoFaceMappings.set(userId, { cubeId, faceIndex });
    this.saveVideoMappings();
    
    // 사이드바 상태 업데이트 - 버튼 제거하고 배치됨 표시
    videoItem.className = 'video-item placed';
    const placeBtn = videoItem.querySelector('.place-video-btn');
    placeBtn.style.display = 'none';
    
    // 배치됨 상태 표시 추가
    let statusDiv = videoItem.querySelector('.placement-status');
    if (!statusDiv) {
      statusDiv = document.createElement('div');
      statusDiv.className = 'placement-status';
      statusDiv.style.cssText = 'text-align:center;color:#4CAF50;font-size:11px;font-weight:bold;margin-top:3px;';
      videoItem.appendChild(statusDiv);
    }
    statusDiv.textContent = '배치됨';
    
    this.exitVideoPlacement();
    this.showToast(`${userId}님의 비디오가 배치되었습니다.`);
  }

  // 큐브 면에 비디오 텍스처 적용
  async applyVideoToFace(cube, faceIndex, stream, userId) {
    // 원본 머티리얼 백업 및 배열 변환
    if (!cube.userData.originalMaterials) {
      // 원본 머티리얼 저장
      const originalMaterial = Array.isArray(cube.material) ? cube.material[0] : cube.material;
      cube.userData.originalMaterials = [];
      
      // 6개 면용 머티리얼 배열 생성
      const materials = [];
      for (let i = 0; i < 6; i++) {
        const clonedMaterial = originalMaterial.clone();
        cube.userData.originalMaterials.push(clonedMaterial.clone()); // 원본 보존
        materials.push(clonedMaterial);
      }
      cube.material = materials;
    } else if (!Array.isArray(cube.material)) {
      // 이미 백업이 있지만 머티리얼이 배열이 아닌 경우
      const materials = [];
      for (let i = 0; i < 6; i++) {
        materials.push(cube.userData.originalMaterials[i].clone());
      }
      cube.material = materials;
    }
    
    // 비디오 텍스처 생성 (고품질 설정)
    const video = document.createElement('video');
    video.srcObject = stream;
    video.autoplay = true;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";
    video.width = 512; // 텍스처 해상도 향상
    video.height = 384;
    
    // 비디오가 로드될 때까지 기다림
    await new Promise((resolve) => {
      video.addEventListener('loadeddata', resolve, { once: true });
      video.play();
    });
    
    const videoTexture = new THREE.VideoTexture(video);
    videoTexture.minFilter = THREE.LinearFilter;
    videoTexture.magFilter = THREE.LinearFilter;
    videoTexture.wrapS = THREE.ClampToEdgeWrapping;
    videoTexture.wrapT = THREE.ClampToEdgeWrapping;
    videoTexture.flipY = true;
    videoTexture.generateMipmaps = false;
    
    // 색상 공간 및 인코딩 설정으로 선명도 개선
    videoTexture.colorSpace = THREE.SRGBColorSpace;
    videoTexture.format = THREE.RGBAFormat;
    
    // 해당 면에 비디오 텍스처 적용 (고품질 설정)
    cube.material[faceIndex] = new THREE.MeshBasicMaterial({
      map: videoTexture,
      side: THREE.FrontSide,
      transparent: false,
      alphaTest: 0,
      depthWrite: true,
      depthTest: true,
      toneMapped: false // 톤 매핑 비활성화로 원본 색상 유지
    });
    
    // 큐브에 비디오 정보 저장
    if (!cube.userData.videos) cube.userData.videos = {};
    cube.userData.videos[faceIndex] = { userId, stream, video, videoTexture };
  }

  // 큐브에서 비디오 제거 (사용하지 않음 - 좀비 코드)
  removeVideoFromCube(userId) {
    // 이 함수는 더 이상 사용하지 않음 - 재배치 기능 제거됨
    console.log('removeVideoFromCube 호출됨 (사용하지 않음):', userId);
  }

  // 큐브의 비디오들을 사이드바로 이동 (큐브 삭제 시 호출)
  moveVideosToSidebar(cube) {
    console.log('🔄 moveVideosToSidebar 호출됨:', cube.userData.videos);
    if (cube.userData.videos) {
      console.log('🔄 처리할 비디오 개수:', Object.keys(cube.userData.videos).length);
      Object.values(cube.userData.videos).forEach(videoInfo => {
        console.log('🔄 비디오 처리 중:', videoInfo.userId);
        // 메모리 리크 방지: 비디오 텍스처와 자원 정리
        this.cleanupVideoResources(videoInfo);
        
        const videoItem = document.getElementById(`video-item-${videoInfo.userId}`);
        if (videoItem) {
          // 배치됨 상태를 원래대로 되돌리기
          videoItem.className = 'video-item unplaced';
          
          // 배치하기 버튼 다시 보이기
          const placeBtn = videoItem.querySelector('.place-video-btn');
          if (placeBtn) {
            placeBtn.style.display = 'block';
            placeBtn.textContent = '배치하기';
          }
          
          // 배치됨 상태 표시 제거
          const statusDiv = videoItem.querySelector('.placement-status');
          if (statusDiv) {
            statusDiv.remove();
          }
        }
        
        // 비디오 매핑 제거
        console.log('🗑️ 매핑 삭제:', videoInfo.userId, '삭제 전:', this.videoFaceMappings.has(videoInfo.userId));
        this.videoFaceMappings.delete(videoInfo.userId);
        console.log('🗑️ 매핑 삭제 후:', this.videoFaceMappings.has(videoInfo.userId));
      });
      this.saveVideoMappings();
    }
  }
  
  // 비디오 리소스 정리 (메모리 리크 방지)
  cleanupVideoResources(videoInfo) {
    if (videoInfo.video) {
      // 비디오 엘리먼트 정리
      videoInfo.video.pause();
      videoInfo.video.srcObject = null;
      videoInfo.video.load(); // 메모리 해제
    }
    
    if (videoInfo.videoTexture) {
      // 비디오 텍스처 정리
      videoInfo.videoTexture.dispose();
    }
    
    console.log('🧹 비디오 리소스 정리 완료:', videoInfo.userId);
  }

  // 피어 연결 종료
  closePeerConnection(userId) {
    const pc = this.peerConnections.get(userId);
    if (pc) {
      pc.close();
      this.peerConnections.delete(userId);
    }
    this.removeVideoFromSidebar(userId);
  }

  // 유틸리티 함수들
  getCubeId(cube) {
    return `${cube.position.x}_${cube.position.y}_${cube.position.z}`;
  }

  findCubeById(cubeId) {
    if (window.findCubeById) {
      return window.findCubeById(cubeId);
    }
    return null;
  }

  showToast(message, isError = false) {
    // main-legacy.js의 showToast 함수 사용
    if (window.showToast) {
      window.showToast(message, isError);
    } else {
      console.log(message);
    }
  }

  // 큐브 면 감지
  detectCubeFace(intersectionPoint, cube) {
    const point = intersectionPoint.point;
    const cubeCenter = cube.position;
    
    // 교차점에서 큐브 중심으로의 방향 벡터
    const direction = new THREE.Vector3().subVectors(point, cubeCenter);
    
    // 가장 큰 축 성분으로 면 결정
    const absX = Math.abs(direction.x);
    const absY = Math.abs(direction.y); 
    const absZ = Math.abs(direction.z);
    
    if (absX > absY && absX > absZ) {
      return direction.x > 0 ? 0 : 1; // 오른쪽(+X) 또는 왼쪽(-X)
    } else if (absY > absX && absY > absZ) {
      return direction.y > 0 ? 2 : 3; // 위(+Y) 또는 아래(-Y)
    } else {
      return direction.z > 0 ? 4 : 5; // 앞(+Z) 또는 뒤(-Z)
    }
  }
}