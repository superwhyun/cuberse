import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';

let scene, camera, rendererDomElement, zoneManager, fpsControls, utils;
let getCubeColorCallback, addCubeToSceneCallback, removeCubeFromSceneCallback, getSocketCallback, getSpaceIdCallback;

// Internal state for interactions
let hoveredCube = null;
let hoveredFaceNormal = null;
let highlightEdge = null;

let isDragging = false;
let previousMousePosition = { x: 0, y: 0 };
let initialMousePosition = { x: 0, y: 0 };
const dragThreshold = 5;
let wasDraggingJustNow = false;
let isDraggingCube = false;
let dragStartCube = null;
let dragStartFace = null;

// Helper to calculate zone of a mesh (assuming mesh has .gridX, .gridY, .gridZ and .position)
function getMeshZone(mesh, currentCubeSize, divisions, zoneSize) {
    if (!mesh || mesh.gridX === undefined || mesh.gridY === undefined || mesh.gridZ === undefined) {
        return null; // Not a grid cube
    }
    const meshWorldX = mesh.position.x;
    const meshWorldZ = mesh.position.z;

    const zoneOriginX = meshWorldX - (mesh.gridX - divisions / 2 + 0.5) * currentCubeSize;
    const zoneOriginZ = meshWorldZ - (mesh.gridZ - divisions / 2 + 0.5) * currentCubeSize;

    const calculatedZoneX = Math.round(zoneOriginX / zoneSize);
    const calculatedZoneZ = Math.round(zoneOriginZ / zoneSize);
    return { x: calculatedZoneX, y: calculatedZoneZ }; // y here is depth (Z)
}


function initCubeInteraction(params) {
    scene = params.scene;
    camera = params.camera;
    rendererDomElement = params.rendererDomElement;
    zoneManager = params.zoneManager;
    fpsControls = params.fpsControls;
    utils = params.utils; // For showToast

    getCubeColorCallback = params.getCubeColorCallback;
    addCubeToSceneCallback = params.addCubeToSceneCallback;
    removeCubeFromSceneCallback = params.removeCubeFromSceneCallback;
    getSocketCallback = params.getSocketCallback;
    getSpaceIdCallback = params.getSpaceIdCallback;

    // Attach event listeners
    rendererDomElement.addEventListener('click', onClick);
    rendererDomElement.addEventListener('contextmenu', onContextMenu);
    rendererDomElement.addEventListener('mousedown', onMouseDown);
    rendererDomElement.addEventListener('mousemove', onMouseMove);
    rendererDomElement.addEventListener('mouseup', onMouseUp);
    // mouseleave is simple enough to keep in main or move here too if needed.
    // For now, keeping it in main if it only affects dragging state.
    // If it affects highlightEdge, it should be here.
    rendererDomElement.addEventListener('mouseleave', onMouseLeave);


    console.log("CubeInteraction initialized.");
}

function onMouseLeave() {
    if (isDragging) {
      isDragging = false;
      isDraggingCube = false;
      dragStartCube = null;
      dragStartFace = null;
      // console.log('Mouse left 3D area, dragging stopped.');
    }
    if (highlightEdge) {
        scene.remove(highlightEdge);
        highlightEdge = null;
    }
    hoveredCube = null;
    hoveredFaceNormal = null;
}


function onClick(event) {
    if (fpsControls && fpsControls.enabled) return;
    if (wasDraggingJustNow) { // Prevent click after drag
      wasDraggingJustNow = false;
      return;
    }

    const rect = rendererDomElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);

    const { x: czx, y: czy } = zoneManager.getCurrentZoneCoordinates();
    const divisions = zoneManager.getZoneDivisions();
    const zoneSize = zoneManager.getZoneSize();
    const currentCubeSize = zoneManager.getCubeSize();
    const cubeColor = getCubeColorCallback();

    let placedOnExistingCubeFace = false;

    if (hoveredCube && hoveredFaceNormal) {
        const hcZone = getMeshZone(hoveredCube, currentCubeSize, divisions, zoneSize);
        if (hcZone && hcZone.x === czx && hcZone.y === czy) {
            const localX = hoveredCube.position.x - (czx * zoneSize);
            const localZ = hoveredCube.position.z - (czy * zoneSize);

            const gridX = Math.round(localX / currentCubeSize + divisions / 2 - 0.5);
            const gridY = Math.round((hoveredCube.position.y / currentCubeSize) - 0.5);
            const gridZ = Math.round(localZ / currentCubeSize + divisions / 2 - 0.5);

            const nextX = gridX + Math.round(hoveredFaceNormal.x);
            const nextY = gridY + Math.round(hoveredFaceNormal.y);
            const nextZ = gridZ + Math.round(hoveredFaceNormal.z);

            if (nextX >= 0 && nextX < divisions && nextY >= 0 && nextZ >= 0 && nextZ < divisions) {
                addCubeToSceneCallback(nextX, nextY, nextZ, cubeColor, czx, czy, false /* not by remote*/);
                placedOnExistingCubeFace = true;
            }
        }
    }

    if (!placedOnExistingCubeFace) {
        const allSceneCubeMeshes = scene.children.filter(obj => obj.isMesh && obj.gridX !== undefined);
        const intersects = raycaster.intersectObjects(allSceneCubeMeshes, false);

        let clickedDirectlyOnCubeInCurrentZone = false;
        if (intersects.length > 0) {
            const firstHitMesh = intersects[0].object;
            const hitMeshZone = getMeshZone(firstHitMesh, currentCubeSize, divisions, zoneSize);
            if (hitMeshZone && hitMeshZone.x === czx && hitMeshZone.y === czy) {
                clickedDirectlyOnCubeInCurrentZone = true;
            }
        }

        if (!clickedDirectlyOnCubeInCurrentZone) {
            const planeY = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
            const intersectPoint = new THREE.Vector3();
            if (raycaster.ray.intersectPlane(planeY, intersectPoint)) {
                const zoneWorldMinX = czx * zoneSize - zoneSize / 2;
                const zoneWorldMaxX = czx * zoneSize + zoneSize / 2;
                const zoneWorldMinZ = czy * zoneSize - zoneSize / 2;
                const zoneWorldMaxZ = czy * zoneSize + zoneSize / 2;

                if (intersectPoint.x >= zoneWorldMinX && intersectPoint.x < zoneWorldMaxX &&
                    intersectPoint.z >= zoneWorldMinZ && intersectPoint.z < zoneWorldMaxZ) {

                    const localX = intersectPoint.x - (czx * zoneSize);
                    const localZ = intersectPoint.z - (czy * zoneSize);

                    let gridX = Math.floor(localX / currentCubeSize + divisions / 2);
                    let gridZ = Math.floor(localZ / currentCubeSize + divisions / 2);

                    if (gridX >= 0 && gridX < divisions && gridZ >= 0 && gridZ < divisions) {
                        const currentManagedZoneCubesData = zoneManager.getZoneCubes(czx, czy);
                        let gridY = 0;
                        if (!currentManagedZoneCubesData.some(cData => cData.gridX === gridX && cData.gridY === gridY && cData.gridZ === gridZ)) {
                            addCubeToSceneCallback(gridX, gridY, gridZ, cubeColor, czx, czy, false);
                        }
                    }
                }
            }
        }
    }
}

function onContextMenu(event) {
    event.preventDefault();
    if (fpsControls && fpsControls.enabled) return;

    const rect = rendererDomElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);

    const { x: czx, y: czy } = zoneManager.getCurrentZoneCoordinates();
    const divisions = zoneManager.getZoneDivisions();
    const currentCubeSize = zoneManager.getCubeSize();
    const zoneSize = zoneManager.getZoneSize();

    const allSceneCubeMeshes = scene.children.filter(obj => obj.isMesh && obj.gridX !== undefined);
    const intersects = raycaster.intersectObjects(allSceneCubeMeshes, false);

    if (intersects.length > 0) {
      const targetCubeMesh = intersects[0].object;
      const hitMeshZone = getMeshZone(targetCubeMesh, currentCubeSize, divisions, zoneSize);

      if (hitMeshZone && hitMeshZone.x === czx && hitMeshZone.y === czy) {
        removeCubeFromSceneCallback(targetCubeMesh, czx, czy);

        if (hoveredCube === targetCubeMesh) {
          hoveredCube = null;
          hoveredFaceNormal = null;
        }
        if (highlightEdge && highlightEdge.position.equals(targetCubeMesh.position)) {
            scene.remove(highlightEdge);
            highlightEdge = null;
        }
      }
    }
}

function onMouseDown(event) {
    if (fpsControls && fpsControls.enabled) return;
    if (event.button === 2) return; // Ignore right-click for dragging

    isDragging = true;
    initialMousePosition.x = event.clientX;
    initialMousePosition.y = event.clientY;
    previousMousePosition.x = event.clientX;
    previousMousePosition.y = event.clientY;
    wasDraggingJustNow = false;

    const { x: czx, y: czy } = zoneManager.getCurrentZoneCoordinates();
    const divisions = zoneManager.getZoneDivisions();
    const currentCubeSize = zoneManager.getCubeSize();
    const zoneSize = zoneManager.getZoneSize();

    if (hoveredCube && hoveredFaceNormal) {
        const hcZone = getMeshZone(hoveredCube, currentCubeSize, divisions, zoneSize);
        if (hcZone && hcZone.x === czx && hcZone.y === czy) {
            isDraggingCube = true;
            dragStartCube = hoveredCube;
            dragStartFace = hoveredFaceNormal.clone();
        } else {
            isDraggingCube = false;
            dragStartCube = null;
            dragStartFace = null;
        }
    } else {
        isDraggingCube = false;
        dragStartCube = null;
        dragStartFace = null;
    }
}

function onMouseMove(event) {
    if (fpsControls && fpsControls.enabled) return;

    const oldHoveredCube = hoveredCube;
    hoveredCube = null;
    hoveredFaceNormal = null;
    if (highlightEdge) {
        scene.remove(highlightEdge);
        highlightEdge = null;
    }

    const rect = rendererDomElement.getBoundingClientRect();
    const currentMouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
    );

    const { x: czx, y: czy } = zoneManager.getCurrentZoneCoordinates();
    const divisions = zoneManager.getZoneDivisions();
    const currentCubeSize = zoneManager.getCubeSize();
    const zoneSize = zoneManager.getZoneSize();
    const cubeColor = getCubeColorCallback();


    if (isDragging) {
        const deltaX = event.clientX - previousMousePosition.x;
        const deltaY = event.clientY - previousMousePosition.y;
        previousMousePosition.x = event.clientX;
        previousMousePosition.y = event.clientY;

        if (isDraggingCube && dragStartCube && dragStartFace) {
            const dragDistance = Math.sqrt(Math.pow(event.clientX - initialMousePosition.x, 2) + Math.pow(event.clientY - initialMousePosition.y, 2));
            if (dragDistance > dragThreshold) {
                const cubeCount = Math.floor(dragDistance / 20);
                if (cubeCount > 0) {
                    const startCubeZone = getMeshZone(dragStartCube, currentCubeSize, divisions, zoneSize);
                    if (startCubeZone && startCubeZone.x === czx && startCubeZone.y === czy) {
                        const localX = dragStartCube.position.x - (czx * zoneSize);
                        const localZ = dragStartCube.position.z - (czy * zoneSize);
                        const currentDragStartGridX = Math.round(localX / currentCubeSize + divisions / 2 - 0.5);
                        const currentDragStartGridY = Math.round((dragStartCube.position.y / currentCubeSize) - 0.5);
                        const currentDragStartGridZ = Math.round(localZ / currentCubeSize + divisions / 2 - 0.5);

                        for (let i = 1; i <= cubeCount; i++) {
                            const nextX = currentDragStartGridX + Math.round(dragStartFace.x) * i;
                            const nextY = currentDragStartGridY + Math.round(dragStartFace.y) * i;
                            const nextZ = currentDragStartGridZ + Math.round(dragStartFace.z) * i;
                            if (nextX >= 0 && nextX < divisions && nextY >= 0 && nextZ >= 0 && nextZ < divisions) {
                                addCubeToSceneCallback(nextX, nextY, nextZ, cubeColor, czx, czy, false);
                            }
                        }
                        wasDraggingJustNow = true;
                        // Reset initial mouse position to create next set of cubes from current mouse pos
                        initialMousePosition.x = event.clientX;
                        initialMousePosition.y = event.clientY;
                    }
                }
            }
        } else {
            if (Math.abs(deltaX) > 0.01 || Math.abs(deltaY) > 0.01) { // Prevent tiny movements from causing rotation
                if (Math.abs(deltaX) > 0.01) { // Favor X-axis rotation slightly more
                    const yawAngle = -deltaX * 0.006;
                    const yawQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yawAngle);
                    camera.quaternion.premultiply(yawQuaternion); // Premultiply for world-axis like rotation
                }
                if (Math.abs(deltaY) > 0.01) {
                    const pitchAngle = -deltaY * 0.006;
                    const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
                    const pitchQuaternion = new THREE.Quaternion().setFromAxisAngle(cameraRight, pitchAngle);

                    const currentCameraQuaternion = camera.quaternion.clone();
                    currentCameraQuaternion.multiply(pitchQuaternion);

                    // Check pitch limits
                    const newDirection = new THREE.Vector3(0,0,-1).applyQuaternion(currentCameraQuaternion);
                    if (Math.abs(newDirection.y) < 0.98) { // Limit pitch to avoid gimbal lock like issues
                       camera.quaternion.multiply(pitchQuaternion);
                    }
                }
                camera.quaternion.normalize();
            }
        }
    } else {
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(currentMouse, camera);
        const allSceneCubeMeshes = scene.children.filter(obj => obj.isMesh && obj.gridX !== undefined);
        const intersects = raycaster.intersectObjects(allSceneCubeMeshes, false);

        if (intersects.length > 0) {
            const firstHitMesh = intersects[0].object;
            const hitMeshZone = getMeshZone(firstHitMesh, currentCubeSize, divisions, zoneSize);

            if (hitMeshZone && hitMeshZone.x === czx && hitMeshZone.y === czy) {
                hoveredCube = firstHitMesh;
                hoveredFaceNormal = intersects[0].face.normal.clone();

                const edgeGeom = new THREE.EdgesGeometry(hoveredCube.geometry);
                const edgeMat = new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 2 });
                highlightEdge = new THREE.LineSegments(edgeGeom, edgeMat);
                highlightEdge.position.copy(hoveredCube.position);
                scene.add(highlightEdge);
            }
        }
    }
}

function onMouseUp(event) {
    if (fpsControls && fpsControls.enabled) return;
    if (event.button === 2) return;

    if (isDragging) {
        const deltaX = event.clientX - initialMousePosition.x;
        const deltaY = event.clientY - initialMousePosition.y;
        const dragDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

        if (dragDistance > dragThreshold && isDraggingCube) { // Only set if was dragging cube
            wasDraggingJustNow = true;
        } else if (dragDistance <= dragThreshold && !isDraggingCube) { // If not dragging cube and small movement, it's a click
            wasDraggingJustNow = false;
        } else if (dragDistance > dragThreshold && !isDraggingCube) { // If dragging camera
             wasDraggingJustNow = true; // Prevent click after camera rotate
        }


        isDragging = false;
        isDraggingCube = false;
        dragStartCube = null;
        dragStartFace = null;
    }
}

export { initCubeInteraction };
