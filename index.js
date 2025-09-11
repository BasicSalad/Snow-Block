/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// --- DOM ELEMENTS ---
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const gameContainerEl = document.getElementById('game-container');
const titleScreenEl = document.getElementById('title-screen');
const instructionsEl = document.getElementById('instructions');
const winMessageEl = document.getElementById('win-message');
const resetButton = document.getElementById('reset-button');


// --- GAME STATE ---
const gameState = {
    current: 'title', // 'title', 'transitioning', 'playing'
    isDragging: false,
    lastPointerX: 0,
    lastPointerY: 0,
    totalDistancePushed: 0,
    hasWon: false,
    upwardForce: 0,
};

const titleState = {
    rotationX: 0.2,
    rotationY: 0,
    vRy: 0.0005, // Slow spin
};

const transitionState = {
    cubes: [],
};

let cubes = [];
let animationFrameId;


// --- GAME CONFIG & PHYSICS ---
const physics = {
  snowDrag: 0.92,
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

// prettier-ignore
const LETTER_GEOMETRY = {
    S: {
        vertices: [{x:-1,y:1,z:0},{x:1,y:1,z:0},{x:-1,y:0,z:0},{x:1,y:0,z:0},{x:-1,y:-1,z:0},{x:1,y:-1,z:0}],
        edges: [[0,1],[0,2],[2,3],[3,5],[4,5]]
    },
    N: {
        vertices: [{x:-1,y:1,z:0},{x:-1,y:-1,z:0},{x:1,y:1,z:0},{x:1,y:-1,z:0}],
        edges: [[0,1],[0,3],[2,3]]
    },
    O: {
        vertices: [{x:-1,y:1,z:0},{x:1,y:1,z:0},{x:-1,y:-1,z:0},{x:1,y:-1,z:0}],
        edges: [[0,1],[1,3],[3,2],[2,0]]
    },
    W: {
        vertices: [{x:-1,y:1,z:0},{x:-0.5,y:-1,z:0},{x:0,y:0,z:0},{x:0.5,y:-1,z:0},{x:1,y:1,z:0}],
        edges: [[0,1],[1,2],[2,3],[3,4]]
    },
    B: {
        vertices: [{x:-0.8,y:1,z:0},{x:0.8,y:0.8,z:0},{x:0.8,y:0,z:0},{x:-0.8,y:0,z:0},{x:0.8,y:-0.8,z:0},{x:-0.8,y:-1,z:0}],
        edges: [[0,1],[1,2],[2,3],[0,3],[2,4],[4,5],[5,3]]
    },
    L: {
        vertices: [{x:-1,y:1,z:0},{x:-1,y:-1,z:0},{x:1,y:-1,z:0}],
        edges: [[0,1],[1,2]]
    },
    C: {
        vertices: [{x:1,y:1,z:0},{x:-1,y:1,z:0},{x:-1,y:-1,z:0},{x:1,y:-1,z:0}],
        edges: [[0,1],[1,2],[2,3]]
    },
    K: {
        vertices: [{x:-1,y:1,z:0},{x:-1,y:-1,z:0},{x:-1,y:0,z:0},{x:1,y:1,z:0},{x:1,y:-1,z:0}],
        edges: [[0,1],[2,3],[2,4]]
    }
};

const projectedVertices = Array.from({ length: 8 }, () => ({ x: 0, y: 0 }));
const projectedLetterVertices = Array.from({ length: 8 }, () => ({ x: 0, y: 0 }));

// --- SETUP & STATE MANAGEMENT ---
function setup() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  gameState.current = 'title';
  titleScreenEl.style.display = 'block';
  titleScreenEl.style.opacity = '1';

  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }
  gameLoop();
}

function setupGame() {
  const startCube = {
    size: START_SIZE,
    y: canvas.height - START_SIZE * 1.5,
    x: canvas.width / 2,
    mass: 1, vx: 0, vy: 0,
    rotationX: 0, rotationY: 0.4,
    vRx: 0, vRy: 0,
  };
  cubes = [startCube];

  Object.assign(gameState, {
      totalDistancePushed: 0, upwardForce: 0,
      hasWon: false, isDragging: false
  });

  winMessageEl.classList.add('hidden');
  resetButton.classList.add('hidden');
  instructionsEl.textContent = '';
  instructionsEl.classList.add('hidden');
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
      y: -(Math.random() * canvas.height), // Start staggered above the screen
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
        updateTitle();
        drawTitle();
        break;
    case 'transitioning':
      updateTransition();
      drawTransition();
      break;
    case 'playing':
      updateGame();
      drawGame();
      break;
  }
  animationFrameId = requestAnimationFrame(gameLoop);
}

// --- TITLE LOGIC ---
function updateTitle() {
    titleState.rotationY += titleState.vRy;
}

function drawTitle() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const scale = Math.min(canvas.width / 10, 80);
    const letterSpacing = scale * 2.5;
    const lineSpacing = scale * 2.5;

    const words = ["SNOW", "BLOCK"];
    const totalHeight = (words.length - 1) * lineSpacing;
    let currentY = canvas.height / 2 - totalHeight / 2;
    
    words.forEach(word => {
        const totalWidth = (word.length - 1) * letterSpacing;
        let currentX = canvas.width / 2 - totalWidth / 2;

        for (const char of word) {
            if (LETTER_GEOMETRY[char]) {
                const letter = {
                    x: currentX, y: currentY,
                    size: scale,
                    rotationX: titleState.rotationX,
                    rotationY: titleState.rotationY,
                };
                const { vertices, edges } = LETTER_GEOMETRY[char];
                drawWireframeObject(letter, vertices, edges, projectedLetterVertices);
            }
            currentX += letterSpacing;
        }
        currentY += lineSpacing;
    });

    // Draw subtitle
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.font = `300 ${Math.min(20, canvas.width/25)}px 'Helvetica Neue', Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('Tap to begin', canvas.width / 2, canvas.height / 2 + totalHeight + scale);
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
  if (gameState.hasWon) return;

  cubes.forEach((cube, index) => {
    if (index === 0 && cubes.length === 1) {
        cube.vy -= gameState.upwardForce;
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
    if (cube.y < halfSize) { cube.y = halfSize; cube.vy *= physics.bounce; }
    if (cube.x < halfSize) { cube.x = halfSize; cube.vx *= physics.bounce; }
    if (cube.x > canvas.width - halfSize) { cube.x = canvas.width - halfSize; cube.vx *= physics.bounce; }
  });

  const mainCube = cubes[0];
  if (cubes.length === 1 && mainCube) {
      if (mainCube.y < WIN_ZONE_HEIGHT + mainCube.size / 2) winGame();
      const maxSize = canvas.width / MAX_SIZE_FACTOR;
      if (mainCube.size >= maxSize) shatterCube(mainCube);
  }
}

function drawGame() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
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
    showTemporaryMessageAndReset("It shattered under its own weight.");
}

function winGame() {
    gameState.hasWon = true;
    winMessageEl.classList.remove('hidden');
    resetButton.classList.remove('hidden');
    instructionsEl.classList.add('hidden');
    cubes.forEach(cube => { cube.vx = cube.vy = cube.vRx = cube.vRy = 0; });
}

function showTemporaryMessageAndReset(message) {
    instructionsEl.textContent = message;
    instructionsEl.classList.remove('hidden');
    setTimeout(setupGame, 2000);
}


// --- EVENT HANDLERS ---
function handlePointerDown(e) {
  if (gameState.current !== 'playing' || cubes.length > 1 || gameState.hasWon) return;
  const mainCube = cubes[0];
  if (!mainCube) return;
  gameState.isDragging = true;
  gameState.lastPointerX = e.clientX;
  gameState.lastPointerY = e.clientY;
  mainCube.vx = mainCube.vy = mainCube.vRx = mainCube.vRy = 0;
  canvas.style.cursor = 'grabbing';
}

function handlePointerMove(e) {
  if (!gameState.isDragging || gameState.current !== 'playing' || gameState.hasWon || cubes.length > 1) return;
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
  mainCube.vRx += (deltaY * 0.001) / mainCube.mass;
  mainCube.vRy -= (deltaX * 0.001) / mainCube.mass;
  
  gameState.lastPointerX = e.clientX;
  gameState.lastPointerY = e.clientY;
}

function handlePointerUp() {
  gameState.isDragging = false;
  canvas.style.cursor = 'grab';
}

function handleDeviceOrientation(e) {
  if (gameState.current !== 'playing' || gameState.hasWon || e.beta === null) return;
  if (e.beta > 150 || e.beta < -150) {
    gameState.upwardForce = 0.1;
    if (cubes.length === 1) {
        instructionsEl.textContent = "What's happening...?";
        instructionsEl.classList.remove('hidden');
    }
  } else {
    gameState.upwardForce = 0;
  }
}

// --- INITIALIZATION ---
window.addEventListener('resize', setup);
titleScreenEl.addEventListener('pointerdown', startTransition, { once: true });
canvas.addEventListener('pointerdown', handlePointerDown);
window.addEventListener('pointermove', handlePointerMove);
window.addEventListener('pointerup', handlePointerUp);
window.addEventListener('deviceorientation', handleDeviceOrientation);
resetButton.addEventListener('click', setupGame);

setup();