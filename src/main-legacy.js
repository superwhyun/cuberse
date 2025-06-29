// THREE.js를 글로벌 객체에서 가져오기
const THREE = window.THREE;

import { getUserSpaces } from './spaces.js';

// --- 전역 spaceId, currentZoneX, currentZoneY 선언 ---
let spaceId;
let currentZoneX;
let currentZoneY;
import { createJumpInButton } from './jumpInButton.js';
import { FPSControls } from './fpsControls.js';
// --- Socket.IO 클라이언트 연결 ---
let socket = null;
let isRealtimeAvailable = false;

// setupSocketIO 함수는 initApp 내부에서 정의될 예정
// -----------------------------------------
console.log('main-legacy.js 로딩됨, THREE:', THREE);

// 유틸리티 함수들
function showLoading(text = '로딩 중...') {
  const overlay = document.createElement('div');
  overlay.className = 'loading-overlay';
  overlay.id = 'loading-overlay';
  overlay.innerHTML = `
    <div class="loading-spinner"></div>
    <div class="loading-text">${text}</div>
  `;
  document.body.appendChild(overlay);
}

function hideLoading() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.remove();
  const initialLoading = document.getElementById('initial-loading');
  if (initialLoading) initialLoading.remove();
}

function showToast(message, isError = false) {
  const toast = document.createElement('div');
  toast.className = `toast ${isError ? 'error' : ''}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => toast.classList.add('show'), 100);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function initApp() {
  // FPSControls 인스턴스 참조 전역 변수 선언
  let fpsControls = null;
  console.log('initApp 함수 시작');

  

  
  try {
  // ---- Multi-Space/Workspace Support ----
  function generateSpaceId() {
    return Math.random().toString(36).substr(2, 8);
  }
  function getSpaceIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    let spaceId = params.get('space');
    if (!spaceId) {
      spaceId = generateSpaceId();
      params.set('space', spaceId);
      window.location.search = params.toString(); // reloads page with new spaceId
    }
    return spaceId;
  }
  function getStorageKey(spaceId) {
    return `cuberse_space_${spaceId}`;
  }
  function saveSpace(spaceId, sceneData) {
    localStorage.setItem(getStorageKey(spaceId), JSON.stringify(sceneData));
  }
  function loadSpace(spaceId) {
    const data = localStorage.getItem(getStorageKey(spaceId));
    return data ? JSON.parse(data) : null;
  }
  spaceId = getSpaceIdFromUrl();
  
  // ---- Zone System ----
  currentZoneX = 0;
  currentZoneY = 0;
  const ZONE_SIZE = 20; // 각 Zone은 20x20
  const ZONE_DIVISIONS = 20;
  
  // 카메라 위치 기반 Zone 그리드 자동 생성
  let lastCheckedCameraPos = { x: 0, z: 0 };
  const CHECK_DISTANCE = 5; // 5 유닛 이동할 때마다 체크
  
  function checkAndCreateNearbyZones() {
    // 카메라가 지면에서 너무 멀리 있으면 Zone 생성하지 않음
    const MAX_HEIGHT_FOR_ZONE_CREATION = 50; // 높이 50 이상에서는 Zone 생성 안 함
    if (camera.position.y > MAX_HEIGHT_FOR_ZONE_CREATION) {
      return;
    }
    
    // 카메라가 충분히 이동했는지 확인
    const currentPos = camera.position;
    const distance = Math.sqrt(
      Math.pow(currentPos.x - lastCheckedCameraPos.x, 2) + 
      Math.pow(currentPos.z - lastCheckedCameraPos.z, 2)
    );
    
    if (distance < CHECK_DISTANCE) return;
    
    // 카메라 위치를 기준으로 필요한 Zone들 계산
    const cameraZoneX = Math.floor(currentPos.x / ZONE_SIZE);
    const cameraZoneZ = Math.floor(currentPos.z / ZONE_SIZE);
    
    // 카메라 주변 5x5 Zone 영역의 그리드 생성
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        const zoneX = cameraZoneX + dx;
        const zoneZ = cameraZoneZ + dz;
        const zoneKey = getZoneKey(zoneX, zoneZ);
        
        // 그리드가 없으면 생성
        if (!zoneGrids.has(zoneKey)) {
          createZoneGrid(zoneX, zoneZ);
        }
        
        // Zone 텍스트도 생성
        if (!zoneTexts.has(zoneKey)) {
          createZoneText(zoneX, zoneZ);
        }
      }
    }
    
    // 마지막 체크 위치 업데이트
    lastCheckedCameraPos.x = currentPos.x;
    lastCheckedCameraPos.z = currentPos.z;
  }

  function clearDragPreview() {
    dragPreviewCubes.forEach(cube => scene.remove(cube));
    dragPreviewCubes.length = 0;
  }

  // Zone별 큐브 데이터 저장
  const zoneData = {};
  
  // 모델 배치 모드 관련 변수
  let placementMode = false;
  let placementModelData = null;
  let placementCursor = null;
  let placementBounds = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
  let placementPreviewCubes = []; // 배치 미리보기 큐브들
  
  function getZoneKey(zoneX, zoneY) {
    return `${zoneX},${zoneY}`;
  }
  
  function getCurrentZoneKey() {
    return getZoneKey(currentZoneX, currentZoneY);
  }
  
  function getZoneCubes(zoneX, zoneY) {
    const key = getZoneKey(zoneX, zoneY);
    if (!zoneData[key]) {
      zoneData[key] = [];
    }
    return zoneData[key];
  }
  
  function addCubeToZone(zoneX, zoneY, cube) {
    const zoneCubes = getZoneCubes(zoneX, zoneY);
    zoneCubes.push(cube);
    updateFpsObstacles();
  }
  
  function removeCubeFromZone(zoneX, zoneY, cube, emitToSocket = true) {
    const zoneCubes = getZoneCubes(zoneX, zoneY);
    const index = zoneCubes.findIndex(c =>
      Math.abs(c.position.x - cube.position.x) < 0.01 &&
      Math.abs(c.position.y - cube.position.y) < 0.01 &&
      Math.abs(c.position.z - cube.position.z) < 0.01
    );
    
    if (index > -1) {
      // 실시간 동기화: emitToSocket이 true일 때만 전송
      if (emitToSocket && isRealtimeAvailable && socket) {
        const data = {
          x: cube.gridX,
          y: cube.gridY,
          z: cube.gridZ,
          zoneX: zoneX,
          zoneY: zoneY,
          spaceId: spaceId
        };
        socket.emit('remove cube', data);
      }
      
      zoneCubes.splice(index, 1);
      updateFpsObstacles();
      
      // 로컬 삭제일 때만 자동저장 (원격 삭제 시에는 자동저장 안 함)
      if (emitToSocket) {
        autoSaveCurrentSpace();
      }
    }
  }
  
  function removeCubeAt(x, y, z) {
    // 현재 Zone에서 해당 위치의 큐브 찾기
    const currentZoneCubes = getZoneCubes(currentZoneX, currentZoneY);
    const targetCube = currentZoneCubes.find(cube => 
      Math.abs(cube.position.x - x) < 0.01 &&
      Math.abs(cube.position.y - y) < 0.01 &&
      Math.abs(cube.position.z - z) < 0.01
    );
    
    if (targetCube) {
      scene.remove(targetCube);
      removeCubeFromZone(currentZoneX, currentZoneY, targetCube, false);
    }
  }
  
  // Socket.IO 초기화 (Zone 함수들이 정의된 후)
  // 전역 변수 선언
  let isOwner = false;
  let myId = localStorage.getItem('cuberse_current_user');
  let userListCache = [];
  let hasRequestedRoomInfo = false; // 방 정보 요청 플래그
  
  function setupSocketIO() {
    try {
      if (window.io) {
        socket = window.io();
        
        socket.on('connect', () => {
          isRealtimeAvailable = true;
          
          const userId = localStorage.getItem('cuberse_current_user');
          if (userId) {
            const userSpaces = getUserSpaces(userId);
            socket.emit('login', { userId, userSpaces, spaceId });
          }
        });

        // --- 신규 참가자: 방 정보 요청 ---
        
        socket.on('user list', (payload) => {
          // payload: { spaceId, userList }
          let list = payload;
          let listSpaceId = spaceId;
          if (payload && typeof payload === 'object' && Array.isArray(payload.userList)) {
            list = payload.userList;
            listSpaceId = payload.spaceId;
          }
          // 현재 내 spaceId와 다르면 무시
          if (listSpaceId !== spaceId) return;

          const ul = document.getElementById('user-list');
          myId = localStorage.getItem('cuberse_current_user');
          userListCache = list;
          isOwner = false;
          if (ul) {
            ul.innerHTML = '';
            list.forEach(user => {
              const li = document.createElement('li');
              let label = user.userId;
              if (user.userId === myId) label += ' (나)';
              if (user.isOwner) label += ' (주인)';
              if (user.userId === myId && user.isOwner) isOwner = true;
              li.textContent = label;
              ul.appendChild(li);
            });
          }
          // 내가 주인이 아니면 방 정보 요청 (한 번만)
          if (!isOwner && !hasRequestedRoomInfo) {
            console.log('[ROOM] 방 정보 요청 전송:', spaceId);
            socket.emit('request room info', { spaceId });
            hasRequestedRoomInfo = true;
          }
        });

        // --- 방 정보(씬 데이터) 수신 시 localStorage에 저장 및 동기화 ---
        socket.on('room info', ({ sceneData }) => {
          console.log('[ROOM] 방 정보 수신:', { 
            hasSceneData: !!sceneData,
            zoneCount: sceneData ? Object.keys(sceneData).filter(k => k !== 'currentZone').length : 0,
            totalCubes: sceneData ? Object.values(sceneData).filter(v => Array.isArray(v)).reduce((sum, arr) => sum + arr.length, 0) : 0
          });
          if (sceneData) {
            saveSpace(spaceId, sceneData);
            showToast('방 정보 동기화 완료');
            // 즉시 씬 데이터 로드 (새로고침 대신)
            loadSceneFromData(sceneData);
          }
        });

        // --- 주인: 방 정보 요청 수신 시 처리 ---
        socket.on('request room info', ({ requesterSocketId, spaceId: reqSpaceId }) => {
          console.log('[ROOM] 방 정보 요청 수신:', { requesterSocketId, reqSpaceId, mySpaceId: spaceId, isOwner });
          // 내가 주인이고, 요청 spaceId가 내 spaceId와 같으면
          if (isOwner && reqSpaceId === spaceId) {
            const sceneData = loadSpace(spaceId);
            console.log('[ROOM] 방 정보 전달 시도:', { 
              hasSceneData: !!sceneData,
              zoneCount: sceneData ? Object.keys(sceneData).filter(k => k !== 'currentZone').length : 0,
              totalCubes: sceneData ? Object.values(sceneData).filter(v => Array.isArray(v)).reduce((sum, arr) => sum + arr.length, 0) : 0
            });
            if (sceneData) {
              socket.emit('send room info', { to: requesterSocketId, spaceId, sceneData });
              showToast('방 정보 요청에 응답함');
              console.log('[ROOM] 방 정보 전달 완료');
            } else {
              console.log('[ROOM] 전달할 씬 데이터가 없음');
            }
          } else {
            console.log('[ROOM] 요청 거부 - 주인이 아니거나 spaceId 불일치');
          }
        });

        // 큐브 추가 이벤트 수신
        socket.on('add cube', (data) => {
          if (data.spaceId === spaceId) {
            // 중복 검사
            const zoneCubes = getZoneCubes(data.zoneX, data.zoneY);
            if (zoneCubes.some(cube => cube.gridX === data.x && cube.gridY === data.y && cube.gridZ === data.z)) {
              return;
            }
            
            // 해당 Zone의 큐브로 직접 생성
            const geometry = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);
            
            // 조명 설정에 따른 머티리얼 선택
            const material = lightingEnabled 
              ? new THREE.MeshLambertMaterial({ color: data.color })
              : new THREE.MeshBasicMaterial({ color: data.color });
            
            const cube = new THREE.Mesh(geometry, material);
            
            // 테두리 추가
            const edges = new THREE.EdgesGeometry(geometry);
            const lineMaterial = new THREE.LineBasicMaterial({ 
              color: 0x000000,
              linewidth: 1,
              transparent: true,
              opacity: 0.3
            });
            const wireframe = new THREE.LineSegments(edges, lineMaterial);
            wireframe.raycast = () => {}; // raycast 비활성화
            cube.add(wireframe);
            
            // Zone 좌표계 적용
            const worldX = (data.zoneX * ZONE_SIZE) + (data.x - ZONE_DIVISIONS / 2 + 0.5) * cubeSize;
            const worldZ = (data.zoneY * ZONE_SIZE) + (data.z - ZONE_DIVISIONS / 2 + 0.5) * cubeSize;
            
            cube.position.set(
              worldX,
              (data.y + 0.5) * cubeSize,
              worldZ
            );
            
            // grid 좌표 설정
            cube.gridX = data.x;
            cube.gridY = data.y;
            cube.gridZ = data.z;
            cube._byRemote = true;
            
            scene.add(cube);
            addCubeToZone(data.zoneX, data.zoneY, cube);
            updateFpsObstacles();
            
            // 원격 큐브 추가도 자동저장 (주인이 아닌 사용자 작업도 저장)
            autoSaveCurrentSpace();
          }
        });
        
        // 모델 배치 이벤트 수신
        socket.on('place model', (data) => {
          if (data.spaceId === spaceId && data.type === 'model_placement') {
            // 모든 큐브를 한 번에 배치
            data.cubes.forEach(cubeData => {
              // 중복 검사
              const zoneCubes = getZoneCubes(cubeData.zoneX, cubeData.zoneY);
              if (zoneCubes.some(cube => 
                cube.gridX === cubeData.x && 
                cube.gridY === cubeData.y && 
                cube.gridZ === cubeData.z
              )) {
                return;
              }
              
              // 큐브 생성
              const geometry = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);
              
              // 조명 설정에 따른 머티리얼 선택
              const material = lightingEnabled 
                ? new THREE.MeshLambertMaterial({ color: cubeData.color })
                : new THREE.MeshBasicMaterial({ color: cubeData.color });
              
              const cube = new THREE.Mesh(geometry, material);
              
              // 테두리 추가
              const edges = new THREE.EdgesGeometry(geometry);
              const lineMaterial = new THREE.LineBasicMaterial({ 
                color: 0x000000,
                linewidth: 1,
                transparent: true,
                opacity: 0.3
              });
              const wireframe = new THREE.LineSegments(edges, lineMaterial);
              wireframe.raycast = () => {}; // raycast 비활성화
              cube.add(wireframe);
              
              // Zone 좌표계 적용
              const worldX = (cubeData.zoneX * ZONE_SIZE) + (cubeData.x - ZONE_DIVISIONS / 2 + 0.5) * cubeSize;
              const worldZ = (cubeData.zoneY * ZONE_SIZE) + (cubeData.z - ZONE_DIVISIONS / 2 + 0.5) * cubeSize;
              
              cube.position.set(
                worldX,
                (cubeData.y + 0.5) * cubeSize,
                worldZ
              );
              
              // grid 좌표 설정
              cube.gridX = cubeData.x;
              cube.gridY = cubeData.y;
              cube.gridZ = cubeData.z;
              cube._byRemote = true;
              
              scene.add(cube);
              addCubeToZone(cubeData.zoneX, cubeData.zoneY, cube);
            });
            
            updateFpsObstacles();
            showToast('다른 사용자가 모델을 배치했습니다.');
            
            // 원격 모델 배치도 자동저장
            autoSaveCurrentSpace();
          }
        });
        
        // 큐브 삭제 이벤트 수신
        socket.on('remove cube', (data) => {
          if (data.spaceId === spaceId) {
            const zoneCubes = getZoneCubes(data.zoneX, data.zoneY);
            const target = zoneCubes.find(cube =>
              cube.gridX === data.x && cube.gridY === data.y && cube.gridZ === data.z
            );
            
            if (target) {
              // 큐브 삭제 전에 비디오 상태 복원 (원격 삭제)
              if (window.webrtcManager && target.userData.videos) {
                window.webrtcManager.moveVideosToSidebar(target);
              }
              
              scene.remove(target);
              removeCubeFromZone(data.zoneX, data.zoneY, target, false);
              
              // 원격 큐브 삭제도 자동저장
              autoSaveCurrentSpace();
            }
          }
        });
        
        // 전체 씬 리셋 이벤트 수신
        socket.on('reset scene', (data) => {
          if (data.spaceId === spaceId) {
            console.log('[SCENE] 전체 씬 리셋 수신');
            
            // 모든 Zone의 기존 큐브들 제거
            for (const [zoneKey, zoneCubes] of Object.entries(zoneData)) {
              zoneCubes.forEach(cube => scene.remove(cube));
              zoneCubes.length = 0;
            }
            
            updateFpsObstacles();
            showToast('방장이 새로운 모델을 로딩하고 있습니다...');
          }
        });
        
        // 새 씬 데이터 로드 이벤트 수신
        socket.on('load new scene', (data) => {
          if (data.spaceId === spaceId && data.sceneData) {
            console.log('[SCENE] 새 씬 데이터 로드 수신');
            
            // 로컬 저장소에 새 데이터 저장
            saveSpace(spaceId, data.sceneData);
            
            // 새 씬 데이터 로드
            loadSceneFromData(data.sceneData);
            
            showToast('새로운 모델이 로드되었습니다.');
          }
        });
        
      } else {
        console.warn('[Socket.IO] window.io가 존재하지 않습니다.');
      }
    } catch (e) {
      console.warn('[Socket.IO] 실시간 서버 연결 실패, 서버리스 모드로 동작합니다.');
      socket = null;
      isRealtimeAvailable = false;
    }
    
    // WebRTC 초기화 (Socket.IO 연결 후)
    console.log('Socket 상태 확인:', { socket: !!socket, isRealtimeAvailable });
    if (socket && isRealtimeAvailable) {
      console.log('WebRTC 초기화 예약됨');
      setTimeout(() => {
        console.log('WebRTC 초기화 실행');
        initWebRTC();
      }, 1000);
    } else {
      console.log('Socket.IO 연결 실패, WebRTC 비활성화');
      // Socket.IO 없이도 WebRTC 초기화 (테스트용)
      setTimeout(() => {
        console.log('Socket.IO 없이 WebRTC 초기화 시도');
        initWebRTC();
      }, 1000);
    }
  }
  
  setupSocketIO();
  
  
  // Zone 배열에서 씬에 없는 큐브들 정리
  function cleanupZoneArrays() {
    Object.keys(zoneData).forEach(zoneKey => {
      const zoneCubes = zoneData[zoneKey];
      zoneData[zoneKey] = zoneCubes.filter(cube => scene.children.includes(cube));
    });
    updateFpsObstacles();
  }
  // ---- End Zone System ----
  
  console.log('워크스페이스 ID:', spaceId);
  
  let hoveredCube = null;
  let hoveredFaceNormal = null;
  let highlightEdge = null;
  const container = document.getElementById('container');
  const colorInput = document.getElementById('cubeColor');

  let cubeColor = colorInput.value;

  // 자동 저장 트리거 함수 (Zone 시스템용)
  function autoSaveCurrentSpace() {
    const allSceneData = {};
    
    // 모든 Zone의 데이터를 저장
    for (const [zoneKey, zoneCubes] of Object.entries(zoneData)) {
      if (zoneCubes.length > 0) {
        allSceneData[zoneKey] = zoneCubes.map(cube => ({
          x: cube.position.x,
          y: cube.position.y,
          z: cube.position.z,
          color: `#${Array.isArray(cube.material) 
            ? cube.material[0]?.color?.getHexString() || 'ffffff'
            : cube.material?.color?.getHexString() || 'ffffff'}`
        }));
      }
    }
    
    // 현재 Zone 정보도 저장
    allSceneData.currentZone = { x: currentZoneX, y: currentZoneY };
    
    saveSpace(spaceId, allSceneData);
    // 자동저장 토스트 메시지 제거
  }

  // Mouse drag variables
  let isDragging = false;
  let isRightDragging = false; // 우클릭 드래그 상태
  let deletedCubesInDrag = new Set(); // 드래그 중 삭제된 큐브들 추적
  let dragPreviewCubes = []; // 드래그 미리보기 큐브들
  let previousMousePosition = { x: 0, y: 0 };
  let initialMousePosition = { x: 0, y: 0 };
  const dragThreshold = 5; // pixels
  let wasDraggingJustNow = false; // Flag to differentiate click from drag
  let isDraggingCube = false; // 큐브 드래그 모드 플래그
  let dragStartCube = null; // 드래그 시작 큐브
  let dragStartFace = null; // 드래그 시작 면

  // 전역 접근을 위해 window 객체에 노출
  window.isDragging = isDragging;
  window.isDraggingCube = isDraggingCube;
  window.dragStartCube = dragStartCube;
  window.dragStartFace = dragStartFace;
  window.wasDraggingJustNow = wasDraggingJustNow;
  window.clearDragPreview = clearDragPreview;
  window.zoneData = zoneData; // zoneData도 전역으로 노출

  // ---- 3D 환경 구성: 씬, 카메라, 렌더러, 플레이어 본체, FPSControls ----
  // 1. THREE.Scene 생성
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf0f0f0);
  console.log('씬 생성:', scene);

  // 2. THREE.PerspectiveCamera 생성
  //    (FPS/편집모드 전환에 따라 위치와 계층 구조가 결정됨)
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  console.log('카메라 생성:', camera);
  
  // 카메라 초기 위치 설정 (가장 먼저)
  camera.position.set(-20, 20, 20);
  camera.lookAt(0, 0, 0);

  // 3. THREE.WebGLRenderer 생성 및 DOM에 추가
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  
  // 색상 공간 설정으로 비디오 텍스처 색상 개선
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  
  container.appendChild(renderer.domElement);
  console.log('렌더러 생성 및 추가:', renderer);
  
  // 전역 접근을 위해 renderer 노출
  window.renderer = renderer;

  // 4. 플레이어 본체(THREE.Object3D) 생성 및 씬에 추가
  //    FPS 모드에서 카메라의 부모가 됨
  //    (이 구조를 통해 FPSControls가 위치/회전을 일관되게 제어)
  const playerObject = new THREE.Object3D();
  scene.add(playerObject);

  // 5. 카메라 위치(눈높이) 설정 및 playerObject의 자식으로 추가
  //    (중복 add 방지, 계층 구조 명확화)
  camera.position.set(0, 1.6, 0); // baseY = 1.6 (눈높이)
  playerObject.add(camera);

  // 6. FPSControls 인스턴스 생성 (playerObject, camera, renderer.domElement 순)
  //    FPS 모드에서는 playerObject가 실제 이동하며, camera는 그 자식
  fpsControls = new FPSControls(playerObject, camera, renderer.domElement);

  // FPS 모드 해제 시(편집모드 복귀) 카메라를 위로 올리고 아래를 비스듬히 바라보게 리셋
  fpsControls.onExit = () => {
    // 플레이어 객체 숨기기 (즉시)
    if (fpsControls.playerMesh) {
      fpsControls.playerMesh.visible = false;
    }
    
    // 저장된 월드 좌표 사용
    const currentPos = fpsControls._exitCameraPosition ? {
      x: fpsControls._exitCameraPosition.x,
      y: fpsControls._exitCameraPosition.y,
      z: fpsControls._exitCameraPosition.z
    } : {
      x: camera.position.x,
      y: camera.position.y,
      z: camera.position.z
    };
    
    // 저장된 회전에서 방향 계산 (월드 좌표 기준)
    let currentDirection = new THREE.Vector3(0, 0, -1);
    if (fpsControls._exitCameraQuaternion) {
      currentDirection.applyQuaternion(fpsControls._exitCameraQuaternion);
    } else {
      camera.getWorldDirection(currentDirection);
    }
    
    // 수평 방향만 유지 (Y축 제거)
    const horizontalDirection = currentDirection.clone();
    horizontalDirection.y = 0;
    horizontalDirection.normalize();
    
    // 자연스러운 목표 위치
    const targetPos = {
      x: currentPos.x, 
      y: currentPos.y + 8, // 8 유닛 위로
      z: currentPos.z - 2  // 뒤로 2 유닛
    };
    
    // 자연스러운 시선 목표
    const lookDistance = 12; // 바라볼 거리
    const targetLook = {
      x: currentPos.x + horizontalDirection.x * lookDistance,
      y: currentPos.y - 3, // 30도 하방
      z: currentPos.z + horizontalDirection.z * lookDistance
    };
    
    // 카메라를 playerObject에서 분리하고 씬에 추가
    if (fpsControls.playerObject.children.includes(camera)) {
      fpsControls.playerObject.remove(camera);
      if (!scene.children.includes(camera)) {
        scene.add(camera);
      }
    }
    
    // 카메라 초기 위치 설정
    camera.position.set(currentPos.x, currentPos.y, currentPos.z);
    
    // 현재 시선 방향으로 카메라 회전 설정 (방향 튐 방지)
    if (fpsControls._exitCameraQuaternion) {
      camera.setRotationFromQuaternion(fpsControls._exitCameraQuaternion);
    }
    
    const startPos = { x: currentPos.x, y: currentPos.y, z: currentPos.z };
    const startLook = { x: 0, y: 0, z: 0 };
    
    // 현재 방향에서 lookAt 계산
    const lookVec = horizontalDirection.clone();
    const camLookAt = new THREE.Vector3(currentPos.x, currentPos.y, currentPos.z).add(lookVec);
    startLook.x = camLookAt.x;
    startLook.y = camLookAt.y;
    startLook.z = camLookAt.z;

    const duration = 600; // ms
    const startTime = performance.now();

    function animateTransition(now) {
      const t = Math.min((now - startTime) / duration, 1);
      // easeOutQuart (부드러운 감속)
      const ease = 1 - Math.pow(1 - t, 4);
      
      camera.position.x = startPos.x + (targetPos.x - startPos.x) * ease;
      camera.position.y = startPos.y + (targetPos.y - startPos.y) * ease;
      camera.position.z = startPos.z + (targetPos.z - startPos.z) * ease;
      camera.lookAt(
        startLook.x + (targetLook.x - startLook.x) * ease,
        startLook.y + (targetLook.y - startLook.y) * ease,
        startLook.z + (targetLook.z - startLook.z) * ease
      );
      if (t < 1) {
        requestAnimationFrame(animateTransition);
      } else {
        // 애니메이션 완료 후 플레이어 객체 완전 제거
        if (fpsControls.playerMesh && scene.children.includes(fpsControls.playerMesh)) {
          scene.remove(fpsControls.playerMesh);
          fpsControls.playerMesh = null;
        }
        // 임시 저장 변수 정리
        delete fpsControls._exitCameraPosition;
        delete fpsControls._exitCameraQuaternion;
      }
    }
    requestAnimationFrame(animateTransition);
  };

  // Jump In 버튼 생성 시 FPSControls 인스턴스 전달
  createJumpInButton(camera, renderer.domElement, fpsControls);

  // FPSControls에 scene 연결 및 playerMesh 생성
  if (fpsControls) {
    fpsControls.setScene(scene);
  }

  // FPSControls에 현재 Zone 큐브 전달
  function updateFpsObstacles() {
    if (fpsControls) {
      fpsControls.setObstacles(Object.values(zoneData).flat());
    }
  }
  updateFpsObstacles();

  // Zone별 그리드 관리 시스템
  const zoneGrids = new Map();
  const zoneFloors = new Map(); // 바닥 면 저장
  
  function createZoneGrid(zoneX, zoneY, isActive = false) {
    // 그리드 선은 항상 회색
    const gridHelper = new THREE.GridHelper(ZONE_SIZE, ZONE_DIVISIONS, 0x888888, 0x888888);
    gridHelper.position.set(zoneX * ZONE_SIZE, 0, zoneY * ZONE_SIZE);
    scene.add(gridHelper);
    
    // 바닥 면 생성하지 않음 - 어디든 편집 가능
    
    const zoneKey = getZoneKey(zoneX, zoneY);
    zoneGrids.set(zoneKey, gridHelper);
    
    return gridHelper;
  }
  
  function updateZoneFloors() {
    // 편집 구역 표시 바닥 제거 - 어디든 편집 가능하므로 불필요
    for (const [zoneKey, floor] of zoneFloors) {
      scene.remove(floor);
    }
    zoneFloors.clear();
    
    // 더 이상 활성 Zone 바닥 표시하지 않음
  }
  
  // 현재 Zone 그리드 생성
  createZoneGrid(currentZoneX, currentZoneY);
  
  // 인접 Zone들 그리드도 미리 생성
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue;
      createZoneGrid(currentZoneX + dx, currentZoneY + dy);
    }
  }
  
  console.log('Zone 그리드들 생성 완료');

  // Zone 텍스트 표시 시스템
  const zoneTexts = new Map();
  
  function createZoneText(zoneX, zoneY) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 512;
    canvas.height = 512;
    
    // 반투명 회색 텍스트
    context.fillStyle = 'rgba(100, 100, 100, 0.3)';
    context.font = 'bold 120px Arial';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    
    const zoneText = `${zoneX},${zoneY}`;
    context.fillText(zoneText, canvas.width / 2, canvas.height / 2);
    
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(material);
    
    // Zone 중앙 바닥에 위치
    const worldX = zoneX * ZONE_SIZE;
    const worldZ = zoneY * ZONE_SIZE;
    sprite.position.set(worldX, 0.1, worldZ);
    sprite.scale.set(ZONE_SIZE * 0.8, ZONE_SIZE * 0.8, 1);
    
    scene.add(sprite);
    zoneTexts.set(getZoneKey(zoneX, zoneY), sprite);
    
    return sprite;
  }
  
  // 현재 Zone 텍스트 생성
  createZoneText(currentZoneX, currentZoneY);
  
  // 인접 Zone들도 미리 생성
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue;
      createZoneText(currentZoneX + dx, currentZoneY + dy);
    }
  }

  // 조명
  const light = new THREE.DirectionalLight(0xffffff, 0.8);
  light.position.set(10, 20, 10);
  scene.add(light);
  scene.add(new THREE.AmbientLight(0xffffff, 0.4));
  console.log('조명 추가');

  // 큐브 쌓기
  const cubeSize = ZONE_SIZE / ZONE_DIVISIONS;
  console.log('큐브 크기:', cubeSize);

  function addCube(x, y, z, color, byRemote = false, isModelPlacement = false) {
    // Zone 범위 제한 제거 - 어디서든 편집 가능
    
    // 해당 위치에 큐브가 배치될 Zone 계산
    let targetZoneX = currentZoneX;
    let targetZoneY = currentZoneY;
    let localX = x;
    let localZ = z;
    
    // 모델 배치이거나 Zone 경계를 넘는 경우 자동으로 Zone 계산
    if (isModelPlacement || x < 0 || x >= ZONE_DIVISIONS || z < 0 || z >= ZONE_DIVISIONS) {
      targetZoneX = currentZoneX + Math.floor(x / ZONE_DIVISIONS);
      targetZoneY = currentZoneY + Math.floor(z / ZONE_DIVISIONS);
      localX = ((x % ZONE_DIVISIONS) + ZONE_DIVISIONS) % ZONE_DIVISIONS;
      localZ = ((z % ZONE_DIVISIONS) + ZONE_DIVISIONS) % ZONE_DIVISIONS;
    }
    
    // 해당 Zone의 큐브 배열 가져오기
    const targetZoneCubes = getZoneCubes(targetZoneX, targetZoneY);
    
    // 중복 검사
    if (targetZoneCubes.some(cube => cube.gridX === localX && cube.gridY === y && cube.gridZ === localZ)) {
      return;
    }

    // 큐브 위치 계산
    const worldX = (targetZoneX * ZONE_SIZE) + (localX - ZONE_DIVISIONS / 2 + 0.5) * cubeSize;
    const worldZ = (targetZoneY * ZONE_SIZE) + (localZ - ZONE_DIVISIONS / 2 + 0.5) * cubeSize;
    const worldY = (y + 0.5) * cubeSize;
    
    // 카메라와의 거리 기반으로 적절한 LOD 지오메트리 선택
    const cubePosition = new THREE.Vector3(worldX, worldY, worldZ);
    const distance = camera.position.distanceTo(cubePosition);
    const lodLevel = calculateGeometryLOD(distance);
    const geometry = getGeometryForLOD(lodLevel);
    
    // 조명 설정에 따른 머티리얼 선택
    const material = lightingEnabled 
      ? new THREE.MeshLambertMaterial({ color }) 
      : new THREE.MeshBasicMaterial({ color });
    
    const cube = new THREE.Mesh(geometry, material);
    cube._geometryLod = lodLevel; // LOD 레벨 저장
    
    // 점 형태가 아닐 때만 테두리 추가
    if (lodLevel !== 'point') {
      const edges = new THREE.EdgesGeometry(geometry);
      const lineMaterial = new THREE.LineBasicMaterial({ 
        color: 0x000000,
        linewidth: 1,
        transparent: true,
        opacity: lodLevel === 'high' ? 0.3 : 0.2
      });
      const wireframe = new THREE.LineSegments(edges, lineMaterial);
      wireframe.raycast = () => {}; // raycast 비활성화
      cube.add(wireframe);
    }
    
    // Zone 좌표계 적용
    cube.position.set(worldX, worldY, worldZ);
    
    // grid 좌표를 cube 객체에 저장
    cube.gridX = localX;
    cube.gridY = y;
    cube.gridZ = localZ;
    cube._byRemote = byRemote;
    
    scene.add(cube);
    addCubeToZone(targetZoneX, targetZoneY, cube);

    // 실시간 동기화: 원격 추가가 아닌 경우에만 전송 (모델 배치는 제외)
    if (!byRemote && !isModelPlacement && isRealtimeAvailable && socket) {
      const data = {
        x: localX, y, z: localZ, color,
        zoneX: targetZoneX,
        zoneY: targetZoneY,
        spaceId
      };
      socket.emit('add cube', data);
    }
    
    autoSaveCurrentSpace();
  }

  // 모델 배치 모드 관련 함수들
  function enterPlacementMode(modelData) {
    placementMode = true;
    placementModelData = modelData;
    
    // 모델의 경계 계산
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    modelData.forEach(cube => {
      minX = Math.min(minX, cube.x);
      maxX = Math.max(maxX, cube.x);
      minZ = Math.min(minZ, cube.z);
      maxZ = Math.max(maxZ, cube.z);
    });
    
    placementBounds = { minX, maxX, minZ, maxZ };
    
    // 커서 생성
    createPlacementCursor();
    
    // 화면 커서 숨기기
    document.body.classList.add('placement-mode');
    
    showToast('모델 배치 모드 활성화. 클릭하여 배치하세요.');
  }
  
  function exitPlacementMode() {
    placementMode = false;
    placementModelData = null;
    
    // 커서 제거
    if (placementCursor) {
      document.body.removeChild(placementCursor);
      placementCursor = null;
    }
    
    // 미리보기 큐브들 제거
    clearPlacementPreview();
    
    // 화면 커서 복원
    document.body.classList.remove('placement-mode');
  }
  
  function clearPlacementPreview() {
    placementPreviewCubes.forEach(cube => scene.remove(cube));
    placementPreviewCubes.length = 0;
  }
  
  function updatePlacementPreview(intersectionX, intersectionZ) {
    // 기존 미리보기 제거
    clearPlacementPreview();
    
    if (!placementModelData) return;
    
    // 교차점을 격자 좌표로 변환 (addCube와 동일한 로직)
    const baseGridX = Math.floor((intersectionX - currentZoneX * ZONE_SIZE) / cubeSize + ZONE_DIVISIONS / 2 - 0.5);
    const baseGridZ = Math.floor((intersectionZ - currentZoneY * ZONE_SIZE) / cubeSize + ZONE_DIVISIONS / 2 - 0.5);
    
    // 반투명 미리보기 큐브들 생성
    placementModelData.forEach(cubeData => {
      const gridX = baseGridX + cubeData.x - placementBounds.minX;
      const gridY = cubeData.y;
      const gridZ = baseGridZ + cubeData.z - placementBounds.minZ;
      
      // Zone 범위에 관계없이 미리보기 생성
      const targetZoneX = currentZoneX + Math.floor(gridX / ZONE_DIVISIONS);
      const targetZoneY = currentZoneY + Math.floor(gridZ / ZONE_DIVISIONS);
      const localX = ((gridX % ZONE_DIVISIONS) + ZONE_DIVISIONS) % ZONE_DIVISIONS;
      const localZ = ((gridZ % ZONE_DIVISIONS) + ZONE_DIVISIONS) % ZONE_DIVISIONS;
      
      // addCube와 동일한 월드 좌표 변환
      const worldX = (targetZoneX * ZONE_SIZE) + (localX - ZONE_DIVISIONS / 2 + 0.5) * cubeSize;
      const worldZ = (targetZoneY * ZONE_SIZE) + (localZ - ZONE_DIVISIONS / 2 + 0.5) * cubeSize;
      const worldY = (gridY + 0.5) * cubeSize;
      
      const geometry = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);
      const material = new THREE.MeshLambertMaterial({ 
        color: cubeData.color,
        transparent: true,
        opacity: 0.5,
        wireframe: false
      });
      
      const cube = new THREE.Mesh(geometry, material);
      cube.position.set(worldX, worldY, worldZ);
      
      // 테두리 추가
      const edges = new THREE.EdgesGeometry(geometry);
      const lineMaterial = new THREE.LineBasicMaterial({ 
        color: 0x00ff00, 
        transparent: true, 
        opacity: 0.8 
      });
      const wireframe = new THREE.LineSegments(edges, lineMaterial);
      cube.add(wireframe);
      
      scene.add(cube);
      placementPreviewCubes.push(cube);
    });
  }
  
  function createPlacementCursor() {
    // HTML 커서 생성하지 않음 - 3D 미리보기만 사용
    placementCursor = null;
  }
  
  function placeModel(intersectionX, intersectionZ) {
    // 교차점을 격자 좌표로 변환 (addCube와 동일한 로직)
    const baseGridX = Math.floor((intersectionX - currentZoneX * ZONE_SIZE) / cubeSize + ZONE_DIVISIONS / 2 - 0.5);
    const baseGridZ = Math.floor((intersectionZ - currentZoneY * ZONE_SIZE) / cubeSize + ZONE_DIVISIONS / 2 - 0.5);
    
    // 배치될 큐브들의 정보를 수집
    const placedCubes = [];
    
    // 기존 큐브들을 제거하고 새 모델 배치
    placementModelData.forEach(cubeData => {
      const gridX = baseGridX + cubeData.x - placementBounds.minX;
      const gridY = cubeData.y;
      const gridZ = baseGridZ + cubeData.z - placementBounds.minZ;
      
      // Zone 범위 체크 없이 배치 (모델은 Zone 경계를 넘어갈 수 있음)
      // 격자 좌표를 월드 좌표로 변환하여 기존 큐브 제거
      const targetZoneX = currentZoneX + Math.floor(gridX / ZONE_DIVISIONS);
      const targetZoneY = currentZoneY + Math.floor(gridZ / ZONE_DIVISIONS);
      const localX = ((gridX % ZONE_DIVISIONS) + ZONE_DIVISIONS) % ZONE_DIVISIONS;
      const localZ = ((gridZ % ZONE_DIVISIONS) + ZONE_DIVISIONS) % ZONE_DIVISIONS;
      
      const worldX = (targetZoneX * ZONE_SIZE) + (localX - ZONE_DIVISIONS / 2 + 0.5) * cubeSize;
      const worldY = (gridY + 0.5) * cubeSize;
      const worldZ = (targetZoneY * ZONE_SIZE) + (localZ - ZONE_DIVISIONS / 2 + 0.5) * cubeSize;
      
      // 해당 위치의 기존 큐브 제거
      removeCubeAt(worldX, worldY, worldZ);
      
      // 새 큐브 추가 (모델 배치 모드로)
      addCube(gridX, gridY, gridZ, cubeData.color, false, true);
      
      // 실시간 동기화용 데이터 수집
      placedCubes.push({
        x: localX,
        y: gridY,
        z: localZ,
        color: cubeData.color,
        zoneX: targetZoneX,
        zoneY: targetZoneY
      });
    });
    
    // 모델 배치 완료 후 일괄 전송
    if (isRealtimeAvailable && socket && placedCubes.length > 0) {
      const modelData = {
        type: 'model_placement',
        cubes: placedCubes,
        spaceId: spaceId
      };
      socket.emit('place model', modelData);
    }
    
    exitPlacementMode();
    showToast('모델이 배치되었습니다.');
  }

  // 마우스 클릭으로 큐브 추가 (큐브 위 또는 바닥)
  renderer.domElement.addEventListener('click', async (event) => {
    // FPS 모드일 때는 편집 기능 건너뜀
    if (fpsControls && fpsControls.enabled) return;
    
    if (wasDraggingJustNow) {
      wasDraggingJustNow = false;
      return;
    }

    const rect = renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);

    // 비디오 배치 모드 체크를 가장 먼저 처리
    if (window.webrtcManager && window.webrtcManager.isVideoPlacementMode) {
      // 모든 Zone의 큐브를 하나의 배열로 통합
      const allCubes = [];
      for (const [zoneKey, zoneCubes] of Object.entries(zoneData)) {
        allCubes.push(...zoneCubes);
      }
      const cubeIntersects = raycaster.intersectObjects(allCubes);
      
      if (cubeIntersects.length > 0) {
        const targetCube = cubeIntersects[0].object;
        const faceIndex = window.webrtcManager.detectCubeFace(cubeIntersects[0], targetCube);
        if (faceIndex !== -1) {
          await window.webrtcManager.placeVideoOnFace(targetCube, faceIndex, window.webrtcManager.placementTargetUserId);
          return;
        }
      } else {
        // 빈 공간 클릭 시 배치 모드 취소
        window.webrtcManager.exitVideoPlacement();
        window.webrtcManager.showToast('비디오 배치가 취소되었습니다.');
      }
      return;
    }
    
    // 모델 배치 모드인 경우
    if (placementMode && placementModelData) {
      // 바닥 클릭 위치 감지 - y=0 평면 사용
      const planeY = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const intersectPoint = raycaster.ray.intersectPlane(planeY, new THREE.Vector3());
      
      if (intersectPoint) {
        placeModel(intersectPoint.x, intersectPoint.z);
      }
      return;
    }

    // hover된 큐브와 면이 있으면 그 정보를 사용 (공중 연결)
    // 단, 비디오 배치 모드가 아닐 때만
    if (hoveredCube && hoveredFaceNormal && !(window.webrtcManager && window.webrtcManager.isVideoPlacementMode)) {
      // 현재 Zone 기준으로 좌표 변환
      const localX = hoveredCube.position.x - (currentZoneX * ZONE_SIZE);
      const localZ = hoveredCube.position.z - (currentZoneY * ZONE_SIZE);
      
      const gridX = Math.round(localX / cubeSize + ZONE_DIVISIONS / 2 - 0.5);
      const gridY = Math.round((hoveredCube.position.y / cubeSize) - 0.5);
      const gridZ = Math.round(localZ / cubeSize + ZONE_DIVISIONS / 2 - 0.5);
      
      const nextX = gridX + Math.round(hoveredFaceNormal.x);
      const nextY = gridY + Math.round(hoveredFaceNormal.y);
      const nextZ = gridZ + Math.round(hoveredFaceNormal.z);
      
      if (
        nextX >= 0 && nextX < ZONE_DIVISIONS &&
        nextY >= 0 &&
        nextZ >= 0 && nextZ < ZONE_DIVISIONS
      ) {
        addCube(nextX, nextY, nextZ, cubeColor);
      }
      return;
    }

    // 모든 큐브들을 검사하여 큐브 클릭 여부 확인
    const allCubes = [];
    for (const [zoneKey, zoneCubes] of Object.entries(zoneData)) {
      allCubes.push(...zoneCubes);
    }
    const cubeIntersects = raycaster.intersectObjects(allCubes);
    
    // 큐브를 클릭한 경우는 이미 hover에서 처리되므로, 바닥 클릭만 처리
    // 단, 비디오 배치 모드가 아닐 때만
    if (cubeIntersects.length === 0 && !(window.webrtcManager && window.webrtcManager.isVideoPlacementMode)) {
      // 바닥 클릭 - 빈 공간이면 바닥부터 쌓기
      const planeY = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const intersect = raycaster.ray.intersectPlane(planeY, new THREE.Vector3());
      if (intersect) {
        // 절대 좌표를 격자 좌표로 변환
        let x = Math.floor(intersect.x / cubeSize);
        let z = Math.floor(intersect.z / cubeSize);
        
        // Zone 제한 없이 어디든 배치 가능
        // 해당 x,z 위치에서 가장 낮은 빈 공간 찾기
        let y = 0;
        let found = false;
        
        // 모든 Zone에서 해당 위치의 큐브 검사
        while (!found) {
          found = true;
          for (const [zoneKey, zoneCubes] of Object.entries(zoneData)) {
            if (zoneCubes.some(cube => {
              const worldX = cube.position.x;
              const worldY = cube.position.y;
              const worldZ = cube.position.z;
              return Math.abs(worldX - x * cubeSize) < 0.01 &&
                     Math.abs(worldY - (y + 0.5) * cubeSize) < 0.01 &&
                     Math.abs(worldZ - z * cubeSize) < 0.01;
            })) {
              found = false;
              y++;
              break;
            }
          }
        }
        
        // 현재 Zone 기준으로 격자 좌표 계산
        const gridX = x - (currentZoneX * ZONE_SIZE / cubeSize) + ZONE_DIVISIONS / 2;
        const gridZ = z - (currentZoneY * ZONE_SIZE / cubeSize) + ZONE_DIVISIONS / 2;
        
        addCube(gridX, y, gridZ, cubeColor);
      }
    }
  });

  // Mouse listeners for drag, highlight
  renderer.domElement.addEventListener('mousedown', (event) => {
    // FPS 모드일 때는 편집 기능 건너뜀
    if (fpsControls && fpsControls.enabled) return;
    
    if (event.button === 2) { // Right mouse button
      isRightDragging = true;
      deletedCubesInDrag.clear(); // 새 드래그 시작 시 초기화
      event.preventDefault();
      return;
    }
    
    isDragging = true;
    dragPreviewCubes.length = 0; // 새 드래그 시작 시 미리보기 초기화
    initialMousePosition.x = event.clientX;
    initialMousePosition.y = event.clientY;
    previousMousePosition.x = event.clientX;
    previousMousePosition.y = event.clientY;
    wasDraggingJustNow = false;
    
    // 큐브가 하이라이트된 상태면 큐브 드래그 모드로 설정
    if (hoveredCube && hoveredFaceNormal) {
      isDraggingCube = true;
      dragStartCube = hoveredCube;
      dragStartFace = hoveredFaceNormal.clone();
    } else {
      isDraggingCube = false;
      dragStartCube = null;
      dragStartFace = null;
    }
  });

  // 마우스가 3D 영역을 벗어나면 드래깅 중단
  renderer.domElement.addEventListener('mouseleave', () => {
    if (isDragging) {
      isDragging = false;
      isDraggingCube = false;
      dragStartCube = null;
      dragStartFace = null;
      // 드래그 미리보기도 정리
      clearDragPreview();
      console.log('마우스가 3D 영역을 벗어나서 드래깅 중단');
    }
    
    // 배치 모드 미리보기 제거
    if (placementMode) {
      clearPlacementPreview();
    }
  });

  renderer.domElement.addEventListener('mousemove', (event) => {
    // FPS 모드일 때는 편집 기능 건너뜀
    if (fpsControls && fpsControls.enabled) return;
    
    // 모델 배치 모드인 경우 미리보기 업데이트
    if (placementMode) {
      // 바닥면과의 교차점 계산하여 격자에 스냅
      const rect = renderer.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );
      
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, camera);
      
      // y=0 평면과의 교차점 계산
      const planeY = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const intersectPoint = raycaster.ray.intersectPlane(planeY, new THREE.Vector3());
      
      if (intersectPoint) {
        // 미리보기 업데이트 (월드 좌표 직접 전달)
        updatePlacementPreview(intersectPoint.x, intersectPoint.z);
        
        // HTML 커서 업데이트는 하지 않음 (placementCursor가 null이므로)
      }
    }
    
    hoveredCube = null;
    hoveredFaceNormal = null;
    const rect = renderer.domElement.getBoundingClientRect();
    const currentMouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
    );

    // 우클릭 드래그 삭제 처리
    if (isRightDragging) {
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(currentMouse, camera);
      
      // 모든 큐브들과 교차 검사
      const allCubes = [];
      for (const [zoneKey, zoneCubes] of Object.entries(zoneData)) {
        allCubes.push(...zoneCubes);
      }
      const intersects = raycaster.intersectObjects(allCubes);
      
      if (intersects.length > 0) {
        const targetCube = intersects[0].object;
        const cubeId = `${targetCube.position.x}_${targetCube.position.y}_${targetCube.position.z}`;
        
        // 이미 삭제된 큐브가 아닌 경우에만 삭제
        if (!deletedCubesInDrag.has(cubeId)) {
          deletedCubesInDrag.add(cubeId);
          
          // 씬에서 제거
          scene.remove(targetCube);
          
          // 해당 큐브가 속한 Zone을 찾아서 제거
          for (const [zoneKey, zoneCubes] of Object.entries(zoneData)) {
            const index = zoneCubes.indexOf(targetCube);
            if (index > -1) {
              const [zoneX, zoneY] = zoneKey.split(',').map(Number);
              removeCubeFromZone(zoneX, zoneY, targetCube);
              break;
            }
          }
          
          // hover 상태 초기화
          if (hoveredCube === targetCube) {
            hoveredCube = null;
            hoveredFaceNormal = null;
          }
          
          // highlight edge 정리
          if (highlightEdge) {
            scene.remove(highlightEdge);
            highlightEdge = null;
          }
        }
      }
    }

    if (isDragging) {
        const deltaX = event.clientX - previousMousePosition.x;
        const deltaY = event.clientY - previousMousePosition.y;

        previousMousePosition.x = event.clientX;
        previousMousePosition.y = event.clientY;

        if (isDraggingCube && dragStartCube && dragStartFace) {
          // 기존 미리보기 제거
          clearDragPreview();
          
          // 현재 마우스 위치를 3D 공간으로 변환
          const rect = renderer.domElement.getBoundingClientRect();
          const mouse = new THREE.Vector2(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1
          );
          
          const raycaster = new THREE.Raycaster();
          raycaster.setFromCamera(mouse, camera);
          
          // 드래그 시작 큐브와 같은 높이의 평면 생성
          const dragPlane = new THREE.Plane();
          dragPlane.setFromNormalAndCoplanarPoint(
            dragStartFace.clone().normalize(),
            dragStartCube.position
          );
          
          // 마우스 레이와 평면의 교차점 계산
          const intersectPoint = raycaster.ray.intersectPlane(dragPlane, new THREE.Vector3());
          
          if (intersectPoint) {
            // 시작점에서 현재 마우스 위치까지의 3D 거리 계산
            const distance3D = dragStartCube.position.distanceTo(intersectPoint);
            
            // 큐브 크기 기준으로 생성할 큐브 개수 계산
            const cubeCount = Math.floor(distance3D / cubeSize);
            
            // 시작 큐브 위치 계산
            const localX = dragStartCube.position.x - (currentZoneX * ZONE_SIZE);
            const localZ = dragStartCube.position.z - (currentZoneY * ZONE_SIZE);
            
            const startGridX = Math.round(localX / cubeSize + ZONE_DIVISIONS / 2 - 0.5);
            const startGridY = Math.round((dragStartCube.position.y / cubeSize) - 0.5);
            const startGridZ = Math.round(localZ / cubeSize + ZONE_DIVISIONS / 2 - 0.5);
            
            // 면 방향으로 미리보기 큐브들 생성
            for (let i = 1; i <= cubeCount; i++) {
              const nextX = startGridX + Math.round(dragStartFace.x) * i;
              const nextY = startGridY + Math.round(dragStartFace.y) * i;
              const nextZ = startGridZ + Math.round(dragStartFace.z) * i;
              
              if (nextY >= 0) {
                // 미리보기 큐브 생성 (반투명)
                const targetZoneX = currentZoneX + Math.floor(nextX / ZONE_DIVISIONS);
                const targetZoneY = currentZoneY + Math.floor(nextZ / ZONE_DIVISIONS);
                const localGridX = ((nextX % ZONE_DIVISIONS) + ZONE_DIVISIONS) % ZONE_DIVISIONS;
                const localGridZ = ((nextZ % ZONE_DIVISIONS) + ZONE_DIVISIONS) % ZONE_DIVISIONS;
                
                const worldX = (targetZoneX * ZONE_SIZE) + (localGridX - ZONE_DIVISIONS / 2 + 0.5) * cubeSize;
                const worldZ = (targetZoneY * ZONE_SIZE) + (localGridZ - ZONE_DIVISIONS / 2 + 0.5) * cubeSize;
                
                const geometry = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);
                const material = new THREE.MeshLambertMaterial({ 
                  color: cubeColor,
                  transparent: true,
                  opacity: 0.5
                });
                
                const previewCube = new THREE.Mesh(geometry, material);
                previewCube.position.set(worldX, (nextY + 0.5) * cubeSize, worldZ);
                
                // 테두리 추가
                const edges = new THREE.EdgesGeometry(geometry);
                const lineMaterial = new THREE.LineBasicMaterial({ 
                  color: 0xffffff, 
                  transparent: true, 
                  opacity: 0.8 
                });
                const wireframe = new THREE.LineSegments(edges, lineMaterial);
                previewCube.add(wireframe);
                
                scene.add(previewCube);
                dragPreviewCubes.push(previewCube);
              }
            }
          }
          
          wasDraggingJustNow = true;
        } else {
          // 일반 카메라 드래그 모드: 회전
          if (Math.abs(deltaX) > 0.1) {
              // 좌우 드래그: 카메라 좌우 회전
              const yawAngle = -deltaX * 0.006;
              const yawQuaternion = new THREE.Quaternion();
              yawQuaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yawAngle);
              camera.quaternion.multiplyQuaternions(yawQuaternion, camera.quaternion);
          }

          if (Math.abs(deltaY) > 0.1) {
              // 상하 드래그: 카메라 상하 회전 (위아래 보기)
              const pitchAngle = -deltaY * 0.006;
              const cameraRight = new THREE.Vector3(1, 0, 0);
              cameraRight.applyQuaternion(camera.quaternion);
              
              const currentDirection = new THREE.Vector3(0, 0, -1);
              currentDirection.applyQuaternion(camera.quaternion);
              const currentPitch = Math.asin(currentDirection.y);
              const newPitch = currentPitch + pitchAngle;
              const maxPitch = Math.PI / 2 * 0.85;
              
              if (Math.abs(newPitch) < maxPitch) {
                  const pitchQuaternion = new THREE.Quaternion();
                  pitchQuaternion.setFromAxisAngle(cameraRight, pitchAngle);
                  camera.quaternion.multiplyQuaternions(pitchQuaternion, camera.quaternion);
              }
          }
          
          camera.quaternion.normalize();
        }
    } else {
        // 현재 Zone의 큐브들만 하이라이트
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(currentMouse, camera);
        
        // 모든 Zone의 큐브들을 검사 대상으로 확장
        const allCubes = [];
        for (const [zoneKey, zoneCubes] of Object.entries(zoneData)) {
          allCubes.push(...zoneCubes);
        }
        
        // 씬에서 실제로 존재하는 큐브들만 필터링
        const validCubes = allCubes.filter(cube => scene.children.includes(cube));
        
        const cubeIntersects = raycaster.intersectObjects(validCubes);

        if (highlightEdge) {
            scene.remove(highlightEdge);
            highlightEdge = null;
        }
        
        // hover 상태 초기화
        hoveredCube = null;
        hoveredFaceNormal = null;
        
        if (cubeIntersects.length > 0) {
            const target = cubeIntersects[0].object;
            const faceNormal = cubeIntersects[0].face.normal;
            hoveredCube = target;
            hoveredFaceNormal = faceNormal.clone();
            const edgeGeom = new THREE.EdgesGeometry(target.geometry);
            const edgeMat = new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 2 });
            highlightEdge = new THREE.LineSegments(edgeGeom, edgeMat);
            highlightEdge.position.copy(target.position);
            scene.add(highlightEdge);
        }
    }
  });

  renderer.domElement.addEventListener('mouseup', (event) => {
    // FPS 모드일 때는 편집 기능 건너뜀
    if (fpsControls && fpsControls.enabled) return;
    
    // 비디오 배치 모드일 때는 큐브 생성 방지
    if (window.webrtcManager && window.webrtcManager.isVideoPlacementMode) {
      return;
    }
    
    if (event.button === 2) { // Right mouse button
      if (isRightDragging) {
        isRightDragging = false;
        if (deletedCubesInDrag.size > 0) {
          showToast(`${deletedCubesInDrag.size}개 큐브가 삭제되었습니다.`);
          // 드래그 삭제 완료 후 자동저장
          autoSaveCurrentSpace();
        }
        deletedCubesInDrag.clear();
      }
      return;
    }
    if (isDragging) {
        const deltaX = event.clientX - initialMousePosition.x;
        const deltaY = event.clientY - initialMousePosition.y;
        const dragDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

        if (dragDistance > dragThreshold) {
            // 드래그한 경우 - 미리보기 큐브들을 실제 큐브로 변환
            wasDraggingJustNow = true;
            
            if (dragPreviewCubes.length > 0) {
              dragPreviewCubes.forEach(previewCube => {
                // 미리보기 큐브 위치를 격자 좌표로 변환
                const worldX = previewCube.position.x;
                const worldY = previewCube.position.y;
                const worldZ = previewCube.position.z;
                
                // Zone과 로컬 격자 좌표 계산
                const zoneX = Math.floor(worldX / ZONE_SIZE);
                const zoneY = Math.floor(worldZ / ZONE_SIZE);
                const localX = Math.round((worldX - zoneX * ZONE_SIZE) / cubeSize + ZONE_DIVISIONS / 2 - 0.5);
                const localZ = Math.round((worldZ - zoneY * ZONE_SIZE) / cubeSize + ZONE_DIVISIONS / 2 - 0.5);
                const gridY = Math.round(worldY / cubeSize - 0.5);
                
                // 글로벌 격자 좌표 계산
                const globalX = localX + (zoneX - currentZoneX) * ZONE_DIVISIONS;
                const globalZ = localZ + (zoneY - currentZoneY) * ZONE_DIVISIONS;
                
                // 실제 큐브 생성
                addCube(globalX, gridY, globalZ, cubeColor);
              });
              
              showToast(`${dragPreviewCubes.length}개 큐브가 생성되었습니다.`);
            }
        } else {
            // 클릭한 경우 - 기존 로직으로 큐브 하나 생성
            if (isDraggingCube && dragStartCube && dragStartFace) {
              // 드래그 시작 큐브 옆에 하나 생성
              const localX = dragStartCube.position.x - (currentZoneX * ZONE_SIZE);
              const localZ = dragStartCube.position.z - (currentZoneY * ZONE_SIZE);
              
              const startGridX = Math.round(localX / cubeSize + ZONE_DIVISIONS / 2 - 0.5);
              const startGridY = Math.round((dragStartCube.position.y / cubeSize) - 0.5);
              const startGridZ = Math.round(localZ / cubeSize + ZONE_DIVISIONS / 2 - 0.5);
              
              const nextX = startGridX + Math.round(dragStartFace.x);
              const nextY = startGridY + Math.round(dragStartFace.y);
              const nextZ = startGridZ + Math.round(dragStartFace.z);
              
              if (nextY >= 0) {
                addCube(nextX, nextY, nextZ, cubeColor);
              }
            }
        }
        
        // 미리보기 정리
        clearDragPreview();
        
        isDragging = false;
        isDraggingCube = false;
        dragStartCube = null;
        dragStartFace = null;
    }
  });

  // 색상 선택
  colorInput.addEventListener('input', (e) => {
    cubeColor = e.target.value;
    // 모든 프리셋 색상에서 selected 클래스 제거
    document.querySelectorAll('.color-preset').forEach(preset => {
      preset.classList.remove('selected');
    });
  });

  // 프리셋 색상 클릭 이벤트
  document.querySelectorAll('.color-preset').forEach(preset => {
    preset.addEventListener('click', () => {
      const selectedColor = preset.getAttribute('data-color');
      cubeColor = selectedColor;
      colorInput.value = selectedColor;
      
      // 모든 프리셋에서 selected 클래스 제거
      document.querySelectorAll('.color-preset').forEach(p => p.classList.remove('selected'));
      // 클릭된 프리셋에 selected 클래스 추가
      preset.classList.add('selected');
    });
  });

  // 첫 번째 프리셋 색상(빨강)을 기본 선택으로 설정
  document.querySelector('.color-preset[data-color="#ff0000"]').classList.add('selected');

  // 확대/축소 (마우스 휠)
  renderer.domElement.addEventListener('wheel', (e) => {
    e.preventDefault();
    camera.position.addScaledVector(camera.getWorldDirection(new THREE.Vector3()), -e.deltaY * 0.01);
  });

  // 부드러운 키보드 이동을 위한 키 상태 추적
  const keyStates = {
    w: false, s: false, a: false, d: false,
    q: false, e: false, c: false, z: false,
    shift: false // Shift 키 상태 추가
  };
  
  // 키 상태 강제 리셋 함수
  function resetAllKeyStates() {
    Object.keys(keyStates).forEach(key => {
      keyStates[key] = false;
    });
  }
  
  const moveSpeed = 0.2; // 이동 속도 (초당 유닛)
  const rotateSpeed = 0.02; // 회전 속도

  // 키보드 이동/회전 - 연속 입력 처리
  window.addEventListener('keydown', (e) => {
    if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
    
    // ESC로 배치 모드 취소
    if (e.key === 'Escape' && placementMode) {
      exitPlacementMode();
      showToast('모델 배치가 취소되었습니다.');
      return;
    }
    
    // FPS 모드일 때는 기존 키보드 처리를 건너뜀
    if (fpsControls && fpsControls.enabled) return;
    
    const key = e.key.toLowerCase();
    
    // Zone 전환 (화살표 키는 즉시 처리)
    switch (e.key) {
      case 'ArrowUp':
      case 'ArrowDown':
      case 'ArrowLeft':
      case 'ArrowRight':
        e.preventDefault();
        
        // 현재 카메라가 보는 방향을 기준으로 Zone 이동 계산
        const cameraDirection = new THREE.Vector3();
        camera.getWorldDirection(cameraDirection);
        
        // 카메라의 오른쪽 방향 벡터 계산
        const cameraRight = new THREE.Vector3();
        cameraRight.crossVectors(cameraDirection, camera.up).normalize();
        
        let deltaX = 0, deltaY = 0;
        
        if (e.key === 'ArrowUp') {
          // 현재 보는 방향으로 이동
          deltaX = Math.round(cameraDirection.x);
          deltaY = Math.round(cameraDirection.z);
        } else if (e.key === 'ArrowDown') {
          // 현재 보는 방향 반대로 이동
          deltaX = -Math.round(cameraDirection.x);
          deltaY = -Math.round(cameraDirection.z);
        } else if (e.key === 'ArrowLeft') {
          // 현재 보는 방향 기준 왼쪽으로 이동
          deltaX = -Math.round(cameraRight.x);
          deltaY = -Math.round(cameraRight.z);
        } else if (e.key === 'ArrowRight') {
          // 현재 보는 방향 기준 오른쪽으로 이동
          deltaX = Math.round(cameraRight.x);
          deltaY = Math.round(cameraRight.z);
        }
        
        const newZoneX = currentZoneX + deltaX;
        const newZoneY = currentZoneY + deltaY;
        
        console.log(`카메라 방향 기준 Zone 이동: (${deltaX}, ${deltaY}) → Zone (${newZoneX}, ${newZoneY})`);
        switchToZone(newZoneX, newZoneY);
        return;
    }
    
    // 이동/회전 키 상태 업데이트 (영문/한글 모두 지원)
    const normalizedKey = normalizeKey(key);
    if (keyStates.hasOwnProperty(normalizedKey)) {
      keyStates[normalizedKey] = true;
      e.preventDefault(); // 기본 브라우저 동작 방지
    }
    
    // Shift 키 처리
    if (e.key === 'Shift') {
      keyStates.shift = true;
    }
  });

  window.addEventListener('keyup', (e) => {
    if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
    
    // FPS 모드일 때는 기존 키보드 처리를 건너뜀
    if (fpsControls && fpsControls.enabled) return;
    
    const key = e.key.toLowerCase();
    const normalizedKey = normalizeKey(key);
    if (keyStates.hasOwnProperty(normalizedKey)) {
      keyStates[normalizedKey] = false;
      e.preventDefault();
    }
    
    // Shift 키 처리
    if (e.key === 'Shift') {
      keyStates.shift = false;
    }
  });

  // 키 정규화 함수 (한글 → 영문 매핑)
  function normalizeKey(key) {
    const keyMap = {
      'ㅂ': 'q',  // q → ㅂ
      'ㅈ': 'w',  // w → ㅈ
      'ㄷ': 'e',  // e → ㄷ
      'ㄱ': 'r',  // r → ㄱ
      'ㅅ': 't',  // t → ㅅ
      'ㅛ': 'y',  // y → ㅛ
      'ㅕ': 'u',  // u → ㅕ
      'ㅑ': 'i',  // i → ㅑ
      'ㅐ': 'o',  // o → ㅐ
      'ㅔ': 'p',  // p → ㅔ
      'ㅁ': 'a',  // a → ㅁ
      'ㄴ': 's',  // s → ㄴ
      'ㅇ': 'd',  // d → ㅇ
      'ㄹ': 'f',  // f → ㄹ
      'ㅎ': 'g',  // g → ㅎ
      'ㅗ': 'h',  // h → ㅗ
      'ㅓ': 'j',  // j → ㅓ
      'ㅏ': 'k',  // k → ㅏ
      'ㅣ': 'l',  // l → ㅣ
      'ㅋ': 'z',  // z → ㅋ
      'ㅌ': 'x',  // x → ㅌ
      'ㅊ': 'c',  // c → ㅊ
      'ㅍ': 'v',  // v → ㅍ
      'ㅠ': 'b',  // b → ㅠ
      'ㅜ': 'n',  // n → ㅜ
      'ㅡ': 'm'   // m → ㅡ
    };
    return keyMap[key] || key;
  }

  // 키 상태 리셋을 위한 다양한 이벤트 리스너들
  
  // 페이지 포커스 잃을 때
  window.addEventListener('blur', resetAllKeyStates);
  
  // 페이지 포커스 얻을 때 (안전장치)
  window.addEventListener('focus', resetAllKeyStates);
  
  // 마우스 클릭 시 (사용자가 다른 작업 시작할 때)
  document.addEventListener('mousedown', resetAllKeyStates);
  
  // 페이지 숨김/보임 상태 변경 시
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      resetAllKeyStates();
    }
  });
  
  // 브라우저 뒤로가기/앞으로가기 등 내비게이션 이벤트
  window.addEventListener('beforeunload', resetAllKeyStates);
  window.addEventListener('pagehide', resetAllKeyStates);
  
  // ESC 키로 강제 리셋
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      resetAllKeyStates();
    }
  });

  // 키 상태에 따른 부드러운 이동 처리 함수
  function handleKeyboardMovement() {
    // FPS 모드일 때는 키보드 이동 처리하지 않음
    if (fpsControls && fpsControls.enabled) return;
    
    // 페이지에 포커스가 없으면 키 상태 리셋하고 이동 중단
    if (document.hidden || !document.hasFocus()) {
      resetAllKeyStates();
      return;
    }
    
    let moved = false;
    
    // Shift 키가 눌린 경우 이동속도 2배 적용
    const currentMoveSpeed = keyStates.shift ? moveSpeed * 2 : moveSpeed;
    
    // 수평 이동 처리
    if (keyStates.a) {
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const left = new THREE.Vector3().crossVectors(camera.up, dir).normalize();
      camera.position.addScaledVector(left, currentMoveSpeed);
      moved = true;
    }
    if (keyStates.d) {
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const right = new THREE.Vector3().crossVectors(dir, camera.up).normalize();
      camera.position.addScaledVector(right, currentMoveSpeed);
      moved = true;
    }
    if (keyStates.w) {
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      dir.y = 0;
      dir.normalize();
      camera.position.addScaledVector(dir, currentMoveSpeed);
      moved = true;
    }
    if (keyStates.s) {
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      dir.y = 0;
      dir.normalize();
      camera.position.addScaledVector(dir, -currentMoveSpeed);
      moved = true;
    }
    
    // 수직 이동 처리
    if (keyStates.c) {
      camera.position.y += currentMoveSpeed; // 위로 이동
      moved = true;
    }
    if (keyStates.z) {
      camera.position.y -= currentMoveSpeed; // 아래로 이동
      moved = true;
    }
    
    // 회전 처리
    if (keyStates.q) {
      const yawQuaternion = new THREE.Quaternion();
      yawQuaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotateSpeed);
      camera.quaternion.multiplyQuaternions(yawQuaternion, camera.quaternion);
      moved = true;
    }
    if (keyStates.e) {
      const yawQuaternion = new THREE.Quaternion();
      yawQuaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -rotateSpeed);
      camera.quaternion.multiplyQuaternions(yawQuaternion, camera.quaternion);
      moved = true;
    }
    
    if (moved) {
      camera.quaternion.normalize();
    }
    
    return moved;
  }

  // Zone 전환 함수 (부드러운 슬라이딩 애니메이션)
  function switchToZone(newZoneX, newZoneY) {
  // Zone 이동 후 장애물 큐브 갱신
    if (newZoneX === currentZoneX && newZoneY === currentZoneY) return;
    
    console.log(`Zone 전환: (${currentZoneX},${currentZoneY}) → (${newZoneX},${newZoneY})`);
    
    // Zone 이동량 계산
    const deltaX = newZoneX - currentZoneX;
    const deltaY = newZoneY - currentZoneY;
    
    // 시작 위치와 목표 위치 설정
    const startX = camera.position.x;
    const startZ = camera.position.z;
    const targetX = startX + (deltaX * ZONE_SIZE);
    const targetZ = startZ + (deltaY * ZONE_SIZE);
    
    // 애니메이션 변수
    let animationProgress = 0;
    const animationDuration = 800; // 800ms
    const startTime = performance.now();
    
    // 부드러운 슬라이딩 애니메이션
    function animateZoneTransition(currentTime) {
      animationProgress = Math.min((currentTime - startTime) / animationDuration, 1);

      if (animationProgress < 1) {
        // 카메라 위치 보간
        camera.position.x = startX + (targetX - startX) * animationProgress;
        camera.position.z = startZ + (targetZ - startZ) * animationProgress;
        requestAnimationFrame(animateZoneTransition);
      } else {
        // 애니메이션 완료 시 Zone 정보 업데이트
        currentZoneX = newZoneX;
        currentZoneY = newZoneY;
        updateFpsObstacles();
        
        // 새 Zone 그리드 생성 (없다면)
        const zoneKey = getCurrentZoneKey();
        if (!zoneGrids.has(zoneKey)) {
          createZoneGrid(currentZoneX, currentZoneY);
        }
        
        // 새 Zone 텍스트 생성 (없다면)
        if (!zoneTexts.has(zoneKey)) {
          createZoneText(currentZoneX, currentZoneY);
        }
        
        // 인접 Zone들도 생성
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            const adjacentX = currentZoneX + dx;
            const adjacentY = currentZoneY + dy;
            const adjacentKey = getZoneKey(adjacentX, adjacentY);
            
            // 그리드 생성
            if (!zoneGrids.has(adjacentKey)) {
              createZoneGrid(adjacentX, adjacentY);
            }
            
            // 텍스트 생성
            if (!zoneTexts.has(adjacentKey)) {
              createZoneText(adjacentX, adjacentY);
            }
          }
        }
        
        // 바닥 면 업데이트 (현재 Zone만 활성)
        updateZoneFloors();
        
        showToast(`Zone (${currentZoneX}, ${currentZoneY})로 이동`);
      }
    }
    
    // 애니메이션 시작
    requestAnimationFrame(animateZoneTransition);
  }

  // 반응형
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // 씬 데이터로부터 로드하는 함수
  function loadSceneFromData(loadedSceneData) {
    // 기존 큐브들 모두 제거
    clearScene();
    
    if (loadedSceneData.currentZone) {
      // 새로운 Zone 시스템 데이터
      console.log('Zone 시스템 데이터 로드');
      
      // 현재 Zone 위치 복원
      currentZoneX = loadedSceneData.currentZone.x || 0;
      currentZoneY = loadedSceneData.currentZone.y || 0;
      
      // 각 Zone의 큐브들 복원
      for (const [zoneKey, cubeDataList] of Object.entries(loadedSceneData)) {
        if (zoneKey === 'currentZone') continue;
        
        const [zoneX, zoneY] = zoneKey.split(',').map(Number);
        
        cubeDataList.forEach(cubeData => {
          // 월드 좌표로 직접 큐브 생성
          const geometry = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);
          const material = new THREE.MeshLambertMaterial({ color: cubeData.color });
          const cube = new THREE.Mesh(geometry, material);
          cube.position.set(cubeData.x, cubeData.y, cubeData.z);
          
          // 테두리 추가
          const edges = new THREE.EdgesGeometry(geometry);
          const lineMaterial = new THREE.LineBasicMaterial({ 
            color: 0x000000,
            linewidth: 1,
            transparent: true,
            opacity: 0.3
          });
          const wireframe = new THREE.LineSegments(edges, lineMaterial);
          wireframe.raycast = () => {}; // raycast 비활성화
          cube.add(wireframe);
          
          // gridX, gridY, gridZ 계산해서 설정
          const localX = cubeData.x - (zoneX * ZONE_SIZE);
          const localZ = cubeData.z - (zoneY * ZONE_SIZE);
          cube.gridX = Math.round(localX / cubeSize + ZONE_DIVISIONS / 2 - 0.5);
          cube.gridY = Math.round((cubeData.y / cubeSize) - 0.5);
          cube.gridZ = Math.round(localZ / cubeSize + ZONE_DIVISIONS / 2 - 0.5);
          
          scene.add(cube);
          
          // Zone에 추가
          addCubeToZone(zoneX, zoneY, cube);
        });
      }
      
      // 복원된 Zone으로 이동 및 바닥 면 업데이트
      if (currentZoneX !== 0 || currentZoneY !== 0) {
        // Zone이 (0,0)이 아닌 경우만 카메라 이동
        const targetX = currentZoneX * ZONE_SIZE;
        const targetZ = currentZoneY * ZONE_SIZE;
        camera.position.x = targetX - 20;
        camera.position.y = 20;
        camera.position.z = targetZ + 20;
        camera.lookAt(targetX, 0, targetZ);
      } else {
        // Zone (0,0)인 경우 기본 위치 유지
        camera.position.set(-20, 20, 20);
        camera.lookAt(0, 0, 0);
      }
      
      // 바닥 면 업데이트 (복원된 Zone이 활성화되도록)
      updateZoneFloors();
      
    } else if (Array.isArray(loadedSceneData)) {
      // 기존 배열 형식 데이터 (호환성)
      console.log('기존 배열 데이터 로드');
      loadedSceneData.forEach(cubeData => {
        // Zone 0,0에 로드
        const localX = cubeData.x;
        const localZ = cubeData.z;
        const gridX = (localX / cubeSize) + ZONE_DIVISIONS / 2 - 0.5;
        const gridY = (cubeData.y / cubeSize) - 0.5;
        const gridZ = (localZ / cubeSize) + ZONE_DIVISIONS / 2 - 0.5;
        
        addCube(Math.round(gridX), Math.round(gridY), Math.round(gridZ), cubeData.color);
      });
    }
    
    // ---- 초기 카메라 위치 설정 (데이터 로드 후) ----
    if (currentZoneX === 0 && currentZoneY === 0) {
      // 첫 접속이거나 Zone (0,0)인 경우 적절한 초기 위치 설정
      camera.position.set(-20, 20, 20);
      camera.lookAt(0, 0, 0);
    }
  }
  
  // 씬의 모든 큐브 제거
  function clearScene() {
    // 모든 Zone의 기존 큐브들 제거
    for (const [zoneKey, zoneCubes] of Object.entries(zoneData)) {
      zoneCubes.forEach(cube => scene.remove(cube));
      zoneCubes.length = 0; // 배열 비우기
    }
  }

  // ---- 첫 진입 시 해당 spaceId에 저장된 씬 자동 로드 ----
  const loadedSceneData = loadSpace(spaceId);
  if (loadedSceneData) {
    console.log('자동 로드 데이터:', loadedSceneData);
    loadSceneFromData(loadedSceneData);
  } else {
    // ---- 초기 카메라 위치 설정 (데이터가 없을 때) ----
    camera.position.set(-20, 20, 20);
    camera.lookAt(0, 0, 0);
  }
  // ---- End 자동 로드 ----

  // 오른쪽 클릭으로 큐브 삭제
  renderer.domElement.addEventListener('contextmenu', (event) => {
    // FPS 모드일 때는 우클릭 삭제 건너뜀
    if (fpsControls && fpsControls.enabled) {
      event.preventDefault();
      return;
    }
    
    const rect = renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);

    // 모든 큐브들이 삭제 가능
    const allCubes = [];
    for (const [zoneKey, zoneCubes] of Object.entries(zoneData)) {
      allCubes.push(...zoneCubes);
    }
    const intersects = raycaster.intersectObjects(allCubes);
    
    if (intersects.length > 0) {
      event.preventDefault();
      const targetCube = intersects[0].object;
      
      // 큐브에 비디오가 있으면 사이드바로 이동
      if (targetCube.userData.videos && window.webrtcManager) {
        window.webrtcManager.moveVideosToSidebar(targetCube);
      }
      
      // 씬에서 제거
      scene.remove(targetCube);

      // 해당 큐브가 속한 Zone을 찾아서 제거
      let found = false;
      for (const [zoneKey, zoneCubes] of Object.entries(zoneData)) {
        const index = zoneCubes.indexOf(targetCube);
        if (index > -1) {
          const [zoneX, zoneY] = zoneKey.split(',').map(Number);
          removeCubeFromZone(zoneX, zoneY, targetCube);
          found = true;
          break;
        }
      }
      
      if (!found) {
        console.warn('삭제할 큐브의 Zone을 찾을 수 없음:', targetCube);
      }

      // hover 상태 초기화
      if (hoveredCube === targetCube) {
        hoveredCube = null;
        hoveredFaceNormal = null;
      }

      // highlight edge 정리
      if (highlightEdge) {
        scene.remove(highlightEdge);
        highlightEdge = null;
      }
      
      // 자동저장은 removeCubeFromZone에서 처리됨
    } else {
      event.preventDefault(); // 컨텍스트 메뉴 표시 방지
    }
  });

  // Download button functionality (Zone 시스템용)
  const downloadButton = document.getElementById('downloadButton');
  if (downloadButton) {
    downloadButton.addEventListener('click', () => {
      showLoading('파일 생성 중...');
      
      setTimeout(() => {
        const allSceneData = {};
        
        console.log('현재 zoneData:', zoneData); // 디버깅
        
        // 모든 Zone의 데이터를 저장
        for (const [zoneKey, zoneCubes] of Object.entries(zoneData)) {
          console.log(`Zone ${zoneKey}: ${zoneCubes.length}개 큐브`); // 디버깅
          if (zoneCubes.length > 0) {
            allSceneData[zoneKey] = zoneCubes.map(cube => ({
              x: cube.position.x,
              y: cube.position.y,
              z: cube.position.z,
              color: `#${cube.material.color.getHexString()}`
            }));
          }
        }
        
        // 현재 Zone 정보도 저장
        allSceneData.currentZone = { x: currentZoneX, y: currentZoneY };
        
        console.log('다운로드할 데이터:', allSceneData); // 디버깅
        
        saveSpace(spaceId, allSceneData);
        const jsonString = JSON.stringify(allSceneData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const anchorElement = document.createElement('a');
        anchorElement.href = URL.createObjectURL(blob);
        anchorElement.download = `cuberse_zones_${spaceId}.json`;
        anchorElement.click();
        URL.revokeObjectURL(anchorElement.href);
        
        hideLoading();
        showToast('파일이 다운로드되었습니다');
      }, 500);
    });
  }

  // Home button functionality
  const homeButton = document.getElementById('homeButton');
  if (homeButton) {
    homeButton.addEventListener('click', () => {
      window.location.href = '/spaces.html';
    });
  }

  // 모델 드롭존 이벤트 리스너
  const modelDropZone = document.getElementById('model-drop-zone');
  if (modelDropZone) {
    modelDropZone.addEventListener('dragover', (event) => {
      event.preventDefault();
      modelDropZone.classList.add('drag-over');
    });

    modelDropZone.addEventListener('dragleave', (event) => {
      event.preventDefault();
      modelDropZone.classList.remove('drag-over');
    });

    modelDropZone.addEventListener('drop', (event) => {
      event.preventDefault();
      event.stopPropagation();
      modelDropZone.classList.remove('drag-over');

      const file = event.dataTransfer.files[0];
      if (file && file.type === 'application/json') {
        showLoading('모델 파일 로딩 중...');
        
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const modelData = JSON.parse(e.target.result);
            console.log('로드된 모델 데이터:', modelData);
            
            // 배열 형태인지 확인
            if (Array.isArray(modelData) && modelData.length > 0) {
              hideLoading();
              enterPlacementMode(modelData);
            } else {
              hideLoading();
              showToast('유효하지 않은 모델 파일입니다.', true);
            }
          } catch (error) {
            console.error('모델 파일 파싱 오류:', error);
            hideLoading();
            showToast('파일을 읽을 수 없습니다.', true);
          }
        };
        reader.readAsText(file);
      } else {
        showToast('JSON 파일만 지원됩니다.', true);
      }
    });
  }

  // Drag and drop load functionality (주인만 가능)
  renderer.domElement.addEventListener('dragover', (event) => {
    event.preventDefault(); // Allow dropping
  });

  renderer.domElement.addEventListener('drop', (event) => {
    event.preventDefault();
    event.stopPropagation();

    // 주인 권한 체크 (실시간 서버 연결 안 된 경우는 항상 주인으로 간주)
    if (isRealtimeAvailable && !isOwner) {
      showToast('JSON 파일 업로드는 방 주인만 가능합니다.', true);
      return;
    }

    const file = event.dataTransfer.files[0];
    if (file && file.type === 'application/json') {
      showLoading('파일 로딩 중...');
      
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const loadedData = JSON.parse(e.target.result);
          console.log('로드된 데이터:', loadedData); // 디버깅

          // 모든 Zone의 기존 큐브들 제거
          console.log('[SCENE] 기존 씬 정리 시작');
          for (const [zoneKey, zoneCubes] of Object.entries(zoneData)) {
            console.log(`[SCENE] Zone ${zoneKey}에서 ${zoneCubes.length}개 큐브 제거`);
            zoneCubes.forEach(cube => scene.remove(cube));
            zoneCubes.length = 0; // 배열 비우기
          }
          
          // Zone 데이터 완전 초기화
          Object.keys(zoneData).forEach(key => {
            zoneData[key] = [];
          });
          
          console.log('[SCENE] 기존 씬 정리 완료');
          
          // 실시간 동기화: 모든 게스트에게 전체 씬 리셋 알림
          if (isRealtimeAvailable && socket) {
            console.log('[SCENE] 씬 리셋 이벤트 전송:', spaceId);
            socket.emit('reset scene', { spaceId });
          } else {
            console.log('[SCENE] 실시간 서버 연결 없음 - 리셋 이벤트 전송 안 함');
          }
          
          // 새로운 Zone 데이터가 있는지 확인
          if (loadedData.currentZone) {
            // 새로운 Zone 시스템 파일
            console.log('Zone 시스템 파일 감지');
            
            // 현재 Zone 위치 복원
            currentZoneX = loadedData.currentZone.x || 0;
            currentZoneY = loadedData.currentZone.y || 0;
            
            // 각 Zone의 큐브들 복원
            for (const [zoneKey, cubeDataList] of Object.entries(loadedData)) {
              if (zoneKey === 'currentZone') continue;
              
              const [zoneX, zoneY] = zoneKey.split(',').map(Number);
              console.log(`Zone ${zoneKey} 복원 중: ${cubeDataList.length}개 큐브`);
              
              cubeDataList.forEach(cubeData => {
                // 월드 좌표로 직접 큐브 생성
                const geometry = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);
                const material = new THREE.MeshLambertMaterial({ color: cubeData.color });
                const cube = new THREE.Mesh(geometry, material);
                cube.position.set(cubeData.x, cubeData.y, cubeData.z);
                
                // gridX, gridY, gridZ 계산해서 설정
                const localX = cubeData.x - (zoneX * ZONE_SIZE);
                const localZ = cubeData.z - (zoneY * ZONE_SIZE);
                cube.gridX = Math.round(localX / cubeSize + ZONE_DIVISIONS / 2 - 0.5);
                cube.gridY = Math.round((cubeData.y / cubeSize) - 0.5);
                cube.gridZ = Math.round(localZ / cubeSize + ZONE_DIVISIONS / 2 - 0.5);
                
                // 테두리 추가
                const edges = new THREE.EdgesGeometry(geometry);
                const lineMaterial = new THREE.LineBasicMaterial({ 
                  color: 0x000000,
                  linewidth: 1,
                  transparent: true,
                  opacity: 0.3
                });
                const wireframe = new THREE.LineSegments(edges, lineMaterial);
                wireframe.raycast = () => {}; // raycast 비활성화
                cube.add(wireframe);
                
                scene.add(cube);
                
                // Zone에 추가
                addCubeToZone(zoneX, zoneY, cube);
                
                // Zone에 추가
                addCubeToZone(zoneX, zoneY, cube);
              });
            }
            
            // 복원된 Zone으로 카메라 이동
            switchToZone(currentZoneX, currentZoneY);
            
          } else {
            // 기존 단일 Zone 파일 (호환성)
            console.log('기존 단일 파일 감지');
            currentZoneX = 0;
            currentZoneY = 0;
            
            if (Array.isArray(loadedData)) {
              loadedData.forEach(cubeData => {
                // 로컬 좌표로 변환하여 addCube 함수 사용
                const localX = cubeData.x - (currentZoneX * ZONE_SIZE);
                const localZ = cubeData.z - (currentZoneY * ZONE_SIZE);
                const gridX = (localX / cubeSize) + ZONE_DIVISIONS / 2 - 0.5;
                const gridY = (cubeData.y / cubeSize) - 0.5;
                const gridZ = (localZ / cubeSize) + ZONE_DIVISIONS / 2 - 0.5;
                
                addCube(Math.round(gridX), Math.round(gridY), Math.round(gridZ), cubeData.color);
              });
            }
          }
          
          autoSaveCurrentSpace();
          
          // 실시간 동기화: 새 씬 데이터를 모든 게스트에게 전송
          if (isRealtimeAvailable && socket) {
            const newSceneData = loadSpace(spaceId);
            if (newSceneData) {
              console.log('[SCENE] 새 씬 데이터 전송:', { 
                spaceId, 
                zoneCount: Object.keys(newSceneData).filter(k => k !== 'currentZone').length 
              });
              socket.emit('load new scene', { spaceId, sceneData: newSceneData });
            } else {
              console.log('[SCENE] 새 씬 데이터가 없음');
            }
          } else {
            console.log('[SCENE] 실시간 서버 연결 없음 - 새 씬 데이터 전송 안 함');
          }
          
          hideLoading();
          showToast('파일이 성공적으로 로드되었습니다');
          
        } catch (error) {
          console.error('Error parsing JSON file:', error);
          hideLoading();
          showToast('유효하지 않은 JSON 파일입니다', true);
        }
      };

      reader.onerror = (error) => {
        console.error('Error reading file:', error);
        hideLoading();
        showToast('파일 읽기에 실패했습니다', true);
      };

      reader.readAsText(file);
    } else if (file) {
      showToast('JSON 파일만 업로드 가능합니다', true);
    }
  });

  // Geometry LOD 시스템
  const LOD_DISTANCES = {
    HIGH: 25,     // 25 유닛 이내: 고해상도 큐브
    MEDIUM: 60,   // 60 유닛 이내: 중해상도 큐브  
    LOW: 120,     // 120 유닛 이내: 저해상도 큐브
    POINT: 200    // 200 유닛 이내: 점으로 표시
  };
  
  // 지오메트리 캐시 (성능 최적화)
  const geometryCache = new Map();
  
  function getGeometryForLOD(lodLevel) {
    if (geometryCache.has(lodLevel)) {
      return geometryCache.get(lodLevel);
    }
    
    let geometry;
    switch (lodLevel) {
      case 'high':
        // 고해상도: 일반 큐브 (기본)
        geometry = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);
        break;
      case 'medium':
        // 중해상도: 낮은 세분화
        geometry = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize, 1, 1, 1);
        break;
      case 'low':
        // 저해상도: 더 간단한 큐브
        geometry = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize, 1, 1, 1);
        break;
      case 'point':
        // 매우 멀리: 점으로 표시
        geometry = new THREE.SphereGeometry(cubeSize * 0.2, 4, 3);
        break;
      default:
        geometry = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);
    }
    
    geometryCache.set(lodLevel, geometry);
    return geometry;
  }
  
  function calculateGeometryLOD(distance) {
    if (distance <= LOD_DISTANCES.HIGH) {
      return 'high';
    } else if (distance <= LOD_DISTANCES.MEDIUM) {
      return 'medium';
    } else if (distance <= LOD_DISTANCES.LOW) {
      return 'low';
    } else if (distance <= LOD_DISTANCES.POINT) {
      return 'point';
    } else {
      return 'point'; // 매우 멀면 점
    }
  }
  
  function performGeometryLOD() {
    const cameraPosition = camera.position;
    
    // 모든 Zone의 큐브들에 대해 LOD 적용
    for (const [zoneKey, zoneCubes] of Object.entries(zoneData)) {
      zoneCubes.forEach(cube => {
        // 씬에 있는 큐브만 처리 (Frustum Culling과 연계)
        if (!scene.children.includes(cube)) return;
        
        // 카메라와 큐브 간 거리 계산
        const distance = cameraPosition.distanceTo(cube.position);
        
        // 현재 LOD 레벨 계산
        const newLodLevel = calculateGeometryLOD(distance);
        
        // 큐브의 현재 LOD와 다르면 지오메트리 교체
        if (cube._geometryLod !== newLodLevel) {
          const newGeometry = getGeometryForLOD(newLodLevel);
          
          // 기존 지오메트리 해제 (메모리 누수 방지)
          if (cube.geometry && !geometryCache.has(cube._geometryLod)) {
            cube.geometry.dispose();
          }
          
          cube.geometry = newGeometry;
          cube._geometryLod = newLodLevel;
          
          // 테두리도 업데이트
          if (cube.children.length > 0) {
            // 기존 테두리 제거
            const wireframe = cube.children[0];
            cube.remove(wireframe);
            if (wireframe.geometry) wireframe.geometry.dispose();
            if (wireframe.material) wireframe.material.dispose();
          }
          
          // 점 형태가 아닐 때만 테두리 추가
          if (newLodLevel !== 'point') {
            const edges = new THREE.EdgesGeometry(newGeometry);
            const lineMaterial = new THREE.LineBasicMaterial({ 
              color: 0x000000,
              linewidth: 1,
              transparent: true,
              opacity: newLodLevel === 'high' ? 0.3 : 0.2
            });
            const wireframe = new THREE.LineSegments(edges, lineMaterial);
            wireframe.raycast = () => {}; // raycast 비활성화
            cube.add(wireframe);
          }
        }
      });
    }
  }

  // 조명 토글 시스템
  let lightingEnabled = true; // 기본값: 조명 켜짐
  
  function toggleLighting() {
    lightingEnabled = !lightingEnabled;
    
    // 버튼 상태 업데이트
    const toggleButton = document.getElementById('lightingToggle');
    if (lightingEnabled) {
      toggleButton.classList.remove('lighting-off');
      toggleButton.classList.add('lighting-on');
      toggleButton.setAttribute('data-tooltip', '조명 효과 끄기');
      toggleButton.querySelector('.icon').textContent = '💡';
    } else {
      toggleButton.classList.remove('lighting-on');
      toggleButton.classList.add('lighting-off');
      toggleButton.setAttribute('data-tooltip', '조명 효과 켜기');
      toggleButton.querySelector('.icon').textContent = '🌙';
    }
    
    // 모든 큐브의 머티리얼 업데이트
    updateAllCubeMaterials();
    
    showToast(lightingEnabled ? '조명 효과가 켜졌습니다' : '조명 효과가 꺼졌습니다');
  }
  
  function updateAllCubeMaterials() {
    // 머티리얼 캐시 클리어 (새 설정에 맞게 재생성)
    if (typeof materialCache !== 'undefined') {
      materialCache.clear();
    }
    
    // 모든 Zone의 큐브들 업데이트
    for (const [zoneKey, zoneCubes] of Object.entries(zoneData)) {
      zoneCubes.forEach(cube => {
        const currentColor = `#${cube.material.color.getHexString()}`;
        
        // 기존 머티리얼 해제
        if (cube.material) {
          cube.material.dispose();
        }
        
        // 새 머티리얼 적용
        if (lightingEnabled) {
          cube.material = new THREE.MeshLambertMaterial({ color: currentColor });
        } else {
          cube.material = new THREE.MeshBasicMaterial({ color: currentColor });
        }
      });
    }
  }
  
  // 조명 토글 버튼 이벤트 리스너
  document.getElementById('lightingToggle').addEventListener('click', toggleLighting);

  // Zone Frustum Culling 시스템
  function performZoneFrustumCulling() {
    // 카메라 frustum 계산
    const frustum = new THREE.Frustum();
    const cameraMatrix = new THREE.Matrix4();
    cameraMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(cameraMatrix);
    
    // 각 Zone별로 frustum 체크
    for (const [zoneKey, zoneCubes] of Object.entries(zoneData)) {
      if (zoneCubes.length === 0) continue;
      
      // Zone 경계 박스 계산
      const [zoneX, zoneY] = zoneKey.split(',').map(Number);
      const zoneCenterX = zoneX * ZONE_SIZE;
      const zoneCenterZ = zoneY * ZONE_SIZE;
      
      // Zone 영역을 포함하는 박스 생성 (여유 공간 포함)
      const zoneBox = new THREE.Box3(
        new THREE.Vector3(zoneCenterX - ZONE_SIZE/2, -50, zoneCenterZ - ZONE_SIZE/2),
        new THREE.Vector3(zoneCenterX + ZONE_SIZE/2, 200, zoneCenterZ + ZONE_SIZE/2)
      );
      
      // Zone이 frustum 안에 있는지 체크
      const isVisible = frustum.intersectsBox(zoneBox);
      
      // Zone 큐브들의 씬 추가/제거 관리
      zoneCubes.forEach(cube => {
        const isInScene = scene.children.includes(cube);
        
        if (isVisible && !isInScene) {
          // 보여야 하는데 씬에 없음 → 추가
          scene.add(cube);
        } else if (!isVisible && isInScene) {
          // 안 보여도 되는데 씬에 있음 → 제거
          scene.remove(cube);
        }
      });
    }
  }

  // 렌더 루프
  function animate() {
    requestAnimationFrame(animate);
    
    // 카메라 위치 기반 Zone 그리드 자동 생성 체크
    checkAndCreateNearbyZones();
    
    // Zone Frustum Culling 수행
    performZoneFrustumCulling();
    
    // Geometry LOD 수행 (500ms마다 실행 - 지오메트리 교체는 비용이 높음)
    if (Math.floor(performance.now() / 500) % 2 === 0) {
      performGeometryLOD();
    }
    
    // FPSControls가 활성화된 경우 FPS 이동 처리
    if (fpsControls && fpsControls.enabled) {
      fpsControls.update();
    } else {
      // 기존 키보드 이동 처리
      handleKeyboardMovement();
    }
    
    renderer.render(scene, camera);
  }

  console.log('3D 환경 초기화 완료');
  console.log('그리드 추가됨:', scene.children.length, '개 객체');
  console.log('카메라 위치:', camera.position);
  console.log('렌더러 크기:', renderer.domElement.width, 'x', renderer.domElement.height);
  
  hideLoading();
  animate();
  
  } catch (error) {
    console.error('3D 환경 초기화 오류:', error);
    hideLoading();
    showToast('3D 환경 로딩에 실패했습니다', true);
  }
}

// DOM이 준비되었는지 확인하고 초기화
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  console.log('DOM이 이미 준비됨, 즉시 초기화');
  initApp();
}

// WebRTC 매니저 초기화 및 이벤트 핸들러
async function initWebRTC() {
  try {
    console.log('=== WebRTC 초기화 시작 ===');
    console.log('Socket:', !!socket, 'SpaceId:', spaceId, 'UserId:', getUserId());
    
    const { WebRTCManager } = await import('./webrtc.js');
    console.log('WebRTCManager 클래스 로드 완료');
    
    window.webrtcManager = new WebRTCManager(socket, spaceId, getUserId());
    console.log('WebRTC 매니저 인스턴스 생성 완료');
    
    // 기존 이벤트 리스너 제거
    const startBtn = document.getElementById('start-video-btn');
    const stopBtn = document.getElementById('stop-video-btn');
    
    if (startBtn) {
      // 기존 리스너 제거 후 새로 추가
      startBtn.replaceWith(startBtn.cloneNode(true));
      const newStartBtn = document.getElementById('start-video-btn');
      
      newStartBtn.addEventListener('click', async () => {
        console.log('=== 카메라 시작 버튼 클릭 ===');
        if (!window.webrtcManager) {
          console.error('WebRTC 매니저가 없습니다!');
          return;
        }
        
        const success = await window.webrtcManager.startLocalVideo();
        if (success && socket && isRealtimeAvailable) {
          // 기존 사용자들과 연결 시도
          setTimeout(() => {
            const userList = getConnectedUsers();
            console.log('연결 시도할 사용자 목록:', userList);
            userList.forEach(userId => {
              if (userId !== getUserId()) {
                console.log('연결 시도:', userId);
                window.webrtcManager.initiateCall(userId);
              }
            });
          }, 1000);
        }
      });
    }
    
    if (stopBtn) {
      stopBtn.replaceWith(stopBtn.cloneNode(true));
      const newStopBtn = document.getElementById('stop-video-btn');
      
      newStopBtn.addEventListener('click', () => {
        console.log('카메라 정지 버튼 클릭');
        if (window.webrtcManager) {
          window.webrtcManager.stopLocalVideo();
        }
      });
    }
    
    // ESC 키로 비디오 배치 모드 취소
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && window.webrtcManager && window.webrtcManager.isVideoPlacementMode) {
        window.webrtcManager.exitVideoPlacement();
      }
    });
    
    console.log('=== WebRTC 매니저 초기화 완료 ===');
    console.log('Socket 연결 상태:', socket ? socket.connected : 'null');
  } catch (error) {
    console.error('=== WebRTC 초기화 실패 ===', error);
    console.error('Error stack:', error.stack);
  }
}

// 유틸리티 함수들
function getUserId() {
  return localStorage.getItem('cuberse_current_user');
}

function getConnectedUsers() {
  const userListElement = document.getElementById('user-list');
  const users = [];
  userListElement.querySelectorAll('li').forEach(li => {
    // 텍스트에서 사용자 이름만 추출 (괄호 안의 내용 제거)
    const userName = li.textContent.replace(/ \(.*?\)/g, '').trim();
    users.push(userName);
  });
  console.log('실제 사용자 ID 목록:', users);
  return users;
}

// showToast 함수를 전역으로 노출
window.showToast = showToast;

// 큐브 ID 생성 함수 추가
function getCubeId(cube) {
  return `${cube.position.x}_${cube.position.y}_${cube.position.z}`;
}

// 큐브 ID로 큐브 찾기 함수 추가
function findCubeById(cubeId) {
  for (const [zoneKey, zoneCubes] of Object.entries(zoneData)) {
    for (const cube of zoneCubes) {
      if (getCubeId(cube) === cubeId) {
        return cube;
      }
    }
  }
  return null;
}

// WebRTC 매니저에 필요한 함수들을 전역으로 노출
window.getCubeId = getCubeId;
window.findCubeById = findCubeById;
window.zoneData = zoneData;

// %%%%%LAST%%%%%