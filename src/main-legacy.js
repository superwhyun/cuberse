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
  
  console.log('워크스페이스 ID:', spaceId);
  
  let hoveredCube = null;
  let hoveredFaceNormal = null;
  let highlightEdge = null;
  const container = document.getElementById('container');
  const colorInput = document.getElementById('cubeColor');

  let cubeColor = colorInput.value;

  // 자동 저장 트리거 함수
  function autoSaveCurrentSpace() {
    const sceneData = cubes.map(cube => ({
      x: cube.position.x,
      y: cube.position.y,
      z: cube.position.z,
      color: `#${cube.material.color.getHexString()}`
    }));
    saveSpace(spaceId, sceneData);
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
  camera.position.set(10, 15, 20);
  camera.lookAt(0, 0, 0);
  console.log('카메라 생성:', camera);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  container.appendChild(renderer.domElement);
  console.log('렌더러 생성 및 추가:', renderer);

  // 그리드 생성
  const gridSize = 20;
  const gridDivisions = 20;
  const gridHelper = new THREE.GridHelper(gridSize, gridDivisions);
  scene.add(gridHelper);
  console.log('그리드 추가:', gridHelper);

  // 조명
  const light = new THREE.DirectionalLight(0xffffff, 0.8);
  light.position.set(10, 20, 10);
  scene.add(light);
  scene.add(new THREE.AmbientLight(0xffffff, 0.4));
  console.log('조명 추가');

  // 큐브 쌓기
  const cubeSize = gridSize / gridDivisions;
  const cubes = [];
  console.log('큐브 크기:', cubeSize);

  function addCube(x, y, z, color) {
    // 이미 해당 위치에 큐브가 있으면 중복 생성 방지
    if (cubes.some(cube =>
      Math.abs(cube.position.x - ((x - gridDivisions / 2 + 0.5) * cubeSize)) < 0.01 &&
      Math.abs(cube.position.y - ((y + 0.5) * cubeSize)) < 0.01 &&
      Math.abs(cube.position.z - ((z - gridDivisions / 2 + 0.5) * cubeSize)) < 0.01
    )) {
      return;
    }

    const geometry = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);
    const material = new THREE.MeshLambertMaterial({ color });
    const cube = new THREE.Mesh(geometry, material);
    cube.position.set(
      (x - gridDivisions / 2 + 0.5) * cubeSize,
      (y + 0.5) * cubeSize,
      (z - gridDivisions / 2 + 0.5) * cubeSize
    );
    scene.add(cube);
    cubes.push(cube);
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
      const gridX = Math.round((hoveredCube.position.x / cubeSize) + gridDivisions / 2 - 0.5);
      const gridY = Math.round((hoveredCube.position.y / cubeSize) - 0.5);
      const gridZ = Math.round((hoveredCube.position.z / cubeSize) + gridDivisions / 2 - 0.5);
      const nextX = gridX + Math.round(hoveredFaceNormal.x);
      const nextY = gridY + Math.round(hoveredFaceNormal.y);
      const nextZ = gridZ + Math.round(hoveredFaceNormal.z);
      if (
        nextX >= 0 && nextX < gridDivisions &&
        nextY >= 0 &&
        nextZ >= 0 && nextZ < gridDivisions
      ) {
        addCube(nextX, nextY, nextZ, cubeColor);
      }
      return;
    }

    // 바닥 클릭 - 빈 공간이면 바닥부터 쌓기
    const planeY = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const intersect = raycaster.ray.intersectPlane(planeY, new THREE.Vector3());
    if (intersect) {
      let x = Math.floor(intersect.x / cubeSize + gridDivisions / 2);
      let z = Math.floor(intersect.z / cubeSize + gridDivisions / 2);
      if (x >= 0 && x < gridDivisions && z >= 0 && z < gridDivisions) {
        // 해당 x,z 위치에서 가장 낮은 빈 공간 찾기
        let y = 0;
        while (cubes.some(cube =>
          Math.abs(cube.position.x - ((x - gridDivisions / 2 + 0.5) * cubeSize)) < 0.01 &&
          Math.abs(cube.position.y - ((y + 0.5) * cubeSize)) < 0.01 &&
          Math.abs(cube.position.z - ((z - gridDivisions / 2 + 0.5) * cubeSize)) < 0.01
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

        const lookAtPoint = new THREE.Vector3(0, 0, 0); // Assuming camera looks at origin

        // Horizontal rotation
        if (Math.abs(deltaX) > 0.01) {
            const rotationSpeed = 0.005;
            const angle = -deltaX * rotationSpeed;
            const worldYAxis = new THREE.Vector3(0, 1, 0);
            camera.position.sub(lookAtPoint);
            camera.position.applyAxisAngle(worldYAxis, angle);
            camera.position.add(lookAtPoint);
            camera.lookAt(lookAtPoint);
        }

        // Vertical rotation
        if (Math.abs(deltaY) > 0.01) {
            const rotationSpeed = 0.004; // Adjusted speed
            const angle = -deltaY * rotationSpeed;

            const viewDirection = new THREE.Vector3();
            camera.getWorldDirection(viewDirection);

            // Axis for vertical rotation: perpendicular to view and world UP.
            const worldUp = new THREE.Vector3(0, 1, 0);
            let rotationAxis = new THREE.Vector3().crossVectors(viewDirection, worldUp).normalize();

            // If camera is looking straight up or down, cross product might be zero.
            if (rotationAxis.lengthSq() < 0.001) {
                rotationAxis = new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion);
            }

            const currentPosRelativeToLookAt = camera.position.clone().sub(lookAtPoint);
            const currentAngleWithHorizontal = Math.asin(currentPosRelativeToLookAt.clone().normalize().y);

            // Predict new position
            const tempQuaternion = new THREE.Quaternion().setFromAxisAngle(rotationAxis, angle);
            const newPosRelativeToLookAt = currentPosRelativeToLookAt.clone().applyQuaternion(tempQuaternion);

            // Limit vertical rotation to prevent flipping (e.g., +/- 85 degrees)
            const maxVerticalAngle = Math.PI / 2 * 0.94; // Approx 85 degrees
            const newAngleWithHorizontal = Math.asin(newPosRelativeToLookAt.clone().normalize().y);

            if (Math.abs(newAngleWithHorizontal) < maxVerticalAngle) {
                camera.position.copy(lookAtPoint).add(newPosRelativeToLookAt);
                camera.lookAt(lookAtPoint);
            }
        }
    } else {
        // Not dragging, so do highlighting logic
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(currentMouse, camera);
        const cubeIntersects = raycaster.intersectObjects(cubes);

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

  // 키보드 이동/회전
  window.addEventListener('keydown', (e) => {
    if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
    const moveStep = cubeSize;
    const rotateStep = Math.PI / 24;
    switch (e.key.toLowerCase()) {
      case 'a': {
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        const left = new THREE.Vector3().crossVectors(camera.up, dir).normalize();
        camera.position.addScaledVector(left, moveStep);
        break;
      }
      case 'd': {
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        const right = new THREE.Vector3().crossVectors(dir, camera.up).normalize();
        camera.position.addScaledVector(right, moveStep);
        break;
      }
      case 'w': {
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        dir.y = 0;
        dir.normalize();
        camera.position.addScaledVector(dir, moveStep);
        break;
      }
      case 's': {
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        dir.y = 0;
        dir.normalize();
        camera.position.addScaledVector(dir, -moveStep);
        break;
      }
      case 'q': {
        const viewDirection = new THREE.Vector3();
        camera.getWorldDirection(viewDirection);
        const pivotDistance = 10;
        const pivotPoint = new THREE.Vector3().addVectors(camera.position, viewDirection.multiplyScalar(pivotDistance));
        const worldYAxis = new THREE.Vector3(0, 1, 0);
        camera.position.sub(pivotPoint);
        camera.position.applyAxisAngle(worldYAxis, rotateStep);
        camera.position.add(pivotPoint);
        camera.lookAt(pivotPoint);
        break;
      }
      case 'e': {
        const viewDirection = new THREE.Vector3();
        camera.getWorldDirection(viewDirection);
        const pivotDistance = 10;
        const pivotPoint = new THREE.Vector3().addVectors(camera.position, viewDirection.multiplyScalar(pivotDistance));
        const worldYAxis = new THREE.Vector3(0, 1, 0);
        camera.position.sub(pivotPoint);
        camera.position.applyAxisAngle(worldYAxis, -rotateStep);
        camera.position.add(pivotPoint);
        camera.lookAt(pivotPoint);
        break;
      }
    }
  });

  // 반응형
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ---- 첫 진입 시 해당 spaceId에 저장된 씬 자동 로드 ----
  const loadedSceneData = loadSpace(spaceId);
  if (loadedSceneData) {
    loadedSceneData.forEach(cubeData => {
      const gridX = (cubeData.x / cubeSize) - 0.5 + gridDivisions / 2;
      const gridY = (cubeData.y / cubeSize) - 0.5;
      const gridZ = (cubeData.z / cubeSize) - 0.5 + gridDivisions / 2;
      addCube(gridX, gridY, gridZ, cubeData.color);
    });
  }

  // 오른쪽 클릭으로 큐브 삭제
  renderer.domElement.addEventListener('contextmenu', (event) => {
    const rect = renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);

    const intersects = raycaster.intersectObjects(cubes);
    if (intersects.length > 0) {
      event.preventDefault();
      const targetCube = intersects[0].object;
      scene.remove(targetCube);
      const idx = cubes.indexOf(targetCube);
      if (idx > -1) cubes.splice(idx, 1);

      if (highlightEdge && highlightEdge.position.equals(targetCube.position)) {
          scene.remove(highlightEdge);
          highlightEdge = null;
      }
      autoSaveCurrentSpace();
    }
  });

  // Download button functionality
  const downloadButton = document.getElementById('downloadButton');
  if (downloadButton) {
    downloadButton.addEventListener('click', () => {
      showLoading('파일 생성 중...');
      
      setTimeout(() => {
        const sceneData = cubes.map(cube => ({
          x: cube.position.x,
          y: cube.position.y,
          z: cube.position.z,
          color: `#${cube.material.color.getHexString()}`
        }));
        saveSpace(spaceId, sceneData);
        const jsonString = JSON.stringify(sceneData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const anchorElement = document.createElement('a');
        anchorElement.href = URL.createObjectURL(blob);
        anchorElement.download = `cuberse_scene_${spaceId}.json`;
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
      window.location.href = '/public/spaces.html';
    });
  }

  // 렌더 루프
  function animate() {
    requestAnimationFrame(animate);
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