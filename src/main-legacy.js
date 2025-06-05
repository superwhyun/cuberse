import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';

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
  
  // Zone별 큐브 데이터 저장
  const zoneData = {};
  
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
  
  // Socket.IO 초기화 (Zone 함수들이 정의된 후)
  function setupSocketIO() {
    try {
      if (window.io) {
        socket = window.io();
        
        socket.on('connect', () => {
          isRealtimeAvailable = true;
          
          const userId = localStorage.getItem('cuberse_current_user');
          if (userId) {
            socket.emit('login', { userId });
          }
        });
        
        socket.on('disconnect', () => {
          isRealtimeAvailable = false;
        });
        
        socket.on('user list', (userList) => {
          const ul = document.getElementById('user-list');
          const myId = localStorage.getItem('cuberse_current_user');
          if (ul) {
            ul.innerHTML = '';
            userList.forEach(userId => {
              const li = document.createElement('li');
              li.textContent = userId + (userId === myId ? ' (나)' : '');
              ul.appendChild(li);
            });
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
            const material = new THREE.MeshLambertMaterial({ color: data.color });
            const cube = new THREE.Mesh(geometry, material);
            
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
              scene.remove(target);
              removeCubeFromZone(data.zoneX, data.zoneY, target, false);
            }
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
          color: `#${cube.material.color.getHexString()}`
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
  let previousMousePosition = { x: 0, y: 0 };
  let initialMousePosition = { x: 0, y: 0 };
  const dragThreshold = 5; // pixels
  let wasDraggingJustNow = false; // Flag to differentiate click from drag
  let isDraggingCube = false; // 큐브 드래그 모드 플래그
  let dragStartCube = null; // 드래그 시작 큐브
  let dragStartFace = null; // 드래그 시작 면

  // ---- 3D 환경 구성: 씬, 카메라, 렌더러, 플레이어 본체, FPSControls ----
  // 1. THREE.Scene 생성
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf0f0f0);
  console.log('씬 생성:', scene);

  // 2. THREE.PerspectiveCamera 생성
  //    (FPS/편집모드 전환에 따라 위치와 계층 구조가 결정됨)
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  console.log('카메라 생성:', camera);

  // 3. THREE.WebGLRenderer 생성 및 DOM에 추가
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  container.appendChild(renderer.domElement);
  console.log('렌더러 생성 및 추가:', renderer);

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
    
    // 바닥 면 생성 (활성 Zone만)
    let floorPlane = null;
    if (isActive) {
      const floorGeometry = new THREE.PlaneGeometry(ZONE_SIZE, ZONE_SIZE);
      const floorMaterial = new THREE.MeshBasicMaterial({ 
        color: 0x4f46e5, 
        transparent: true, 
        opacity: 0.1,
        side: THREE.DoubleSide
      });
      floorPlane = new THREE.Mesh(floorGeometry, floorMaterial);
      floorPlane.rotation.x = -Math.PI / 2; // 수평으로 회전
      floorPlane.position.set(zoneX * ZONE_SIZE, 0.01, zoneY * ZONE_SIZE); // 약간 위에
      scene.add(floorPlane);
    }
    
    const zoneKey = getZoneKey(zoneX, zoneY);
    zoneGrids.set(zoneKey, gridHelper);
    if (floorPlane) {
      zoneFloors.set(zoneKey, floorPlane);
    }
    
    return gridHelper;
  }
  
  function updateZoneFloors() {
    // 모든 기존 바닥 면 제거
    for (const [zoneKey, floor] of zoneFloors) {
      scene.remove(floor);
    }
    zoneFloors.clear();
    
    // 현재 활성 Zone에만 바닥 면 추가
    const activeZoneKey = getCurrentZoneKey();
    const floorGeometry = new THREE.PlaneGeometry(ZONE_SIZE, ZONE_SIZE);
    const floorMaterial = new THREE.MeshBasicMaterial({ 
      color: 0x4f46e5, 
      transparent: true, 
      opacity: 0.1,
      side: THREE.DoubleSide
    });
    const floorPlane = new THREE.Mesh(floorGeometry, floorMaterial);
    floorPlane.rotation.x = -Math.PI / 2;
    floorPlane.position.set(currentZoneX * ZONE_SIZE, 0.01, currentZoneY * ZONE_SIZE);
    scene.add(floorPlane);
    
    zoneFloors.set(activeZoneKey, floorPlane);
  }
  
  // 현재 Zone 그리드 생성 (활성)
  createZoneGrid(currentZoneX, currentZoneY, true);
  
  // 인접 Zone들 그리드도 미리 생성 (비활성)
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue;
      createZoneGrid(currentZoneX + dx, currentZoneY + dy, false);
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

  function addCube(x, y, z, color, byRemote = false) {
    // 현재 Zone에서만 편집 가능
    if (x < 0 || x >= ZONE_DIVISIONS || z < 0 || z >= ZONE_DIVISIONS) {
      return;
    }
    
    // 중복 검사
    const currentZoneCubes = getZoneCubes(currentZoneX, currentZoneY);
    if (currentZoneCubes.some(cube => cube.gridX === x && cube.gridY === y && cube.gridZ === z)) {
      return;
    }

    const geometry = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);
    const material = new THREE.MeshLambertMaterial({ color });
    const cube = new THREE.Mesh(geometry, material);
    
    // Zone 좌표계 적용
    const worldX = (currentZoneX * ZONE_SIZE) + (x - ZONE_DIVISIONS / 2 + 0.5) * cubeSize;
    const worldZ = (currentZoneY * ZONE_SIZE) + (z - ZONE_DIVISIONS / 2 + 0.5) * cubeSize;
    
    cube.position.set(
      worldX,
      (y + 0.5) * cubeSize,
      worldZ
    );
    
    // grid 좌표를 cube 객체에 저장
    cube.gridX = x;
    cube.gridY = y;
    cube.gridZ = z;
    cube._byRemote = byRemote;
    
    scene.add(cube);
    addCubeToZone(currentZoneX, currentZoneY, cube);

    // 실시간 동기화: 원격 추가가 아닌 경우에만 전송
    if (!byRemote && isRealtimeAvailable && socket) {
      const data = {
        x, y, z, color,
        zoneX: currentZoneX,
        zoneY: currentZoneY,
        spaceId
      };
      socket.emit('add cube', data);
    }
    
    autoSaveCurrentSpace();
  }

  // 마우스 클릭으로 큐브 추가 (큐브 위 또는 바닥)
  renderer.domElement.addEventListener('click', (event) => {
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

    // hover된 큐브와 면이 있으면 그 정보를 사용 (공중 연결)
    if (hoveredCube && hoveredFaceNormal) {
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

    // 현재 Zone의 큐브들만 검사하여 큐브 클릭 여부 확인
    const currentZoneCubes = getZoneCubes(currentZoneX, currentZoneY);
    const cubeIntersects = raycaster.intersectObjects(currentZoneCubes);
    
    // 큐브를 클릭한 경우는 이미 hover에서 처리되므로, 바닥 클릭만 처리
    if (cubeIntersects.length === 0) {
      // 바닥 클릭 - 빈 공간이면 바닥부터 쌓기
      const planeY = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const intersect = raycaster.ray.intersectPlane(planeY, new THREE.Vector3());
      if (intersect) {
        // 현재 Zone 기준으로 좌표 변환
        const localX = intersect.x - (currentZoneX * ZONE_SIZE);
        const localZ = intersect.z - (currentZoneY * ZONE_SIZE);
        
        let x = Math.floor(localX / cubeSize + ZONE_DIVISIONS / 2);
        let z = Math.floor(localZ / cubeSize + ZONE_DIVISIONS / 2);
        
        if (x >= 0 && x < ZONE_DIVISIONS && z >= 0 && z < ZONE_DIVISIONS) {
          // 해당 x,z 위치에서 가장 낮은 빈 공간 찾기
          const currentZoneCubes = getZoneCubes(currentZoneX, currentZoneY);
          let y = 0;
          while (currentZoneCubes.some(cube =>
            Math.abs(cube.position.x - ((currentZoneX * ZONE_SIZE) + (x - ZONE_DIVISIONS / 2 + 0.5) * cubeSize)) < 0.01 &&
            Math.abs(cube.position.y - ((y + 0.5) * cubeSize)) < 0.01 &&
            Math.abs(cube.position.z - ((currentZoneY * ZONE_SIZE) + (z - ZONE_DIVISIONS / 2 + 0.5) * cubeSize)) < 0.01
          )) {
            y++;
          }
          addCube(x, y, z, cubeColor);
        }
      }
    }
  });

  // Mouse listeners for drag, highlight
  renderer.domElement.addEventListener('mousedown', (event) => {
    // FPS 모드일 때는 편집 기능 건너뜀
    if (fpsControls && fpsControls.enabled) return;
    
    if (event.button === 2) { // Right mouse button for context menu
        return;
    }
    isDragging = true;
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
      console.log('마우스가 3D 영역을 벗어나서 드래깅 중단');
    }
  });

  renderer.domElement.addEventListener('mousemove', (event) => {
    // FPS 모드일 때는 편집 기능 건너뜀
    if (fpsControls && fpsControls.enabled) return;
    
    hoveredCube = null;
    hoveredFaceNormal = null;
    const rect = renderer.domElement.getBoundingClientRect();
    const currentMouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
    );

    if (isDragging) {
        const deltaX = event.clientX - previousMousePosition.x;
        const deltaY = event.clientY - previousMousePosition.y;

        previousMousePosition.x = event.clientX;
        previousMousePosition.y = event.clientY;

        if (isDraggingCube && dragStartCube && dragStartFace) {
          // 큐브 드래그 모드: 직선 경로에 큐브 생성
          const dragDistance = Math.sqrt(
            Math.pow(event.clientX - initialMousePosition.x, 2) + 
            Math.pow(event.clientY - initialMousePosition.y, 2)
          );
          
          if (dragDistance > dragThreshold) {
            // 드래그 방향에 따른 큐브 생성 개수 계산 (거리에 비례)
            const cubeCount = Math.floor(dragDistance / 20); // 20px마다 1개 큐브
            
            if (cubeCount > 0) {
              // 시작 큐브 위치 계산
              const localX = dragStartCube.position.x - (currentZoneX * ZONE_SIZE);
              const localZ = dragStartCube.position.z - (currentZoneY * ZONE_SIZE);
              
              const startGridX = Math.round(localX / cubeSize + ZONE_DIVISIONS / 2 - 0.5);
              const startGridY = Math.round((dragStartCube.position.y / cubeSize) - 0.5);
              const startGridZ = Math.round(localZ / cubeSize + ZONE_DIVISIONS / 2 - 0.5);
              
              // 면 방향으로 직선 경로에 큐브들 생성
              for (let i = 1; i <= cubeCount; i++) {
                const nextX = startGridX + Math.round(dragStartFace.x) * i;
                const nextY = startGridY + Math.round(dragStartFace.y) * i;
                const nextZ = startGridZ + Math.round(dragStartFace.z) * i;
                
                if (
                  nextX >= 0 && nextX < ZONE_DIVISIONS &&
                  nextY >= 0 &&
                  nextZ >= 0 && nextZ < ZONE_DIVISIONS
                ) {
                  addCube(nextX, nextY, nextZ, cubeColor);
                }
              }
              
              wasDraggingJustNow = true;
            }
          }
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
        const currentZoneCubes = getZoneCubes(currentZoneX, currentZoneY);
        
        // 씬에서 실제로 존재하는 큐브들만 필터링
        const validZoneCubes = currentZoneCubes.filter(cube => scene.children.includes(cube));
        
        const cubeIntersects = raycaster.intersectObjects(validZoneCubes);

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
    
    if (event.button === 2) { // Right mouse button
        return;
    }
    if (isDragging) {
        const deltaX = event.clientX - initialMousePosition.x;
        const deltaY = event.clientY - initialMousePosition.y;
        const dragDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

        if (dragDistance > dragThreshold) {
            wasDraggingJustNow = true;
        }
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
    q: false, e: false, c: false, z: false
  };
  
  const moveSpeed = 0.2; // 이동 속도 (초당 유닛)
  const rotateSpeed = 0.02; // 회전 속도

  // 키보드 이동/회전 - 연속 입력 처리
  window.addEventListener('keydown', (e) => {
    if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
    
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

  // 페이지 포커스 잃을 때 모든 키 상태 리셋 (키가 눌린 채로 고정되는 것 방지)
  window.addEventListener('blur', () => {
    Object.keys(keyStates).forEach(key => {
      keyStates[key] = false;
    });
  });

  // 키 상태에 따른 부드러운 이동 처리 함수
  function handleKeyboardMovement() {
    let moved = false;
    
    // 수평 이동 처리
    if (keyStates.a) {
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const left = new THREE.Vector3().crossVectors(camera.up, dir).normalize();
      camera.position.addScaledVector(left, moveSpeed);
      moved = true;
    }
    if (keyStates.d) {
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const right = new THREE.Vector3().crossVectors(dir, camera.up).normalize();
      camera.position.addScaledVector(right, moveSpeed);
      moved = true;
    }
    if (keyStates.w) {
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      dir.y = 0;
      dir.normalize();
      camera.position.addScaledVector(dir, moveSpeed);
      moved = true;
    }
    if (keyStates.s) {
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      dir.y = 0;
      dir.normalize();
      camera.position.addScaledVector(dir, -moveSpeed);
      moved = true;
    }
    
    // 수직 이동 처리
    if (keyStates.c) {
      camera.position.y += moveSpeed; // 위로 이동
      moved = true;
    }
    if (keyStates.z) {
      camera.position.y -= moveSpeed; // 아래로 이동
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
        
        // 새 Zone 그리드 생성 (없다면) - 비활성으로 생성
        const zoneKey = getCurrentZoneKey();
        if (!zoneGrids.has(zoneKey)) {
          createZoneGrid(currentZoneX, currentZoneY, false);
        }
        
        // 새 Zone 텍스트 생성 (없다면)
        if (!zoneTexts.has(zoneKey)) {
          createZoneText(currentZoneX, currentZoneY);
        }
        
        // 인접 Zone들도 생성 - 모두 비활성으로
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            const adjacentX = currentZoneX + dx;
            const adjacentY = currentZoneY + dy;
            const adjacentKey = getZoneKey(adjacentX, adjacentY);
            
            // 그리드 생성
            if (!zoneGrids.has(adjacentKey)) {
              createZoneGrid(adjacentX, adjacentY, false);
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

  // ---- 첫 진입 시 해당 spaceId에 저장된 씬 자동 로드 ----
  const loadedSceneData = loadSpace(spaceId);
  if (loadedSceneData) {
    console.log('자동 로드 데이터:', loadedSceneData); // 디버깅
    
    if (loadedSceneData.currentZone) {
      // 새로운 Zone 시스템 데이터
      console.log('Zone 시스템 데이터 자동 로드');
      
      // 현재 Zone 위치 복원
      currentZoneX = loadedSceneData.currentZone.x || 0;
      currentZoneY = loadedSceneData.currentZone.y || 0;
      
      // 각 Zone의 큐브들 복원
      for (const [zoneKey, cubeDataList] of Object.entries(loadedSceneData)) {
        if (zoneKey === 'currentZone') continue;
        
        const [zoneX, zoneY] = zoneKey.split(',').map(Number);
        console.log(`Zone ${zoneKey} 자동 로드: ${cubeDataList.length}개 큐브`);
        
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
          
          scene.add(cube);
          
          // Zone에 추가
          addCubeToZone(zoneX, zoneY, cube);
        });
      }
      
      // 복원된 Zone으로 이동 및 바닥 면 업데이트
      if (currentZoneX !== 0 || currentZoneY !== 0) {
        // 카메라를 복원된 Zone 위치로 이동
        const targetX = currentZoneX * ZONE_SIZE;
        const targetZ = currentZoneY * ZONE_SIZE;
        camera.position.x = targetX;
        camera.position.z = targetZ + 20;
        camera.lookAt(targetX, 0, targetZ);
      }
      
      // 바닥 면 업데이트 (복원된 Zone이 활성화되도록)
      updateZoneFloors();
      
    } else if (Array.isArray(loadedSceneData)) {
      // 기존 배열 형식 데이터 (호환성)
      console.log('기존 배열 데이터 자동 로드');
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
  }
  
  // ---- 초기 카메라 위치 설정 (데이터 로드 후) ----
  if (!loadedSceneData || (currentZoneX === 0 && currentZoneY === 0)) {
    // 첫 접속이거나 Zone (0,0)인 경우 적절한 초기 위치 설정
    camera.position.set(-15, 12, 15);
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

    // 현재 Zone의 큐브들만 삭제 가능
    const currentZoneCubes = getZoneCubes(currentZoneX, currentZoneY);
    const intersects = raycaster.intersectObjects(currentZoneCubes);
    
    if (intersects.length > 0) {
      event.preventDefault();
      const targetCube = intersects[0].object;
      
      // 씬에서 제거
      scene.remove(targetCube);

      // Zone 배열에서 제거 (실시간 동기화 포함)
      removeCubeFromZone(currentZoneX, currentZoneY, targetCube);

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

  // Drag and drop load functionality
  renderer.domElement.addEventListener('dragover', (event) => {
    event.preventDefault(); // Allow dropping
  });

  renderer.domElement.addEventListener('drop', (event) => {
    event.preventDefault();
    event.stopPropagation();

    const file = event.dataTransfer.files[0];
    if (file && file.type === 'application/json') {
      showLoading('파일 로딩 중...');
      
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const loadedData = JSON.parse(e.target.result);
          console.log('로드된 데이터:', loadedData); // 디버깅

          // 모든 Zone의 기존 큐브들 제거
          for (const [zoneKey, zoneCubes] of Object.entries(zoneData)) {
            zoneCubes.forEach(cube => scene.remove(cube));
            zoneCubes.length = 0; // 배열 비우기
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
                
                scene.add(cube);
                
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

  // 렌더 루프
  function animate() {
    requestAnimationFrame(animate);
    
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

// %%%%%LAST%%%%%