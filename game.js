const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const shell = document.querySelector(".phone-shell");
const startButton = document.getElementById("start");
const restartButton = document.getElementById("restart");

const W = 720;
let H = 1280;
const ink = "#2b211f";
const sky = "#9ed7f3";
const grass = "#bee969";
const foodTypes = ["cake", "pizza", "chicken", "meat"];
const veggieTypes = ["broccoli", "carrot", "cabbage"];
const roadItemTypes = [...foodTypes, ...veggieTypes];
const playerWalkFps = 5.6;
const playerSpriteHeight = 225;
const playerGroundOffset = 116;
const playerMouthOffset = { x: 110, y: 9 };
const itemMouthHeight = playerGroundOffset - playerMouthOffset.y;
const playerOpenFrameYOffset = [19, 46, 19, 31];
const maxEnergy = 100;
const foodEnergy = 5;
const assetStatus = {
  total: 0,
  loaded: 0,
  failed: 0,
  ready: false,
  error: "",
};
const assetPromises = [];
const playerSprites = {
  walk: loadFrames("assets/player/walk/walk_", 4),
  walkOpen: loadFrames("assets/player/walk/walk_", 4, "_open"),
  jump: loadFrames("assets/player/jump/jump_", 4),
};
const foodSprites = Object.fromEntries(
  roadItemTypes.map((type) => [type, loadImage(`assets/food/${type}.png`)]),
);
const itemPatterns = [
  [false, false, true, false, false, true],
  [false, true, false, false, true, false],
  [false, false, true, false, true, false],
  [false, true, false, true, false, false],
];

let game;
startButton.disabled = true;
startButton.textContent = "素材加载中...";

function loadFrames(prefix, count, suffix = "") {
  return Array.from({ length: count }, (_, index) => {
    return loadImage(`${prefix}${String(index + 1).padStart(2, "0")}${suffix}.png`);
  });
}

function loadImage(src) {
  const image = new Image();
  assetStatus.total += 1;
  const promise = new Promise((resolve, reject) => {
    image.addEventListener("load", () => {
      assetStatus.loaded += 1;
      resolve(image);
    }, { once: true });
    image.addEventListener("error", () => {
      assetStatus.failed += 1;
      reject(new Error(`素材加载失败: ${src}`));
    }, { once: true });
  });
  image.src = `./${src}`;
  assetPromises.push(promise);
  return image;
}

function markAssetsReady() {
  assetStatus.ready = true;
  startButton.disabled = false;
  startButton.textContent = "开始游戏";
}

function markAssetsFailed(error) {
  assetStatus.error = error.message;
  startButton.disabled = true;
  startButton.textContent = "素材加载失败";
}

function resizeCanvas() {
  const ratio = window.innerHeight / Math.max(1, window.innerWidth);
  H = Math.max(960, Math.round(W * ratio));
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function groundLine() {
  return Math.round(H * 0.68);
}

function launchY() {
  return terrain(275) - playerGroundOffset - 180;
}

function resetGame({ playing = false } = {}) {
  game = {
    t: 0,
    speed: 165,
    distance: 0,
    energy: 0,
    hearts: 5,
    started: playing,
    over: false,
    won: false,
    rider: {
      x: 275,
      y: playing ? launchY() : terrain(275) - playerGroundOffset,
      vy: 0,
      grounded: !playing,
      angle: 0,
      airTime: 0,
    },
    eating: null,
    stunnedUntil: 0,
    stunFrameIndex: 0,
    effects: [],
    clouds: [
      { x: 55, y: 175, s: 1.0 },
      { x: 430, y: 120, s: 0.8 },
      { x: 635, y: 230, s: 0.75 },
      { x: 190, y: 205, s: 0.58 },
    ],
    items: [],
    itemQueue: [],
    nextItem: 520,
  };
  spawnInitialItems();
  syncStartScreen();
}

function startGame() {
  if (!assetStatus.ready) return;
  resetGame({ playing: true });
}

function syncStartScreen() {
  shell.classList.toggle("is-playing", game.started || game.over);
}

function spawnInitialItems() {
  for (let x = 980; x <= 3600; x += 520) {
    spawnItem(x);
  }
  game.nextItem = 4120;
}

function spawnItem(x, forcedBad) {
  const bad = forcedBad ?? nextItemBad();
  const ground = terrain(x);
  const lift = itemMouthHeight;
  game.items.push({
    x,
    y: ground - lift,
    size: bad ? 54 : 50,
    type: bad
      ? veggieTypes[Math.floor(Math.random() * veggieTypes.length)]
      : foodTypes[Math.floor(Math.random() * foodTypes.length)],
    bad,
    hit: false,
    bob: Math.random() * Math.PI * 2,
  });
}

function nextItemBad() {
  if (game.itemQueue.length === 0) refillItemQueue();
  return game.itemQueue.shift();
}

function refillItemQueue() {
  const lastItem = game.items.length > 0 ? game.items[game.items.length - 1] : null;
  const candidates = itemPatterns.filter((pattern) => !(lastItem?.bad && pattern[0]));
  const pattern = candidates[Math.floor(Math.random() * candidates.length)] || itemPatterns[0];
  game.itemQueue.push(...pattern);
}

function terrain(worldX) {
  return groundLine();
}

function terrainSlope(worldX) {
  return 0;
}

function jump(strength = 1) {
  if (game.over) {
    resetGame();
    return;
  }
  if (!game.started) return;
  if (isStunned()) return;
  if (game.rider.grounded) {
    game.rider.vy = -660 * strength;
    game.rider.grounded = false;
  }
}

function update(dt) {
  if (game.over) {
    game.t += dt;
    return;
  }

  game.t += dt;
  const stunned = isStunned();
  const moveDt = stunned ? 0 : dt;
  if (!game.started) {
    const rider = game.rider;
    rider.y = terrain(game.distance + rider.x) - playerGroundOffset;
    rider.vy = 0;
    rider.grounded = true;
    rider.angle = 0;
    rider.airTime = 0;
    return;
  }

  game.distance += game.speed * moveDt;
  game.speed = Math.min(245, game.speed + moveDt * 2.4);

  const rider = game.rider;
  const worldX = game.distance + rider.x;
  const groundY = terrain(worldX) - playerGroundOffset;

  rider.vy += 980 * moveDt;
  rider.y += rider.vy * moveDt;
  if (rider.y >= groundY) {
    rider.y = groundY;
    rider.vy = 0;
    rider.grounded = true;
    rider.angle = 0;
    rider.airTime = 0;
  } else {
    rider.grounded = false;
    rider.airTime += dt;
    rider.angle = Math.max(-0.18, Math.min(0.18, rider.vy / 1800));
  }

  for (const cloud of game.clouds) {
    cloud.x -= moveDt * (16 + cloud.s * 9);
    if (cloud.x < -130) cloud.x = W + 120 + Math.random() * 160;
  }

  while (game.nextItem < game.distance + 1180) {
    spawnItem(game.nextItem);
    game.nextItem += 430 + Math.random() * 210;
  }

  for (const item of game.items) {
    const sx = item.x - game.distance;
    const sy = item.y;
    const itemRadius = item.bad ? item.size * 0.42 : item.size * 0.46;
    const riderRadius = item.bad ? 26 : 22;
    const riderCenterX = rider.x + playerMouthOffset.x;
    const riderCenterY = rider.y + playerMouthOffset.y;
    if (!item.hit && circleHit(sx, sy, itemRadius, riderCenterX, riderCenterY, riderRadius)) {
      item.hit = true;
      if (item.bad) {
        game.hearts -= 1;
        triggerEatFrame();
        triggerBadFoodEffect();
        if (game.hearts <= 0) game.over = true;
      } else {
        game.energy = Math.min(maxEnergy, game.energy + foodEnergy);
        triggerEatFrame();
        if (game.energy >= maxEnergy) {
          game.over = true;
          game.won = true;
        }
      }
    }
  }
  game.items = game.items.filter((item) => item.x - game.distance > -140 && !item.hit);
  game.effects = game.effects.filter((effect) => game.t <= effect.until);
}

function currentWalkFrameIndex() {
  if (!game.started) return 0;
  if (isStunned()) return game.stunFrameIndex;
  return Math.floor(game.t * playerWalkFps) % playerSprites.walk.length;
}

function isStunned() {
  return game.started && game.t < game.stunnedUntil;
}

function triggerEatFrame() {
  if (!game.rider.grounded) return;
  const frameIndex = currentWalkFrameIndex();
  game.eating = {
    frameIndex,
    until: game.t + 1 / playerWalkFps,
  };
}

function triggerBadFoodEffect() {
  const rider = game.rider;
  game.stunFrameIndex = currentWalkFrameIndex();
  game.stunnedUntil = Math.max(game.stunnedUntil, game.t + 0.72);
  game.effects.push({
    type: "dizzy",
    x: rider.x + 70,
    y: rider.y - 18,
    startedAt: game.t,
    until: game.t + 0.72,
  });
}

function circleHit(ax, ay, ar, bx, by, br) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy < (ar + br) * (ar + br);
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  if (!assetStatus.ready) {
    drawLoading();
    return;
  }

  for (const cloud of game.clouds) drawCloud(cloud.x, cloud.y, cloud.s);
  drawGround();
  drawItems();
  drawRider();
  drawEffects();
  drawHud();
  if (game.over) drawGameOver();
}

function drawLoading() {
  drawCloud(120, 180, 0.9);
  drawCloud(520, 145, 0.72);
  drawGround();

  const progress = assetStatus.total === 0
    ? 0
    : Math.round((assetStatus.loaded / assetStatus.total) * 100);
  const y = Math.round(H * 0.42);
  const message = assetStatus.error || `素材加载中 ${progress}%`;
  outlinedText(message, 98, y, assetStatus.error ? 34 : 38);
}

function drawEffects() {
  for (const effect of game.effects) {
    if (effect.type === "dizzy") drawDizzyEffect(effect);
  }
}

function drawDizzyEffect(effect) {
  const progress = Math.min(1, (game.t - effect.startedAt) / (effect.until - effect.startedAt));
  const alpha = 1 - Math.max(0, progress - 0.58) / 0.42;
  const wobble = Math.sin(game.t * 42) * (1 - progress) * 3;
  const spin = game.t * 8;

  ctx.save();
  ctx.globalAlpha = Math.max(0, alpha);
  ctx.translate(effect.x + wobble, effect.y);
  drawDizzySpiral(2, -76, 19 + Math.sin(game.t * 16) * 2, spin);
  drawStar(-34 + Math.cos(spin) * 8, -58 + Math.sin(spin) * 5, 9, "#fff66f");
  drawStar(31 + Math.cos(spin + 2.1) * 9, -51 + Math.sin(spin + 2.1) * 6, 8, "#ffb6cf");
  drawStar(0 + Math.cos(spin + 4.2) * 12, -37 + Math.sin(spin + 4.2) * 5, 7, "#ffffff");
  ctx.restore();
}

function drawDizzySpiral(x, y, r, rot) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot * 0.28);
  ctx.strokeStyle = ink;
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  for (let i = 0; i < 42; i++) {
    const t = i / 41;
    const a = t * Math.PI * 3.6;
    const rr = r * (1 - t * 0.72);
    const px = Math.cos(a) * rr;
    const py = Math.sin(a) * rr * 0.62;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.restore();
}

function drawGround() {
  ctx.beginPath();
  ctx.moveTo(0, H + 20);
  const ground = groundLine();
  ctx.lineTo(0, ground);
  ctx.bezierCurveTo(120, ground - 6, 220, ground + 6, 360, ground);
  ctx.bezierCurveTo(500, ground - 6, 610, ground + 4, W + 20, ground);
  ctx.lineTo(W + 20, H + 20);
  ctx.closePath();
  ctx.fillStyle = grass;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(0, ground);
  ctx.bezierCurveTo(120, ground - 6, 220, ground + 6, 360, ground);
  ctx.bezierCurveTo(500, ground - 6, 610, ground + 4, W + 20, ground);
  ctx.strokeStyle = ink;
  ctx.lineWidth = 7;
  ctx.lineJoin = "round";
  ctx.stroke();
}

function drawCloud(x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = "rgba(255,255,255,0.96)";
  blob(-38, 6, 42, 33);
  blob(0, -8, 50, 44);
  blob(46, 9, 42, 33);
  blob(10, 22, 58, 23);
  ctx.restore();
}

function drawItems() {
  for (const item of game.items) {
    drawFoodSprite(item.x - game.distance, item.y, item.type, item.size);
  }
}

function drawFoodSprite(x, y, type, size) {
  const image = foodSprites[type];
  if (!image?.complete || image.naturalWidth === 0) return;

  const scale = size / 116;
  const drawW = image.naturalWidth * scale;
  const drawH = image.naturalHeight * scale;
  ctx.drawImage(image, x - drawW * 0.5, y - drawH * 0.5, drawW, drawH);
}

function drawRider() {
  const r = game.rider;
  const stunned = isStunned();
  const stride = r.grounded && game.started && !stunned ? Math.sin(game.t * 13) : 0;
  const bounce = r.grounded && game.started && !stunned ? Math.abs(Math.sin(game.t * 13)) * 4 : 0;
  const jumpPose = r.grounded ? 0 : Math.max(-1, Math.min(1, r.vy / 640));

  ctx.save();
  ctx.translate(r.x + 52 + (stunned ? Math.sin(game.t * 38) * 2 : 0), r.y + 58 + bounce);
  ctx.rotate(r.angle);
  ctx.translate(-52, -58);

  drawKittenSprite(jumpPose);
  ctx.restore();
}

function drawKittenSprite(jumpPose) {
  const r = game.rider;
  const frames = r.grounded ? playerSprites.walk : playerSprites.jump;
  const frameIndex = r.grounded
    ? currentWalkFrameIndex()
    : jumpFrameIndex(r.airTime, jumpPose);
  const openFrame =
    r.grounded &&
    game.eating &&
    game.t <= game.eating.until;
  const image = openFrame ? playerSprites.walkOpen[game.eating.frameIndex] : frames[frameIndex];

  const scale = playerSpriteHeight / image.naturalHeight;
  const feetX = 56;
  const feetY = 123;
  const yOffset = openFrame ? playerOpenFrameYOffset[game.eating.frameIndex] * scale : 0;
  const drawW = image.naturalWidth * scale;
  const drawH = image.naturalHeight * scale;

  ctx.drawImage(image, feetX - drawW * 0.5, feetY - drawH + yOffset, drawW, drawH);
}

function jumpFrameIndex(airTime, jumpPose) {
  if (airTime < 0.08) return 0;
  if (jumpPose < -0.28) return 1;
  if (jumpPose < 0.22) return 2;
  if (jumpPose < 0.82) return 3;
  return 0;
}

function drawStar(x, y, r, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.strokeStyle = ink;
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.42;
    const px = Math.cos(a) * rr;
    const py = Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawHud() {
  drawSmile(43, 42);
  drawEnergy(82, 27, 202, 31);
  drawHeart(617, 42, 17, "#ffc6d1");
  outlinedText("x" + game.hearts, 653, 52, 28);
}

function drawSmile(x, y) {
  ctx.fillStyle = "#fff179";
  ctx.strokeStyle = ink;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(x, y, 23, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.arc(x - 8, y - 5, 3.5, 0, Math.PI * 2);
  ctx.arc(x + 8, y - 5, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y + 1, 10, 0.25, Math.PI - 0.25);
  ctx.stroke();
}

function drawEnergy(x, y, w, h) {
  ctx.strokeStyle = ink;
  ctx.lineWidth = 7;
  roundRect(x, y, w, h, 14, false, true);
  ctx.save();
  ctx.clip();
  const fillW = Math.max(0, (w - 6) * (game.energy / maxEnergy));
  ctx.fillStyle = "#f38a37";
  if (fillW > 0) roundRect(x + 3, y + 3, fillW, h - 6, 10, true, false);
  ctx.restore();
}

function drawHeart(x, y, s, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s / 24, s / 24);
  ctx.fillStyle = color;
  ctx.strokeStyle = ink;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(0, 18);
  ctx.bezierCurveTo(-30, -5, -10, -30, 0, -12);
  ctx.bezierCurveTo(10, -30, 30, -5, 0, 18);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawGameOver() {
  ctx.fillStyle = "rgba(255, 241, 206, 0.78)";
  ctx.fillRect(0, 0, W, H);
  const y = Math.round(H * 0.36);
  outlinedText(game.won ? "通关!" : "不吃蔬菜", game.won ? 242 : 154, y, 64);
  outlinedText("点 ↻ 再玩", 226, y + 92, 34);
}

function outlinedText(text, x, y, size) {
  ctx.font = `900 ${size}px ui-rounded, "Hiragino Maru Gothic ProN", system-ui, sans-serif`;
  ctx.lineJoin = "round";
  ctx.strokeStyle = ink;
  ctx.lineWidth = Math.max(5, size * 0.16);
  ctx.strokeText(text, x, y);
  ctx.fillStyle = "#fff6b8";
  ctx.fillText(text, x, y);
}

function blob(x, y, rx, ry) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function roundRect(x, y, w, h, r, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

let touchStart = null;
let pointerStart = null;
window.addEventListener("touchstart", (event) => {
  const t = event.changedTouches[0];
  touchStart = { x: t.clientX, y: t.clientY, time: performance.now() };
}, { passive: false });

window.addEventListener("touchmove", (event) => event.preventDefault(), { passive: false });

window.addEventListener("touchend", (event) => {
  if (!touchStart) return;
  const t = event.changedTouches[0];
  const dy = touchStart.y - t.clientY;
  const dx = Math.abs(touchStart.x - t.clientX);
  if (dy > 28 && dy > dx * 0.8) jump(Math.min(1.2, 0.85 + dy / 280));
  touchStart = null;
}, { passive: false });

window.addEventListener("pointerdown", (event) => {
  pointerStart = { x: event.clientX, y: event.clientY };
});

window.addEventListener("pointerup", (event) => {
  if (!pointerStart) return;
  const dy = pointerStart.y - event.clientY;
  const dx = Math.abs(pointerStart.x - event.clientX);
  if (dy > 28 && dy > dx * 0.8) jump(Math.min(1.25, 0.9 + dy / 260));
  pointerStart = null;
});

window.addEventListener("keydown", (event) => {
  if (!game.started && (event.code === "Enter" || event.code === "Space")) {
    startGame();
    return;
  }
  if (event.code === "Space" || event.code === "ArrowUp") jump();
});

startButton.addEventListener("click", startGame);
restartButton.addEventListener("click", () => resetGame());
window.addEventListener("resize", () => {
  const wasPlaying = game.started && !game.over;
  resizeCanvas();
  resetGame({ playing: wasPlaying });
});

resizeCanvas();
resetGame();
Promise.all(assetPromises).then(markAssetsReady).catch(markAssetsFailed);
requestAnimationFrame(loop);
