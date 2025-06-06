import { getUserSpaces } from './spaces.js';
import { showLoading, hideLoading, showToast } from './utils.js';
import { initCore3D, startAnimation } from './core3d.js'; // Removed aliased imports for core3d objects, will use scene, camera etc. directly from initCore3D return
import {
  initZoneManager,
  switchToZone as zmSwitchToZone, // Alias for now
  setNetworkContext as zmSetNetworkContext
  // Other zoneManager imports will be added as needed in later stages
} from './zoneManager.js';

// --- 전역 spaceId 선언 ---
let spaceId;
// Global currentZoneX, currentZoneY removed. They are managed by zoneManager or passed as params.
import { createJumpInButton } from './jumpInButton.js';
import { FPSControls } from './fpsControls.js';
// --- Socket.IO 클라이언트 연결 ---
let socket = null;
let isRealtimeAvailable = false;

// setupSocketIO 함수는 initApp 내부에서 정의될 예정
// -----------------------------------------
console.log('main-legacy.js 로딩됨');

// Core 3D objects - these will be assigned after initCore3D
let scene, camera, renderer, playerObject;
let zoneManager; // Declare zoneManager

function initApp() {
  // FPSControls 인스턴스 참조 전역 변수 선언
  let fpsControls = null;
  console.log('initApp 함수 시작');

  

  
  try {
    const container = document.getElementById('container');
    // Initialize Core 3D setup
    const core3DObjects = initCore3D(container);
    scene = core3DObjects.scene;
    camera = core3DObjects.camera;
    renderer = core3DObjects.renderer;
    playerObject = core3DObjects.playerObject;

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
  
  // Initialize ZoneManager
  const updateFpsObstaclesCb = () => updateFpsObstacles();
  const showToastCb = (message, isError) => showToast(message, isError);

  // Initial values for network related params for zoneManager.
  // These will be updated by zmSetNetworkContext when socket connects.
  zoneManager = initZoneManager(
    scene,
    0, // initialZoneX
    0, // initialZoneY
    spaceId,
    isRealtimeAvailable, // initial value
    socket, // initial value (null)
    updateFpsObstaclesCb,
    showToastCb
  );
  
  // ---- Old Zone System Variables and Functions are now being removed ----
  // const ZONE_SIZE = 20; // Removed
  // const ZONE_DIVISIONS = 20; // Removed
  // const cubeSize = ZONE_SIZE / ZONE_DIVISIONS; // Removed

  // Dummy getZoneCubes and addCubeToZone are no longer needed as the main addCube and click listener will be removed.
  // function getZoneCubes(zx, zy) { ... } // Removed
  // function addCubeToZone(zx, zy, c) { ... } // Removed
  
  // Socket.IO 초기화
  function setupSocketIO() {
    try {
      if (window.io) {
        socket = window.io();
        
        socket.on('connect', () => {
          isRealtimeAvailable = true;
          if (zoneManager) {
            zoneManager.setNetworkContext(spaceId, isRealtimeAvailable, socket);
          }
          
          const userId = localStorage.getItem('cuberse_current_user');
          if (userId) {
            const userSpaces = getUserSpaces(userId);
            socket.emit('login', { userId, userSpaces, spaceId });
          }
        });

        // --- 신규 참가자: 방 정보 요청 ---
        let isOwner = false;
        let myId = localStorage.getItem('cuberse_current_user');
        let userListCache = [];
        let hasRequestedRoomInfo = false;
        
        socket.on('user list', (payload) => {
          let list = payload;
          let listSpaceId = spaceId;
          if (payload && typeof payload === 'object' && Array.isArray(payload.userList)) {
            list = payload.userList;
            listSpaceId = payload.spaceId;
          }
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
          if (!isOwner && !hasRequestedRoomInfo) {
            console.log('[ROOM] 방 정보 요청 전송:', spaceId);
            socket.emit('request room info', { spaceId });
            hasRequestedRoomInfo = true;
          }
        });

        socket.on('room info', ({ sceneData }) => {
          console.log('[ROOM] 방 정보 수신:', { 
            hasSceneData: !!sceneData,
            zoneCount: sceneData ? Object.keys(sceneData).filter(k => k !== 'currentZone').length : 0,
            totalCubes: sceneData ? Object.values(sceneData).filter(v => Array.isArray(v)).reduce((sum, arr) => sum + arr.length, 0) : 0
          });
          if (sceneData) {
            saveSpace(spaceId, sceneData);
            showToast('방 정보 동기화 완료');
            loadSceneFromData(sceneData);
          }
        });

        socket.on('request room info', ({ requesterSocketId, spaceId: reqSpaceId }) => {
          console.log('[ROOM] 방 정보 요청 수신:', { requesterSocketId, reqSpaceId, mySpaceId: spaceId, isOwner });
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

        socket.on('add cube', (eventData) => {
          if (eventData.spaceId === spaceId) {
            const { x, y, z, color, zoneX, zoneY } = eventData;
            // Call the main callback to add the cube, flagging as remote
            addCubeToSceneCallback(x, y, z, color, zoneX, zoneY, true /*isRemote*/);
          }
        });
        
        socket.on('remove cube', (eventData) => {
          if (eventData.spaceId === spaceId) {
            const { x, y, z, zoneX, zoneY } = eventData;
            const rcvdCubeSize = zoneManager.getCubeSize();
            const rcvdZoneSize = zoneManager.getZoneSize();
            const rcvdDivisions = zoneManager.getZoneDivisions();

            const cubeMeshToRemove = scene.children.find(mesh =>
              mesh.isMesh &&
              mesh.gridX === x &&
              mesh.gridY === y &&
              mesh.gridZ === z &&
              ( () => {
                  const expectedWorldX = (zoneX * rcvdZoneSize) + (x - rcvdDivisions / 2 + 0.5) * rcvdCubeSize;
                  const expectedWorldZ = (zoneY * rcvdZoneSize) + (z - rcvdDivisions / 2 + 0.5) * rcvdCubeSize;
                  return Math.abs(mesh.position.x - expectedWorldX) < rcvdCubeSize * 0.5 &&
                         Math.abs(mesh.position.z - expectedWorldZ) < rcvdCubeSize * 0.5;
              })()
            );
            
            if (cubeMeshToRemove) {
              // Pass the actual mesh to the callback, which will also handle zoneManager update
              removeCubeFromSceneCallback(cubeMeshToRemove, zoneX, zoneY);
            } else {
              // If mesh not found, still try to remove from data model as a fallback
              zoneManager.removeCubeDataFromZone(zoneX, zoneY, { gridX: x, gridY: y, gridZ: z });
            }
          }
        });
        
      } else {
        console.warn('[Socket.IO] window.io가 존재하지 않습니다.');
        if (zoneManager) zoneManager.setNetworkContext(spaceId, false, null);
      }
    } catch (e) {
      console.warn('[Socket.IO] 실시간 서버 연결 실패, 서버리스 모드로 동작합니다.');
      socket = null;
      isRealtimeAvailable = false;
      if (zoneManager) zoneManager.setNetworkContext(spaceId, false, null);
    }
  }
  
  setupSocketIO();
  
  console.log('워크스페이스 ID:', spaceId);

  // Callbacks for cubeInteraction.js (already defined above)
  
  const colorInput = document.getElementById('cubeColor');
  let cubeColor = colorInput.value;

  function autoSaveCurrentSpace() {
    if (!zoneManager) return;

    const allZoneDataFromManager = zoneManager.getZoneData();
    const currentZoneCoords = zoneManager.getCurrentZoneCoordinates();
    
    const sceneDataToSave = {};
    for (const zoneKey in allZoneDataFromManager) {
      if (zoneKey === 'currentZone') continue;
      sceneDataToSave[zoneKey] = allZoneDataFromManager[zoneKey].map(cubeData => ({
        x: cubeData.x,
        y: cubeData.y,
        z: cubeData.z,
        color: cubeData.color,
        gridX: cubeData.gridX,
        gridY: cubeData.gridY,
        gridZ: cubeData.gridZ,
      }));
    }
    sceneDataToSave.currentZone = currentZoneCoords;
    
    saveSpace(spaceId, sceneDataToSave);
  }

  // Mouse drag variables are now managed by cubeInteraction.js
  // let isDragging = false; // Removed
  // let previousMousePosition = { x: 0, y: 0 }; // Removed
  // let initialMousePosition = { x: 0, y: 0 }; // Removed
  // const dragThreshold = 5; // Removed
  // let wasDraggingJustNow = false; // Removed
  // let isDraggingCube = false; // Removed
  // let dragStartCube = null; // Removed
  // let dragStartFace = null; // Removed

  // ---- 3D 환경 구성 is now handled by core3d.js ----

  // FPSControls 인스턴스 생성 (playerObject, camera, renderer.domElement 순)
  // playerObject, camera, renderer are now from core3d.js
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
    if (fpsControls && zoneManager) { // Check if zoneManager is initialized
      const allManagedZoneData = zoneManager.getZoneData(); // This returns data, not meshes
      let physicsCubeMeshes = [];
      
      // Iterate through scene children to find meshes that correspond to cube data in zoneManager
      const sceneMeshes = scene.children.filter(obj => obj.isMesh && obj.gridX !== undefined);

      for (const zoneKey in allManagedZoneData) {
        if (zoneKey === "currentZone") continue;
        const cubeDataInZone = allManagedZoneData[zoneKey];
        cubeDataInZone.forEach(data => {
          const correspondingMesh = sceneMeshes.find(mesh =>
            mesh.gridX === data.gridX &&
            mesh.gridY === data.gridY &&
            mesh.gridZ === data.gridZ &&
            // Approximate position check to ensure it's the right cube in the right zone,
            // as grid coords might repeat across zones if not careful with global identification
            Math.abs(mesh.position.x - data.x) < 0.01 &&
            Math.abs(mesh.position.y - data.y) < 0.01 &&
            Math.abs(mesh.position.z - data.z) < 0.01
          );
          if (correspondingMesh) {
            physicsCubeMeshes.push(correspondingMesh);
          }
        });
      }
      fpsControls.setObstacles(physicsCubeMeshes);
    }
  }
  updateFpsObstacles(); // Initial call

  // Zone visual management (grids, texts, floors) is now handled by zoneManager.
  // Old functions: createZoneGrid, updateZoneFloors, createZoneText are removed.
  // Initial grid/text creation is done in initZoneManager.

  console.log('Zone setup is now delegated to ZoneManager.');

  // 큐브 쌓기
  // const cubeSize = ZONE_SIZE / ZONE_DIVISIONS; // Will be replaced by zoneManager.getCubeSize()
  // console.log('큐브 크기:', cubeSize); // Will be updated

  // Old addCube function is now removed. Its logic is primarily in addCubeToSceneCallback.

  // The old click listener (the one that was using dummy variables like currentZoneX globally) is now ACTUALLY removed.
  // Its functionality will be handled by cubeInteraction.js.

  // Mouse listeners (mousedown, mouseleave, mousemove) removed.
  // The mousedown listener that was here has been removed.
  // Click listener (the one that was using dummy variables) is now removed.
  // The ACTUAL click listener that was present is now removed.
  // All listeners prior to mouseup should now be gone.
  // CLICK LISTENER REMOVED (attempt)

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
        const { x: czx, y: czy } = zoneManager.getCurrentZoneCoordinates(); // Get current zone from manager
        
        const cameraDirection = new THREE.Vector3();
        camera.getWorldDirection(cameraDirection);
        cameraDirection.y = 0; // Keep movement horizontal
        cameraDirection.normalize();

        const cameraRight = new THREE.Vector3();
        cameraRight.crossVectors(camera.up, cameraDirection).normalize(); // Right vector based on horizontal direction
        
        let deltaZoneX = 0;
        let deltaZoneY = 0; // This corresponds to depth (Z axis in 3D)
        
        // Determine dominant camera direction component for more intuitive mapping
        const absCamX = Math.abs(cameraDirection.x);
        const absCamZ = Math.abs(cameraDirection.z);

        if (e.key === 'ArrowUp') {
            if (absCamX > absCamZ) { // Moving more along X
                deltaZoneX = Math.sign(cameraDirection.x);
            } else { // Moving more along Z
                deltaZoneY = Math.sign(cameraDirection.z);
            }
        } else if (e.key === 'ArrowDown') {
            if (absCamX > absCamZ) {
                deltaZoneX = -Math.sign(cameraDirection.x);
            } else {
                deltaZoneY = -Math.sign(cameraDirection.z);
            }
        } else if (e.key === 'ArrowLeft') { // Strafe left relative to camera
            if (absCamX > absCamZ) { // If camera is mainly along X, strafing changes Z
                 deltaZoneY = Math.sign(cameraRight.z); // cameraRight.z might be negative for "left" depending on orientation
            } else { // If camera is mainly along Z, strafing changes X
                 deltaZoneX = Math.sign(cameraRight.x);
            }
             // Correcting strafe direction based on typical FPS controls (strafe left = negative right vector component)
            if (deltaZoneX === 0 && deltaZoneY !== 0) { // Moving along Z axis
                deltaZoneY = -new THREE.Vector3().crossVectors(camera.up, cameraDirection.clone().setX(0).normalize()).z * Math.sign(deltaZoneY);
            } else if (deltaZoneY === 0 && deltaZoneX !== 0) { // Moving along X axis
                deltaZoneX = -new THREE.Vector3().crossVectors(camera.up, cameraDirection.clone().setZ(0).normalize()).x * Math.sign(deltaZoneX);
            }


        } else if (e.key === 'ArrowRight') { // Strafe right relative to camera
            if (absCamX > absCamZ) {
                 deltaZoneY = -Math.sign(cameraRight.z);
            } else {
                 deltaZoneX = -Math.sign(cameraRight.x);
            }
            // Correcting strafe direction
             if (deltaZoneX === 0 && deltaZoneY !== 0) {
                deltaZoneY = new THREE.Vector3().crossVectors(camera.up, cameraDirection.clone().setX(0).normalize()).z * Math.sign(deltaZoneY);
            } else if (deltaZoneY === 0 && deltaZoneX !== 0) {
                deltaZoneX = new THREE.Vector3().crossVectors(camera.up, cameraDirection.clone().setZ(0).normalize()).x * Math.sign(deltaZoneX);
            }
        }
        // Ensure only one delta is non-zero for cardinal direction snapping
        if (Math.abs(deltaZoneX) > Math.abs(deltaZoneY)) deltaZoneY = 0; else deltaZoneX = 0;

        // Normalize to 1 or -1 or 0
        deltaZoneX = Math.sign(deltaZoneX);
        deltaZoneY = Math.sign(deltaZoneY);

        const newZoneX = czx + deltaZoneX;
        const newZoneY = czy + deltaZoneY; // czy is Z-depth for zoneManager
        
        if (deltaZoneX !== 0 || deltaZoneY !== 0) { // Only switch if there's a change
          console.log(`카메라 방향 기준 Zone 이동 요청: (${deltaZoneX}, ${deltaZoneY}) → Zone (${newZoneX}, ${newZoneY})`);
          triggerZoneSwitch(newZoneX, newZoneY); // This function will handle camera animation & call zoneManager
        }
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

  // New function to handle zone switching and camera animation
  function triggerZoneSwitch(newZoneX, newZoneY) {
    const oldCoords = zoneManager.getCurrentZoneCoordinates();
    // zoneManager.switchToZone handles updating currentZoneX/Y, grids, texts, floors, and calling updateFpsObstaclesCb & showToastCb
    // It returns true if the zone actually changed.
    // The camera is passed as an argument to zoneManager.switchToZone for potential future use, but not used by ZM for animation currently.
    const zoneActuallyChanged = zoneManager.switchToZone(newZoneX, newZoneY, camera);

    if (zoneActuallyChanged) {
      console.log(`Animating camera for Zone Switch: (${oldCoords.x},${oldCoords.y}) → (${newZoneX},${newZoneY})`);

      const zoneSize = zoneManager.getZoneSize(); // Get zone size from manager
      const deltaX = newZoneX - oldCoords.x;
      const deltaY = newZoneY - oldCoords.y; // zoneManager's y is 3D Z

      const startX = camera.position.x;
      const startZ = camera.position.z;
      // Target camera position to be the center of the new zone, possibly with an offset for better view.
      // For simplicity, we'll aim for the same relative position within the new zone as it was in the old.
      const targetX = startX + (deltaX * zoneSize);
      const targetZ = startZ + (deltaY * zoneSize);

      let animationProgress = 0;
      const animationDuration = 300; // ms - reduced duration for quicker feel
      const startTime = performance.now();

      function animateZoneTransition(currentTime) {
        animationProgress = Math.min((currentTime - startTime) / animationDuration, 1);
        const easeOutQuart = 1 - Math.pow(1 - animationProgress, 4);

        camera.position.x = startX + (targetX - startX) * easeOutQuart;
        camera.position.z = startZ + (targetZ - startZ) * easeOutQuart;
        
        if (animationProgress < 1) {
          requestAnimationFrame(animateZoneTransition);
        } else {
          camera.position.x = targetX;
          camera.position.z = targetZ;
          // updateFpsObstacles is already called by zoneManager.switchToZone's callback
          // showToast is also called by zoneManager.switchToZone's callback
        }
      }
      requestAnimationFrame(animateZoneTransition);
    }
  }

  // 반응형 resize handler is now in core3d.js

  // 씬 데이터로부터 로드하는 함수 (Refactored for zoneManager)
  function loadSceneFromData(loadedData) {
    if (!zoneManager) return;

    clearSceneMeshes(); // Clear existing cube meshes from the scene

    // Callback for zoneManager to add cube meshes to the scene
    const addCubeMeshToSceneCallback = (cubeData) => {
      const currentCubeSize = zoneManager.getCubeSize(); // Get current cube size
      const geometry = new THREE.BoxGeometry(currentCubeSize, currentCubeSize, currentCubeSize);
      const material = new THREE.MeshLambertMaterial({ color: cubeData.color });
      const cubeMesh = new THREE.Mesh(geometry, material);
      
      // Position is already world position from cubeData stored by zoneManager or from file
      cubeMesh.position.set(cubeData.x, cubeData.y, cubeData.z);
      
      // Assign grid coordinates to the mesh for identification
      cubeMesh.gridX = cubeData.gridX;
      cubeMesh.gridY = cubeData.gridY;
      cubeMesh.gridZ = cubeData.gridZ;
      
      scene.add(cubeMesh);
    };

    // zoneManager loads data, clears its own state, sets up new grids/texts, and calls the callback for meshes
    zoneManager.loadZoneData(loadedData, addCubeMeshToSceneCallback);

    const { x: czx, y: czy } = zoneManager.getCurrentZoneCoordinates();
    const zoneSize = zoneManager.getZoneSize();

    // Adjust camera to the new current zone
    if (czx !== 0 || czy !== 0) {
      camera.position.x = czx * zoneSize; // czx is world X for zone center
      camera.position.z = czy * zoneSize + 20; // czy is world Z for zone center, add offset
      camera.lookAt(czx * zoneSize, 0, czy * zoneSize);
    } else {
      // Default camera position if current zone is (0,0)
      camera.position.set(-15, 12, 15);
      camera.lookAt(0, 0, 0);
    }
    updateFpsObstacles(); // Update obstacles after new cubes are in place
    // showToast is called by zoneManager.switchToZone if it's part of loadZoneData's internal reset.
    // If not, and if a zone change occurred, a toast might be needed here.
    // zoneManager.loadZoneData itself calls clearAllZoneData which then calls showToast.
  }
  
  // Clears only cube meshes from the scene. Grids/texts are handled by zoneManager.
  function clearSceneMeshes() {
    const meshesToRemove = scene.children.filter(child => child.isMesh && child.gridX !== undefined);
    meshesToRemove.forEach(mesh => scene.remove(mesh));
    console.log("Cleared all cube meshes from scene.");
  }

  // ---- 첫 진입 시 해당 spaceId에 저장된 씬 자동 로드 ----
  const loadedSceneData = loadSpace(spaceId);
  if (loadedSceneData) {
    console.log('자동 로드 데이터:', loadedSceneData);
    loadSceneFromData(loadedSceneData);
  } else {
    // ---- 초기 카메라 위치 설정 (데이터가 없을 때) ----
    camera.position.set(-15, 12, 15);
    camera.lookAt(0, 0, 0);
  }
  // ---- End 자동 로드 ----

  // CONTEXTMENU LISTENER WAS HERE - NOW DELETED

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

  // 렌더 루프 is now handled by core3d.js
  // We need to create cameraControls for the new startAnimation function
  const cameraControls = {
    update: function() {
      handleKeyboardMovement(); // This function needs access to camera and keyStates
    }
  };

  console.log('3D 환경 초기화 완료 (via core3d.js)');
  // The following logs might be slightly different as objects are now managed by core3d.js
  // console.log('그리드 추가됨:', scene.children.length, '개 객체');
  // console.log('카메라 위치:', camera.position);
  // console.log('렌더러 크기:', renderer.domElement.width, 'x', renderer.domElement.height);
  
  hideLoading();
  startAnimation(fpsControls, cameraControls); // Start the animation loop from core3d.js
  
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