/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// --- DOM ELEMENTS ---
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const titleScreenEl = document.getElementById('title-screen');
const instructionsEl = document.getElementById('instructions');
const winMessageEl = document.getElementById('win-message');
const finalMessageEl = document.getElementById('final-message');
const trailCanvas = document.createElement('canvas');
const trailCtx = trailCanvas.getContext('2d');


// --- GAME STATE ---
const gameState = {
    current: 'title', // 'title', 'transitioning', 'playing', 'won', 'smashing'
    isDragging: false,
    lastPointerX: 0,
    lastPointerY: 0,
    totalDistancePushed: 0,
    upwardForce: 0,
    motionHintShown: false,
};

const transitionState = {
    cubes: [],
};

let cubes = [];
let animationFrameId;


// --- GAME CONFIG & PHYSICS ---
const physics = {
  snowDrag: 0.92,
  gravity: 0.5,
  pushMultiplier: 0.3,
  rotationalDamping: 0.97,
  bounce: -0.5,
};
const START_SIZE = 50;
const MAX_SIZE_FACTOR = 4;
const WIN_ZONE_HEIGHT = 50;
const NUM_SHARDS = 8;

// --- 3D RENDERING DATA ---
const UNIT_CUBE_VERTICES = [
  { x: -1, y: -1, z: -1 }, { x: 1, y: -1, z: -1 },
  { x: 1, y: 1, z: -1 }, { x: -1, y: 1, z: -1 },
  { x: -1, y: -1, z: 1 }, { x: 1, y: -1, z: 1 },
  { x: 1, y: 1, z: 1 }, { x: -1, y: 1, z: 1 },
];
const CUBE_EDGES = [
  [0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6],
  [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]
];

const projectedVertices = Array.from({ length: 8 }, () => ({ x: 0, y: 0 }));

// --- SETUP & STATE MANAGEMENT ---
function setup() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  trailCanvas.width = canvas.width;
  trailCanvas.height = canvas.height;


  gameState.current = 'title';
  titleScreenEl.style.display = 'flex';
  titleScreenEl.style.opacity = '1';

  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }
  gameLoop();
}

function setupGame() {
  const startX = canvas.width / 2;
  const startY = canvas.height - START_SIZE * 1.5;
  const startCube = {
    size: START_SIZE,
    y: startY,
    x: startX,
    prevX: startX,
    prevY: startY,
    mass: 1, vx: 0, vy: 0,
    rotationX: 0, rotationY: 0.4,
    vRx: 0, vRy: 0,
  };
  cubes = [startCube];
  trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);

  Object.assign(gameState, {
      totalDistancePushed: 0, upwardForce: 0,
      isDragging: false, motionHintShown: false,
  });

  winMessageEl.classList.add('hidden');
  finalMessageEl.classList.add('hidden');
  instructionsEl.textContent = '';
  instructionsEl.classList.add('hidden');
  
  // Reset letter styles
  Array.from(winMessageEl.children).forEach(span => {
    span.classList.remove('shattered');
    span.style.transform = '';
  });
}

function startTransition() {
    gameState.current = 'transitioning';
    titleScreenEl.style.opacity = '0';
    setTimeout(() => { titleScreenEl.style.display = 'none'; }, 500);

    transitionState.cubes = [];
    const numCubes = 200;
    for (let i = 0; i < numCubes; i++) {
        transitionState.cubes.push({
            x: Math.random() * canvas.width,
            y: -(Math.random() * canvas.height),
            size: 10 + Math.random() * 20,
            rotationX: Math.random() * Math.PI * 2,
            rotationY: Math.random() * Math.PI * 2,
            vRx: (Math.random() - 0.5) * 0.05,
            vRy: (Math.random() - 0.5) * 0.05,
            speed: 5 + Math.random() * 10,
        });
    }
}


// --- GAME LOOP ---
function gameLoop(timestamp) {
  switch(gameState.current) {
    case 'title':
        break;
    case 'transitioning':
      updateTransition();
      drawTransition();
      break;
    case 'playing':
    case 'won':
    case 'smashing':
      updateGame();
      drawGame();
      break;
  }
  animationFrameId = requestAnimationFrame(gameLoop);
}

// --- TRANSITION LOGIC ---
function updateTransition() {
  let allCubesOffScreen = true;
  transitionState.cubes.forEach(cube => {
    cube.y += cube.speed;
    cube.rotationX += cube.vRx;
    cube.rotationY += cube.vRy;
    if (cube.y - cube.size / 2 < canvas.height) {
        allCubesOffScreen = false;
    }
  });

  if (allCubesOffScreen && transitionState.cubes.length > 0) {
    gameState.current = 'playing';
    setupGame();
    transitionState.cubes = []; 
  }
}

function drawTransition() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  transitionState.cubes.forEach(c => drawWireframeObject(c, UNIT_CUBE_VERTICES, CUBE_EDGES, projectedVertices));
}


// --- GAME LOGIC ---
function updateGame() {
  if (gameState.current === 'won') return;

  cubes.forEach((cube, index) => {
    const prevX = cube.x;
    const prevY = cube.y;

    if (gameState.current === 'playing' && index === 0 && cubes.length === 1) {
        cube.vy -= gameState.upwardForce;
    }
    
    if (gameState.current === 'smashing') {
        cube.vy += physics.gravity;
    }

    cube.vx *= physics.snowDrag;
    cube.vy *= physics.snowDrag;
    cube.x += cube.vx;
    cube.y += cube.vy;
    cube.rotationX += cube.vRx;
    cube.rotationY += cube.vRy;
    cube.vRx *= physics.rotationalDamping;
    cube.vRy *= physics.rotationalDamping;

    const halfSize = cube.size / 2;
    if (cube.y > canvas.height - halfSize) { cube.y = canvas.height - halfSize; cube.vy *= physics.bounce; }
    if (cube.y < halfSize && gameState.current !== 'smashing') { cube.y = halfSize; cube.vy *= physics.bounce; }
    if (cube.x < halfSize) { cube.x = halfSize; cube.vx *= physics.bounce; }
    if (cube.x > canvas.width - halfSize) { cube.x = canvas.width - halfSize; cube.vx *= physics.bounce; }
    
    if (gameState.current === 'playing' && gameState.isDragging && Math.hypot(cube.x - prevX, cube.y - prevY) > 1) {
        drawTrailSegment(prevX, prevY, cube.x, cube.y, cube.size);
    }
  });

  const mainCube = cubes[0];
  if (cubes.length === 1 && mainCube) {
      if (gameState.current === 'playing') {
        if (mainCube.y < WIN_ZONE_HEIGHT + mainCube.size / 2) winGame();
        const maxSize = canvas.width / MAX_SIZE_FACTOR;
        if (mainCube.size >= maxSize) showTemporaryMessageAndReset("It shattered under its own weight.", shatterAndReset);
      } else if (gameState.current === 'smashing') {
          const winMessageRect = winMessageEl.getBoundingClientRect();
          if (mainCube.y > winMessageRect.top - mainCube.size) {
              shatterText();
              shatterCube(mainCube);
              gameState.current = 'won'; // Stop further updates in smashing state
              setTimeout(() => {
                  finalMessageEl.classList.remove('hidden');
                  finalMessageEl.style.opacity = '1';
                  setTimeout(() => {
                      gameState.current = 'playing';
                      setupGame();
                  }, 2500);
              }, 1000);
          }
      }
  }
}

function drawGame() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(trailCanvas, 0, 0);
  cubes.forEach(c => drawWireframeObject(c, UNIT_CUBE_VERTICES, CUBE_EDGES, projectedVertices));
}

// --- RENDERING ---
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

  ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 2;
  ctx.beginPath();
  edges.forEach(edge => {
    const v1 = projectionBuffer[edge[0]];
    const v2 = projectionBuffer[edge[1]];
    ctx.moveTo(v1.x, v1.y);
    ctx.lineTo(v2.x, v2.y);
  });
  ctx.stroke();
  ctx.restore();
}

function drawTrailSegment(x1, y1, x2, y2, size) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len < 1) return;

    const nx = dx / len;
    const ny = dy / len;
    
    const px = -ny;
    const py = nx;

    const offset = size / 2;

    const p1_start = { x: x1 + px * offset, y: y1 + py * offset };
    const p1_end = { x: x2 + px * offset, y: y2 + py * offset };
    const p2_start = { x: x1 - px * offset, y: y1 - py * offset };
    const p2_end = { x: x2 - px * offset, y: y2 - py * offset };

    trailCtx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
    trailCtx.lineWidth = 2;
    trailCtx.lineCap = 'round';
    trailCtx.beginPath();
    trailCtx.moveTo(p1_start.x + 1, p1_start.y + 1);
    trailCtx.lineTo(p1_end.x + 1, p1_end.y + 1);
    trailCtx.moveTo(p2_start.x + 1, p2_start.y + 1);
    trailCtx.lineTo(p2_end.x + 1, p2_end.y + 1);
    trailCtx.stroke();
    
    trailCtx.strokeStyle = '#FFFFFF';
    trailCtx.lineWidth = 1.5;
    trailCtx.beginPath();
    trailCtx.moveTo(p1_start.x, p1_start.y);
    trailCtx.lineTo(p1_end.x, p1_end.y);
    trailCtx.moveTo(p2_start.x, p2_start.y);
    trailCtx.lineTo(p2_end.x, p2_end.y);
    trailCtx.stroke();
}


// --- ACTIONS ---
function shatterCube(parentCube) {
    const shards = [];
    for (let i = 0; i < NUM_SHARDS; i++) {
        const angle = (Math.PI * 2 / NUM_SHARDS) * i;
        const speed = 5 + Math.random() * 5;
        shards.push({
            ...parentCube,
            size: parentCube.size / 4, mass: 1,
            vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
            vRx: (Math.random() - 0.5) * 0.2, vRy: (Math.random() - 0.5) * 0.2,
        });
    }
    cubes = shards;
}

function shatterText() {
    Array.from(winMessageEl.children).forEach(span => {
        const x = (Math.random() - 0.5) * 100;
        const y = Math.random() * 150 + 50;
        const rot = (Math.random() - 0.5) * 360;
        span.style.transform = `translate(${x}px, ${y}px) rotate(${rot}deg)`;
        span.classList.add('shattered');
    });
}


function winGame() {
    gameState.current = 'won';
    winMessageEl.classList.remove('hidden');
    instructionsEl.classList.add('hidden');
    cubes.forEach(cube => { cube.vx = cube.vy = cube.vRx = cube.vRy = 0; });
}

function showTemporaryMessageAndReset(message, action) {
    instructionsEl.textContent = message;
    instructionsEl.classList.remove('hidden');
    setTimeout(action, 2000);
}

function shatterAndReset() {
    shatterCube(cubes[0]);
    setTimeout(setupGame, 1500);
}


// --- EVENT HANDLERS ---
function handlePointerDown(e) {
  if (gameState.current !== 'playing' || cubes.length > 1) return;
  const mainCube = cubes[0];
  if (!mainCube) return;
  gameState.isDragging = true;
  gameState.lastPointerX = e.clientX;
  gameState.lastPointerY = e.clientY;
  mainCube.vx = mainCube.vy = mainCube.vRx = mainCube.vRy = 0;
  canvas.style.cursor = 'grabbing';
}

function handlePointerMove(e) {
  if (!gameState.isDragging || gameState.current !== 'playing' || cubes.length > 1) return;
  const mainCube = cubes[0];
  if (!mainCube) return;

  const deltaX = e.clientX - gameState.lastPointerX;
  const deltaY = e.clientY - gameState.lastPointerY;

  gameState.totalDistancePushed += Math.sqrt(deltaX * deltaX + deltaY * deltaY);
  const growthFactor = 1 + (gameState.totalDistancePushed / (canvas.height * 2)) * 1.5;
  const newSize = START_SIZE * growthFactor;
  const maxSize = canvas.width / MAX_SIZE_FACTOR;

  if (newSize < maxSize) {
      mainCube.size = newSize;
      mainCube.mass = Math.pow(growthFactor, 3);
  } else {
      mainCube.size = maxSize;
      mainCube.mass = Math.pow(maxSize / START_SIZE, 3);
  }
  
  mainCube.vx += (deltaX * physics.pushMultiplier) / mainCube.mass;
  mainCube.vy += (deltaY * physics.pushMultiplier) / mainCube.mass;
  
  mainCube.vRx -= (deltaY * 0.001) / mainCube.mass;
  mainCube.vRy += (deltaX * 0.001) / mainCube.mass;
  
  gameState.lastPointerX = e.clientX;
  gameState.lastPointerY = e.clientY;
}

function handlePointerUp() {
  gameState.isDragging = false;
  canvas.style.cursor = 'grab';
}

function handleDeviceOrientation(e) {
  if (e.beta === null) return;
  
  if (gameState.current === 'playing') {
      if (e.beta < -75) {
        gameState.upwardForce = 0.1;
        if (cubes.length === 1 && !gameState.motionHintShown) {
            instructionsEl.textContent = "What's happening...?";
            instructionsEl.classList.remove('hidden');
            gameState.motionHintShown = true;
        }
      } else {
        gameState.upwardForce = 0;
      }
  } else if (gameState.current === 'won' && e.beta > 0) {
      gameState.current = 'smashing';
  }
}

// --- INITIALIZATION ---
window.addEventListener('resize', setup);
titleScreenEl.addEventListener('pointerdown', handleTitleTap, { once: true });
canvas.addEventListener('pointerdown', handlePointerDown);
window.addEventListener('pointermove', handlePointerMove);
window.addEventListener('pointerup', handlePointerUp);

function handleTitleTap() {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission()
            .then(permissionState => {
                if (permissionState === 'granted') {
                    window.addEventListener('deviceorientation', handleDeviceOrientation);
                }
            })
            .catch(console.error)
            .finally(startTransition);
    } else {
        window.addEventListener('deviceorientation', handleDeviceOrientation);
        startTransition();
    }
}


setup();