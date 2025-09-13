/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// --- DOM ELEMENTS ---
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const titleScreenEl = document.getElementById('title-screen');
const instructionsEl = document.getElementById('instructions');
const levelMessageEl = document.getElementById('level-message');

// --- GAME STATE ---
const gameState = {
    currentScene: 'title', // 'title', 'title-outro', 'game', 'won'
    isDragging: false,
    startPointerX: 0,
    startPointerY: 0,
};

const transitionState = { cubes: [] };
const titleState = { letterMeshes: {} };

let cube = null;
let animationFrameId;

// --- AUDIO ---
let audioContext;
let musicNode = null;

// --- GAME CONFIG & PHYSICS ---
const physics = {
  snowDrag: 0.92,
  gravity: 0.5,
  rotationalDamping: 0.97,
  bounce: -0.5,
};
const START_SIZE = 50;
let targetZone = {};

// --- 3D RENDERING DATA (shared) ---
const UNIT_CUBE_VERTICES = [ { x: -1, y: -1, z: -1 }, { x: 1, y: -1, z: -1 }, { x: 1, y: 1, z: -1 }, { x: -1, y: 1, z: -1 }, { x: -1, y: -1, z: 1 }, { x: 1, y: -1, z: 1 }, { x: 1, y: 1, z: 1 }, { x: -1, y: 1, z: 1 }];
const CUBE_EDGES = [ [0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7] ];
const projectedVertices = Array.from({ length: 8 }, () => ({ x: 0, y: 0 }));

const S_PATH = [[4, 5], [0, 5], [0, 3], [3, 3], [3, 2.5], [0, 2.5], [0, 0], [4, 0], [4, 2], [1, 2], [1, 2.5], [4, 2.5], [4, 5], [1, 5], [1, 3], [0, 3]];
const W_PATH = [[0, 0], [1, 0], [1, 3], [2, 0], [3, 3], [3, 0], [4, 0], [4, 5], [3, 5], [2, 2], [1, 5], [0, 5]];
const letterShapes = { 'S': { path: S_PATH }, 'N': { path: [[0, 0], [1, 0], [1, 3], [3, 0], [4, 0], [4, 5], [3, 5], [3, 2], [1, 5], [0, 5]] }, 'O': { path: [[0, 0], [4, 0], [4, 5], [0, 5]], holes: [[[1, 1], [3, 1], [3, 4], [1, 4]]] }, 'W': { path: W_PATH }, 'B': { path: [[0, 0], [3, 0], [4, 1], [4, 2], [3, 2.5], [4, 3], [4, 4], [3, 5], [0, 5]], holes: [[[1, 1], [2, 1], [2, 2], [1, 2]], [[1, 3], [2, 3], [2, 4], [1, 4]]] }, 'L': { path: [[0, 0], [1, 0], [1, 4], [4, 4], [4, 5], [0, 5]] }, 'C': { path: [[4, 0], [0, 0], [0, 5], [4, 5], [4, 4], [1, 4], [1, 1], [4, 1]] }, 'K': { path: [[0, 0], [1, 0], [1, 2], [3, 0], [4, 0], [2, 2.5], [4, 5], [3, 5], [1, 3], [1, 5], [0, 5]] } };

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
        // Animation state
        isAnimating: false, animProgress: 0,
        startX: 0, startY: 0, targetX: 0, targetY: 0,
        startRotX: 0, startRotY: 0, targetRotX: 0, targetRotY: 0,
        ...overrides,
    };
}

function startGame() {
    gameState.currentScene = 'game';
    const platformY = canvas.height - START_SIZE;
    cube = createCube(canvas.width / 2, platformY - START_SIZE / 2, {rotationY: 0.4});
    targetZone = { x: canvas.width / 2, y: 60, size: START_SIZE };

    instructionsEl.textContent = ""; // Remove instruction text
    levelMessageEl.classList.add('hidden');

    canvas.addEventListener('pointerdown', handleDragStart);
    window.addEventListener('pointermove', handleDragMove);
    window.addEventListener('pointerup', handleDragEnd);
}

function winGame() {
    gameState.currentScene = 'won'; // Pause updates
    
    // Cleanup listeners
    canvas.removeEventListener('pointerdown', handleDragStart);
    window.removeEventListener('pointermove', handleDragMove);
    window.removeEventListener('pointerup', handleDragEnd);

    levelMessageEl.textContent = "PERSPECTIVE";
    levelMessageEl.style.transform = 'rotate(0deg)';
    levelMessageEl.classList.remove('hidden');
    levelMessageEl.style.opacity = 0;

    playWinSound(audioContext);
    
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
    case 'title-outro':
      updateTitleScreenAnimation();
      drawTransition();
      checkTransitionEnd();
      break;
    case 'game':
      updateGame();
      drawGame();
      break;
    case 'won':
      // Static, draw the last game state and let the HTML message show
      drawGame();
      break;
  }
  animationFrameId = requestAnimationFrame(gameLoop);
}

// ====================================================================
// --- GAME LOGIC ---
// ====================================================================

function updateGame() {
    if (!cube) return;

    if (cube.isAnimating) {
        const animationSpeed = 0.05; // Adjust for desired animation duration
        cube.animProgress += animationSpeed;
        const easedProgress = easeInOutQuad(cube.animProgress);

        cube.x = lerp(cube.startX, cube.targetX, easedProgress);
        cube.y = lerp(cube.startY, cube.targetY, easedProgress);
        cube.rotationX = lerp(cube.startRotX, cube.targetRotX, easedProgress);
        cube.rotationY = lerp(cube.startRotY, cube.targetRotY, easedProgress);

        if (cube.animProgress >= 1) {
            cube.isAnimating = false;
            cube.x = cube.targetX;
            cube.y = cube.targetY;
            cube.rotationX = cube.targetRotX;
            cube.rotationY = cube.targetRotY;
            // Normalize rotations to prevent them from growing infinitely
            cube.rotationX = cube.rotationX % (Math.PI * 2);
            cube.rotationY = cube.rotationY % (Math.PI * 2);
            
            // Post-animation wall collision check
            const halfSize = cube.size / 2;
            const clampedX = Math.max(halfSize, Math.min(canvas.width - halfSize, cube.x));
            const clampedY = Math.max(halfSize, Math.min(canvas.height - halfSize, cube.y));

            if (clampedX !== cube.x || clampedY !== cube.y) {
                playCollisionSound(audioContext, 5);
                cube.x = clampedX;
                cube.y = clampedY;
            }
        }
    }

    targetZone.size = cube.size; // Dynamic target sizing

    // Win Condition
    const isHorizontallyAligned = Math.abs(cube.x - targetZone.x) < START_SIZE / 2;
    const isVerticallyAligned = Math.abs(cube.y - targetZone.y) < START_SIZE / 2;
    const isCorrectSize = Math.abs(cube.size - START_SIZE) < 5;
    if (isHorizontallyAligned && isVerticallyAligned && isCorrectSize) {
        winGame();
    }
}

function drawGame() {
    drawStartingPlatform();
    drawGameUI();
    if(cube) {
        drawWireframeObject(cube, UNIT_CUBE_VERTICES, CUBE_EDGES, projectedVertices);
    }
}


// ====================================================================
// --- EVENT HANDLERS ---
// ====================================================================

function handleDragStart(e) {
  if (!cube || cube.isAnimating) return; // Prevent interaction during animation
  gameState.isDragging = true;
  gameState.startPointerX = e.clientX;
  gameState.startPointerY = e.clientY;
}

function handleDragMove(e) {
  if (!gameState.isDragging || !cube) return;
  // This function is now intentionally left blank. 
  // All logic is handled on drag end to create a discrete "push" action.
}

function handleDragEnd(e) {
  if (!gameState.isDragging || !cube || cube.isAnimating) return;
  gameState.isDragging = false;

  const deltaX = e.clientX - gameState.startPointerX;
  const deltaY = e.clientY - gameState.startPointerY;
  const dragDistance = Math.hypot(deltaX, deltaY);
  
  const minDragDistance = 30; // Min pixels to drag to trigger a push
  if (dragDistance < minDragDistance) return;

  // Set up animation state
  cube.isAnimating = true;
  cube.animProgress = 0;
  cube.startX = cube.x;
  cube.startY = cube.y;
  cube.startRotX = cube.rotationX;
  cube.startRotY = cube.rotationY;

  // Determine direction and set targets
  if (Math.abs(deltaX) > Math.abs(deltaY)) { // Horizontal push
    const direction = Math.sign(deltaX);
    cube.targetX = cube.x + direction * cube.size;
    cube.targetY = cube.y; // Y position doesn't change
    cube.targetRotX = cube.rotationX;
    cube.targetRotY = cube.rotationY - direction * (Math.PI / 2);
  } else { // Vertical push
    const direction = Math.sign(deltaY);
    cube.targetY = cube.y + direction * cube.size;
    cube.targetX = cube.x; // X position doesn't change
    cube.targetRotY = cube.rotationY;
    cube.targetRotX = cube.rotationX + direction * (Math.PI / 2);
  }

  // Handle cube growth on each push
  const growthFactor = 1.05;
  const newSize = cube.size * growthFactor;
  cube.size = Math.min(newSize, canvas.width / 4);
}

// ====================================================================
// --- GENERIC DRAWING & UTILS ---
// ====================================================================

function lerp(start, end, t) {
  return start * (1 - t) + end * t;
}

function easeInOutQuad(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

function drawStartingPlatform() {
    const platformY = canvas.height - START_SIZE;
    const platformWidth = START_SIZE * 1.2;
    const platformStartX = canvas.width / 2 - platformWidth / 2;
    
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(platformStartX, platformY);
    ctx.lineTo(platformStartX + platformWidth, platformY);
    ctx.stroke();
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
// --- TITLE SCREEN & TRANSITION ---
// ====================================================================
function handleTitleTap() {
    titleScreenEl.removeEventListener('pointerdown', handleTitleTap);
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        startMusicLoop(audioContext);
    }
    // Device orientation permission is no longer needed
    startTitleScreenOutro();
}

function startTitleScreenOutro() {
    titleScreenEl.style.opacity = '0';
    setTimeout(() => { 
        titleScreenEl.style.display = 'none';
     }, 500);

    gameState.currentScene = 'title-outro';
}

function checkTransitionEnd() {
    const allOffscreen = transitionState.cubes.every(c => c.y - c.size > canvas.height);
    if (allOffscreen) {
        startGame();
    }
}

function initializeTitleCubes() {
    transitionState.cubes = [];
    for (let i = 0; i < 150; i++) {
        const initialX = Math.random() * canvas.width;
        transitionState.cubes.push({ x: initialX, y: Math.random() * canvas.height, size: 5 + Math.random() * 10, rotationX: Math.random() * Math.PI * 2, rotationY: Math.random() * Math.PI * 2, vRx: (Math.random() - 0.5) * 0.02, vRy: (Math.random() - 0.5) * 0.02, speed: 0.5 + Math.random() * 1, initialX: initialX, swayAngle: Math.random() * Math.PI * 2, swayFrequency: 0.01 + Math.random() * 0.01, swayAmplitude: 20 + Math.random() * 40, alpha: 0.4 + Math.random() * 0.6 });
    }
}
function updateTitleScreenAnimation() {
    const isOutro = gameState.currentScene === 'title-outro';
    const speedMultiplier = isOutro ? 3.5 : 1; // Speed up the cubes for the outro transition
    transitionState.cubes.forEach(cube => {
        cube.y += cube.speed * speedMultiplier;
        cube.rotationX += cube.vRx;
        cube.rotationY += cube.vRy;
        
        cube.swayAngle += cube.swayFrequency;
        
        cube.x = cube.initialX + Math.sin(cube.swayAngle) * cube.swayAmplitude;

        if (cube.y - cube.size > canvas.height && !isOutro) {
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
// --- SOUND SYNTHESIS ---
// ====================================================================
function playCollisionSound(context, velocity) {
    if (!context || velocity < 0.1) return; const osc = context.createOscillator(); const gain = context.createGain(); osc.connect(gain); gain.connect(context.destination); const now = context.currentTime; const peakGain = Math.min(0.4, velocity / 25); const frequency = Math.max(40, 80 - velocity * 2); osc.type = 'sine'; osc.frequency.setValueAtTime(frequency, now); gain.gain.setValueAtTime(peakGain, now); gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2); osc.start(now); osc.stop(now + 0.2);
}
function startMusicLoop(context) {
    if (!context || musicNode) return; const masterGain = context.createGain(); masterGain.gain.setValueAtTime(0, context.currentTime); masterGain.gain.linearRampToValueAtTime(0.2, context.currentTime + 5); masterGain.connect(context.destination); const padOsc = context.createOscillator(); padOsc.type = 'sawtooth'; padOsc.frequency.value = 65.41; const padFilter = context.createBiquadFilter(); padFilter.type = 'lowpass'; padFilter.frequency.value = 440; padFilter.Q.value = 5; const padLFO = context.createOscillator(); padLFO.type = 'sine'; padLFO.frequency.value = 0.1; const lfoGain = context.createGain(); lfoGain.gain.value = 150; padLFO.connect(lfoGain); lfoGain.connect(padFilter.frequency); padOsc.connect(padFilter); padFilter.connect(masterGain); const arpOsc = context.createOscillator(); arpOsc.type = 'triangle'; const arpGain = context.createGain(); arpGain.gain.value = 0; const delay = context.createDelay(5.0); delay.delayTime.value = 0.46875; const feedback = context.createGain(); feedback.gain.value = 0.4; arpOsc.connect(arpGain); arpGain.connect(masterGain); arpGain.connect(delay); delay.connect(feedback); feedback.connect(delay); delay.connect(masterGain); const scale = [130.81, 155.56, 196.00, 233.08, 261.63, 311.13, 392.00]; const sequence = [0, 4, 2, 5, 0, 4, 2, 6, 1, 5, 3, 6, 1, 5, 3, 5, 0, 4, 2, 5, 0, 4, 2, 6, 1, 5, 3, 6, 2, 4, 1, 3]; const loopDuration = 15; const noteTime = loopDuration / sequence.length; let nextNoteTime = context.currentTime; let seqIndex = 0; function scheduleNotes() { while (nextNoteTime < context.currentTime + 0.1) { const noteIndex = sequence[seqIndex % sequence.length]; arpOsc.frequency.setValueAtTime(scale[noteIndex], nextNoteTime); arpGain.gain.cancelScheduledValues(nextNoteTime); arpGain.gain.setValueAtTime(0.5, nextNoteTime); arpGain.gain.exponentialRampToValueAtTime(0.001, nextNoteTime + noteTime * 0.9); nextNoteTime += noteTime; seqIndex++; } } padOsc.start(); padLFO.start(); arpOsc.start(); const schedulerInterval = setInterval(scheduleNotes, 25); musicNode = { masterGain, padOsc, padLFO, arpOsc, schedulerInterval };
}
function playWinSound(context) {
    if (!context) return; const osc = context.createOscillator(); const gain = context.createGain(); osc.connect(gain); gain.connect(context.destination); const now = context.currentTime; osc.type = 'triangle'; gain.gain.setValueAtTime(0.3, now); osc.frequency.setValueAtTime(440, now); osc.frequency.setValueAtTime(554.37, now + 0.1); osc.frequency.setValueAtTime(659.25, now + 0.2); osc.frequency.setValueAtTime(880, now + 0.3); gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5); osc.start(now); osc.stop(now + 0.5);
}

// --- INITIALIZATION ---
window.addEventListener('resize', setup);
titleScreenEl.addEventListener('pointerdown', handleTitleTap);
setup();