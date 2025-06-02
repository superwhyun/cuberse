// @ts-nocheck
// fpsControls.js
// Three.js 기반 1인칭(FPS) 컨트롤러 - 큐브 위 튐 완전 방지, 장애물 충돌 포함

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';

// 실린더-박스(AABB) 충돌 판정 함수
function cylinderIntersectsBox(cyl, box) {
  if (cyl.yMax < box.min.y || cyl.yMin > box.max.y) return false;
  const dx = Math.max(box.min.x - cyl.x, 0, cyl.x - box.max.x);
  const dz = Math.max(box.min.z - cyl.z, 0, cyl.z - box.max.z);
  return (dx * dx + dz * dz) <= (cyl.radius * cyl.radius);
}

export class FPSControls {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;
    this.enabled = false;
    this.scene = null; // 시각화용 THREE.Scene 참조

    // 시점 회전 관련
    this.pitch = 0;
    this.yaw = 0;
    this.sensitivity = 0.002;

    // 이동 관련
    this.moveSpeed = 0.0375;
    this.moveForward = false;
    this.moveBackward = false;
    this.moveLeft = false;
    this.moveRight = false;

    // 점프/중력
    this.velocityY = 0;
    this.gravity = -0.004;
    this.jumpSpeed = 0.12;
    this.isOnGround = false;
    this.playerHeight = 1.7;
    this.isJumpKeyDown = false;
    this.isJumping = false; // 점프 중 여부

    // 장애물(큐브)
    this.obstacles = [];

    // 플레이어 콜리전 박스 크기 (기본값, cubeSize로 갱신 필요)
    this.playerBoxWidth = 0.8; // cubeSize * 0.8
    this.playerBoxDepth = 0.8; // cubeSize * 0.8
    this.playerBoxHeight = 1.34; // cubeSize * 4/3

    this.playerMesh = null;

    // 실린더 충돌 기본값
    this.cylinderRadius = 0.5;
    this.cylinderHeight = 1.7;

    // 내부 바인딩
    this.onMouseMove = this.onMouseMove.bind(this);
    this.onPointerLockChange = this.onPointerLockChange.bind(this);
    this.onPointerLockError = this.onPointerLockError.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
  }

  setObstacles(obstacles) {
    this.obstacles = obstacles || [];
  }

  // 플레이어 콜리전 박스 크기 설정 (cubeSize를 받아서 계산)
  setPlayerCollisionBox(cubeSize) {
    this.playerBoxWidth = cubeSize * 0.8;
    this.playerBoxDepth = cubeSize * 0.8;
    this.playerBoxHeight = cubeSize * 4 / 3;
  }

  setPlayerCollisionCylinder(cubeSize) {
    this.cylinderRadius = cubeSize * 0.6;
    this.cylinderHeight = cubeSize * 1.5;
  }

  _cylinderCollides(pos) {
    const cyl = {
      x: pos.x,
      z: pos.z,
      yMax: pos.y,
      yMin: pos.y - this.cylinderHeight,
      radius: this.cylinderRadius
    };
    for (const mesh of this.obstacles) {
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
      this.camera.position.x,
      this.camera.position.y - this.cylinderHeight / 2,
      this.camera.position.z
    );
    scene.add(mesh);
    this._debugCylinderMesh = mesh;
  }

  setScene(scene) {
    this.scene = scene;
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

    // FPS 모드 진입 시 Y만 지상으로 슬라이딩
    const startX = this.camera.position.x;
    const startY = this.camera.position.y;
    const startZ = this.camera.position.z;
    const targetY = Math.max(this.playerHeight, this.playerHeight);

    const duration = 350;
    const startTime = performance.now();
    const animate = (now) => {
      const t = Math.min((now - startTime) / duration, 1);
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      this.camera.position.x = startX;
      this.camera.position.y = startY + (targetY - startY) * ease;
      this.camera.position.z = startZ;
      if (t < 1) {
        requestAnimationFrame(animate);
      } else {
        this.camera.position.x = startX;
        this.camera.position.y = targetY;
        this.camera.position.z = startZ;
        this.velocityY = 0;
        this.isOnGround = true;
      }
    };
    requestAnimationFrame(animate);

    this.domElement.requestPointerLock();
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    document.addEventListener('pointerlockerror', this.onPointerLockError);
  }

  disable() {
    if (!this.enabled) return;
    this.enabled = false;
    document.exitPointerLock();
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    document.removeEventListener('pointerlockerror', this.onPointerLockError);
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('keyup', this.onKeyUp);
  }

  onPointerLockChange() {
    if (document.pointerLockElement === this.domElement) {
      document.addEventListener('mousemove', this.onMouseMove);
      document.addEventListener('keydown', this.onKeyDown);
      document.addEventListener('keyup', this.onKeyUp);
    } else {
      document.removeEventListener('mousemove', this.onMouseMove);
      document.removeEventListener('keydown', this.onKeyDown);
      document.removeEventListener('keyup', this.onKeyUp);
      this.enabled = false;
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

  updateCameraRotation() {
    const euler = new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(euler);
  }

  onKeyDown(event) {
    if (!this.enabled) return;
    switch (event.code) {
      case 'KeyW': this.moveForward = true; break;
      case 'KeyS': this.moveBackward = true; break;
      case 'KeyA': this.moveLeft = true; break;
      case 'KeyD': this.moveRight = true; break;
      case 'Space':
        if (!this.isJumpKeyDown && !this.isJumping) {
          this.velocityY = this.jumpSpeed;
          this.isJumping = true;
          this.isOnGround = false; // 점프 시작 시 명확히 공중 상태로
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

    // 이동 벡터 계산
    const direction = new THREE.Vector3();
    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();

    this.camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();

    right.crossVectors(forward, this.camera.up).normalize();

    const forwardAmount = (this.moveForward ? 1 : 0) - (this.moveBackward ? 1 : 0);
    const rightAmount = (this.moveRight ? 1 : 0) - (this.moveLeft ? 1 : 0);

    direction.copy(forward).multiplyScalar(forwardAmount);
    direction.add(right.clone().multiplyScalar(rightAmount));

    // 이동 적용 (장애물 충돌 체크)
    if (direction.lengthSq() > 0) {
      // 큐브 위에 있을 때 이동키 입력 로그
      const posBelow = this.camera.position.clone();
      posBelow.y = this.camera.position.y - this.playerHeight + 0.1;
      // 기존 박스 충돌 체크 제거
      // if (this.isOnGround && cubeBox) {
      //   console.log('[FPSControls] 큐브 위에서 이동키 입력 감지:', {
      //     moveForward: this.moveForward,
      //     moveBackward: this.moveBackward,
      //     moveLeft: this.moveLeft,
      //     moveRight: this.moveRight,
      //     position: this.camera.position.toArray()
      //   });
      // }
      direction.normalize();
      const moveVector = direction.multiplyScalar(this.moveSpeed);
      const nextPos = this.camera.position.clone().add(moveVector);
      nextPos.y = this.camera.position.y; // Y는 별도 처리
      if (!this._cylinderCollides(nextPos)) {
        this.camera.position.copy(nextPos);
      }
    }

    // --- 큐브 위 튐 완전 방지 구조 ---
    // 1. 현재 카메라 위치 기준으로 큐브 위에 있는지 먼저 판정
    const posBelow = this.camera.position.clone();
    posBelow.y = this.camera.position.y - this.playerHeight + 0.1;
    // 박스 충돌 체크 제거

    // 큐브 위에 있을 때 점프 시작 프레임에는 고정 로직을 건너뜀
    // 점프 시작 프레임: isOnGround가 true였고, velocityY > 0(점프 시작)
    // velocityY가 충분히 작을 때(하강 중이거나 거의 정지)만 큐브 위 고정
    if (this.isOnGround && this.velocityY <= 0.001) {
      // 기존 박스 충돌 관련 제거
      // const expectedY = cubeBox.max.y + this.playerHeight;
      // 오차 허용 범위 내에서만 Y 위치와 속도를 클램핑
      // if (Math.abs(this.camera.position.y - expectedY) < 0.05 || this.velocityY < 0) {
      //   this.camera.position.y = expectedY;
      //   this.velocityY = 0;
      //   if (!this.isOnGround) this.isJumpKeyDown = false;
      //   this.isOnGround = true;
      //   this.isJumping = false; // 큐브 위에 착지하면 점프 이벤트 종료
      //   // return;  // 이동이 막히지 않도록 return 제거
      // }
    }
    // 점프 중(상승 중)이면 아래 중력/점프 처리로 진행

    // 2. 큐브 위가 아니면 중력 적용
    this.velocityY += this.gravity;
    let nextY = this.camera.position.y + this.velocityY;
    const testPos = this.camera.position.clone();
    testPos.y = nextY;
    let onGround = false;

    if (nextY <= this.playerHeight) {
      nextY = this.playerHeight;
      this.velocityY = 0;
      onGround = true;
      this.camera.position.y = nextY;
    } else {
      if (!this._cylinderCollides(testPos)) {
        this.camera.position.y = nextY;
      } else {
        // 큐브 위에 올라섰는지 체크
        const playerFoot = nextY - this.cylinderHeight;
        let landedOnCube = false;
        for (const mesh of this.obstacles) {
          if (!mesh.geometry || !mesh.position) continue;
          const box = new THREE.Box3().setFromObject(mesh);
          const tolerance = 0.05; // 오차 허용
          if (Math.abs(playerFoot - box.max.y) < tolerance) {
            // 큐브 위에 착지한 상황
            this.camera.position.y = box.max.y + this.cylinderHeight;
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

    // 착지 이벤트 감지
    if (!this.isOnGround && onGround) {
      this.isJumpKeyDown = false;
      this.isJumping = false; // 바닥에 착지하면 점프 이벤트 종료
    }
    this.isOnGround = onGround;

    // === 3인칭 시점 동기화 ===
    // 실제 플레이어 좌표를 별도 벡터로 저장
    if (!this.playerPosition) {
      this.playerPosition = new THREE.Vector3();
    }
    this.playerPosition.set(
      this.camera.position.x,
      this.camera.position.y,
      this.camera.position.z
    );

    // 플레이어 mesh를 실제 좌표에 위치(중심 y를 맞춤)
    if (this.playerMesh) {
      this.playerMesh.position.set(
        this.playerPosition.x,
        this.playerPosition.y - this.playerBoxHeight / 2,
        this.playerPosition.z
      );
    }

    // 카메라는 항상 플레이어 mesh에서 떨어진 위치로 옮기고, 플레이어 mesh 중심을 바라봄
    if (this.playerMesh && this.scene) {
      const offset = new THREE.Vector3(-3, 3, -3);
      this.camera.position.copy(this.playerMesh.position).add(offset);
      this.camera.lookAt(this.playerMesh.position);
    }

    // 콜리전 실린더 시각화
    if (this.scene) {
      this.debugDrawPlayerCylinder(this.scene);
    }
  }

  // 기존 박스 충돌 관련 메서드 및 호출 제거
}
