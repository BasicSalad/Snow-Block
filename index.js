/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// --- DOM Elements ---
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const titleScreen = document.getElementById('title-screen');
const gameContainer = document.getElementById('game-container');
const winMessage = document.getElementById('win-message');
const resetButton = document.getElementById('reset-button');
const instructions = document.getElementById('instructions');

// --- Constants ---
const CUBE_GEOMETRY = {
    vertices: [
        { x: -1, y: -1, z: -1 }, { x: 1, y: -1, z: -1 },
        { x: 1, y: 1, z: -1 }, { x: -1, y: 1, z: -1 },
        { x: -1, y: -1, z: 1 }, { x: 1, y: -1, z: 1 },
        { x: 1, y: 1, z: 1 }, { x: -1, y: 1, z: 1 },
    ],
    edges: [
        [0, 1], [1, 2], [2, 3], [3, 0], // Front face
        [4, 5], [5, 6], [6, 7], [7, 4], // Back face
        [0, 4], [1, 5], [2, 6], [3, 7]  // Side edges
    ],
    faces: [] // Not used for wireframe
};

// Each letter is defined as a set of polygons in a 2D space, which will be extruded into 3D.
// Coordinates are relative to a 100x100 box.
const letterShapes = {
    'S': [
        [{x:-25,y:-40},{x:25,y:-40},{x:25,y:-20},{x:-25,y:-20}],
        [{x:-25,y:-20},{x:-5,y:-20},{x:-5,y:0},{x:-25,y:0}],
        [{x:-25,y:0},{x:25,y:0},{x:25,y:20},{x:-25,y:20}],
        [{x:5,y:20},{x:25,y:20},{x:25,y:40},{x:5,y:40}],
        [{x:-25,y:20},{x:25,y:40},{x:25,y:40},{x:-25,y:40},{x:-25,y:20}]
    ],
    'N': [
        [{x:-25,y:-40},{x:-5,y:-40},{x:-5,y:40},{x:-25,y:40}],
        [{x:5,y:-40},{x:25,y:-40},{x:25,y:40},{x:5,y:40}],
        [{x:-5,y:-40},{x:5,y:-20},{x:5,y:-40}],
        [{x:-5,y:20},{x:5,y:40},{x:-5,y:40}],
    ],
    'O': [
        [{x:-25,y:-40},{x:25,y:-40},{x:25,y:40},{x:-25,y:40}],
        [{x:-15,y:-30},{x:-15,y:30},{x:15,y:30},{x:15,y:-30}],
    ],
    'W': [
        [{x:-25,y:-40},{x:-15,y:-40},{x:-5,y:40},{x:-15,y:40}],
        [{x:-5,y:-40},{x:5,y:-40},{x:0,y:0}],
        [{x:15,y:-40},{x:25,y:-40},{x:15,y:40},{x:5,y:40}],
    ],
    'B': [
        [{x:-25,y:-40},{x:15,y:-40},{x:25,y:-20},{x:25,y:0},{x:15,y:0},{x:-25,y:0}],
        [{x:-25,y:0},{x:20,y:0},{x:25,y:20},{x:25,y:40},{x:20,y:40},{x:-25,y:40}],
        [{x:-15,y:-30},{x:5,y:-30},{x:5,y:-10},{x:-15,y:-10}],
        [{x:-15,y:10},{x:10,y:10},{x:10,y:30},{x:-15,y:30}],
    ],
    'L': [
        [{x:-25,y:-40},{x:-5,y:-40},{x:-5,y:40},{x:-25,y:40}],
        [{x:-5,y:20},{x:25,y:20},{x:25,y:40},{x:-5,y:40}],
    ],
    'C': [
        [{x:25,y:-40},{x:-25,y:-40},{x:-25,y:40},{x:25,y:40},{x:25,y:20},{x:-5,y:20},{x:-5,y:-20},{x:25,y:-20}],
    ],
    'K': [
        [{x:-25,y:-40},{x:-5,y:-40},{x:-5,y:40},{x:-25,y:40}],
        [{x:-5,y:-10},{x:25,y:-40},{x:25,y:-20},{x:-5,y:10}],
        [{x:-5,y:0},{x:25,y:40},{x:25,y:20},{x:-5,y:20}],
    ],
    ' ': [],
};


// --- Game State ---
let gameState = {
    appState: 'title', // 'title', 'transitioning', 'playing'
    isDragging: false,
    hasWon: false,
    lastPointerX: 0,
    lastPointerY: 0,
    totalDist: 0,
    hintShown: false,
};

let cubes = [];
let titleState = {
    letters: {},
    rotX: 0.2,
    rotY: 0.1,
    rotZ: 0,
};

let transitionState = {
    cubes: [],
};


// --- Helper Functions ---
function extrudeShape(shape, depth) {
    const vertices = [];
    const edges = [];

    // Generate vertices for front and back faces from the 2D shape
    shape.forEach(polygon => {
        const frontFaceVertices = polygon.map(p => ({ ...p, z: -depth / 2 }));
        const backFaceVertices = polygon.map(p => ({ ...p, z: depth / 2 }));

        // For each polygon, create the 3D prism
        const baseIndex = vertices.length;
        vertices.push(...frontFaceVertices, ...backFaceVertices);
        const polyVertexCount = polygon.length;

        for (let i = 0; i < polyVertexCount; i++) {
            const V1_FRONT = baseIndex + i;
            const V2_FRONT = baseIndex + (i + 1) % polyVertexCount;
            const V1_BACK = baseIndex + i + polyVertexCount;
            const V2_BACK = baseIndex + ((i + 1) % polyVertexCount) + polyVertexCount;

            edges.push([V1_FRONT, V2_FRONT]); // Front edge
            edges.push([V1_BACK, V2_BACK]);   // Back edge
            edges.push([V1_FRONT, V1_BACK]);  // Side edge
        }
    });

    return { vertices, edges, faces: [] };
}


function project3D(point, fov, viewerDist) {
    const factor = fov / (viewerDist + point.z);
    return {
        x: point.x * factor + canvas.width / 2,
        y: point.y * factor + canvas.height / 2,
        factor: factor
    };
}

function rotateX(point, angle) {
    const rad = angle;
    const cosa = Math.cos(rad);
    const sina = Math.sin(rad);
    const y = point.y * cosa - point.z * sina;
    const z = point.y * sina + point.z * cosa;
    return { x: point.x, y: y, z: z };
}

function rotateY(point, angle) {
    const rad = angle;
    const cosa = Math.cos(rad);
    const sina = Math.sin(rad);
    const z = point.z * cosa - point.x * sina;
    const x = point.z * sina + point.x * cosa;
    return { x: x, y: point.y, z: z };
}

function rotateZ(point, angle) {
    const rad = angle;
    const cosa = Math.cos(rad);
    const sina = Math.sin(rad);
    const x = point.x * cosa - point.y * sina;
    const y = point.x * sina + point.y * cosa;
    return { x: x, y: y, z: point.z };
}

function drawWireframeObject(obj, centerX, centerY, scale, rotX, rotY, rotZ, color) {
    const projectedPoints = obj.vertices.map(v => {
        let p = { x: v.x * scale, y: v.y * scale, z: v.z * scale };
        p = rotateX(p, rotX);
        p = rotateY(p, rotY);
        p = rotateZ(p, rotZ);
        p.x += centerX;
        p.y += centerY;
        return project3D(p, 400, 5);
    });

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    obj.edges.forEach(edge => {
        const p1 = projectedPoints[edge[0]];
        const p2 = projectedPoints[edge[1]];
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
    });
    ctx.stroke();
}


// --- Game State Functions ---
function handleTitleTap() {
    // Attempt to request device motion permission
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        DeviceMotionEvent.requestPermission()
            .then(permissionState => {
                if (permissionState === 'granted') {
                    window.addEventListener('devicemotion', handleDeviceMotion);
                }
            })
            .catch(console.error)
            .finally(startTransition); // Always start transition
    } else {
        // For non-iOS 13+ browsers
        window.addEventListener('devicemotion', handleDeviceMotion);
        startTransition();
    }
}

function startTransition() {
    gameState.appState = 'transitioning';
    titleScreen.style.opacity = 0;
    titleScreen.style.pointerEvents = 'none';

    // Create a waterfall of cubes
    for (let i = 0; i < 200; i++) {
        transitionState.cubes.push({
            ...CUBE_GEOMETRY,
            x: Math.random() * canvas.width,
            y: -Math.random() * canvas.height * 2 - 50, // Start above screen
            z: Math.random() * 500 - 250,
            size: Math.random() * 20 + 10,
            vx: 0,
            vy: Math.random() * 5 + 5, // Fall speed
            rotX: Math.random() * Math.PI * 2,
            rotY: Math.random() * Math.PI * 2,
            rotZ: Math.random() * Math.PI * 2,
            rotSpeedX: (Math.random() - 0.5) * 0.1,
            rotSpeedY: (Math.random() - 0.5) * 0.1,
            rotSpeedZ: (Math.random() - 0.5) * 0.1,
        });
    }
}

function createCube() {
    const size = 50;
    const newCube = {
        ...CUBE_GEOMETRY,
        x: canvas.width / 2,
        y: canvas.height - size * 1.5,
        size: size,
        mass: 1,
        vx: 0,
        vy: 0,
        rotX: 0,
        rotY: 0,
        rotZ: 0,
    };
    return newCube;
}

function shatterCube(sourceCube) {
    const numShards = 20;
    const newCubes = [];
    for (let i = 0; i < numShards; i++) {
        newCubes.push({
            ...CUBE_GEOMETRY,
            x: sourceCube.x,
            y: sourceCube.y,
            size: sourceCube.size / 5,
            mass: 0.1,
            vx: (Math.random() - 0.5) * 15,
            vy: (Math.random() - 0.5) * 15,
            rotX: sourceCube.rotX,
            rotY: sourceCube.rotY,
            rotZ: sourceCube.rotZ,
            isShard: true,
            life: 1, // 1 = 100% life
        });
    }
    cubes = newCubes;
}


// --- Main Game Logic ---
function setup() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    gameContainer.classList.remove('hidden');

    // Generate 3D letter objects from shapes
    Object.keys(letterShapes).forEach(char => {
        titleState.letters[char] = extrudeShape(letterShapes[char], 20);
    });

    resetGame();

    // Remove old listeners to prevent duplication
    window.removeEventListener('resize', setup);
    titleScreen.removeEventListener('click', handleTitleTap);

    // Add new listeners
    window.addEventListener('resize', setup);
    titleScreen.addEventListener('click', handleTitleTap, { once: true });

    // Start game loop if it's the first time
    if (!gameState.loopRunning) {
        gameState.loopRunning = true;
        gameLoop();
    }
}

function resetGame() {
    cubes = [createCube()];
    gameState.isDragging = false;
    gameState.hasWon = false;
    gameState.totalDist = 0;

    winMessage.classList.add('hidden');
    resetButton.classList.add('hidden');
    instructions.classList.remove('hidden');
    instructions.textContent = "The cube is heavy.";

    // Re-attach pointer listeners for the new game
    canvas.onpointerdown = handlePointerDown;
    canvas.onpointerup = handlePointerUp;
    canvas.onpointerleave = handlePointerUp; // Stop dragging if pointer leaves canvas
    canvas.onpointermove = null;
}

function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

function update() {
    switch (gameState.appState) {
        case 'title':
            updateTitle();
            break;
        case 'transitioning':
            updateTransition();
            break;
        case 'playing':
            updatePlaying();
            break;
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    switch (gameState.appState) {
        case 'title':
            drawTitle();
            break;
        case 'transitioning':
            drawTransition();
            // Fall-through to draw the game behind the transition
        case 'playing':
            drawPlaying();
            break;
    }
}

// --- Update and Draw Functions for each State ---
function updateTitle() {
    titleState.rotY += 0.005;
    titleState.rotX += 0.002;
}

function drawTitle() {
    const titleText = "SNOW BLOCK";
    const totalChars = titleText.replace(/ /g, '').length;
    const spaceWidth = 100;
    const charWidth = 100;
    
    // Responsive scaling
    const availableWidth = canvas.width * 0.8;
    const requiredWidth = totalChars * charWidth + (titleText.split(' ').length -1) * spaceWidth;
    const scale = Math.min(1.5, availableWidth / requiredWidth);
    
    const scaledCharWidth = charWidth * scale;
    const scaledSpaceWidth = spaceWidth * scale;

    let currentX = (canvas.width / 2) - (requiredWidth * scale / 2);
    
    for (const char of titleText) {
        if (char === ' ') {
            currentX += scaledSpaceWidth;
            continue;
        }
        const letter = titleState.letters[char];
        if (letter) {
            drawWireframeObject(letter, currentX + scaledCharWidth / 2, canvas.height * 0.4, scale, titleState.rotX, titleState.rotY, titleState.rotZ, '#fff');
        }
        currentX += scaledCharWidth;
    }

    // Draw subtitle
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.font = '1.2rem Helvetica Neue, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Tap to begin', canvas.width / 2, canvas.height * 0.6);
}

function updateTransition() {
    let allCubesOffScreen = true;
    transitionState.cubes.forEach(cube => {
        cube.y += cube.vy;
        cube.rotX += cube.rotSpeedX;
        cube.rotY += cube.rotSpeedY;
        cube.rotZ += cube.rotSpeedZ;
        if (cube.y < canvas.height + cube.size) {
            allCubesOffScreen = false;
        }
    });

    if (allCubesOffScreen && transitionState.cubes.length > 0) {
        gameState.appState = 'playing';
        transitionState.cubes = []; // Clear cubes for performance
    }
}

function drawTransition() {
    transitionState.cubes.forEach(cube => {
        drawWireframeObject(cube, cube.x, cube.y, cube.size, cube.rotX, cube.rotY, cube.rotZ, '#fff');
    });
}

function updatePlaying() {
    if (gameState.hasWon) return;

    cubes.forEach((cube, index) => {
        if (cube.isShard) {
            cube.life -= 0.02;
            if (cube.life <= 0) {
                cubes.splice(index, 1);
            }
        }
        const snowDrag = 0.92;
        cube.vx *= snowDrag;
        cube.vy *= snowDrag;

        cube.x += cube.vx;
        cube.y += cube.vy;

        // Wall collision
        if (cube.x - cube.size < 0) { cube.x = cube.size; cube.vx *= -0.5; }
        if (cube.x + cube.size > canvas.width) { cube.x = canvas.width - cube.size; cube.vx *= -0.5; }
        // Ceiling/Floor collision
        if (cube.y - cube.size < 0) { cube.y = cube.size; cube.vy *= -0.5; }
        if (cube.y + cube.size > canvas.height) { cube.y = canvas.height - cube.size; cube.vy *= -0.5; }
    });

    // Reset if all shards are gone
    if (cubes.length === 0) {
        resetGame();
    }
}

function drawPlaying() {
    cubes.forEach(cube => {
        const color = cube.isShard ? `rgba(255, 255, 255, ${cube.life})` : '#fff';
        drawWireframeObject(cube, cube.x, cube.y, cube.size, cube.rotX, cube.rotY, cube.rotZ, color);
    });
}

// --- Event Handlers ---
function handlePointerDown(e) {
    if (gameState.hasWon || cubes.length > 1) return;
    const mainCube = cubes[0];
    const dx = e.clientX - mainCube.x;
    const dy = e.clientY - mainCube.y;
    // Only start drag if clicking near the cube
    if (Math.sqrt(dx * dx + dy * dy) < mainCube.size * 2) {
        gameState.isDragging = true;
        canvas.cursor = 'grabbing';
        gameState.lastPointerX = e.clientX;
        gameState.lastPointerY = e.clientY;
        canvas.onpointermove = handlePointerMove;
        canvas.setPointerCapture(e.pointerId);
    }
}

function handlePointerUp(e) {
    gameState.isDragging = false;
    canvas.cursor = 'grab';
    canvas.onpointermove = null;
    canvas.releasePointerCapture(e.pointerId);
}

function handlePointerMove(e) {
    if (!gameState.isDragging || gameState.hasWon || cubes.length > 1) return;
    const mainCube = cubes[0];

    const deltaX = e.clientX - gameState.lastPointerX;
    const deltaY = e.clientY - gameState.lastPointerY;

    const pushMultiplier = 0.3;
    mainCube.vx += deltaX * pushMultiplier / mainCube.mass;
    mainCube.vy += deltaY * pushMultiplier / mainCube.mass;

    // Rotation based on movement
    const rotMultiplier = 0.001;
    mainCube.rotX += deltaY * rotMultiplier;
    mainCube.rotY -= deltaX * rotMultiplier;

    gameState.lastPointerX = e.clientX;
    gameState.lastPointerY = e.clientY;

    const dist = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    gameState.totalDist += dist;

    // Grow cube based on distance pushed
    const growthFactor = 1.5;
    const maxSize = Math.min(canvas.width, canvas.height) / 3;
    mainCube.size = 50 + (gameState.totalDist / 100) * growthFactor;
    mainCube.mass = 1 + (mainCube.size - 50) / 10;

    if (mainCube.size > maxSize) {
        shatterCube(mainCube);
        instructions.textContent = "It broke.";
    } else {
        instructions.textContent = "The cube is heavy.";
    }
}

function handleDeviceMotion(e) {
    if (gameState.hasWon) return;
    const mainCube = cubes[0];
    if (!mainCube || mainCube.isShard) return;

    // Check if phone is upside down (gravity is inverted on y-axis)
    if (e.accelerationIncludingGravity.y < -7) {
        mainCube.vy -= 0.5; // Apply gentle upward force

        if (!gameState.hintShown) {
             instructions.textContent = "... or is it?";
             gameState.hintShown = true;
        }
    }

    if (mainCube.y < -mainCube.size * 2) { // Cube has floated off the top
        gameState.hasWon = true;
        winMessage.classList.remove('hidden');
        resetButton.classList.remove('hidden');
        resetButton.onclick = () => {
             gameState.appState = 'title';
             titleScreen.style.opacity = 1;
             titleScreen.style.pointerEvents = 'auto';
             setup();
        };
        instructions.classList.add('hidden');
    }
}

// --- Initial Setup ---
setup();
