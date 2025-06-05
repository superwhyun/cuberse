// @ts-nocheck
// fpsControls.js
// Three.js 기반 1인칭(FPS) 컨트롤러 - playerObject 중심 이동/충돌/중력 처리, 카메라 자식화 및 Head Bobbing 적용

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';

// 실린더-박스(AABB) 충돌 판정 함수
function cylinderIntersectsBox(cyl, box) {
  if (cyl.yMax < box.min.y || cyl.yMin > box.max.y) return false;
  const dx = Math.max(box.min.x - cyl.x, 0, cyl.x - box.max.x);
  const dz = Math.max(box.min.z - cyl.z, 0, cyl.z - box.max.z);
  return (dx * dx + dz * dz) <= (cyl.radius * cyl.radius);
}

export class FPSControls {
  /**
   * playerObject: THREE.Object3D - 플레이어의 위치 및 충돌을 담당하는 객체
   * camera: THREE.Camera - playerObject의 자식으로 추가되어 y 위치에 head bobbing 효과만 적용
   * domElement: 이벤트 캡처용 DOM 엘리먼트
   */
  constructor(playerObject, camera, domElement) {
    this.playerObject = playerObject;
    this.camera = camera;
    this.domElement = domElement;
    this.enabled = false;
    this.scene = null;

    // 카메라는 playerObject의 자식으로 추가 (눈 위치에 정확히 배치)
    if (!this.playerObject.children.includes(this.camera)) {
      this.playerObject.add(this.camera);
    }
    this.baseCameraY = 1.6; // head bobbing 기준 y 위치 (카메라 로컬 y)
    
    // 카메라를 플레이어 머리 위치(눈높이)로 정확히 설정
    this.camera.position.set(0, this.baseCameraY, 0);
    this.camera.rotation.set(0, 0, 0);

    // 시점 회전 관련
    this.pitch = 0;
    this.yaw = 0;
    this.sensitivity = 0.001; // 감도 낮춤 (휙휙 날아가는 현상 완화)

    // 이동 관련
    this.moveSpeed = 0.075;
    this.moveForward = false;
    this.moveBackward = false;
    this.moveLeft = false;
    this.moveRight = false;

    // 점프/중력
    this.velocityY = 0;
    this.gravity = -0.004;
    this.jumpSpeed = 0.12;
    this.isOnGround = false;
    this.playerHeight = 1.7; // 플레이어 높이 (실린더 높이와 일치 권장)
    this.isJumpKeyDown = false;
    this.isJumping = false;

    // 장애물(큐브)
    this.obstacles = [];

    // 플레이어 콜리전 박스 크기 (기본값)
    this.playerBoxWidth = 0.8;
    this.playerBoxDepth = 0.8;
    this.playerBoxHeight = 1.34;

    this.playerMesh = null;

    // 실린더 충돌 기본값 (플레이어 크기에 맞게 조정)
    this.cylinderRadius = 0.3;
    this.cylinderHeight = 1.6;

    // Head Bob 효과 관련 (기존과 다르게 카메라 로컬 y에만 적용)
    this.headBobAmplitude = 0.04; // 진폭 (변경됨)
    this.headBobFrequency = 1.4;  // 주파수 (변경됨)
    this.headBobPhase = 0;
    this.isMoving = false;

    // 내부 바인딩
    this.onMouseMove = this.onMouseMove.bind(this);
    this.onPointerLockChange = this.onPointerLockChange.bind(this);
    this.onPointerLockError = this.onPointerLockError.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
  }

  setObstacles(obstacles) {
    // 플레이어 자신의 mesh(this.playerMesh)는 obstacles에서 제외
    if (obstacles && this.playerMesh) {
      this.obstacles = obstacles.filter(mesh => mesh !== this.playerMesh);
    } else {
      this.obstacles = obstacles || [];
    }
  }

  setPlayerCollisionBox(cubeSize) {
    this.playerBoxWidth = cubeSize * 0.8;
    this.playerBoxDepth = cubeSize * 0.8;
    this.playerBoxHeight = cubeSize * 4 / 3;
  }

  setPlayerCollisionCylinder(cubeSize) {
    this.cylinderRadius = cubeSize * 0.6;
    this.cylinderHeight = cubeSize * 1.5;
    this.playerHeight = this.cylinderHeight;
  }

  _cylinderCollides(pos) {
    // pos는 playerObject.position 예상 위치 (THREE.Vector3)
    const cyl = {
      x: pos.x,
      z: pos.z,
      yMax: pos.y,
      yMin: pos.y - this.cylinderHeight + 0.1, // 바닥에서 약간 띄워서 서있는 큐브와 겹치지 않게
      radius: this.cylinderRadius
    };
    for (let i = 0; i < this.obstacles.length; i++) {
      const mesh = this.obstacles[i];
      if (!mesh.geometry || !mesh.position) continue;
      const box = new THREE.Box3().setFromObject(mesh);
      if (cylinderIntersectsBox(cyl, box)) {
        return true;
      }
    }
    return false;
  }

  debugDrawPlayerCylinder(scene) {
    if (this._debugCylinderMesh) {
      scene.remove(this._debugCylinderMesh);
    }
    const geo = new THREE.CylinderGeometry(this.cylinderRadius, this.cylinderRadius, this.cylinderHeight, 24);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffff00, wireframe: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(
      this.playerObject.position.x,
      this.playerObject.position.y - this.cylinderHeight / 2,
      this.playerObject.position.z
    );
    scene.add(mesh);
    this._debugCylinderMesh = mesh;
  }

  setScene(scene) {
    this.scene = scene;
    // scene에는 playerObject만 추가, 카메라는 playerObject 자식이므로 별도 추가 불필요
    if (!this.scene.children.includes(this.playerObject)) {
      this.scene.add(this.playerObject);
    }
    if (!this.playerMesh) {
      this.playerMesh = new THREE.Mesh(
        new THREE.BoxGeometry(this.playerBoxWidth, this.playerBoxHeight, this.playerBoxDepth),
        new THREE.MeshStandardMaterial({ color: 0x0088ff, opacity: 0.5, transparent: true })
      );
      this.scene.add(this.playerMesh);
    }
  }

  enable() {
    if (this.enabled) return;
    this.enabled = true;

    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    document.removeEventListener('pointerlockerror', this.onPointerLockError);
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('keyup', this.onKeyUp);

    // 현재 카메라의 위치와 방향 저장
    const startCameraPos = this.camera.position.clone();
    const startCameraRotation = this.camera.rotation.clone();
    
    // 시작 시선 방향 저장
    const startPitch = startCameraRotation.x;
    const startYaw = startCameraRotation.y;
    
    // 목표 시선 방향 (수평 정면)
    const targetPitch = 0; // 수평 시선
    const targetYaw = startYaw; // 좌우 회전은 유지
    
    // 최종 yaw, pitch 설정 (애니메이션 목표값)
    this.yaw = targetYaw;
    this.pitch = targetPitch;

    // 플레이어를 카메라 위치 기준으로 배치 (눈높이 고려해서 플레이어 발 위치 계산)
    const targetPlayerPos = new THREE.Vector3(
      startCameraPos.x,
      startCameraPos.y - this.baseCameraY + this.cylinderHeight,
      startCameraPos.z
    );
    
    // 플레이어 위치 설정
    this.playerObject.position.copy(targetPlayerPos);
    this.playerObject.rotation.set(0, targetYaw, 0);

    // 씬에서 카메라 제거하고 플레이어에 붙이기
    if (this.scene && this.scene.children.includes(this.camera)) {
      this.scene.remove(this.camera);
    }
    if (!this.playerObject.children.includes(this.camera)) {
      this.playerObject.add(this.camera);
    }

    // 애니메이션 시작 위치 (현재 카메라 위치를 플레이어 로컬 좌표로 변환)
    const localStartPos = this.playerObject.worldToLocal(startCameraPos.clone());
    
    // 애니메이션 목표 위치 (플레이어 눈높이)
    const targetLocalPos = new THREE.Vector3(0, this.baseCameraY, 0);
    
    // 카메라 초기 위치를 애니메이션 시작점으로 설정
    this.camera.position.copy(localStartPos);
    this.camera.rotation.set(startPitch, 0, 0); // 시작 pitch 설정

    // 부드러운 하강 및 시선 애니메이션
    const duration = 600; // 600ms (편집모드 전환과 동일하게)
    const startTime = performance.now();
    
    const animateTransition = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // easeInOutCubic 곡선
      const ease = progress < 0.5 
        ? 4 * progress * progress * progress 
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;
      
      // 위치 보간
      this.camera.position.lerpVectors(localStartPos, targetLocalPos, ease);
      
      // 시선 방향 보간 (pitch만, yaw는 플레이어 회전으로 처리)
      const currentPitch = startPitch + (targetPitch - startPitch) * ease;
      this.camera.rotation.set(currentPitch, 0, 0);
      
      if (progress < 1) {
        requestAnimationFrame(animateTransition);
      } else {
        // 애니메이션 완료 시 최종 설정
        this.camera.position.copy(targetLocalPos);
        this.camera.rotation.set(targetPitch, 0, 0);
        
        // 중력 및 상태 초기화
        this.velocityY = 0;
        this.isOnGround = false;

        // 키 이벤트 등록
        window.addEventListener('keydown', this.onKeyDown);
        window.addEventListener('keyup', this.onKeyUp);

        this.domElement.requestPointerLock();

        document.addEventListener('pointerlockchange', this.onPointerLockChange);
        document.addEventListener('pointerlockerror', this.onPointerLockError);
      }
    };
    
    requestAnimationFrame(animateTransition);
  }

  disable() {
    if (!this.enabled) return;
    this.enabled = false;
    
    // 카메라를 playerObject에서 분리하고 월드 좌표로 변환
    if (this.playerObject.children.includes(this.camera)) {
      // 카메라의 월드 위치와 회전을 저장
      const worldPosition = new THREE.Vector3();
      const worldQuaternion = new THREE.Quaternion();
      this.camera.getWorldPosition(worldPosition);
      this.camera.getWorldQuaternion(worldQuaternion);
      
      // playerObject에서 카메라 제거
      this.playerObject.remove(this.camera);
      
      // 씬에 카메라 직접 추가
      if (this.scene && !this.scene.children.includes(this.camera)) {
        this.scene.add(this.camera);
      }
      
      // 월드 좌표로 위치와 회전 설정
      this.camera.position.copy(worldPosition);
      this.camera.setRotationFromQuaternion(worldQuaternion);
      
      // onExit에서 사용할 수 있도록 월드 위치 저장
      this._exitCameraPosition = worldPosition.clone();
      this._exitCameraQuaternion = worldQuaternion.clone();
    }
    
    document.exitPointerLock();
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    document.removeEventListener('pointerlockerror', this.onPointerLockError);
    document.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);

    // 모든 이동/점프 플래그 초기화
    this.moveForward = false;
    this.moveBackward = false;
    this.moveLeft = false;
    this.moveRight = false;
    this.isJumpKeyDown = false;
    this.isJumping = false;
  }

  onPointerLockChange() {
    if (document.pointerLockElement === this.domElement) {
      this.enabled = true;
      document.addEventListener('mousemove', this.onMouseMove);
      window.addEventListener('keydown', this.onKeyDown);
      window.addEventListener('keyup', this.onKeyUp);
    } else {
      // 월드 좌표 저장 (disable() 함수의 로직과 동일)
      if (this.enabled && this.playerObject.children.includes(this.camera)) {
        const worldPosition = new THREE.Vector3();
        const worldQuaternion = new THREE.Quaternion();
        this.camera.getWorldPosition(worldPosition);
        this.camera.getWorldQuaternion(worldQuaternion);
        
        // onExit에서 사용할 수 있도록 월드 위치 저장
        this._exitCameraPosition = worldPosition.clone();
        this._exitCameraQuaternion = worldQuaternion.clone();
      }
      
      this.enabled = false;
      document.removeEventListener('mousemove', this.onMouseMove);
      document.removeEventListener('keydown', this.onKeyDown);
      document.removeEventListener('keyup', this.onKeyUp);
      this.moveForward = false;
      this.moveBackward = false;
      this.moveLeft = false;
      this.moveRight = false;
      this.isJumpKeyDown = false;
      this.isJumping = false;
      if (this.onExit) this.onExit();
    }
  }

  onPointerLockError() {
    alert('Pointer Lock 에러: FPS 모드 진입 실패');
    this.disable();
  }

  onMouseMove(event) {
    if (!this.enabled) return;
    this.yaw -= event.movementX * this.sensitivity;
    this.pitch -= event.movementY * this.sensitivity;
    const maxPitch = Math.PI / 2 * 0.94;
    this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));
    this.updateCameraRotation();
  }

  onKeyDown(event) {
    if (!this.enabled) return;
    switch (event.code) {
      case 'KeyW': this.moveForward = true; break;
      case 'KeyS': this.moveBackward = true; break;
      case 'KeyA': this.moveLeft = true; break;
      case 'KeyD': this.moveRight = true; break;
      case 'Space':
        if (!this.isJumpKeyDown && !this.isJumping && this.isOnGround) {
          this.velocityY = this.jumpSpeed;
          this.isJumping = true;
          this.isOnGround = false;
        }
        this.isJumpKeyDown = true;
        break;
      case 'Escape': this.disable(); break;
    }
  }

  onKeyUp(event) {
    if (!this.enabled) return;
    switch (event.code) {
      case 'KeyW': this.moveForward = false; break;
      case 'KeyS': this.moveBackward = false; break;
      case 'KeyA': this.moveLeft = false; break;
      case 'KeyD': this.moveRight = false; break;
      case 'Space':
        this.isJumpKeyDown = false;
        break;
    }
  }

  update() {
    if (!this.enabled) return;
    // pointer lock이 풀렸으면 강제 비활성화
    if (document.pointerLockElement !== this.domElement) {
      this.enabled = false;
      return;
    }

    // --- 이동 처리: this.yaw 값 기준으로 방향 계산 ---
    // 1. 입력량 계산
    let forwardAmount = (this.moveForward ? 1 : 0) - (this.moveBackward ? 1 : 0);
    let rightAmount = (this.moveRight ? 1 : 0) - (this.moveLeft ? 1 : 0);

    this.isMoving = forwardAmount !== 0 || rightAmount !== 0;

    if (this.isMoving) {
      // 2. yaw 기준으로 방향 벡터 계산 (Three.js 좌표계: -Z가 forward)
      const forward = new THREE.Vector3(
        -Math.sin(this.yaw),
        0,
        -Math.cos(this.yaw)
      ).normalize();
      
      const right = new THREE.Vector3(
        Math.cos(this.yaw),
        0,
        -Math.sin(this.yaw)
      ).normalize();

      // 3. 이동 벡터 계산
      const moveVector = new THREE.Vector3();
      moveVector.addScaledVector(forward, forwardAmount * this.moveSpeed);
      moveVector.addScaledVector(right, rightAmount * this.moveSpeed);

      // 4. 충돌 검사 및 이동
      const nextPos = this.playerObject.position.clone().add(moveVector);
      nextPos.y = this.playerObject.position.y; // y축은 별도 처리

      if (!this._cylinderCollides(nextPos)) {
        this.playerObject.position.copy(nextPos);
      }
    }

    // --- 중력 및 점프 처리: playerObject.position.y 기준 ---
    this.velocityY += this.gravity;
    let nextY = this.playerObject.position.y + this.velocityY;
    const testPos = this.playerObject.position.clone();
    testPos.y = nextY;

    let onGround = false;

    if (nextY <= this.playerHeight) {
      nextY = this.playerHeight;
      this.velocityY = 0;
      onGround = true;
      this.playerObject.position.y = nextY;
    } else {
      if (!this._cylinderCollides(testPos)) {
        this.playerObject.position.y = nextY;
      } else {
        // 큐브 위에 착지 체크
        const playerFoot = nextY - this.cylinderHeight;
        let landedOnCube = false;
        for (const mesh of this.obstacles) {
          if (!mesh.geometry || !mesh.position) continue;
          const box = new THREE.Box3().setFromObject(mesh);
          const tolerance = 0.05;
          if (Math.abs(playerFoot - box.max.y) < tolerance) {
            this.playerObject.position.y = box.max.y + this.cylinderHeight;
            this.velocityY = 0;
            onGround = true;
            landedOnCube = true;
            break;
          }
        }
        if (!landedOnCube) {
          this.velocityY = 0;
        }
      }
    }

    if (!this.isOnGround && onGround) {
      this.isJumpKeyDown = false;
      this.isJumping = false;
    }
    this.isOnGround = onGround;

    // 플레이어 mesh 위치 동기화 (playerObject 바닥에 맞춤)
    if (this.playerMesh) {
      this.playerMesh.position.set(
        this.playerObject.position.x,
        this.playerObject.position.y - this.cylinderHeight + this.playerBoxHeight / 2,
        this.playerObject.position.z
      );
    }

    // Head Bobbing 효과 (카메라 로컬 y 위치에만 적용)
    if (this.isMoving && this.isOnGround) {
      this.headBobPhase += this.headBobFrequency * this.moveSpeed;
    } else {
      this.headBobPhase = 0;
    }
    const bobOffset = this.isOnGround ? Math.abs(Math.sin(this.headBobPhase)) * this.headBobAmplitude : 0;
    this.camera.position.y = this.baseCameraY + bobOffset;
    
    // 카메라 위치 강제 고정 (x, z는 항상 0)
    this.camera.position.x = 0;
    this.camera.position.z = 0;

    // 콜리전 실린더 시각화 (디버깅용)
    if (this.scene) {
      this.debugDrawPlayerCylinder(this.scene);
    }
  }
  updateCameraRotation() {
    // playerObject가 yaw 회전을 담당 (플레이어 몸체 회전)
    this.playerObject.rotation.set(0, this.yaw, 0);

    // 카메라는 pitch만 담당 (고개 위아래)
    this.camera.rotation.set(this.pitch, 0, 0);
  }
}