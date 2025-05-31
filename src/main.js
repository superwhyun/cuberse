import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';

document.addEventListener('DOMContentLoaded', () => {
  let highlightEdge = null;
  const container = document.getElementById('container');
  const colorInput = document.getElementById('cubeColor');

  let cubeColor = colorInput.value;

  // Mouse drag variables
  let isDragging = false;
  let previousMousePosition = { x: 0, y: 0 };
  let initialMousePosition = { x: 0, y: 0 };
  const dragThreshold = 5; // pixels
  let wasDraggingJustNow = false; // Flag to differentiate click from drag

  // 씬, 카메라, 렌더러 생성
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf0f0f0);

  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(10, 15, 20);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  container.appendChild(renderer.domElement);

  // 그리드 생성
  const gridSize = 20;
  const gridDivisions = 20;
  const gridHelper = new THREE.GridHelper(gridSize, gridDivisions);
  scene.add(gridHelper);

  // 조명
  const light = new THREE.DirectionalLight(0xffffff, 0.8);
  light.position.set(10, 20, 10);
  scene.add(light);
  scene.add(new THREE.AmbientLight(0xffffff, 0.4));

  // 큐브 쌓기
  const cubeSize = gridSize / gridDivisions;
  const cubes = [];

  function addCube(x, y, z, color) {
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
  }

  // 마우스 클릭으로 큐브 추가 (큐브 위 또는 바닥)
  renderer.domElement.addEventListener('click', (event) => {
    if (wasDraggingJustNow) {
      wasDraggingJustNow = false; // Reset flag and consume the click
      return;
    }

    const rect = renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);

    const cubeIntersects = raycaster.intersectObjects(cubes);
    if (cubeIntersects.length > 0) {
      // 큐브 위라면, 그 큐브 위에 쌓기
      const target = cubeIntersects[0].object;
      const x = Math.round((target.position.x / cubeSize) + gridDivisions / 2 - 0.5);
      const z = Math.round((target.position.z / cubeSize) + gridDivisions / 2 - 0.5);
      let y = cubes.filter(cube =>
        Math.abs(cube.position.x - target.position.x) < 0.01 &&
        Math.abs(cube.position.z - target.position.z) < 0.01
      ).length;
      addCube(x, y, z, cubeColor);
      return;
    }

    // 바닥 클릭 - 기존 코드
    const planeY = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const intersect = raycaster.ray.intersectPlane(planeY, new THREE.Vector3());
    if (intersect) {
      let x = Math.floor(intersect.x / cubeSize + gridDivisions / 2);
      let z = Math.floor(intersect.z / cubeSize + gridDivisions / 2);
      if (x >= 0 && x < gridDivisions && z >= 0 && z < gridDivisions) {
        let y = cubes.filter(cube =>
          Math.abs(cube.position.x - ((x - gridDivisions / 2 + 0.5) * cubeSize)) < 0.01 &&
          Math.abs(cube.position.z - ((z - gridDivisions / 2 + 0.5) * cubeSize)) < 0.01
        ).length;
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
            // This is essentially the camera's local X-axis if camera.up is aligned with world Y.
            // However, camera.up can change, so we derive it based on view direction and a fixed world UP.
            const worldUp = new THREE.Vector3(0, 1, 0);
            let rotationAxis = new THREE.Vector3().crossVectors(viewDirection, worldUp).normalize();

            // If camera is looking straight up or down, cross product might be zero.
            // In such cases, we can use camera's local X axis (derived from its quaternion)
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
                // Rotate camera.up as well, but ensure it's somewhat aligned with world up
                // This part is tricky; directly rotating camera.up can lead to it pointing downwards.
                // A common approach is to set camera.up towards world Y and then re-lookAt.
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
            const edgeGeom = new THREE.EdgesGeometry(target.geometry);
            const edgeMat = new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 2 }); // Thinner line
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
  });

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
    console.log(`[키 입력] e.key: ${e.key}, e.code: ${e.code}`);
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
        // Rotate left around a dynamic pivot point
        const viewDirection = new THREE.Vector3();
        camera.getWorldDirection(viewDirection);
        const pivotDistance = 10; // Fixed distance to pivot point
        const pivotPoint = new THREE.Vector3().addVectors(camera.position, viewDirection.multiplyScalar(pivotDistance));

        const worldYAxis = new THREE.Vector3(0, 1, 0);

        camera.position.sub(pivotPoint); // Translate camera to pivot's origin
        camera.position.applyAxisAngle(worldYAxis, rotateStep); // Rotate
        camera.position.add(pivotPoint); // Translate camera back

        camera.lookAt(pivotPoint); // Look at the pivot point
        break;
      }
      case 'e': {
        // Rotate right around a dynamic pivot point
        const viewDirection = new THREE.Vector3();
        camera.getWorldDirection(viewDirection);
        const pivotDistance = 10; // Fixed distance to pivot point
        const pivotPoint = new THREE.Vector3().addVectors(camera.position, viewDirection.multiplyScalar(pivotDistance));

        const worldYAxis = new THREE.Vector3(0, 1, 0);

        camera.position.sub(pivotPoint); // Translate camera to pivot's origin
        camera.position.applyAxisAngle(worldYAxis, -rotateStep); // Rotate (negative for right)
        camera.position.add(pivotPoint); // Translate camera back

        camera.lookAt(pivotPoint); // Look at the pivot point
        break;
      }
      default:
        // do nothing
        break;
    }
  });

  // 반응형
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // 렌더 루프
  function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
  }

  // contextmenu(오른쪽 클릭) 시, 마우스 위치에 가장 가까운 큐브(raycast hit)가 있으면 scene에서 제거하고 cubes 배열에서도 삭제
  // 기본 브라우저 context menu 동작은 preventDefault()로 차단
  renderer.domElement.addEventListener('contextmenu', (event) => {
    // event.preventDefault(); // Only preventDefault if we are actually removing a cube

    const rect = renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);

    const intersects = raycaster.intersectObjects(cubes);
    if (intersects.length > 0) {
      event.preventDefault(); // Prevent context menu only if a cube is targeted for removal
      const targetCube = intersects[0].object;
      scene.remove(targetCube);
      const idx = cubes.indexOf(targetCube);
      if (idx > -1) cubes.splice(idx, 1);

      // Remove highlight if the removed cube was highlighted
      if (highlightEdge && highlightEdge.position.equals(targetCube.position)) {
          scene.remove(highlightEdge);
          highlightEdge = null;
      }
    }
    // If no cube is intersected, allow the default context menu to appear
  });

  // Save button functionality
  const saveButton = document.getElementById('saveButton');
  if (saveButton) {
    saveButton.addEventListener('click', () => {
      const sceneData = [];
      cubes.forEach(cube => {
        sceneData.push({
          x: cube.position.x,
          y: cube.position.y,
          z: cube.position.z,
          color: `#${cube.material.color.getHexString()}`
        });
      });

      const jsonString = JSON.stringify(sceneData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const anchorElement = document.createElement('a');
      anchorElement.href = URL.createObjectURL(blob);
      anchorElement.download = 'scene.json';
      anchorElement.click();
      URL.revokeObjectURL(anchorElement.href);
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
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const loadedSceneData = JSON.parse(e.target.result);

          // Clear existing cubes
          cubes.forEach(cube => scene.remove(cube));
          cubes.length = 0; // Clear the array

          // Load new cubes
          loadedSceneData.forEach(cubeData => {
            // Convert absolute positions from JSON back to grid coordinates for addCube
            const gridX = (cubeData.x / cubeSize) - 0.5 + gridDivisions / 2;
            const gridY = (cubeData.y / cubeSize) - 0.5;
            const gridZ = (cubeData.z / cubeSize) - 0.5 + gridDivisions / 2;

            addCube(gridX, gridY, gridZ, cubeData.color);
          });
        } catch (error) {
          console.error('Error parsing JSON file:', error);
          alert('Failed to load scene: Invalid JSON file.');
        }
      };

      reader.onerror = (error) => {
        console.error('Error reading file:', error);
        alert('Failed to read file.');
      };

      reader.readAsText(file);
    } else if (file) {
      alert('Invalid file type. Please drop a .json file.');
    }
  });

  animate();
});