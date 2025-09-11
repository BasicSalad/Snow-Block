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
const platformTextEl = document.getElementById('platform-text');
const trailCanvas = document.createElement('canvas');
const trailCtx = trailCanvas.getContext('2d');


// --- GAME STATE ---
const gameState = {
    current: 'title', // 'title', 'transitioning', 'playing', 'won', 'smashing'
    isDragging: false,
    lastPointerX: 0,
    lastPointerY: 0,
    pushOffsetX: 0,
    pushOffsetY: 0,
    totalDistancePushed: 0,
    upwardForce: 0,
    motionHintShown: false,
};

const transitionState = {
    cubes: [],
};

const titleState = {
    rotationX: 0.5,
    rotationY: -0.3,
    letterMeshes: {},
};

let cubes = [];
let textShards = [];
let animationFrameId;
let winMessageFontSize = 40; // default


// --- AUDIO ---
let audioContext;
let dragSoundNode = null;
let ambientSoundNode = null;


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
const NUM_SHARDS = 20;
const targetZone = {
    x: 0,
    y: 60,
    size: START_SIZE,
};

// --- 3D RENDERING DATA ---
// Basic unit cube, used for non-title screen rendering
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

const letterShapes = {
    'S': { path: [[0, 0], [4, 0], [4, 1], [1, 1], [1, 2], [3, 2], [3, 3], [4, 3], [4, 5], [0, 5], [0, 4], [3, 4], [3, 3], [1, 3], [1, 4], [0, 4]] },
    'N': { path: [[0, 0], [1, 0], [1, 3], [3, 0], [4, 0], [4, 5], [3, 5], [3, 2], [1, 5], [0, 5]] },
    'O': { path: [[0, 0], [4, 0], [4, 5], [0, 5]], holes: [[[1, 1], [3, 1], [3, 4], [1, 4]]] },
    'W': { path: [[0, 0], [1, 0], [2, 3], [3, 0], [4, 0], [4, 5], [3, 5], [3, 2], [2, 5], [1, 2], [1, 5], [0, 5]] },
    'B': { path: [[0, 0], [3, 0], [4, 1], [4, 2], [3, 2.5], [4, 3], [4, 4], [3, 5], [0, 5]], holes: [[[1, 1], [2, 1], [2, 2], [1, 2]], [[1, 3], [2, 3], [2, 4], [1, 4]]] },
    'L': { path: [[0, 0], [1, 0], [1, 4], [4, 4], [4, 5], [0, 5]] },
    'C': { path: [[4, 0], [0, 0], [0, 5], [4, 5], [4, 4], [1, 4], [1, 1], [4, 1]] },
    'K': { path: [[0, 0], [1, 0], [1, 2], [3, 0], [4, 0], [2, 2.5], [4, 5], [3, 5], [1, 3], [1, 5], [0, 5]] },
};


// --- SETUP & STATE MANAGEMENT ---
function setup() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  trailCanvas.width = canvas.width;
  trailCanvas.height = canvas.height;
  winMessageFontSize = 2.5 * parseFloat(getComputedStyle(document.documentElement).fontSize);

  // Set target zone position
  targetZone.x = canvas.width / 2;

  // Pre-generate letter meshes
  for (const char in letterShapes) {
      titleState.letterMeshes[char] = extrudeShape(letterShapes[char]);
  }

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
  textShards = [];
  trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);

  Object.assign(gameState, {
      totalDistancePushed: 0, upwardForce: 0,
      isDragging: false, motionHintShown: false,
  });

  winMessageEl.classList.add('hidden');
  finalMessageEl.classList.add('hidden');
  instructionsEl.textContent = '';
  instructionsEl.classList.add('hidden');
  
  platformTextEl.textContent = 'A change in perspective is all it takes.';
  platformTextEl.classList.remove('hidden');

  Array.from(winMessageEl.children).forEach(span => {
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
function gameLoop() {
  switch(gameState.current) {
    case 'title':
      drawTitle();
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
  if (gameState.current === 'won' && cubes.length <= 1) return;

  cubes.forEach((cube, index) => {
    const prevX = cube.x;
    const prevY = cube.y;

    if (gameState.current === 'playing' && index === 0 && cubes.length === 1) {
        cube.vy -= gameState.upwardForce;
    }
    
    if (gameState.current === 'smashing' || cubes.length > 1) {
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
    if (cube.y > canvas.height - halfSize) {
        playCollisionSound(audioContext, Math.abs(cube.vy));
        cube.y = canvas.height - halfSize;
        cube.vy *= physics.bounce;
    }
    if (cube.y < halfSize && gameState.current !== 'smashing' && cubes.length <= 1) {
        playCollisionSound(audioContext, Math.abs(cube.vy));
        cube.y = halfSize;
        cube.vy *= physics.bounce;
    }
    if (cube.x < halfSize) {
        playCollisionSound(audioContext, Math.abs(cube.vx));
        cube.x = halfSize;
        cube.vx *= physics.bounce;
    }
    if (cube.x > canvas.width - halfSize) {
        playCollisionSound(audioContext, Math.abs(cube.vx));
        cube.x = canvas.width - halfSize;
        cube.vx *= physics.bounce;
    }
    
    if (gameState.current === 'playing' && gameState.isDragging && Math.hypot(cube.x - prevX, cube.y - prevY) > 1) {
        drawTrailSegment(prevX, prevY, cube.x, cube.y, cube.size);
    }
  });

  textShards.forEach(shard => {
    shard.vy += physics.gravity; // Apply gravity
    shard.vx *= 0.99; // Air resistance
    shard.x += shard.vx;
    shard.y += shard.vy;
    shard.rotation += shard.vR;
    shard.vR *= 0.99; // Rotational damping
  });
  textShards = textShards.filter(shard => shard.y < canvas.height + 50);

  const mainCube = cubes[0];
  if (cubes.length === 1 && mainCube) {
      if (gameState.current === 'playing') {
        const isHorizontallyAligned = Math.abs(mainCube.x - targetZone.x) < targetZone.size / 2;
        const isVerticallyAligned = Math.abs(mainCube.y - targetZone.y) < targetZone.size / 2;
        const isCorrectSize = Math.abs(mainCube.size - targetZone.size) < 5;

        if (isHorizontallyAligned && isVerticallyAligned && isCorrectSize) {
            winGame();
        }

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

function drawGameUI() {
    // Draw starting line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 1;
    const startCubeY = canvas.height - START_SIZE * 1.5;
    const startLineY = startCubeY + START_SIZE / 2 + 5;
    const startLineWidth = START_SIZE * 1.2;
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2 - startLineWidth / 2, startLineY);
    ctx.lineTo(canvas.width / 2 + startLineWidth / 2, startLineY);
    ctx.stroke();

    // Draw target box
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.strokeRect(
        targetZone.x - targetZone.size / 2,
        targetZone.y - targetZone.size / 2,
        targetZone.size,
        targetZone.size
    );
}

function drawGame() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(trailCanvas, 0, 0);

  if (gameState.current === 'playing' || gameState.current === 'smashing') {
    drawGameUI();
  }
  
  cubes.forEach(c => drawWireframeObject(c, UNIT_CUBE_VERTICES, CUBE_EDGES, projectedVertices));

  if (textShards.length > 0) {
      ctx.font = `bold ${winMessageFontSize}px 'Helvetica Neue', Arial, sans-serif`;
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      textShards.forEach(shard => {
          ctx.save();
          ctx.translate(shard.x, shard.y);
          ctx.rotate(shard.rotation);
          ctx.fillText(shard.text, 0, 0);
          ctx.restore();
      });
  }
}

// --- 3D RENDERING ---

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
    const p2_end = { x: x2 - px * offset, y: y2 + py * offset };

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

// --- TITLE SCREEN 3D RENDERING ---

function extrudeShape(shapeDef) {
    const { path, holes = [] } = shapeDef;
    const vertices = [];
    const faces = [];
    const depth = 1;

    // Create front and back vertices
    [...path, ...holes.flat()].forEach(p => {
        vertices.push({ x: p[0] - 2, y: p[1] - 2.5, z: -depth / 2 }); // Front
        vertices.push({ x: p[0] - 2, y: p[1] - 2.5, z: depth / 2 });  // Back
    });

    // Create front and back faces
    function createFaces(pointPath, offset) {
        const frontFace = [], backFace = [];
        for (let i = 0; i < pointPath.length; i++) {
            frontFace.push(offset + i * 2);
            backFace.push(offset + i * 2 + 1);
        }
        faces.push({ vertices: frontFace, color: '#FFFFFF', type: 'front' });
        faces.push({ vertices: backFace.reverse(), color: '#000000', type: 'back' });

        // Create side faces
        for (let i = 0; i < pointPath.length; i++) {
            const p1 = offset + i * 2;
            const p2 = offset + ((i + 1) % pointPath.length) * 2;
            faces.push({ vertices: [p1, p2, p2 + 1, p1 + 1], color: '#000000', type: 'side' });
        }
    }
    
    createFaces(path, 0);
    let offset = path.length * 2;
    holes.forEach(holePath => {
        createFaces(holePath, offset);
        offset += holePath.length * 2;
    });

    return { vertices, faces };
}

function draw3DObject(mesh, x, y, size, rotX, rotY) {
    const { vertices, faces } = mesh;
    const sX = Math.sin(rotX); const cX = Math.cos(rotX);
    const sY = Math.sin(rotY); const cY = Math.cos(rotY);
    const perspective = 500;

    const projected = vertices.map(v => {
        const rotX_y = v.y * cX - v.z * sX;
        const rotX_z = v.y * sX + v.z * cX;
        const rotY_x = v.x * cY + rotX_z * sY;
        const rotY_z = -v.x * sY + rotX_z * cY;
        const scale = perspective / (perspective - rotY_z * size);
        return {
            x: x + rotY_x * size * scale,
            y: y + rotX_y * size * scale,
            z: rotY_z,
        };
    });

    faces.forEach(face => {
        face.avgZ = face.vertices.reduce((sum, i) => sum + projected[i].z, 0) / face.vertices.length;
    });

    faces.sort((a, b) => a.avgZ - b.avgZ);

    faces.forEach(face => {
        ctx.beginPath();
        const first = projected[face.vertices[0]];
        ctx.moveTo(first.x, first.y);
        for (let i = 1; i < face.vertices.length; i++) {
            const p = projected[face.vertices[i]];
            ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();

        ctx.fillStyle = face.color;
        ctx.fill();
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.stroke();
    });
}

function drawTitle() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const line1 = "SNOW";
    const line2 = "BLOCK";
    const totalLetters = line1.length + line2.length;
    
    const scale = Math.min(canvas.width / (totalLetters * 3), canvas.height / 15);
    const charWidth = scale * 4.5;
    const lineHeight = scale * 6;

    const drawLine = (text, yOffset) => {
        const totalWidth = text.length * charWidth;
        let currentX = canvas.width / 2 - totalWidth / 2 + charWidth / 2;
        for (const char of text) {
            const mesh = titleState.letterMeshes[char];
            if (mesh) {
                draw3DObject(mesh, currentX, yOffset, scale, titleState.rotationX, titleState.rotationY);
            }
            currentX += charWidth;
        }
    };
    
    drawLine(line1, canvas.height / 2 - lineHeight / 2);
    drawLine(line2, canvas.height / 2 + lineHeight / 2);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.font = '16px "Helvetica Neue", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Tap to begin', canvas.width / 2, canvas.height / 2 + lineHeight * 1.5);
}



// --- ACTIONS ---
function shatterCube(parentCube) {
    playShatterSound(audioContext);
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
    playShatterSound(audioContext);
    winMessageEl.classList.add('hidden');
    Array.from(winMessageEl.children).forEach(span => {
        if (span.textContent.trim() === '') return;
        const rect = span.getBoundingClientRect();
        textShards.push({
            text: span.textContent,
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
            vx: (Math.random() - 0.5) * 8,
            vy: (Math.random() - 0.5) * 10 - 5,
            rotation: 0,
            vR: (Math.random() - 0.5) * 0.2,
        });
    });
}


function winGame() {
    gameState.current = 'won';
    winMessageEl.classList.remove('hidden');
    instructionsEl.classList.add('hidden');
    platformTextEl.classList.add('hidden');
    cubes.forEach(cube => { cube.vx = cube.vy = cube.vRx = cube.vRy = 0; });
    playWinSound(audioContext);
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
  gameState.pushOffsetX = e.clientX - mainCube.x;
  gameState.pushOffsetY = e.clientY - mainCube.y;
  mainCube.vx = mainCube.vy = mainCube.vRx = mainCube.vRy = 0;
  canvas.style.cursor = 'grabbing';
  startDragSound(audioContext);
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
  
  const rotationalMultiplier = 0.00005;
  mainCube.vRx -= (deltaY * gameState.pushOffsetX * rotationalMultiplier) / mainCube.mass;
  mainCube.vRy += (deltaX * gameState.pushOffsetY * rotationalMultiplier) / mainCube.mass;
  
  gameState.lastPointerX = e.clientX;
  gameState.lastPointerY = e.clientY;
}

function handlePointerUp() {
  gameState.isDragging = false;
  canvas.style.cursor = 'grab';
  stopDragSound();
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
  } else if (gameState.current === 'won' && e.beta > 0 && cubes.length === 1) {
      gameState.current = 'smashing';
  }
}

// --- SOUND SYNTHESIS ---
function playCollisionSound(context, velocity) {
    if (!context || velocity < 0.1) return;

    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.connect(gain);
    gain.connect(context.destination);

    const now = context.currentTime;
    const peakGain = Math.min(0.4, velocity / 25);
    const baseFrequency = 80;
    const frequency = Math.max(40, baseFrequency - velocity * 2);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency, now);

    gain.gain.setValueAtTime(peakGain, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);

    osc.start(now);
    osc.stop(now + 0.2);
}

function startAmbientSound(context) {
    if (!context || ambientSoundNode) return;

    const bufferSize = 2 * context.sampleRate;
    const noiseBuffer = context.createBuffer(1, bufferSize, context.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
    }

    const noise = context.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;

    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 150;

    const gain = context.createGain();
    gain.gain.setValueAtTime(0, context.currentTime);
    gain.gain.linearRampToValueAtTime(0.03, context.currentTime + 3); // Fade in

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(context.destination);

    noise.start();
    ambientSoundNode = { noise, filter, gain };
}

function playShatterSound(context) {
    if (!context) return;
    const duration = 0.5;
    const sampleRate = context.sampleRate;
    const buffer = context.createBuffer(1, sampleRate * duration, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
        data[i] = Math.random() * 2 - 1; // White noise
    }
    
    const source = context.createBufferSource();
    source.buffer = buffer;
    
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.3, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);

    source.connect(gain);
    gain.connect(context.destination);
    source.start();
}

function playWinSound(context) {
    if (!context) return;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.connect(gain);
    gain.connect(context.destination);

    const now = context.currentTime;
    osc.type = 'triangle';
    gain.gain.setValueAtTime(0.3, now);
    
    // Ascending arpeggio
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.setValueAtTime(554.37, now + 0.1);
    osc.frequency.setValueAtTime(659.25, now + 0.2);
    osc.frequency.setValueAtTime(880, now + 0.3);

    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
    osc.start(now);
    osc.stop(now + 0.5);
}

function startDragSound(context) {
    if (!context || dragSoundNode) return;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.connect(gain);
    gain.connect(context.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(80, context.currentTime); // Low hum
    gain.gain.setValueAtTime(0, context.currentTime);
    gain.gain.linearRampToValueAtTime(0.05, context.currentTime + 0.1); // Fade in

    osc.start();
    dragSoundNode = { osc, gain };
}

function stopDragSound() {
    if (!dragSoundNode || !audioContext) return;
    const now = audioContext.currentTime;
    dragSoundNode.gain.gain.linearRampToValueAtTime(0, now + 0.2); // Fade out
    dragSoundNode.osc.stop(now + 0.2);
    dragSoundNode = null;
}


// --- INITIALIZATION ---
window.addEventListener('resize', setup);
titleScreenEl.addEventListener('pointerdown', handleTitleTap, { once: true });
canvas.addEventListener('pointerdown', handlePointerDown);
window.addEventListener('pointermove', handlePointerMove);
window.addEventListener('pointerup', handlePointerUp);

function handleTitleTap() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        startAmbientSound(audioContext);
    }

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