/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// --- DOM ELEMENTS ---
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const titleScreenEl = document.getElementById('title-screen');
const instructionsEl = document.getElementById('instructions');
const levelTitleContainerEl = document.getElementById('level-title-container');
const levelTitleEl = document.getElementById('level-title');
const levelMessageEl = document.getElementById('level-message');

// --- GAME STATE ---
const gameState = {
    currentScene: 'title', // 'title', 'level-transition', 'level', 'ending'
    currentLevelIndex: -1,
    isDragging: false,
    lastPointerX: 0,
    lastPointerY: 0,
    pushOffsetX: 0,
    pushOffsetY: 0,
    totalDistancePushed: 0,
    upwardForce: 0,
};

const transitionState = { cubes: [] };
const titleState = { letterMeshes: {} };

let cubes = [];
let animationFrameId;
let currentLevel = null;

// --- AUDIO ---
let audioContext;
let musicNode = null;
let windSoundNode = null;

// --- GAME CONFIG & PHYSICS ---
const physics = {
  snowDrag: 0.92,
  gravity: 0.5,
  pushMultiplier: 0.3,
  rotationalDamping: 0.97,
  bounce: -0.5,
  jumpForce: -12,
};
const START_SIZE = 50;
let targetZone = {};
let platforms = []; // For skill level
let targetSlot = {}; // For IQ level


// --- 3D RENDERING DATA (shared) ---
const UNIT_CUBE_VERTICES = [ { x: -1, y: -1, z: -1 }, { x: 1, y: -1, z: -1 }, { x: 1, y: 1, z: -1 }, { x: -1, y: 1, z: -1 }, { x: -1, y: -1, z: 1 }, { x: 1, y: -1, z: 1 }, { x: 1, y: 1, z: 1 }, { x: -1, y: 1, z: 1 }];
const CUBE_EDGES = [ [0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7] ];
const projectedVertices = Array.from({ length: 8 }, () => ({ x: 0, y: 0 }));

const S_PATH = [[4, 5], [0, 5], [0, 3], [3, 3], [3, 2.5], [0, 2.5], [0, 0], [4, 0], [4, 2], [1, 2], [1, 2.5], [4, 2.5], [4, 5], [1, 5], [1, 3], [0, 3]];
const W_PATH = [[0, 0], [1, 0], [1, 3], [2, 0], [3, 3], [3, 0], [4, 0], [4, 5], [3, 5], [2, 2], [1, 5], [0, 5]];
const letterShapes = { 'S': { path: S_PATH }, 'N': { path: [[0, 0], [1, 0], [1, 3], [3, 0], [4, 0], [4, 5], [3, 5], [3, 2], [1, 5], [0, 5]] }, 'O': { path: [[0, 0], [4, 0], [4, 5], [0, 5]], holes: [[[1, 1], [3, 1], [3, 4], [1, 4]]] }, 'W': { path: W_PATH }, 'B': { path: [[0, 0], [3, 0], [4, 1], [4, 2], [3, 2.5], [4, 3], [4, 4], [3, 5], [0, 5]], holes: [[[1, 1], [2, 1], [2, 2], [1, 2]], [[1, 3], [2, 3], [2, 4], [1, 4]]] }, 'L': { path: [[0, 0], [1, 0], [1, 4], [4, 4], [4, 5], [0, 5]] }, 'C': { path: [[4, 0], [0, 0], [0, 5], [4, 5], [4, 4], [1, 4], [1, 1], [4, 1]] }, 'K': { path: [[0, 0], [1, 0], [1, 2], [3, 0], [4, 0], [2, 2.5], [4, 5], [3, 5], [1, 3], [1, 5], [0, 5]] } };

// ====================================================================
// --- LEVEL DEFINITIONS ---
// ====================================================================

const levels = [
    // --- LEVEL 1: SKILL ---
    {
        name: 'SKILL',
        setup: () => {
            platforms = [];
            const platformCount = 5;
            const ySpacing = (canvas.height - 200) / platformCount;
            for (let i = 0; i < platformCount; i++) {
                platforms.push({
                    x: (i % 2 === 0) ? canvas.width * 0.25 : canvas.width * 0.75,
                    y: canvas.height - 150 - (i * ySpacing),
                    width: canvas.width * 0.4,
                    height: 20,
                });
            }
            targetZone = { x: canvas.width / 2, y: 80, size: START_SIZE * 1.5 };
            cubes = [createCube(canvas.width / 2, canvas.height - START_SIZE)];
            canvas.addEventListener('pointerdown', handleSkillJump);
        },
        update: () => {
            const cube = cubes[0];
            if (!cube) return;
            cube.vy += physics.gravity;
            cube.x += cube.vx;
            cube.y += cube.vy;
            cube.vx *= physics.snowDrag;
            
            // Platform collision
            let onPlatform = false;
            platforms.forEach(p => {
                if (cube.x > p.x - p.width / 2 && cube.x < p.x + p.width / 2 && cube.y + cube.size / 2 > p.y && cube.y - cube.size / 2 < p.y + p.height && cube.vy > 0) {
                    cube.vy = 0;
                    cube.y = p.y - cube.size / 2;
                    onPlatform = true;
                }
            });

            if (!onPlatform && cube.y + cube.size / 2 > canvas.height) {
                cube.y = canvas.height - cube.size / 2;
                cube.vy = 0;
            }
            
            // Wall bounce
            if (cube.x - cube.size/2 < 0 || cube.x + cube.size/2 > canvas.width) cube.vx *= -1;

            // Win condition
            if (Math.hypot(cube.x - targetZone.x, cube.y - targetZone.y) < targetZone.size / 2) {
                winLevel();
            }
        },
        draw: () => {
            drawGameUI();
            platforms.forEach(p => {
                ctx.fillStyle = '#FFF';
                ctx.fillRect(p.x - p.width / 2, p.y, p.width, p.height);
            });
            cubes.forEach(c => drawWireframeObject(c, UNIT_CUBE_VERTICES, CUBE_EDGES, projectedVertices));
        },
        cleanup: () => canvas.removeEventListener('pointerdown', handleSkillJump),
    },
    // --- LEVEL 2: PUZZLE ---
    {
        name: 'PUZZLE',
        setup: () => {
            targetZone = { x: canvas.width / 2, y: 60, size: START_SIZE };
            cubes = [createCube(canvas.width / 2, canvas.height - START_SIZE * 1.5, {rotationY: 0.4})];
            Object.assign(gameState, { totalDistancePushed: 0, upwardForce: 0 });
            canvas.addEventListener('pointerdown', handlePuzzleDragStart);
            window.addEventListener('pointermove', handlePuzzleDragMove);
            window.addEventListener('pointerup', handlePuzzleDragEnd);
            window.addEventListener('deviceorientation', handleDeviceOrientation);
        },
        update: () => {
            const cube = cubes[0];
            if (!cube) return;
            cube.vy -= gameState.upwardForce; // Apply tilt force
            cube.vy += physics.gravity; // Apply gravity (if not tilted up)
            cube.vx *= physics.snowDrag;
            cube.vy *= physics.snowDrag;
            cube.x += cube.vx;
            cube.y += cube.vy;
            cube.rotationX += cube.vRx;
            cube.rotationY += cube.vRy;
            cube.vRx *= physics.rotationalDamping;
            cube.vRy *= physics.rotationalDamping;
            checkWallCollisions(cube);

            targetZone.size = cube.size; // Dynamic target sizing

            // Win Condition
            const isHorizontallyAligned = Math.abs(cube.x - targetZone.x) < START_SIZE / 2;
            const isVerticallyAligned = Math.abs(cube.y - targetZone.y) < START_SIZE / 2;
            const isCorrectSize = Math.abs(cube.size - START_SIZE) < 5;
            if (isHorizontallyAligned && isVerticallyAligned && isCorrectSize) {
                winLevel("clever you", 180);
            }
        },
        draw: () => {
            drawGameUI();
            cubes.forEach(c => drawWireframeObject(c, UNIT_CUBE_VERTICES, CUBE_EDGES, projectedVertices));
        },
        cleanup: () => {
            canvas.removeEventListener('pointerdown', handlePuzzleDragStart);
            window.removeEventListener('pointermove', handlePuzzleDragMove);
            window.removeEventListener('pointerup', handlePuzzleDragEnd);
            window.removeEventListener('deviceorientation', handleDeviceOrientation);
        }
    },
    // --- LEVEL 3: IQ ---
    {
        name: 'IQ',
        setup: () => {
            targetSlot = { x: canvas.width / 2, y: canvas.height/2, width: START_SIZE * 0.8, height: START_SIZE * 3, rotation: Math.PI / 4 };
            cubes = [createCube(canvas.width / 2, canvas.height - START_SIZE * 1.5)];
            gameState.upwardForce = 0;
            canvas.addEventListener('pointerdown', handlePuzzleDragStart); // Can reuse drag for rotation
            window.addEventListener('pointermove', handleIQDragMove); // Special move handler for rotation
            window.addEventListener('pointerup', handlePuzzleDragEnd);
            window.addEventListener('deviceorientation', handleDeviceOrientation);
            instructionsEl.textContent = "Rotate with touch, move with tilt.";
            instructionsEl.classList.remove('hidden');
        },
        update: () => {
            const cube = cubes[0];
            if (!cube) return;
            cube.vy -= gameState.upwardForce; // Tilt to move
            cube.x += cube.vx;
            cube.y += cube.vy;
            cube.rotationX += cube.vRx;
            cube.rotationY += cube.vRy;
            cube.vRx *= physics.rotationalDamping;
            cube.vRy *= physics.rotationalDamping;

            // Win Condition: check position and rotation alignment
            const inPosition = Math.hypot(cube.x - targetSlot.x, cube.y - targetSlot.y) < 10;
            const angleDiff = Math.abs((cube.rotationY % (Math.PI/2)) - (targetSlot.rotation % (Math.PI/2)));
            const aligned = angleDiff < 0.1;

            if (inPosition && aligned) {
                winLevel("BRILLIANT");
            }
        },
        draw: () => {
            const { x, y, width, height, rotation } = targetSlot;
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(rotation);
            ctx.strokeStyle = '#FFF';
            ctx.lineWidth = 2;
            ctx.strokeRect(-width/2, -height/2, width, height);
            ctx.restore();
            cubes.forEach(c => drawWireframeObject(c, UNIT_CUBE_VERTICES, CUBE_EDGES, projectedVertices));
        },
        cleanup: () => {
            canvas.removeEventListener('pointerdown', handlePuzzleDragStart);
            window.removeEventListener('pointermove', handleIQDragMove);
            window.removeEventListener('pointerup', handlePuzzleDragEnd);
            window.removeEventListener('deviceorientation', handleDeviceOrientation);
        }
    }
];

// ====================================================================
// --- CORE GAME FLOW & SETUP ---
// ====================================================================

function setup() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  for (const char in letterShapes) {
      titleState.letterMeshes[char] = extrudeShape(letterShapes[char]);
  }
  initializeTitleCubes();
  gameState.currentScene = 'title';
  titleScreenEl.style.display = 'flex';
  titleScreenEl.style.opacity = '1';

  if (animationFrameId) cancelAnimationFrame(animationFrameId);
  gameLoop();
}

function createCube(x, y, overrides = {}) {
    return {
        size: START_SIZE, x, y, prevX: x, prevY: y, mass: 1, vx: 0, vy: 0,
        rotationX: 0, rotationY: 0, vRx: 0, vRy: 0,
        ...overrides,
    };
}

function goToNextLevel() {
    if (currentLevel && currentLevel.cleanup) currentLevel.cleanup();
    
    gameState.currentLevelIndex++;
    
    if (gameState.currentLevelIndex >= levels.length) {
        startEnding();
        return;
    }

    currentLevel = levels[gameState.currentLevelIndex];
    showLevelTitle(currentLevel.name, () => {
        gameState.currentScene = 'level';
        cubes = [];
        platforms = [];
        targetZone = {};
        instructionsEl.textContent = '';
        instructionsEl.classList.add('hidden');
        levelMessageEl.classList.add('hidden');
        if (currentLevel.setup) currentLevel.setup();
    });
}

function showLevelTitle(name, callback) {
    gameState.currentScene = 'level-transition';
    levelTitleEl.textContent = name;
    levelTitleContainerEl.classList.remove('hidden');
    levelTitleContainerEl.style.opacity = '1';

    setTimeout(() => {
        levelTitleContainerEl.style.opacity = '0';
        setTimeout(() => {
            levelTitleContainerEl.classList.add('hidden');
            if (callback) callback();
        }, 500);
    }, 1500);
}

function winLevel(message = "COMPLETE", rotation = 0) {
    gameState.currentScene = 'level-transition'; // Pause updates
    if (currentLevel.cleanup) currentLevel.cleanup();
    
    levelMessageEl.textContent = message;
    levelMessageEl.style.transform = `rotate(${rotation}deg)`;
    levelMessageEl.classList.remove('hidden');

    playWinSound(audioContext);
    
    setTimeout(goToNextLevel, 2500);
}

function startEnding() {
    gameState.currentScene = 'ending';
    cubes = [];
    levelMessageEl.textContent = "PERSPECTIVE";
    levelMessageEl.style.transform = 'rotate(0deg)';
    levelMessageEl.classList.remove('hidden');
    levelMessageEl.style.opacity = 0;
    
    let opacity = 0;
    const fadeInInterval = setInterval(() => {
        opacity += 0.02;
        levelMessageEl.style.opacity = opacity;
        if (opacity >= 1) clearInterval(fadeInInterval);
    }, 50);
}

// ====================================================================
// --- MAIN GAME LOOP ---
// ====================================================================

function gameLoop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  switch(gameState.currentScene) {
    case 'title':
      updateTitleScreenAnimation();
      drawTransition();
      drawTitle();
      break;
    case 'level-transition':
       // Draw previous level state statically
       if (currentLevel && currentLevel.draw) currentLevel.draw();
       else { // If coming from title, draw snowflakes
            drawTransition();
       }
      break;
    case 'level':
      if (currentLevel && currentLevel.update) currentLevel.update();
      if (currentLevel && currentLevel.draw) currentLevel.draw();
      break;
    case 'ending':
      // Static, just the message is shown via HTML
      break;
  }
  animationFrameId = requestAnimationFrame(gameLoop);
}

// ====================================================================
// --- EVENT HANDLERS (specific to levels) ---
// ====================================================================

function handleSkillJump() {
    if (cubes[0]) {
        cubes[0].vy = physics.jumpForce;
        playCollisionSound(audioContext, 10);
    }
}

function handlePuzzleDragStart(e) {
  if (cubes.length > 1) return;
  const mainCube = cubes[0];
  if (!mainCube) return;
  gameState.isDragging = true;
  gameState.lastPointerX = e.clientX;
  gameState.lastPointerY = e.clientY;
  gameState.pushOffsetX = e.clientX - mainCube.x;
  gameState.pushOffsetY = e.clientY - mainCube.y;
  mainCube.vx = mainCube.vy = mainCube.vRx = mainCube.vRy = 0;
}

function handlePuzzleDragMove(e) {
  if (!gameState.isDragging) return;
  const mainCube = cubes[0];
  const deltaX = e.clientX - gameState.lastPointerX;
  const deltaY = e.clientY - gameState.lastPointerY;
  gameState.totalDistancePushed += Math.hypot(deltaX, deltaY);
  
  const growthFactor = 1 + (gameState.totalDistancePushed / (canvas.height * 2)) * 1.5;
  const newSize = START_SIZE * growthFactor;
  mainCube.size = Math.min(newSize, canvas.width / 4);
  mainCube.mass = Math.pow(mainCube.size/START_SIZE, 3);
  
  mainCube.vx += (deltaX * physics.pushMultiplier) / mainCube.mass;
  mainCube.vy += (deltaY * physics.pushMultiplier) / mainCube.mass;
  
  const rotationalMultiplier = 0.00005;
  mainCube.vRx -= (deltaY * gameState.pushOffsetX * rotationalMultiplier) / mainCube.mass;
  mainCube.vRy += (deltaX * gameState.pushOffsetY * rotationalMultiplier) / mainCube.mass;
  
  gameState.lastPointerX = e.clientX;
  gameState.lastPointerY = e.clientY;
}

function handleIQDragMove(e) {
    if (!gameState.isDragging) return;
    const mainCube = cubes[0];
    const deltaX = e.clientX - gameState.lastPointerX;
    const deltaY = e.clientY - gameState.lastPointerY;
    
    // In IQ level, drag only rotates
    mainCube.vRx -= deltaY * 0.001;
    mainCube.vRy += deltaX * 0.001;
    
    gameState.lastPointerX = e.clientX;
    gameState.lastPointerY = e.clientY;
}

function handlePuzzleDragEnd() {
  gameState.isDragging = false;
}

function handleDeviceOrientation(e) {
  if (e.beta === null) return;
  // Beta: front-back tilt. Negative is forward.
  if (e.beta < -45) gameState.upwardForce = 0.2;
  else gameState.upwardForce = 0;
}


// ====================================================================
// --- GENERIC DRAWING & UTILS ---
// ====================================================================

function checkWallCollisions(cube) {
    const halfSize = cube.size / 2;
    if (cube.y > canvas.height - halfSize) { playCollisionSound(audioContext, Math.abs(cube.vy)); cube.y = canvas.height - halfSize; cube.vy *= physics.bounce; }
    if (cube.y < halfSize) { playCollisionSound(audioContext, Math.abs(cube.vy)); cube.y = halfSize; cube.vy *= physics.bounce; }
    if (cube.x < halfSize) { playCollisionSound(audioContext, Math.abs(cube.vx)); cube.x = halfSize; cube.vx *= physics.bounce; }
    if (cube.x > canvas.width - halfSize) { playCollisionSound(audioContext, Math.abs(cube.vx)); cube.x = canvas.width - halfSize; cube.vx *= physics.bounce; }
}

function drawGameUI() {
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.strokeRect(targetZone.x - targetZone.size / 2, targetZone.y - targetZone.size / 2, targetZone.size, targetZone.size);
}

function drawWireframeObject(obj, vertices, edges, projectionBuffer) {
  ctx.save();
  ctx.translate(obj.x, obj.y);
  const halfSize = obj.size / 2;
  const sX = Math.sin(obj.rotationX); const cX = Math.cos(obj.rotationX);
  const sY = Math.sin(obj.rotationY); const cY = Math.cos(obj.rotationY);
  vertices.forEach((v, i) => {
    const rotX_y = v.y * cX - v.z * sX; const rotX_z = v.y * sX + v.z * cX;
    const rotY_x = v.x * cY + rotX_z * sY;
    projectionBuffer[i] = { x: rotY_x * halfSize, y: rotX_y * halfSize };
  });
  ctx.strokeStyle = obj.alpha ? `rgba(255, 255, 255, ${obj.alpha})` : '#FFFFFF';
  ctx.lineWidth = 2;
  ctx.beginPath();
  edges.forEach(edge => {
    ctx.moveTo(projectionBuffer[edge[0]].x, projectionBuffer[edge[0]].y);
    ctx.lineTo(projectionBuffer[edge[1]].x, projectionBuffer[edge[1]].y);
  });
  ctx.stroke();
  ctx.restore();
}

// ====================================================================
// --- TITLE SCREEN & TRANSITION (mostly unchanged) ---
// ====================================================================
function handleTitleTap() {
    titleScreenEl.removeEventListener('pointerdown', handleTitleTap);
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        windSoundNode = startWindSound(audioContext);
        startMusicLoop(audioContext);
        const now = audioContext.currentTime;
        windSoundNode.windGain.gain.linearRampToValueAtTime(0, now + 5);
        setTimeout(() => { if (windSoundNode) { windSoundNode.noiseSource.stop(); windSoundNode.lfo.stop(); windSoundNode = null; } }, 5100);
    }
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission()
            .catch(console.error)
            .finally(startInitialTransition);
    } else {
        startInitialTransition();
    }
}
function startInitialTransition() {
    gameState.currentScene = 'level-transition';
    titleScreenEl.style.opacity = '0';
    setTimeout(() => { 
        titleScreenEl.style.display = 'none';
        goToNextLevel();
     }, 500);
}
function initializeTitleCubes() {
    transitionState.cubes = [];
    for (let i = 0; i < 150; i++) {
        const initialX = Math.random() * canvas.width;
        transitionState.cubes.push({ x: initialX, y: Math.random() * canvas.height, size: 5 + Math.random() * 10, rotationX: Math.random() * Math.PI * 2, rotationY: Math.random() * Math.PI * 2, vRx: (Math.random() - 0.5) * 0.02, vRy: (Math.random() - 0.5) * 0.02, speed: 0.5 + Math.random() * 1, initialX: initialX, swayAngle: Math.random() * Math.PI * 2, swayFrequency: 0.01 + Math.random() * 0.01, swayAmplitude: 20 + Math.random() * 40, alpha: 0.4 + Math.random() * 0.6 });
    }
}
function updateTitleScreenAnimation() {
    transitionState.cubes.forEach(cube => {
        cube.y += cube.speed;
        cube.rotationX += cube.vRx;
        cube.rotationY += cube.vRy;
        cube.swayAngle += cube.swayFrequency;
        cube.x = cube.initialX + Math.sin(cube.swayAngle) * cube.swayAmplitude;
        if (cube.y - cube.size > canvas.height) {
            cube.y = -cube.size;
            cube.initialX = Math.random() * canvas.width;
        }
    });
}
function drawTransition() {
  transitionState.cubes.forEach(c => drawWireframeObject(c, UNIT_CUBE_VERTICES, CUBE_EDGES, projectedVertices));
}
function extrudeShape(shapeDef) {
    const { path, holes = [] } = shapeDef; const vertices = []; const faces = []; const depth = 1; const shearX = -0.7; const shearY = 0.7;
    [...path, ...holes.flat()].forEach(p => { vertices.push({ x: p[0] - 2, y: p[1] - 2.5, z: -depth / 2 }); vertices.push({ x: p[0] - 2 + shearX, y: p[1] - 2.5 + shearY, z: depth / 2 }); });
    function createFaces(pointPath, offset) {
        const frontFace = [], backFace = [];
        for (let i = 0; i < pointPath.length; i++) { frontFace.push(offset + i * 2); backFace.push(offset + i * 2 + 1); }
        faces.push({ vertices: frontFace, color: '#FFFFFF', type: 'front' }); faces.push({ vertices: backFace.reverse(), color: '#FFFFFF', type: 'back' });
        for (let i = 0; i < pointPath.length; i++) { const p1 = offset + i * 2; const p2 = offset + ((i + 1) % pointPath.length) * 2; faces.push({ vertices: [p1, p2, p2 + 1, p1 + 1], color: '#FFFFFF', type: 'side' }); }
    }
    createFaces(path, 0); let offset = path.length * 2; holes.forEach(holePath => { createFaces(holePath, offset); offset += holePath.length * 2; });
    return { vertices, faces };
}
function draw3DObject(mesh, x, y, size, rotX, rotY) {
    const { vertices, faces } = mesh; const sX = Math.sin(rotX); const cX = Math.cos(rotX); const sY = Math.sin(rotY); const cY = Math.cos(rotY);
    const projected = vertices.map(v => { const rotX_y = v.y * cX - v.z * sX; const rotX_z = v.y * sX + v.z * cX; const rotY_x = v.x * cY + rotX_z * sY; const rotY_z = -v.x * sY + rotX_z * cY; return { x: x + rotY_x * size, y: y + rotX_y * size, z: rotY_z }; });
    faces.forEach(face => { face.avgZ = face.vertices.reduce((sum, i) => sum + projected[i].z, 0) / face.vertices.length; });
    faces.sort((a, b) => a.avgZ - b.avgZ);
    faces.forEach(face => {
        ctx.beginPath(); const first = projected[face.vertices[0]]; ctx.moveTo(first.x, first.y);
        for (let i = 1; i < face.vertices.length; i++) ctx.lineTo(projected[face.vertices[i]].x, projected[face.vertices[i]].y);
        ctx.closePath(); ctx.fillStyle = face.color; ctx.fill(); ctx.strokeStyle = '#000000'; ctx.lineWidth = 2; ctx.stroke();
    });
}
function drawTitle() {
    const scale = Math.min(canvas.width / 35, canvas.height / 25); const charWidth = scale * 4.5; const lineHeight = scale * 6; const subtextHeight = 20; const totalHeight = lineHeight * 2 + subtextHeight;
    const startY = (canvas.height / 3 - totalHeight / 2) + 60;
    const drawLine = (text, yOffset) => {
        let currentX = canvas.width / 2 - (text.length * charWidth) / 2 + charWidth / 2;
        for (const char of text) { if (titleState.letterMeshes[char]) draw3DObject(titleState.letterMeshes[char], currentX, yOffset, scale, 0, 0); currentX += charWidth; }
    };
    drawLine("SNOW", startY + lineHeight / 2); drawLine("BLOCK", startY + lineHeight * 1.5);
    const flash = (Math.sin(Date.now() / 400) + 1) / 2;
    ctx.fillStyle = `rgba(255, 255, 255, ${0.4 + flash * 0.6})`; ctx.font = '16px "Helvetica Neue", Arial, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText("Tap to begin", canvas.width / 2, startY + lineHeight * 2 + subtextHeight / 2 + 50);
}

// ====================================================================
// --- SOUND SYNTHESIS (unchanged) ---
// ====================================================================
function playCollisionSound(context, velocity) {
    if (!context || velocity < 0.1) return; const osc = context.createOscillator(); const gain = context.createGain(); osc.connect(gain); gain.connect(context.destination); const now = context.currentTime; const peakGain = Math.min(0.4, velocity / 25); const frequency = Math.max(40, 80 - velocity * 2); osc.type = 'sine'; osc.frequency.setValueAtTime(frequency, now); gain.gain.setValueAtTime(peakGain, now); gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2); osc.start(now); osc.stop(now + 0.2);
}
function startMusicLoop(context) {
    if (!context || musicNode) return; const masterGain = context.createGain(); masterGain.gain.setValueAtTime(0, context.currentTime); masterGain.gain.linearRampToValueAtTime(0.2, context.currentTime + 5); masterGain.connect(context.destination); const padOsc = context.createOscillator(); padOsc.type = 'sawtooth'; padOsc.frequency.value = 65.41; const padFilter = context.createBiquadFilter(); padFilter.type = 'lowpass'; padFilter.frequency.value = 440; padFilter.Q.value = 5; const padLFO = context.createOscillator(); padLFO.type = 'sine'; padLFO.frequency.value = 0.1; const lfoGain = context.createGain(); lfoGain.gain.value = 150; padLFO.connect(lfoGain); lfoGain.connect(padFilter.frequency); padOsc.connect(padFilter); padFilter.connect(masterGain); const arpOsc = context.createOscillator(); arpOsc.type = 'triangle'; const arpGain = context.createGain(); arpGain.gain.value = 0; const delay = context.createDelay(5.0); delay.delayTime.value = 0.46875; const feedback = context.createGain(); feedback.gain.value = 0.4; arpOsc.connect(arpGain); arpGain.connect(masterGain); arpGain.connect(delay); delay.connect(feedback); feedback.connect(delay); delay.connect(masterGain); const scale = [130.81, 155.56, 196.00, 233.08, 261.63, 311.13, 392.00]; const sequence = [0, 4, 2, 5, 0, 4, 2, 6, 1, 5, 3, 6, 1, 5, 3, 5, 0, 4, 2, 5, 0, 4, 2, 6, 1, 5, 3, 6, 2, 4, 1, 3]; const loopDuration = 15; const noteTime = loopDuration / sequence.length; let nextNoteTime = context.currentTime; let seqIndex = 0; function scheduleNotes() { while (nextNoteTime < context.currentTime + 0.1) { const noteIndex = sequence[seqIndex % sequence.length]; arpOsc.frequency.setValueAtTime(scale[noteIndex], nextNoteTime); arpGain.gain.cancelScheduledValues(nextNoteTime); arpGain.gain.setValueAtTime(0.5, nextNoteTime); arpGain.gain.exponentialRampToValueAtTime(0.001, nextNoteTime + noteTime * 0.9); nextNoteTime += noteTime; seqIndex++; } } padOsc.start(); padLFO.start(); arpOsc.start(); const schedulerInterval = setInterval(scheduleNotes, 25); musicNode = { masterGain, padOsc, padLFO, arpOsc, schedulerInterval };
}
function startWindSound(context) {
    const bufferSize = context.sampleRate * 2; const buffer = context.createBuffer(1, bufferSize, context.sampleRate); const data = buffer.getChannelData(0); for (let i = 0; i < bufferSize; i++) { data[i] = Math.random() * 2 - 1; } const noiseSource = context.createBufferSource(); noiseSource.buffer = buffer; noiseSource.loop = true; const filter = context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 500; filter.Q.value = 12; const lfo = context.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.4; const lfoGain = context.createGain(); lfoGain.gain.value = 250; const windGain = context.createGain(); windGain.gain.value = 0.15; noiseSource.connect(filter); lfo.connect(lfoGain); lfoGain.connect(filter.frequency); filter.connect(windGain); windGain.connect(context.destination); lfo.start(); noiseSource.start(); return { noiseSource, lfo, windGain };
}
function playWinSound(context) {
    if (!context) return; const osc = context.createOscillator(); const gain = context.createGain(); osc.connect(gain); gain.connect(context.destination); const now = context.currentTime; osc.type = 'triangle'; gain.gain.setValueAtTime(0.3, now); osc.frequency.setValueAtTime(440, now); osc.frequency.setValueAtTime(554.37, now + 0.1); osc.frequency.setValueAtTime(659.25, now + 0.2); osc.frequency.setValueAtTime(880, now + 0.3); gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5); osc.start(now); osc.stop(now + 0.5);
}

// --- INITIALIZATION ---
window.addEventListener('resize', setup);
titleScreenEl.addEventListener('pointerdown', handleTitleTap);
setup();