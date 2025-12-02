const BASE_WORLD_WIDTH = 480;
const WORLD_HEIGHT = 640;
let worldWidth = BASE_WORLD_WIDTH;
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

let devicePixelRatioScale = window.devicePixelRatio || 1;
let renderScaleX = 1;
let renderScaleY = 1;

const GRAVITY = 1200;
const FLAP_STRENGTH = -360;
const PIPE_GAP = 160;
const PIPE_SPEED = 220;
const BASE_PIPE_INTERVAL = 1500;
const MIN_PIPE_INTERVAL = 1150;
const MAX_PIPE_INTERVAL = 2100;
const GROUND_HEIGHT = 110;
const BIRD_RADIUS = 22;
const BIRD_X_RATIO = 0.3;
const BACKGROUND_SPEED = PIPE_SPEED * 0.25;
const MAX_DELTA = 0.035;

let pipeWidth = 80;

const state = {
    running: false,
    gameOver: false,
    lastTime: 0,
    spawnTimer: 0,
    pipeInterval: BASE_PIPE_INTERVAL,
    score: 0,
    best: Number(localStorage.getItem("flappy-best") || 0),
    pipes: [],
    backgroundOffset: 0,
    idleTime: 0,
    backgroundTileWidth: worldWidth,
    paused: false,
    restartLocked: false
};

const bird = {
    x: worldWidth * BIRD_X_RATIO,
    y: WORLD_HEIGHT * 0.45,
    velocity: 0,
    rotation: 0
};

const assets = {
    background: null,
    bird: null,
    pipeImages: []
};

const backgroundMusic = new Audio("assets/bgmusic.mp3");
backgroundMusic.loop = true;
backgroundMusic.volume = 0.45;

const crashTracks = ["assets/crashmusic1.mp3", "assets/crashmusic2.mp3"];
const jumpSound = new Audio("assets/jump.mp3");
jumpSound.volume = 0.32;

let audioUnlocked = false;
let assetsReady = false;
let activeCrashAudio = null;

const overlay = document.getElementById("overlay");
const scoreCard = document.getElementById("score-card");
const pauseCard = document.getElementById("pause-card");
const startCard = document.getElementById("start-card");
const scoreValueEl = document.getElementById("score-value");
const bestValueEl = document.getElementById("best-value");

function setBlur() {
    canvas.classList.remove("blurred");
}

function refreshScoreCard() {
    if (scoreValueEl) {
        scoreValueEl.textContent = String(state.score);
    }
    if (bestValueEl) {
        bestValueEl.textContent = String(state.best);
    }
}

function refreshOverlay() {
    const showScore = state.gameOver;
    const showPause = state.paused && !state.gameOver;
    const showStart = !state.running && !state.gameOver;

    if (overlay) {
        overlay.classList.toggle("visible", showScore || showPause || showStart);
    }
    if (scoreCard) {
        scoreCard.classList.toggle("visible", showScore);
    }
    if (pauseCard) {
        pauseCard.classList.toggle("visible", showPause);
    }
    if (startCard) {
        startCard.classList.toggle("visible", showStart);
    }

    if (showScore) {
        refreshScoreCard();
    }

    setBlur();
}

function setPaused(paused) {
    if (state.paused === paused) {
        return;
    }
    state.paused = paused;
    if (!paused) {
        state.lastTime = performance.now();
    }
    refreshOverlay();
}

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.src = src;
        image.onload = () => resolve(image);
        image.onerror = reject;
    });
}

function unlockAudio() {
    if (audioUnlocked) {
        return;
    }
    audioUnlocked = true;
}

function startBackgroundMusic() {
    if (!audioUnlocked) {
        unlockAudio();
    }
    backgroundMusic.currentTime = 0;
    backgroundMusic.play().catch(() => {});
}

function playJumpSound() {
    if (!audioUnlocked) {
        return;
    }
    jumpSound.currentTime = 0;
    jumpSound.play().catch(() => {});
}

function playCrashSound() {
    if (!audioUnlocked) {
        return false;
    }

    if (activeCrashAudio) {
        activeCrashAudio.pause();
        activeCrashAudio = null;
    }

    const choice = crashTracks[Math.floor(Math.random() * crashTracks.length)];
    const crash = new Audio(choice);
    activeCrashAudio = crash;
    crash.volume = 0.6;

    const releaseLock = () => {
        if (activeCrashAudio === crash) {
            activeCrashAudio = null;
            state.restartLocked = false;
        }
    };

    crash.addEventListener("ended", releaseLock);
    crash.addEventListener("error", releaseLock);
    crash.play().catch(() => {
        releaseLock();
    });

    return true;
}

function recomputePipeWidth() {
    const baseMin = 68;
    const baseMax = 96;
    const referencePipe = assets.pipeImages.length > 0 ? assets.pipeImages[0] : null;
    const assetWidth = referencePipe ? referencePipe.width : 86;
    const clampedAsset = Math.max(Math.min(assetWidth, baseMax), baseMin);
    const aspect = Math.max(worldWidth / BASE_WORLD_WIDTH, 0.65);
    const scale = Math.min(Math.pow(aspect, 0.35), 1.2);
    pipeWidth = Math.max(Math.min(clampedAsset * scale, baseMax), baseMin);
}

function recomputeBackgroundTileWidth() {
    if (assets.background) {
        const aspect = assets.background.width / assets.background.height;
        state.backgroundTileWidth = Math.max(aspect * WORLD_HEIGHT, worldWidth);
    } else {
        state.backgroundTileWidth = worldWidth;
    }
}

function applyWorldWidthChange(previousWidth) {
    recomputePipeWidth();
    recomputeBackgroundTileWidth();

    const tileWidth = state.backgroundTileWidth || worldWidth;
    const scale = previousWidth > 0 ? worldWidth / previousWidth : 1;

    bird.x = worldWidth * BIRD_X_RATIO;

    state.pipes.forEach(pipe => {
        pipe.x *= scale;
        pipe.width = pipeWidth;
    });

    state.backgroundOffset = (state.backgroundOffset * scale) % tileWidth;
}

function resizeCanvas() {
    devicePixelRatioScale = window.devicePixelRatio || 1;
    const availableWidth = Math.max(window.innerWidth, 1);
    const availableHeight = Math.max(window.innerHeight, 1);
    const previousWidth = worldWidth;

    const targetAspect = availableWidth / availableHeight;
    if (Number.isFinite(targetAspect) && targetAspect > 0) {
        worldWidth = WORLD_HEIGHT * targetAspect;
    } else {
        worldWidth = BASE_WORLD_WIDTH;
    }

    const cssWidth = availableWidth;
    const cssHeight = availableHeight;

    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;

    canvas.width = Math.max(Math.floor(cssWidth * devicePixelRatioScale), 1);
    canvas.height = Math.max(Math.floor(cssHeight * devicePixelRatioScale), 1);

    renderScaleX = canvas.width / worldWidth;
    renderScaleY = canvas.height / WORLD_HEIGHT;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    applyWorldWidthChange(previousWidth);
    refreshOverlay();
}

function resetGame() {
    state.running = false;
    state.gameOver = false;
    state.spawnTimer = 0;
    state.pipeInterval = BASE_PIPE_INTERVAL;
    state.score = 0;
    state.pipes = [];
    state.backgroundOffset = 0;
    state.idleTime = 0;
    state.lastTime = 0;
    state.restartLocked = false;
    state.paused = false;

    bird.x = worldWidth * BIRD_X_RATIO;
    bird.y = WORLD_HEIGHT * 0.45;
    bird.velocity = 0;
    bird.rotation = 0;

    if (activeCrashAudio) {
        activeCrashAudio.pause();
        activeCrashAudio = null;
    }

    if (audioUnlocked) {
        backgroundMusic.pause();
        backgroundMusic.currentTime = 0;
    }

    refreshOverlay();
}

function flap() {
    if (!assetsReady) {
        return;
    }

    if (state.restartLocked || state.paused) {
        return;
    }

    if (state.gameOver) {
        resetGame();
    }

    unlockAudio();

    if (!state.running) {
        state.running = true;
        state.lastTime = performance.now();
        startBackgroundMusic();
        refreshOverlay();
    }

    bird.velocity = FLAP_STRENGTH;
    playJumpSound();
}

function spawnPipe() {
    const minGapY = 70;
    const maxGapY = WORLD_HEIGHT - GROUND_HEIGHT - 70 - PIPE_GAP;
    const gapY = Math.random() * (maxGapY - minGapY) + minGapY;
    const pipeImages = assets.pipeImages;
    const pipeImage = pipeImages.length > 0 ? pipeImages[Math.floor(Math.random() * pipeImages.length)] : null;

    state.pipes.push({
        x: worldWidth + pipeWidth,
        width: pipeWidth,
        gapY,
        gapHeight: PIPE_GAP,
        passed: false,
        image: pipeImage
    });
}

function update(delta) {
    if (!assetsReady) {
        return;
    }

    if (state.paused) {
        return;
    }

    const clampedDelta = Math.min(delta, MAX_DELTA);
    const tileWidth = state.backgroundTileWidth || worldWidth;
    const backgroundAdvance = state.running ? BACKGROUND_SPEED : BACKGROUND_SPEED * 0.35;
    state.backgroundOffset = (state.backgroundOffset + backgroundAdvance * clampedDelta) % tileWidth;

    if (!state.running) {
        state.idleTime += clampedDelta;
        bird.y = WORLD_HEIGHT * 0.45 + Math.sin(state.idleTime * 3) * 12;
        bird.rotation = Math.sin(state.idleTime * 3) * 0.12;
        return;
    }

    bird.velocity += GRAVITY * clampedDelta;
    bird.y += bird.velocity * clampedDelta;
    bird.rotation = Math.max(Math.min(Math.atan2(bird.velocity, PIPE_SPEED * 1.6), 1.2), -0.7);

    state.spawnTimer += clampedDelta * 1000;
    if (state.spawnTimer >= state.pipeInterval) {
        state.spawnTimer = 0;
        spawnPipe();
        const variance = 220;
        state.pipeInterval = BASE_PIPE_INTERVAL + (Math.random() - 0.5) * variance;
        state.pipeInterval = Math.max(MIN_PIPE_INTERVAL, Math.min(MAX_PIPE_INTERVAL, state.pipeInterval));
    }

    for (const pipe of state.pipes) {
        pipe.x -= PIPE_SPEED * clampedDelta;

        if (!pipe.passed && pipe.x + pipe.width < bird.x - BIRD_RADIUS) {
            pipe.passed = true;
            state.score += 1;
            if (state.score > state.best) {
                state.best = state.score;
                localStorage.setItem("flappy-best", state.best);
            }
        }

        if (
            bird.x + BIRD_RADIUS > pipe.x &&
            bird.x - BIRD_RADIUS < pipe.x + pipe.width
        ) {
            if (bird.y - BIRD_RADIUS < pipe.gapY || bird.y + BIRD_RADIUS > pipe.gapY + pipe.gapHeight) {
                triggerGameOver();
            }
        }
    }

    state.pipes = state.pipes.filter(pipe => pipe.x + pipe.width > -pipe.width);

    if (bird.y + BIRD_RADIUS >= WORLD_HEIGHT - GROUND_HEIGHT) {
        bird.y = WORLD_HEIGHT - GROUND_HEIGHT - BIRD_RADIUS;
        triggerGameOver();
    }

    if (bird.y - BIRD_RADIUS <= 0) {
        bird.y = BIRD_RADIUS;
        triggerGameOver();
    }
}

function triggerGameOver() {
    if (state.gameOver) {
        return;
    }

    state.running = false;
    state.gameOver = true;
    bird.velocity = 0;

    if (audioUnlocked) {
        backgroundMusic.pause();
        backgroundMusic.currentTime = 0;
    }
    state.restartLocked = playCrashSound();
    refreshOverlay();
}

function drawBackground() {
    if (!assets.background) {
        ctx.fillStyle = "#4ec0ca";
        ctx.fillRect(0, 0, worldWidth, WORLD_HEIGHT);
        return;
    }

    const tileWidth = state.backgroundTileWidth || worldWidth;
    for (let x = -state.backgroundOffset; x < worldWidth + tileWidth; x += tileWidth) {
        ctx.drawImage(assets.background, x, 0, tileWidth, WORLD_HEIGHT);
    }
}

function drawGround() {
    const topY = WORLD_HEIGHT - GROUND_HEIGHT;
    const gradient = ctx.createLinearGradient(0, topY, 0, WORLD_HEIGHT);
    gradient.addColorStop(0, "#d8c56c");
    gradient.addColorStop(1, "#c79b3b");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, topY, worldWidth, GROUND_HEIGHT);

    ctx.fillStyle = "rgba(0, 0, 0, 0.1)";
    for (let i = 0; i < worldWidth; i += 40) {
        ctx.fillRect(i, topY, 20, 8);
    }
}

function drawPipes() {
    for (const pipe of state.pipes) {
        const topHeight = pipe.gapY;
        const bottomY = pipe.gapY + pipe.gapHeight;
        const bottomHeight = WORLD_HEIGHT - GROUND_HEIGHT - bottomY;
        const pipeImage = pipe.image;

        if (topHeight > 0) {
            ctx.save();
            ctx.translate(pipe.x, pipe.gapY);
            ctx.scale(1, -1);
            if (pipeImage) {
                ctx.drawImage(pipeImage, 0, 0, pipe.width, topHeight);
            } else {
                ctx.fillStyle = "#2fbf71";
                ctx.fillStyle = "#2fbf71";
                ctx.fillRect(0, 0, pipe.width, topHeight);
            }
            ctx.restore();
        }

        if (bottomHeight > 0) {
            if (pipeImage) {
                ctx.drawImage(pipeImage, pipe.x, bottomY, pipe.width, bottomHeight);
            } else {
                ctx.fillStyle = "#2fbf71";
                ctx.fillRect(pipe.x, bottomY, pipe.width, bottomHeight);
            }
        }
    }
}

function drawBird() {
    ctx.save();
    ctx.translate(bird.x, bird.y);
    ctx.rotate(bird.rotation * 0.75);

    if (assets.bird) {
        const aspect = assets.bird.width / assets.bird.height;
        const drawHeight = BIRD_RADIUS * 2.2;
        const drawWidth = drawHeight * aspect;
        ctx.drawImage(assets.bird, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    } else {
        ctx.fillStyle = "#ffeb3b";
        ctx.beginPath();
        ctx.arc(0, 0, BIRD_RADIUS, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
}

function drawHud() {
    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
    ctx.fillRect(worldWidth / 2 - 80, 30, 160, 60);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 44px 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(state.score), worldWidth / 2, 60);

    ctx.restore();
}

function draw() {
    ctx.setTransform(renderScaleX, 0, 0, renderScaleY, 0, 0);
    ctx.clearRect(0, 0, worldWidth, WORLD_HEIGHT);
    drawBackground();
    drawPipes();
    drawGround();
    drawBird();
    drawHud();
}

function loop(timestamp) {
    if (!state.lastTime) {
        state.lastTime = timestamp;
    }
    const delta = (timestamp - state.lastTime) / 1000;
    state.lastTime = timestamp;
    update(delta);
    draw();
    requestAnimationFrame(loop);
}

function startGame() {
    resizeCanvas();
    resetGame();
    requestAnimationFrame(loop);
}

window.addEventListener("keydown", event => {
    if (event.code === "Space") {
        event.preventDefault();
        flap();
    }
});

window.addEventListener("mousedown", event => {
    if (event.button === 0) {
        flap();
    }
});

window.addEventListener("touchstart", event => {
    event.preventDefault();
    flap();
}, { passive: false });

window.addEventListener("resize", resizeCanvas);
window.addEventListener("orientationchange", resizeCanvas);

document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
        if (state.running && !state.gameOver) {
            setPaused(true);
        }
        if (audioUnlocked) {
            backgroundMusic.pause();
        }
    } else {
        if (state.paused) {
            setPaused(false);
        }
        if (audioUnlocked && state.running && !state.gameOver) {
            backgroundMusic.play().catch(() => {});
        }
    }
});

const assetPromises = [
    loadImage("assets/bg.jpg"),
    loadImage("assets/bird.png"),
    loadImage("assets/pillar.png"),
    loadImage("assets/pillar2.png")
].map(promise => promise.catch(() => null));

Promise.all(assetPromises).then(([background, birdImage, pipeImage1, pipeImage2]) => {
    if (background) {
        assets.background = background;
    }
    if (birdImage) {
        assets.bird = birdImage;
    }
    assets.pipeImages = [pipeImage1, pipeImage2].filter(image => image);
    assetsReady = true;
    applyWorldWidthChange(worldWidth);
    startGame();
}).catch(error => {
    console.error("Failed to load assets", error);
    assetsReady = true;
    applyWorldWidthChange(worldWidth);
    startGame();
});
