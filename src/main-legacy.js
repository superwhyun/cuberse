console.log('main-legacy.js 로딩됨, THREE:', window.THREE);

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
  console.log('initApp 함수 시작');
  const THREE = window.THREE;
  
  if (!THREE) {
    console.error('THREE.js가 로드되지 않았습니다');
    return;
  }
  
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
  const spaceId = getSpaceIdFromUrl();
  // ---- End Multi-Space/Workspace Support ----
  
  // ---- Zone System ----
  let currentZoneX = 0;
  let currentZoneY = 0;
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
  }
  
  function removeCubeFromZone(zoneX, zoneY, cube) {
    const zoneCubes = getZoneCubes(zoneX, zoneY);
    const index = zoneCubes.indexOf(cube);
    if (index > -1) {
      zoneCubes.splice(index, 1);
    }
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
    showToast('자동 저장됨');
  }

  // Mouse drag variables
  let isDragging = false;
  let previousMousePosition = { x: 0, y: 0 };
  let initialMousePosition = { x: 0, y: 0 };
  const dragThreshold = 5; // pixels
  let wasDraggingJustNow = false; // Flag to differentiate click from drag

  // 씬, 카메라, 렌더러 생성
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf0f0f0);
  console.log('씬 생성:', scene);

  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  // Zone 0,0을 바라보도록 카메라 설정
  camera.position.set(10, 15, 20);
  camera.lookAt(0, 0, 0);
  console.log('카메라 생성:', camera);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  container.appendChild(renderer.domElement);
  console.log('렌더러 생성 및 추가:', renderer);

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

  function addCube(x, y, z, color) {
    // 현재 Zone에서만 편집 가능
    if (x < 0 || x >= ZONE_DIVISIONS || z < 0 || z >= ZONE_DIVISIONS) {
      return;
    }
    
    // 이미 해당 위치에 큐브가 있으면 중복 생성 방지
    const currentZoneCubes = getZoneCubes(currentZoneX, currentZoneY);
    if (currentZoneCubes.some(cube =>
      Math.abs(cube.position.x - ((x - ZONE_DIVISIONS / 2 + 0.5) * cubeSize)) < 0.01 &&
      Math.abs(cube.position.y - ((y + 0.5) * cubeSize)) < 0.01 &&
      Math.abs(cube.position.z - ((z - ZONE_DIVISIONS / 2 + 0.5) * cubeSize)) < 0.01
    )) {
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
    
    scene.add(cube);
    addCubeToZone(currentZoneX, currentZoneY, cube);
    console.log(`큐브 생성됨. Zone (${currentZoneX},${currentZoneY})에 ${getZoneCubes(currentZoneX, currentZoneY).length}개 큐브`); // 디버깅
    autoSaveCurrentSpace(); // addCube마다 자동 저장
  }

  // 마우스 클릭으로 큐브 추가 (큐브 위 또는 바닥)
  renderer.domElement.addEventListener('click', (event) => {
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
  });

  // Mouse listeners for drag, highlight
  renderer.domElement.addEventListener('mousedown', (event) => {
    if (event.button === 2) { // Right mouse button for context menu
        return;
    }
    isDragging = true;
    initialMousePosition.x = event.clientX;
    initialMousePosition.y = event.clientY;
    previousMousePosition.x = event.clientX;
    previousMousePosition.y = event.clientY;
    wasDraggingJustNow = false;
  });

  // 마우스가 3D 영역을 벗어나면 드래깅 중단
  renderer.domElement.addEventListener('mouseleave', () => {
    if (isDragging) {
      isDragging = false;
      console.log('마우스가 3D 영역을 벗어나서 드래깅 중단');
    }
  });

  renderer.domElement.addEventListener('mousemove', (event) => {
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

        // 카메라를 제자리에서 회전 (FPS 스타일)
        const rotationSpeed = 0.006; // 속도 증가 (0.002 → 0.006)

        // 수평 회전 (Y축 기준 - 좌우 돌기)
        if (Math.abs(deltaX) > 0.1) {
            const yawAngle = -deltaX * rotationSpeed;
            
            // 카메라의 현재 회전을 Y축 기준으로 추가 회전
            const yawQuaternion = new THREE.Quaternion();
            yawQuaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yawAngle);
            
            camera.quaternion.multiplyQuaternions(yawQuaternion, camera.quaternion);
        }

        // 수직 회전 (X축 기준 - 위아래 보기)
        if (Math.abs(deltaY) > 0.1) {
            const pitchAngle = -deltaY * rotationSpeed;
            
            // 현재 카메라의 로컬 X축을 구해서 pitch 회전
            const cameraRight = new THREE.Vector3(1, 0, 0);
            cameraRight.applyQuaternion(camera.quaternion);
            
            // 수직 회전 제한 확인
            const currentDirection = new THREE.Vector3(0, 0, -1);
            currentDirection.applyQuaternion(camera.quaternion);
            const currentPitch = Math.asin(currentDirection.y);
            const newPitch = currentPitch + pitchAngle;
            const maxPitch = Math.PI / 2 * 0.85; // 85도 제한
            
            if (Math.abs(newPitch) < maxPitch) {
                const pitchQuaternion = new THREE.Quaternion();
                pitchQuaternion.setFromAxisAngle(cameraRight, pitchAngle);
                
                camera.quaternion.multiplyQuaternions(pitchQuaternion, camera.quaternion);
            }
        }
        
        // 쿼터니언 정규화 (중요!)
        camera.quaternion.normalize();
    } else {
        // 현재 Zone의 큐브들만 하이라이트
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(currentMouse, camera);
        const currentZoneCubes = getZoneCubes(currentZoneX, currentZoneY);
        const cubeIntersects = raycaster.intersectObjects(currentZoneCubes);

        if (highlightEdge) {
            scene.remove(highlightEdge);
            highlightEdge = null;
        }
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
    
    // 이동/회전 키 상태 업데이트
    if (keyStates.hasOwnProperty(key)) {
      keyStates[key] = true;
      e.preventDefault(); // 기본 브라우저 동작 방지
    }
  });

  window.addEventListener('keyup', (e) => {
    if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
    
    const key = e.key.toLowerCase();
    if (keyStates.hasOwnProperty(key)) {
      keyStates[key] = false;
      e.preventDefault();
    }
  });

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

  // Zone 전환 함수
  function switchToZone(newZoneX, newZoneY) {
    if (newZoneX === currentZoneX && newZoneY === currentZoneY) return;
    
    console.log(`Zone 전환: (${currentZoneX},${currentZoneY}) → (${newZoneX},${newZoneY})`);
    
    // Zone 이동량 계산
    const deltaX = newZoneX - currentZoneX;
    const deltaY = newZoneY - currentZoneY;
    
    // 카메라 위치를 Zone 이동량만큼 평행이동 (X, Z만 이동, Y와 방향 유지)
    camera.position.x += deltaX * ZONE_SIZE;
    camera.position.z += deltaY * ZONE_SIZE;
    
    currentZoneX = newZoneX;
    currentZoneY = newZoneY;
    
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
          scene.add(cube);
          
          // Zone에 추가
          addCubeToZone(zoneX, zoneY, cube);
        });
      }
      
      // 복원된 Zone으로 카메라 이동
      if (currentZoneX !== 0 || currentZoneY !== 0) {
        switchToZone(currentZoneX, currentZoneY);
      }
      
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
  // ---- End 자동 로드 ----

  // 오른쪽 클릭으로 큐브 삭제
  renderer.domElement.addEventListener('contextmenu', (event) => {
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
      scene.remove(targetCube);
      
      // Zone에서 큐브 제거
      removeCubeFromZone(currentZoneX, currentZoneY, targetCube);

      if (highlightEdge && highlightEdge.position.equals(targetCube.position)) {
          scene.remove(highlightEdge);
          highlightEdge = null;
      }
      autoSaveCurrentSpace();
      console.log(`큐브 삭제됨. Zone (${currentZoneX},${currentZoneY})에 ${currentZoneCubes.length}개 큐브 남음`); // 디버깅
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
    
    // 키보드 입력에 따른 부드러운 이동 처리
    handleKeyboardMovement();
    
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