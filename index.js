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
    currentScene: 'title', // 'title', 'title-outro', 'game', 'won', 'collapsing', 'restarting'
    isDragging: false,
    startPointerX: 0,
    startPointerY: 0,
};

const transitionState = { cubes: [], uiAlpha: 0 };
const restartTransitionState = { cubes: [] };
const titleState = { letterMeshes: {} };

let cube = null;
let collapseParticles = [];
let collapseState = { floorY: 0 };
let animationFrameId;

// --- AUDIO ---
let audioContext;
let musicNode = null;

// --- GAME CONFIG & PHYSICS ---
const physics = {
  gravity: 0.5,
  bounce: -0.5,
};

// DYNAMIC SIZING FOR RESPONSIVENESS
let START_SIZE = 50;
let SCREEN_PADDING = 5;
let targetZone = {};

// --- 3D RENDERING DATA (shared) ---
const UNIT_CUBE_VERTICES = [ { x: -1, y: -1, z: -1 }, { x: 1, y: -1, z: -1 }, { x: 1, y: 1, z: -1 }, { x: -1, y: 1, z: -1 }, { x: -1, y: -1, z: 1 }, { x: 1, y: -1, z: 1 }, { x: 1, y: 1, z: 1 }, { x: -1, y: 1, z: 1 }];
const CUBE_EDGES = [ [0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7] ];
const CUBE_FACES = [ [4, 5, 6, 7], [0, 3, 2, 1], [3, 7, 6, 2], [0, 4, 5, 1], [1, 5, 6, 2], [0, 3, 7, 4] ];
const projectedVertices = Array.from({ length: 8 }, () => ({ x: 0, y: 0, z: 0 }));

const S_PATH = [[0, 5], [4, 5], [4, 3], [1, 3], [1, 2], [4, 2], [4, 0], [0, 0], [0, 2], [3, 2], [3, 3], [0, 3]];
const W_PATH = [[0, 0], [1, 0], [1, 3], [2, 0], [3, 3], [3, 0], [4, 0], [4, 5], [3, 5], [2, 2], [1, 5], [0, 5]];
const letterShapes = { 'S': { path: S_PATH }, 'N': { path: [[0, 0], [1, 0], [1, 3], [3, 0], [4, 0], [4, 5], [3, 5], [3, 2], [1, 5], [0, 5]] }, 'O': { path: [[0, 0], [4, 0], [4, 5], [0, 5]], holes: [[[1, 1], [3, 1], [3, 4], [1, 4]]] }, 'W': { path: W_PATH }, 'B': { path: [[0, 0], [3, 0], [4, 1], [4, 2], [3, 2.5], [4, 3], [4, 4], [3, 5], [0, 5]], holes: [[[1, 1], [2, 1], [2, 2], [1, 2]], [[1, 3], [2, 3], [2, 4], [1, 4]]] }, 'L': { path: [[0, 0], [1, 0], [1, 4], [4, 4], [4, 5], [0, 5]] }, 'C': { path: [[4, 0], [0, 0], [0, 5], [4, 5], [4, 4], [1, 4], [1, 1], [4, 1]] }, 'K': { path: [[0, 0], [1, 0], [1, 2], [3, 0], [4, 0], [2, 2.5], [4, 5], [3, 5], [1, 3], [1, 5], [0, 5]] } };

// ====================================================================
// --- CORE GAME FLOW & SETUP ---
// ====================================================================

function setup() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  // Make game elements responsive
  START_SIZE = Math.max(40, Math.min(canvas.width, canvas.height) * 0.1);
  SCREEN_PADDING = START_SIZE * 0.1;
  targetZone = { x: canvas.width / 2, y: START_SIZE * 1.2, size: START_SIZE };

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
    const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    return {
        size: START_SIZE, x, y, prevX: x, prevY: y, mass: 1, vx: 0, vy: 0,
        orientation: [...identity],
        isAnimating: false, animProgress: 0,
        startX: 0, startY: 0, targetX: 0, targetY: 0,
        startOrientation: [...identity],
        animationAxis: null,
        animationAngle: 0,
        rollCount: 0,
        collapseRollTarget: Math.floor(Math.random() * 6) + 8, // 8 to 13 rolls
        ...overrides,
    };
}

function startGame() {
    gameState.currentScene = 'game';
    collapseParticles = [];
    collapseState.floorY = 0;
    const platformY = canvas.height - START_SIZE;
    const initialGap = 10;
    cube = createCube(canvas.width / 2, platformY - START_SIZE / 2 - initialGap);

    instructionsEl.textContent = "";
    levelMessageEl.classList.add('hidden');

    setTimeout(showTutorial, 2000);

    canvas.addEventListener('pointerdown', handleDragStart);
    window.addEventListener('pointerup', handleDragEnd);
}

function showTutorial() {
    const tutorialOverlayEl = document.getElementById('tutorial-overlay');
    const tutorialFingerEl = document.getElementById('tutorial-finger');

    if (!tutorialOverlayEl || !tutorialFingerEl) return;

    tutorialOverlayEl.classList.remove('hidden');
    
    setTimeout(() => {
        tutorialOverlayEl.style.opacity = '1';
        tutorialOverlayEl.classList.add('animate');
    }, 10);

    const onAnimationEnd = () => {
        tutorialFingerEl.removeEventListener('animationend', onAnimationEnd);

        tutorialOverlayEl.style.opacity = '0';
        
        setTimeout(() => {
            tutorialOverlayEl.classList.add('hidden');
            tutorialOverlayEl.classList.remove('animate');
        }, 500);
    };

    tutorialFingerEl.addEventListener('animationend', onAnimationEnd);
}

function winGame() {
    gameState.currentScene = 'won';
    
    canvas.removeEventListener('pointerdown', handleDragStart);
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
      if (transitionState.uiAlpha < 1) {
        transitionState.uiAlpha = Math.min(1, transitionState.uiAlpha + 0.02);
      }
      drawStartingPlatform(transitionState.uiAlpha);
      drawGameUI(transitionState.uiAlpha);
      updateTitleScreenAnimation();
      drawTransition();
      checkTransitionEnd();
      break;
    case 'game':
      updateGame();
      drawGame();
      break;
    case 'collapsing':
      updateCollapse();
      drawGame();
      drawCollapse();
      break;
    case 'restarting':
      updateRestartTransition();
      drawGame();
      drawCollapse();
      drawRestartTransition();
      break;
    case 'won':
      drawGame();
      break;
  }
  animationFrameId = requestAnimationFrame(gameLoop);
}

// ====================================================================
// --- GAME LOGIC ---
// ====================================================================

let renderOrientation;

function updateGame() {
    if (!cube) return;

    if (cube.isAnimating) {
        const animationSpeed = (0.05 * START_SIZE) / cube.size;
        cube.animProgress += animationSpeed;
        const easedProgress = easeInOutQuad(cube.animProgress);

        cube.x = lerp(cube.startX, cube.targetX, easedProgress);
        cube.y = lerp(cube.startY, cube.targetY, easedProgress);
        
        const currentAngle = cube.animationAngle * easedProgress;
        const animationRotationMatrix = createRotationMatrix(cube.animationAxis, currentAngle);
        renderOrientation = multiplyMatrices(animationRotationMatrix, cube.startOrientation);

        if (cube.animProgress >= 1) {
            cube.isAnimating = false;
            cube.x = cube.targetX;
            cube.y = cube.targetY;

            const moveRotationMatrix = createRotationMatrix(cube.animationAxis, cube.animationAngle);
            cube.orientation = multiplyMatrices(moveRotationMatrix, cube.startOrientation);

            cube.animationAxis = null;
            cube.animationAngle = 0;
            
            const halfSize = cube.size / 2;
            const clampedX = Math.max(halfSize, Math.min(canvas.width - halfSize, cube.x));
            const clampedY = Math.max(halfSize, Math.min(canvas.height - halfSize, cube.y));

            if (clampedX !== cube.x || clampedY !== cube.y) {
                playCollisionSound(audioContext, 5);
                cube.x = clampedX;
                cube.y = clampedY;
            }
        }
    } else {
        renderOrientation = cube.orientation;
    }

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
    if (cube) {
        drawSolidObject(cube, UNIT_CUBE_VERTICES, CUBE_FACES, projectedVertices, renderOrientation);
    }
}

function triggerCollapse() {
    gameState.currentScene = 'collapsing';
    playCollapseSound(audioContext);

    collapseState.floorY = cube.y + cube.size;

    const breakdown = 3;
    const baseParticleSize = cube.size / breakdown;
    collapseParticles = [];

    for (let i = 0; i < breakdown; i++) {
        for (let j = 0; j < breakdown; j++) {
            for (let k = 0; k < breakdown; k++) {
                const offsetX = (i - (breakdown - 1) / 2) * baseParticleSize;
                const offsetY = (j - (breakdown - 1) / 2) * baseParticleSize;
                
                const x = cube.x + offsetX + (Math.random() - 0.5) * baseParticleSize * 0.2;
                const y = cube.y + offsetY + (Math.random() - 0.5) * baseParticleSize * 0.2;

                const sizeVariation = 0.5 + Math.random();
                const particleSize = baseParticleSize * sizeVariation;

                collapseParticles.push({
                    x, y,
                    size: particleSize,
                    vx: (Math.random() - 0.5) * 3,
                    vy: (Math.random() - 0.5) * 3 - 2,
                    vRx: (Math.random() - 0.5) * 0.1,
                    vRy: (Math.random() - 0.5) * 0.1,
                    orientation: [...cube.orientation]
                });
            }
        }
    }

    cube = null;

    canvas.removeEventListener('pointerdown', handleDragStart);
    window.removeEventListener('pointerup', handleDragEnd);
    
    canvas.addEventListener('pointerdown', handleRestartSwipeStart);

    levelMessageEl.textContent = "TOO BIG";
    levelMessageEl.style.transform = 'rotate(0deg)';
    levelMessageEl.classList.remove('hidden');
    levelMessageEl.style.opacity = 0;
    
    instructionsEl.textContent = "Swipe to restart";
    instructionsEl.style.opacity = '1';

    let opacity = 0;
    const fadeInInterval = setInterval(() => {
        opacity += 0.05;
        levelMessageEl.style.opacity = opacity;
        if (opacity >= 1) clearInterval(fadeInInterval);
    }, 50);
}

function updateCollapse() {
    const groundY = collapseState.floorY;
    const friction = 0.85;
    const rotationalFriction = 0.96;

    collapseParticles.forEach(p => {
        p.vy += physics.gravity;
        p.x += p.vx;
        p.y += p.vy;

        const rotDeltaX = createRotationMatrix('x', p.vRx);
        const rotDeltaY = createRotationMatrix('y', p.vRy);
        p.orientation = multiplyMatrices(rotDeltaX, p.orientation);
        p.orientation = multiplyMatrices(rotDeltaY, p.orientation);

        const halfSize = p.size / 2;
        if (p.y + halfSize > groundY) {
            p.y = groundY - halfSize;
            p.vy *= physics.bounce;
            p.vx *= friction;
            p.vRx *= rotationalFriction;
            p.vRy *= rotationalFriction;
            if (Math.abs(p.vy) < 0.5) p.vy = 0;
        }
        
        if (p.x - halfSize < 0) {
            p.x = halfSize;
            p.vx *= physics.bounce;
        } else if (p.x + halfSize > canvas.width) {
            p.x = canvas.width - halfSize;
            p.vx *= physics.bounce;
        }
    });
}

function drawCollapse() {
    collapseParticles.forEach(p => {
        drawSolidObject(p, UNIT_CUBE_VERTICES, CUBE_FACES, projectedVertices, p.orientation);
    });
}


// ====================================================================
// --- EVENT HANDLERS ---
// ====================================================================

function handleDragStart(e) {
  if (!cube || cube.isAnimating) return;
  gameState.isDragging = true;
  gameState.startPointerX = e.clientX;
  gameState.startPointerY = e.clientY;
}

function handleDragEnd(e) {
  if (!gameState.isDragging || !cube || cube.isAnimating) return;
  gameState.isDragging = false;

  const deltaX = e.clientX - gameState.startPointerX;
  const deltaY = e.clientY - gameState.startPointerY;
  const dragDistance = Math.hypot(deltaX, deltaY);
  
  const minDragDistance = 30;
  if (dragDistance < minDragDistance) return;

  cube.isAnimating = true;
  cube.animProgress = 0;
  cube.startX = cube.x;
  cube.startY = cube.y;
  cube.startOrientation = [...cube.orientation];

  const direction = Math.abs(deltaX) > Math.abs(deltaY) ? Math.sign(deltaX) : Math.sign(deltaY);
  const halfSize = cube.size / 2;
  
  if (Math.abs(deltaX) > Math.abs(deltaY)) {
    cube.targetX = cube.x + direction * cube.size;
    cube.targetY = cube.y;
    
    if (cube.targetX + halfSize > canvas.width - SCREEN_PADDING || cube.targetX - halfSize < SCREEN_PADDING) {
        playCollisionSound(audioContext, 5);
        cube.isAnimating = false;
        return;
    }

    cube.animationAxis = 'y';
    cube.animationAngle = direction * (Math.PI / 2);
  } else {
    const platformY = canvas.height - START_SIZE;
    const potentialTargetY = cube.y + direction * cube.size;

    if (direction > 0 && (potentialTargetY + halfSize > platformY)) {
        playCollisionSound(audioContext, 5);
        cube.isAnimating = false;
        return;
    }
    
    if (direction < 0 && (potentialTargetY - halfSize < SCREEN_PADDING)) {
        playCollisionSound(audioContext, 5);
        cube.isAnimating = false;
        return;
    }

    cube.targetY = potentialTargetY;
    cube.targetX = cube.x;
    cube.animationAxis = 'x';
    cube.animationAngle = direction * (Math.PI / 2);
  }

  cube.rollCount++;
  
  const growthFactor = 1.05;
  const newSize = cube.size * growthFactor;
  cube.size = Math.min(newSize, START_SIZE * 4);

  if (cube.rollCount >= cube.collapseRollTarget) {
    triggerCollapse();
  }
}

let restartSwipeState = {
    isSwiping: false,
    startX: 0,
    startY: 0,
};

function handleRestartSwipeStart(e) {
    restartSwipeState.isSwiping = true;
    restartSwipeState.startX = e.clientX;
    restartSwipeState.startY = e.clientY;
    window.addEventListener('pointerup', handleRestartSwipeEnd, { once: true });
}

function handleRestartSwipeEnd(e) {
    if (!restartSwipeState.isSwiping) return;
    restartSwipeState.isSwiping = false;

    const deltaX = e.clientX - restartSwipeState.startX;
    const deltaY = e.clientY - restartSwipeState.startY;
    const dragDistance = Math.hypot(deltaX, deltaY);
    const swipeThreshold = 50; 

    if (dragDistance > swipeThreshold) {
        canvas.removeEventListener('pointerdown', handleRestartSwipeStart);
        
        const vec = { x: deltaX / dragDistance, y: deltaY / dragDistance };
        const perpVec = { x: -vec.y, y: vec.x };
        const speed = 25 + Math.random() * 10;
        
        restartTransitionState.cubes = [];
        for (let i = 0; i < 80; i++) {
            const spread = (Math.random() - 0.5) * Math.max(canvas.width, canvas.height) * 2.5;
            const startX = (canvas.width / 2) - vec.x * (canvas.width / 2 + 100) + perpVec.x * spread;
            const startY = (canvas.height / 2) - vec.y * (canvas.height / 2 + 100) + perpVec.y * spread;
            
            restartTransitionState.cubes.push({
                baseX: startX, baseY: startY,
                x: startX, y: startY,
                vx: vec.x * speed, vy: vec.y * speed,
                perpVec: perpVec,
                swayAngle: Math.random() * Math.PI * 2,
                swayFrequency: 0.04 + Math.random() * 0.04,
                swayAmplitude: 20 + Math.random() * 40,
                size: 5 + Math.random() * 10,
                rotationX: Math.random() * Math.PI * 2,
                rotationY: Math.random() * Math.PI * 2,
                vRx: (Math.random() - 0.5) * 0.1,
                vRy: (Math.random() - 0.5) * 0.1,
                alpha: 0.4 + Math.random() * 0.6
            });
        }
        gameState.currentScene = 'restarting';
    }
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

function createRotationMatrix(axis, angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    if (axis === 'x') {
        return [1, 0, 0, 0, c, -s, 0, s, c];
    } else if (axis === 'y') {
        return [c, 0, s, 0, 1, 0, -s, 0, c];
    }
    return [1, 0, 0, 0, 1, 0, 0, 0, 1];
}

function multiplyMatrices(a, b) {
    const c = Array(9);
    c[0] = a[0] * b[0] + a[1] * b[3] + a[2] * b[6];
    c[1] = a[0] * b[1] + a[1] * b[4] + a[2] * b[7];
    c[2] = a[0] * b[2] + a[1] * b[5] + a[2] * b[8];
    c[3] = a[3] * b[0] + a[4] * b[3] + a[5] * b[6];
    c[4] = a[3] * b[1] + a[4] * b[4] + a[5] * b[7];
    c[5] = a[3] * b[2] + a[4] * b[5] + a[5] * b[8];
    c[6] = a[6] * b[0] + a[7] * b[3] + a[8] * b[6];
    c[7] = a[6] * b[1] + a[7] * b[4] + a[8] * b[7];
    c[8] = a[6] * b[2] + a[7] * b[5] + a[8] * b[8];
    return c;
}

function transformVertex(v, m) {
    return {
        x: v.x * m[0] + v.y * m[1] + v.z * m[2],
        y: v.x * m[3] + v.y * m[4] + v.z * m[5],
        z: v.x * m[6] + v.y * m[7] + v.z * m[8],
    };
}


function drawStartingPlatform(alpha = 1) {
    const platformY = canvas.height - START_SIZE;
    const platformWidth = START_SIZE * 1.2;
    const platformStartX = canvas.width / 2 - platformWidth / 2;
    
    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(platformStartX, platformY);
    ctx.lineTo(platformStartX + platformWidth, platformY);
    ctx.stroke();
}

function drawGameUI(alpha = 1) {
    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(targetZone.x - targetZone.size / 2, targetZone.y - targetZone.size / 2, targetZone.size, targetZone.size);
}

function drawSolidObject(obj, vertices, faces, projectionBuffer, orientation) {
    ctx.save();
    ctx.translate(obj.x, obj.y);
    const halfSize = obj.size / 2;

    vertices.forEach((v, i) => {
        const rotatedV = transformVertex(v, orientation);
        projectionBuffer[i] = {
            x: rotatedV.x * halfSize,
            y: rotatedV.y * halfSize,
            z: rotatedV.z * halfSize
        };
    });

    const renderableFaces = faces.map(faceIndices => {
        const avgZ = faceIndices.reduce((sum, i) => sum + projectionBuffer[i].z, 0) / faceIndices.length;
        return { vertices: faceIndices, avgZ: avgZ };
    });

    renderableFaces.sort((a, b) => a.avgZ - b.avgZ);

    renderableFaces.forEach(face => {
        ctx.beginPath();
        const firstVertexIndex = face.vertices[0];
        ctx.moveTo(projectionBuffer[firstVertexIndex].x, projectionBuffer[firstVertexIndex].y);
        for (let i = 1; i < face.vertices.length; i++) {
            const vertexIndex = face.vertices[i];
            ctx.lineTo(projectionBuffer[vertexIndex].x, projectionBuffer[vertexIndex].y);
        }
        ctx.closePath();
        
        ctx.fillStyle = obj.alpha ? `rgba(0, 0, 0, ${obj.alpha})` : '#000000';
        ctx.strokeStyle = obj.alpha ? `rgba(255, 255, 255, ${obj.alpha})` : '#FFFFFF';
        ctx.lineWidth = 2;
        
        ctx.fill();
        ctx.stroke();
    });

    ctx.restore();
}

function drawWireframeObject(obj, vertices, edges, projectionBuffer, orientation) {
  ctx.save();
  ctx.translate(obj.x, obj.y);
  const halfSize = obj.size / 2;

  vertices.forEach((v, i) => {
    const rotatedV = transformVertex(v, orientation);
    projectionBuffer[i] = { x: rotatedV.x * halfSize, y: rotatedV.y * halfSize, z: rotatedV.z * halfSize };
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
    for (let i = 0; i < 80; i++) {
        const initialX = Math.random() * canvas.width;
        transitionState.cubes.push({ x: initialX, y: Math.random() * canvas.height, size: 5 + Math.random() * 10, rotationX: Math.random() * Math.PI * 2, rotationY: Math.random() * Math.PI * 2, vRx: (Math.random() - 0.5) * 0.02, vRy: (Math.random() - 0.5) * 0.02, speed: 0.5 + Math.random() * 1, initialX: initialX, swayAngle: Math.random() * Math.PI * 2, swayFrequency: 0.01 + Math.random() * 0.01, swayAmplitude: 20 + Math.random() * 40, alpha: 0.4 + Math.random() * 0.6 });
    }
}
function updateTitleScreenAnimation() {
    const isOutro = gameState.currentScene === 'title-outro';
    const speedMultiplier = isOutro ? 3.5 : 1;
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
    transitionState.cubes.forEach(c => {
        const rotX = createRotationMatrix('x', c.rotationX);
        const rotY = createRotationMatrix('y', c.rotationY);
        const orientation = multiplyMatrices(rotY, rotX);
        drawWireframeObject(c, UNIT_CUBE_VERTICES, CUBE_EDGES, projectedVertices, orientation);
    });
}

function updateRestartTransition() {
    if (parseFloat(levelMessageEl.style.opacity) > 0) {
        let newOpacity = Math.max(0, parseFloat(levelMessageEl.style.opacity) - 0.03);
        levelMessageEl.style.opacity = newOpacity;
        instructionsEl.style.opacity = newOpacity;
    }

    if (restartTransitionState.cubes.length === 0) return;

    let activeCubes = 0;
    restartTransitionState.cubes.forEach(c => {
        c.baseX += c.vx;
        c.baseY += c.vy;

        c.swayAngle += c.swayFrequency;
        const swayOffset = Math.sin(c.swayAngle) * c.swayAmplitude;
        c.x = c.baseX + c.perpVec.x * swayOffset;
        c.y = c.baseY + c.perpVec.y * swayOffset;
        
        c.rotationX += c.vRx;
        c.rotationY += c.vRy;
        
        let isDone = false;
        if (c.vx > 0 && c.x - c.size > canvas.width) isDone = true;
        else if (c.vx < 0 && c.x + c.size < 0) isDone = true;
        else if (c.vy > 0 && c.y - c.size > canvas.height) isDone = true;
        else if (c.vy < 0 && c.y + c.size < 0) isDone = true;

        if (!isDone) {
            activeCubes++;
        }
    });

    if (activeCubes === 0) {
        restartTransitionState.cubes = [];
        levelMessageEl.classList.add('hidden');
        instructionsEl.textContent = "";
        instructionsEl.style.opacity = 1;
        startGame();
    }
}

function drawRestartTransition() {
    restartTransitionState.cubes.forEach(c => {
        const rotX = createRotationMatrix('x', c.rotationX);
        const rotY = createRotationMatrix('y', c.rotationY);
        const orientation = multiplyMatrices(rotY, rotX);
        drawWireframeObject(c, UNIT_CUBE_VERTICES, CUBE_EDGES, projectedVertices, orientation);
    });
}

function extrudeShape(shapeDef) {
    const { path, holes = [] } = shapeDef; const vertices = []; const faces = []; const depth = 0.4; const shearX = -0.5; const shearY = 0.5;
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
    const projected = vertices.map(v => {
        const rotX_y = v.y * cX - v.z * sX;
        const rotX_z = v.y * sX + v.z * cX;
        const rotY_x = v.x * cY - rotX_z * sY;
        const final_z = v.x * sY + rotX_z * cY;
        return { x: x + rotY_x * size, y: y + rotX_y * size, z: final_z };
    });
    faces.forEach(face => { face.avgZ = face.vertices.reduce((sum, i) => sum + projected[i].z, 0) / face.vertices.length; });
    faces.sort((a, b) => a.avgZ - b.avgZ);
    faces.forEach(face => {
        ctx.beginPath(); const first = projected[face.vertices[0]]; ctx.moveTo(first.x, first.y);
        for (let i = 1; i < face.vertices.length; i++) ctx.lineTo(projected[face.vertices[i]].x, projected[face.vertices[i]].y);
        ctx.closePath(); ctx.fillStyle = face.color; ctx.fill(); ctx.strokeStyle = '#000000'; ctx.lineWidth = 1; ctx.stroke();
    });
}
function drawTitle() {
    const scale = Math.min(canvas.width / 35, canvas.height / 25); 
    const charWidth = scale * 4.5; 
    const lineHeight = scale * 6;
    const subtitleSize = 16;
    const subtitleMargin = 20;

    const totalHeight = (lineHeight * 2) + subtitleSize + subtitleMargin;
    
    const startY = (canvas.height / 3 - totalHeight / 2) + 60;
    
    const drawLine = (text, yOffset) => {
        let currentX = canvas.width / 2 - (text.length * charWidth) / 2 + charWidth / 2;
        for (const char of text) { 
            if (titleState.letterMeshes[char]) draw3DObject(titleState.letterMeshes[char], currentX, yOffset, scale, 0, 0); 
            currentX += charWidth; 
        }
    };
    
    const snowY = startY - lineHeight / 2;
    const blockY = startY + lineHeight / 2;
    const subtitleY = blockY + (lineHeight / 2) + subtitleMargin;

    drawLine("SNOW", snowY); 
    drawLine("BLOCK", blockY);
    
    const subtitleText = "the annoyingly possible puzzle game";
    ctx.font = `${subtitleSize}px "Patrick Hand", cursive`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    const subtitleMetrics = ctx.measureText(subtitleText);
    const subtitlePaddingX = 10;
    const subtitlePaddingY = 5;
    const subtitleBoxWidth = subtitleMetrics.width + subtitlePaddingX * 2;
    const subtitleBoxHeight = subtitleSize + subtitlePaddingY * 2;
    const subtitleBoxX = canvas.width / 2 - subtitleBoxWidth / 2;
    const subtitleBoxY = subtitleY - subtitleBoxHeight / 2;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(subtitleBoxX, subtitleBoxY, subtitleBoxWidth, subtitleBoxHeight);

    ctx.fillStyle = `rgba(255, 255, 255, 0.8)`;
    ctx.fillText(subtitleText, canvas.width / 2, subtitleY);

    const tapText = "Tap to begin";
    const tapTextSize = 16;
    const tapTextY = canvas.height - START_SIZE - 30;
    
    ctx.font = `${tapTextSize}px "Helvetica Neue", Arial, sans-serif`;
    
    const tapMetrics = ctx.measureText(tapText);
    const tapPaddingX = 10;
    const tapPaddingY = 5;
    const tapBoxWidth = tapMetrics.width + tapPaddingX * 2;
    const tapBoxHeight = tapTextSize + tapPaddingY * 2;
    const tapBoxX = canvas.width / 2 - tapBoxWidth / 2;
    const tapBoxY = tapTextY - tapBoxHeight / 2;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(tapBoxX, tapBoxY, tapBoxWidth, tapBoxHeight);
    
    const flash = (Math.sin(Date.now() / 400) + 1) / 2;
    ctx.fillStyle = `rgba(255, 255, 255, ${0.4 + flash * 0.6})`; 
    ctx.fillText(tapText, canvas.width / 2, tapTextY);
    
    ctx.textBaseline = 'alphabetic';
}


// ====================================================================
// --- SOUND SYNTHESIS ---
// ====================================================================
function playCollisionSound(context, velocity) {
    if (!context || velocity < 0.1) return; const osc = context.createOscillator(); const gain = context.createGain(); osc.connect(gain); gain.connect(context.destination); const now = context.currentTime; const peakGain = Math.min(0.4, velocity / 25); const frequency = Math.max(40, 80 - velocity * 2); osc.type = 'sine'; osc.frequency.setValueAtTime(frequency, now); gain.gain.setValueAtTime(peakGain, now); gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2); osc.start(now); osc.stop(now + 0.2);
}
function playCollapseSound(context) {
    if (!context) return;
    const now = context.currentTime;
    const duration = 1.0;
    const bufferSize = context.sampleRate * duration;
    const buffer = context.createBuffer(1, bufferSize, context.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
    }
    const noiseSource = context.createBufferSource();
    noiseSource.buffer = buffer;
    const lowpass = context.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(800, now);
    lowpass.frequency.exponentialRampToValueAtTime(100, now + duration * 0.8);
    const gainNode = context.createGain();
    gainNode.gain.setValueAtTime(0.4, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);
    noiseSource.connect(lowpass);
    lowpass.connect(gainNode);
    gainNode.connect(context.destination);
    noiseSource.start(now);
    noiseSource.stop(now + duration);
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
