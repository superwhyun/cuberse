// @ts-nocheck
// fpsControls.js
// Three.js 기반 1인칭(FPS) 컨트롤러 모듈
// main.js에서 FPS 모드 진입/해제 시 사용

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';

export class FPSControls {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;
    this.enabled = false;

    // 시점 회전 관련
    this.pitch = 0;
    this.yaw = 0;
    this.sensitivity = 0.002;

    // 이동 관련
    this.moveSpeed = 0.5;
    this.moveForward = false;
    this.moveBackward = false;
    this.moveLeft = false;
    this.moveRight = false;

    // 점프/중력
    this.velocityY = 0;
    this.gravity = -0.03;
    this.jumpSpeed = 0.7;
    this.isOnGround = false;
    this.playerHeight = 1.7; // 카메라 바닥 기준 높이

    // 장애물(큐브)
    this.obstacles = [];

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

  enable() {
    if (this.enabled) return;
    this.enabled = true;
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
    // pitch 제한 (상하 85도)
    const maxPitch = Math.PI / 2 * 0.94;
    this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));
    this.updateCameraRotation();
  }

  updateCameraRotation() {
    // 카메라 위치를 기준으로 회전
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
        if (this.isOnGround) {
          this.velocityY = this.jumpSpeed;
          this.isOnGround = false;
        }
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
    }
  }

  update() {
    if (!this.enabled) return;
    // 이동 벡터 계산
    const direction = new THREE.Vector3();
    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0; // 수평 이동
    forward.normalize();
    right.crossVectors(forward, this.camera.up).normalize();
    if (this.moveForward) direction.add(forward);
    if (this.moveBackward) direction.add(forward.clone().negate());
    if (this.moveLeft) direction.add(right.clone().negate());
    if (this.moveRight) direction.add(right);
    direction.normalize();

    // 수평 이동 충돌 체크
    if (direction.lengthSq() > 0) {
      direction.normalize();
      const moveVec = direction.clone().multiplyScalar(this.moveSpeed);
      const nextPos = this.camera.position.clone().add(moveVec);
      nextPos.y = this.camera.position.y; // y는 아래에서 처리
      if (!this._collides(nextPos, this.playerHeight)) {
        this.camera.position.copy(nextPos);
      }
    }

    // 중력/점프 적용
    this.velocityY += this.gravity;
    let nextY = this.camera.position.y + this.velocityY;
    let onGround = false;

    // 바닥 충돌
    if (nextY < this.playerHeight) {
      nextY = this.playerHeight;
      this.velocityY = 0;
      onGround = true;
    }

    // 큐브 위 충돌 (머리/발)
    const posBelow = this.camera.position.clone();
    posBelow.y = nextY - this.playerHeight * 0.5;
    if (this._collides(posBelow, this.playerHeight * 0.8)) {
      if (this.velocityY < 0) {
        // 아래에서 큐브 위에 착지
        nextY = Math.floor(this.camera.position.y);
        this.velocityY = 0;
        onGround = true;
      } else if (this.velocityY > 0) {
        // 머리 위에 부딪힘
        nextY = this.camera.position.y;
        this.velocityY = 0;
      }
    }

    this.camera.position.y = nextY;
    this.isOnGround = onGround;
  }

  // AABB 충돌 체크 (카메라 위치와 큐브들)
  _collides(pos, height = 1.7) {
    // 카메라를 0.4x0.4xheight 박스로 가정
    const px = pos.x, py = pos.y, pz = pos.z;
    const half = 0.2;
    for (const mesh of this.obstacles) {
      if (!mesh.geometry || !mesh.position) continue;
      const box = new THREE.Box3().setFromObject(mesh);
      if (
        px + half > box.min.x && px - half < box.max.x &&
        py > box.min.y && py - height < box.max.y &&
        pz + half > box.min.z && pz - half < box.max.z
      ) {
        return true;
      }
    }
    return false;
  }
}
