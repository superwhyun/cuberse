// src/zoneManager.js

import *_THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';

// Make THREE available in this module. We are not using it directly here yet,
// but it's highly likely to be needed for geometry calculations if not already.
// It's also good practice if this module is dealing with Three.js related concepts.
const THREE = _THREE;

// --- Constants ---
const ZONE_SIZE = 20; // Each Zone is 20x20
const ZONE_DIVISIONS = 20;

// --- Module State ---
let sceneRef = null;
let currentZoneX = 0;
let currentZoneY = 0;
const zoneData = {}; // Stores cube data {x,y,z,color} per zone
const zoneGrids = new Map();
const zoneFloors = new Map();
const zoneTexts = new Map();

let spaceIdRef = null; // Will be set during init
let isRealtimeAvailableRef = false; // Will be set during init or via a setter
let socketRef = null; // Will be set during init

// Callbacks
let updateFpsObstaclesCallback = () => {};
let showToastCallback = () => {};

// --- Initialization ---
function initZoneManager(
  sRef,
  initialZoneX,
  initialZoneY,
  spId,
  isRtAvailable,
  sockRef,
  updateCb,
  toastCb
) {
  sceneRef = sRef;
  currentZoneX = initialZoneX || 0;
  currentZoneY = initialZoneY || 0;
  spaceIdRef = spId;
  isRealtimeAvailableRef = isRtAvailable;
  socketRef = sockRef;
  updateFpsObstaclesCallback = updateCb || updateFpsObstaclesCallback;
  showToastCallback = toastCb || showToastCallback;

  // Initial setup of grids and texts for the starting zone and neighbors
  createZoneGrid(currentZoneX, currentZoneY, true); // Active
  createZoneText(currentZoneX, currentZoneY);
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue;
      createZoneGrid(currentZoneX + dx, currentZoneY + dy, false); // Inactive
      createZoneText(currentZoneX + dx, currentZoneY + dy);
    }
  }
  updateZoneFloors(); // Create initial floor

  console.log(`ZoneManager initialized. Current Zone: (${currentZoneX}, ${currentZoneY})`);
}

// --- Zone Key Functions ---
function getZoneKey(zoneX, zoneY) {
  return `${zoneX},${zoneY}`;
}

function getCurrentZoneKey() {
  return getZoneKey(currentZoneX, currentZoneY);
}

// --- Cube Data Management ---
function getZoneCubes(zoneX, zoneY) {
  const key = getZoneKey(zoneX, zoneY);
  if (!zoneData[key]) {
    zoneData[key] = [];
  }
  return zoneData[key];
}

// Add cube data (not mesh) to a zone
function addCubeDataToZone(zoneX, zoneY, cubeObject) {
  // cubeObject is expected to be the THREE.Mesh object with gridX, gridY, gridZ, etc.
  const zoneCubes = getZoneCubes(zoneX, zoneY);
  // Store essential data, not the full mesh, to avoid circular refs if mesh is passed
  const cubeData = {
    gridX: cubeObject.gridX,
    gridY: cubeObject.gridY,
    gridZ: cubeObject.gridZ,
    x: cubeObject.position.x,
    y: cubeObject.position.y,
    z: cubeObject.position.z,
    color: `#${cubeObject.material.color.getHexString()}`,
    _byRemote: cubeObject._byRemote || false
  };
  zoneCubes.push(cubeData);
  updateFpsObstaclesCallback(); // Notify main to update obstacles
}

// Remove cube data (not mesh) from a zone
// The actual mesh removal from scene should be handled by the caller
function removeCubeDataFromZone(zoneX, zoneY, cubeObject) {
  const zoneCubes = getZoneCubes(zoneX, zoneY);
  const index = zoneCubes.findIndex(c =>
    c.gridX === cubeObject.gridX &&
    c.gridY === cubeObject.gridY &&
    c.gridZ === cubeObject.gridZ
    // Position check might be needed if grid coords aren't guaranteed unique after some ops
    // Math.abs(c.x - cubeObject.position.x) < 0.01 &&
    // Math.abs(c.y - cubeObject.position.y) < 0.01 &&
    // Math.abs(c.z - cubeObject.position.z) < 0.01
  );

  if (index > -1) {
    zoneCubes.splice(index, 1);
    updateFpsObstaclesCallback(); // Notify main to update obstacles
    return true; // Indicate success
  }
  return false; // Indicate failure (cube not found)
}

// --- Zone Visualization ---
function createZoneGrid(zoneX, zoneY, isActive = false) {
  if (!sceneRef) return;
  const gridHelper = new THREE.GridHelper(ZONE_SIZE, ZONE_DIVISIONS, 0x888888, 0x888888);
  gridHelper.position.set(zoneX * ZONE_SIZE, 0, zoneY * ZONE_SIZE);
  sceneRef.add(gridHelper);

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
    floorPlane.rotation.x = -Math.PI / 2;
    floorPlane.position.set(zoneX * ZONE_SIZE, 0.01, zoneY * ZONE_SIZE);
    sceneRef.add(floorPlane);
  }

  const key = getZoneKey(zoneX, zoneY);
  zoneGrids.set(key, gridHelper);
  if (floorPlane) {
    zoneFloors.set(key, floorPlane);
  }
}

function updateZoneFloors() {
  if (!sceneRef) return;
  for (const floor of zoneFloors.values()) {
    sceneRef.remove(floor);
  }
  zoneFloors.clear();

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
  sceneRef.add(floorPlane);
  zoneFloors.set(activeZoneKey, floorPlane);
}

function createZoneText(zoneX, zoneY) {
  if (!sceneRef) return;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  canvas.width = 512;
  canvas.height = 512;
  context.fillStyle = 'rgba(100, 100, 100, 0.3)';
  context.font = 'bold 120px Arial';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  const text = `${zoneX},${zoneY}`;
  context.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.position.set(zoneX * ZONE_SIZE, 0.1, zoneY * ZONE_SIZE);
  sprite.scale.set(ZONE_SIZE * 0.8, ZONE_SIZE * 0.8, 1);
  sceneRef.add(sprite);
  zoneTexts.set(getZoneKey(zoneX, zoneY), sprite);
}

// --- Zone Switching ---
// switchToZone needs access to camera for smooth transition,
// which is not ideal here. For now, we'll make it simpler and
// the main module can handle camera animation.
// This version will just update state and visuals.
function switchToZone(newZoneX, newZoneY, cameraRef) { // cameraRef is passed for animation
    if (newZoneX === currentZoneX && newZoneY === currentZoneY) return false;

    console.log(`ZoneManager: Switching from (${currentZoneX},${currentZoneY}) to (${newZoneX},${newZoneY})`);

    const oldZoneX = currentZoneX;
    const oldZoneY = currentZoneY;

    // Animate camera (this part is tricky as camera is external)
    // The caller (main-legacy.js) will handle the animation using core3d camera.
    // This function will focus on updating zone state and visuals.

    currentZoneX = newZoneX;
    currentZoneY = newZoneY;

    // Update grids, floors, texts
    const newKey = getCurrentZoneKey();
    if (!zoneGrids.has(newKey)) createZoneGrid(currentZoneX, currentZoneY, false); // Create if not exists, then activate
    if (!zoneTexts.has(newKey)) createZoneText(currentZoneX, currentZoneY);

    updateZoneFloors(); // This will make the new current zone's floor active

    // Create surrounding grids/texts if they don't exist
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            const adjacentX = currentZoneX + dx;
            const adjacentY = currentZoneY + dy;
            const adjacentKey = getZoneKey(adjacentX, adjacentY);
            if (!zoneGrids.has(adjacentKey)) createZoneGrid(adjacentX, adjacentY, false);
            if (!zoneTexts.has(adjacentKey)) createZoneText(adjacentX, adjacentY);
        }
    }

    updateFpsObstaclesCallback(); // Important to update based on new zone's potential obstacles
    showToastCallback(`Zone (${currentZoneX}, ${currentZoneY})로 이동`);
    return true; // Indicates zone changed
}


// --- Data Access and Utilities ---
function getZoneData() {
  // Return a deep copy to prevent external modification issues
  return JSON.parse(JSON.stringify(zoneData));
}

function getCurrentZoneCoordinates() {
  return { x: currentZoneX, y: currentZoneY };
}

function getCubeSize() {
  return ZONE_SIZE / ZONE_DIVISIONS;
}

function getZoneSize() {
  return ZONE_SIZE;
}

function getZoneDivisions() {
  return ZONE_DIVISIONS;
}

function clearAllZoneData() {
  for (const key in zoneData) {
    delete zoneData[key];
  }
  // Also clear visual elements managed here
  if (sceneRef) {
    for (const grid of zoneGrids.values()) sceneRef.remove(grid);
    for (const floor of zoneFloors.values()) sceneRef.remove(floor);
    for (const text of zoneTexts.values()) sceneRef.remove(text);
  }
  zoneGrids.clear();
  zoneFloors.clear();
  zoneTexts.clear();

  // Re-initialize for current zone after clearing
  currentZoneX = 0;
  currentZoneY = 0;
  createZoneGrid(currentZoneX, currentZoneY, true);
  createZoneText(currentZoneX, currentZoneY);
  updateZoneFloors();
   for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue;
      createZoneGrid(currentZoneX + dx, currentZoneY + dy, false);
      createZoneText(currentZoneX + dx, currentZoneY + dy);
    }
  }

  updateFpsObstaclesCallback();
  console.log("ZoneManager: All zone data cleared and reset to origin.");
}

// loadZoneData: Populates zoneData and calls a callback to create meshes
function loadZoneData(loadedData, addCubeMeshCallback) {
  clearAllZoneData(); // Start fresh

  if (loadedData.currentZone) {
    currentZoneX = loadedData.currentZone.x || 0;
    currentZoneY = loadedData.currentZone.y || 0;
  } else {
    // If old format (array of cubes, assume zone 0,0)
    // We'll need to check if loadedData is an array.
    // For now, this function expects the new format.
    currentZoneX = 0;
    currentZoneY = 0;
  }

  // Re-initialize grids and texts for the new currentZone
  // (clearAllZoneData already does some of this for 0,0, but let's be sure for loaded coords)
  if (sceneRef) {
    for (const grid of zoneGrids.values()) sceneRef.remove(grid);
    for (const floor of zoneFloors.values()) sceneRef.remove(floor);
    for (const text of zoneTexts.values()) sceneRef.remove(text);
  }
  zoneGrids.clear();
  zoneFloors.clear();
  zoneTexts.clear();

  createZoneGrid(currentZoneX, currentZoneY, true);
  createZoneText(currentZoneX, currentZoneY);
   for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue;
      const ax = currentZoneX + dx;
      const ay = currentZoneY + dy;
      if (!zoneGrids.has(getZoneKey(ax,ay))) createZoneGrid(ax, ay, false);
      if (!zoneTexts.has(getZoneKey(ax,ay))) createZoneText(ax, ay);
    }
  }
  updateZoneFloors();


  for (const [zoneKey, cubeDataList] of Object.entries(loadedData)) {
    if (zoneKey === 'currentZone') continue;
    if (!Array.isArray(cubeDataList)) continue; // Ensure it's an array of cubes

    const [zoneX, zoneY] = zoneKey.split(',').map(Number);
    const targetZoneCubes = getZoneCubes(zoneX, zoneY); // Ensures zone array exists

    cubeDataList.forEach(cubeData => {
      // Add to zoneData
      targetZoneCubes.push(JSON.parse(JSON.stringify(cubeData))); // Store a copy
      // Call callback to create the mesh in the main scene
      if (addCubeMeshCallback) {
        addCubeMeshCallback(cubeData, zoneX, zoneY);
      }
    });
  }
  updateFpsObstaclesCallback();
  console.log("ZoneManager: Zone data loaded. Current zone:", currentZoneX, currentZoneY);
}

function forEachCubeInZone(zoneX, zoneY, callback) {
    const cubes = getZoneCubes(zoneX, zoneY);
    cubes.forEach(callback);
}

function getCurrentZoneCubes() {
    return getZoneCubes(currentZoneX, currentZoneY);
}

// This function will be called by main-legacy.js to update socket related variables
function setNetworkContext(spId, isRtAvail, sockRefInstance) {
    spaceIdRef = spId;
    isRealtimeAvailableRef = isRtAvail;
    socketRef = sockRefInstance;
}


export {
  initZoneManager,
  switchToZone,
  addCubeDataToZone,
  removeCubeDataFromZone,
  getZoneCubes, // Exporting for specific cases, though getCurrentZoneCubes might be preferred
  getCurrentZoneCubes,
  getZoneData,
  getCurrentZoneCoordinates,
  getCubeSize,
  getZoneSize,
  getZoneDivisions,
  getZoneKey,
  loadZoneData,
  clearAllZoneData,
  forEachCubeInZone,
  setNetworkContext, // To update socket info if needed post-init
  ZONE_SIZE as EXPORTED_ZONE_SIZE, // Exporting constants if needed by other modules directly
  ZONE_DIVISIONS as EXPORTED_ZONE_DIVISIONS
};
