// Core 3D setup and rendering logic
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';

let scene, camera, renderer, playerObject;
let container; // To store the container element

function initCore3D(containerElement) {
  container = containerElement;

  // 1. THREE.Scene 생성
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf0f0f0);
  console.log('씬 생성:', scene);

  // 2. THREE.PerspectiveCamera 생성
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  console.log('카메라 생성:', camera);

  // 3. THREE.WebGLRenderer 생성 및 DOM에 추가
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  container.appendChild(renderer.domElement);
  console.log('렌더러 생성 및 추가:', renderer);

  // 4. 플레이어 본체(THREE.Object3D) 생성 및 씬에 추가
  playerObject = new THREE.Object3D();
  scene.add(playerObject);

  // 5. 카메라 위치(눈높이) 설정 및 playerObject의 자식으로 추가
  camera.position.set(0, 1.6, 0); // baseY = 1.6 (눈높이)
  playerObject.add(camera);

  // 조명
  const light = new THREE.DirectionalLight(0xffffff, 0.8);
  light.position.set(10, 20, 10);
  scene.add(light);
  scene.add(new THREE.AmbientLight(0xffffff, 0.4));
  console.log('조명 추가');

  // 반응형
  window.addEventListener('resize', () => {
    if (camera && renderer) {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    }
  });

  return { scene, camera, renderer, playerObject };
}

let fpsControlsRef;
let cameraControlsRef;

function animate() {
  requestAnimationFrame(animate);

  if (fpsControlsRef && fpsControlsRef.enabled) {
    fpsControlsRef.update();
  } else if (cameraControlsRef) {
    cameraControlsRef.update();
  }

  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
}

function startAnimation(fpsControls, cameraControls) {
  fpsControlsRef = fpsControls;
  cameraControlsRef = cameraControls;
  animate();
}

export { scene, camera, renderer, playerObject, initCore3D, startAnimation };
