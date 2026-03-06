// ══════════════════════════════════════════════════
//  STRAND COMMANDER – HBBU Arcade
//  SNIPPET 2 of 2 — Paste into WPCode as type: JavaScript
//  Set Location: "Run Everywhere" or "Footer"
//  DO NOT wrap in <script> tags — WPCode does that automatically
// ══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════
//  CONSTANTS
// ══════════════════════════════════════════════════════
const C   = document.getElementById('hbbu-c');
const ctx = C.getContext('2d');
const W = C.width, H = C.height;
const COLS = 28, ROWS = 31;
const CS = W / COLS; // 20px
const CS2 = CS * CS; // precomputed for squared-distance checks
const MAX_STRAND_SPEED = 4.2; // ② Speed cap

const CLR = {
  pink:  '#FA5185', hot:   '#FF0D58', green: '#015A42',
  dark:  '#171411', cream: '#F8EEE5', gold:  '#C8A96E', lav: '#C97DC8',
};

const THEMES = [
  { name: 'Babylights',      sub: 'Fine sections — keep it subtle, babe.',        glow: '#FA5185' },
  { name: 'Balayage',        sub: 'Sun-kissed color, hand-painted to perfection.', glow: '#C8A96E' },
  { name: 'Color Correction',sub: 'Fix the damage. Own the transformation.',       glow: '#C97DC8' },
  { name: 'Foilayage',       sub: 'Foils meet balayage — best of both worlds.',    glow: '#015A42' },
  { name: 'Extensions',      sub: 'Length & volume unlocked. You earned it.',      glow: '#FA5185' },
  { name: 'Bleach & Tone',   sub: 'Lift it. Tone it. Slay it.',                   glow: '#FF0D58' },
  { name: 'Root Smudge',     sub: "Seamless root to tip. Chef's kiss.",            glow: '#C8A96E' },
  { name: 'Gloss & Glaze',   sub: 'Shine, babe. Make them turn heads.',            glow: '#C97DC8' },
  { name: 'Master Stylist',  sub: 'Behind the chair. No one can stop you.',        glow: '#FF0D58' },
];
function theme(lvl) { return THEMES[Math.min(lvl - 1, THEMES.length - 1)]; }

// ══════════════════════════════════════════════════════
//  ① OFFSCREEN CANVAS — pre-render static grid
// ══════════════════════════════════════════════════════
const gridCanvas = document.createElement('canvas');
gridCanvas.width = W; gridCanvas.height = H;
const gCtx = gridCanvas.getContext('2d');
gCtx.fillStyle = CLR.dark;
gCtx.fillRect(0, 0, W, H);
gCtx.strokeStyle = '#F8EEE50A'; gCtx.lineWidth = 0.5;
for (let x = 0; x < W; x += CS) { gCtx.beginPath(); gCtx.moveTo(x,0); gCtx.lineTo(x,H); gCtx.stroke(); }
for (let y = 0; y < H; y += CS) { gCtx.beginPath(); gCtx.moveTo(0,y); gCtx.lineTo(W,y); gCtx.stroke(); }
gCtx.strokeStyle = '#015A4250'; gCtx.lineWidth = 1;
gCtx.setLineDash([4,4]);
gCtx.beginPath(); gCtx.moveTo(0, H-CS*3); gCtx.lineTo(W, H-CS*3); gCtx.stroke();
gCtx.setLineDash([]);

// ══════════════════════════════════════════════════════
//  ⑥ WEB AUDIO SOUND FX
// ══════════════════════════════════════════════════════
let audioCtx = null;

function initAudio() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
}

function beep(freq, endFreq, dur, vol, type = 'sine', startDelay = 0) {
  if (!audioCtx) return;
  try {
    const osc  = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.connect(gain); gain.connect(audioCtx.destination);
    const t = audioCtx.currentTime + startDelay;
    osc.frequency.setValueAtTime(freq, t);
    if (endFreq !== freq) osc.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.start(t); osc.stop(t + dur + 0.01);
  } catch(e) {}
}

const SFX = {
  shoot:    () => beep(900, 400, 0.06, 0.12, 'sine'),
  hit:      () => beep(200, 80,  0.10, 0.18, 'square'),
  bottle:   () => beep(350, 200, 0.07, 0.10, 'sine'),
  pickup:   () => { beep(600, 1000, 0.12, 0.18); beep(1000, 1400, 0.10, 0.12, 'sine', 0.12); },
  lifeLost: () => beep(300, 80,  0.4,  0.22, 'sawtooth'),
  levelUp:  () => [440, 554, 660, 880].forEach((f, i) => beep(f, f*1.05, 0.18, 0.18, 'sine', i*0.12)),
  gameOver: () => [440, 330, 220, 165].forEach((f, i) => beep(f, f*0.9, 0.22, 0.18, 'sawtooth', i*0.16)),
  danger:   () => beep(120, 100, 0.15, 0.08, 'square'),
  spider:   () => { beep(800, 400, 0.12, 0.15, 'square'); },
  scorpion: () => [200, 150, 100].forEach((f, i) => beep(f, f*0.8, 0.15, 0.2, 'sawtooth', i*0.1)),
};

// ══════════════════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════════════════
let now = 0; // cached timestamp — updated once per frame in loop()

// ④ Load persisted high score
let score = 0, lives = 3, level = 1;
let hiScore = 0;
try { hiScore = parseInt(localStorage.getItem('hbbu_hi') || '0'); } catch(e) {}
let gameRunning = false;
let animId;

let levelUpActive = false, levelUpTimer = 0;
const LEVELUP_FRAMES = 160;

let particles = [];
let player = { x: W/2, y: H - CS*1.5, w: CS*1.8, h: CS*1.2, speed: 5, cooldown: 0 };
let bullets = [], bottles = [], strands = [];
let spider = null, flea = null, scorpion = null;
let spiderTimer = 0, fleaTimer = 0, scorpionTimer = 0;
let powerUps = [], activePU = null;
const PU_TYPES = ['wide', 'rapid', 'detangle'];
const PU_DURATION = 420;
let invFrames = 0;

// ③ Player-zone danger state
let dangerFlash = 0;
let shakeX = 0, shakeY = 0;
let dangerSfxCooldown = 0;

// ⑦ Touch controls
let isTouchDevice = false;
let touchLeft = false, touchRight = false, touchFire = false;
let touchStartX = 0;

// ══════════════════════════════════════════════════════
//  INPUT — keyboard
// ══════════════════════════════════════════════════════
const keys = {};
window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'Space') e.preventDefault();
  // SPACE or ENTER restarts when overlay is showing (game over / victory)
  if ((e.code === 'Space' || e.code === 'Enter') && !gameRunning) {
    const ov = document.getElementById('hbbu-ov');
    if (ov && ov.style.display === 'flex') restartGame();
  }
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

// ══════════════════════════════════════════════════════
//  ⑦ TOUCH CONTROLS
// ══════════════════════════════════════════════════════
function getTouchPos(t) {
  const rect = C.getBoundingClientRect();
  return {
    x: (t.clientX - rect.left) * (W / rect.width),
    y: (t.clientY - rect.top)  * (H / rect.height),
  };
}

C.addEventListener('touchstart', e => {
  e.preventDefault();
  isTouchDevice = true;
  initAudio();
  for (const t of e.changedTouches) {
    const { x, y } = getTouchPos(t);
    touchStartX = x;
    if (y > H - CS * 3.5) {
      if      (x < W * 0.33) touchLeft  = true;
      else if (x > W * 0.67) touchRight = true;
      else                   touchFire  = true;
    } else {
      touchFire = true;
    }
  }
}, { passive: false });

C.addEventListener('touchmove', e => {
  e.preventDefault();
  touchLeft = false; touchRight = false;
  for (const t of e.changedTouches) {
    const { x, y } = getTouchPos(t);
    if (y > H - CS * 3.5) {
      if      (x < W * 0.33) touchLeft  = true;
      else if (x > W * 0.67) touchRight = true;
    } else {
      // Drag to steer in play area
      const dx = x - touchStartX;
      if (dx < -8)  touchLeft  = true;
      if (dx >  8)  touchRight = true;
    }
  }
}, { passive: false });

C.addEventListener('touchend', e => {
  e.preventDefault();
  touchLeft = false; touchRight = false; touchFire = false;
}, { passive: false });

window.addEventListener('touchstart', () => { isTouchDevice = true; }, { once: true, passive: true });

// ══════════════════════════════════════════════════════
//  START / INIT
// ══════════════════════════════════════════════════════
function startGame() {
  initAudio();
  document.getElementById('hbbu-ov').style.display = 'none';
  score = 0; lives = 3; level = 1;
  activePU = null; dangerFlash = 0;
  _hudCache = { score: -1, level: -1, hi: -1, lives: -1, puKey: '' };
  initLevel();
  gameRunning = true;
  if (animId) cancelAnimationFrame(animId);
  loop();
}

function initLevel() {
  player.x = W / 2; player.y = H - CS * 1.5;
  bullets = []; particles = []; powerUps = [];
  activePU = null; dangerFlash = 0; shakeX = 0; shakeY = 0;

  // Bonus life every 3 levels
  if (level > 1 && (level - 1) % 3 === 0) {
    lives = Math.min(lives + 1, 6);
    spawnBurst(W/2, H/2, CLR.pink, 40);
  }

  // Bottles
  bottles = [];
  const bCount = 18 + level * 2;
  for (let i = 0; i < bCount; i++) {
    let placed = false, tries = 0;
    while (!placed && tries++ < 60) {
      const bx = (Math.floor(Math.random() * COLS) + 0.5) * CS;
      const by = (Math.floor(Math.random() * (ROWS - 9)) + 2) * CS;
      if (!bottles.find(b => Math.abs(b.x-bx)<CS && Math.abs(b.y-by)<CS)) {
        bottles.push({ x: bx, y: by, hp: 2, maxHp: 2, poisoned: false });
        placed = true;
      }
    }
  }

  // Strands
  const numStrands = level < 3 ? 1 : level < 5 ? 2 : level < 7 ? 3 : 4;
  strands = [];
  for (let s = 0; s < numStrands; s++) spawnStrand(s * 2);

  spider = null; flea = null; scorpion = null;
  scheduleSpider(); scheduleFlea(); scheduleScorpion();
}

function spawnStrand(rowOffset = 0) {
  const segCount = Math.max(8, 14 + level * 2 - strands.length * 4);
  const segs = [];
  // ② Hard speed cap
  const speed = Math.min((0.5 + level * 0.18) * 0.9, MAX_STRAND_SPEED);
  let dir = 1, col = 0, row = rowOffset;
  for (let i = 0; i < segCount; i++) {
    segs.push({ x: (col+0.5)*CS, y: (row+0.5)*CS, dir, speed });
    col++;
    if (col >= COLS) { col = COLS-1; row++; dir = -1; }
    else if (col < 0) { col = 0; row++; dir = 1; }
  }
  strands.push(segs);
}

// ══════════════════════════════════════════════════════
//  SCHEDULING
// ══════════════════════════════════════════════════════
function scheduleSpider()   { spiderTimer   = Math.max(60,  280 - level*15) + rand(200); }
function scheduleFlea()     { fleaTimer     = Math.max(60,  200 - level*10) + rand(200); }
function scheduleScorpion() { scorpionTimer = Math.max(120, 550 - level*20) + rand(300); }
function rand(n) { return Math.floor(Math.random() * n); }

// ══════════════════════════════════════════════════════
//  LOOP
// ══════════════════════════════════════════════════════
function loop() {
  if (!gameRunning) return;
  now = Date.now(); // cache once per frame
  if (levelUpActive) {
    levelUpTimer--;
    drawLevelUpScreen();
    if (levelUpTimer <= 0) { levelUpActive = false; initLevel(); }
  } else {
    update();
    draw();
  }
  animId = requestAnimationFrame(loop);
}

// ══════════════════════════════════════════════════════
//  UPDATE
// ══════════════════════════════════════════════════════
function update() {
  if (invFrames > 0) invFrames--;
  updatePlayer();
  updateBullets();
  updateStrands();
  updateSpider();
  updateFlea();
  updateScorpion();
  updatePowerUps();
  updateParticles();
  updateDanger();
  checkCollisions();
  updateHUD();

  let _anyAlive = false;
  for (let _si = 0; _si < strands.length; _si++) { if (strands[_si].length > 0) { _anyAlive = true; break; } }
  if (!_anyAlive) {
    score += 500 * level;
    level++;
    if (level > THEMES.length) {
      victoryGame();
    } else {
      SFX.levelUp();
      levelUpActive = true;
      levelUpTimer  = LEVELUP_FRAMES;
    }
  }
}

function updatePlayer() {
  const left  = keys['ArrowLeft']  || keys['KeyA'] || touchLeft;
  const right = keys['ArrowRight'] || keys['KeyD'] || touchRight;
  if (left)  player.x = Math.max(player.w/2,     player.x - player.speed);
  if (right) player.x = Math.min(W - player.w/2, player.x + player.speed);

  if (player.cooldown > 0) player.cooldown--;
  const rate = activePU?.type === 'rapid' ? 6 : 12;
  if ((keys['Space'] || keys['ArrowUp'] || keys['KeyW'] || touchFire) && player.cooldown === 0) {
    const spd = 10;
    if (activePU?.type === 'wide') {
      bullets.push({ x: player.x - CS*.6, y: player.y - player.h/2, speed: spd, angle: -0.15 });
      bullets.push({ x: player.x,          y: player.y - player.h/2, speed: spd, angle: 0 });
      bullets.push({ x: player.x + CS*.6, y: player.y - player.h/2, speed: spd, angle:  0.15 });
    } else {
      bullets.push({ x: player.x, y: player.y - player.h/2, speed: spd, angle: 0 });
    }
    player.cooldown = rate;
    SFX.shoot();
  }
}

function updateBullets() {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.y -= b.speed * Math.cos(b.angle || 0);
    b.x += b.speed * Math.sin(b.angle || 0);
    if (b.y <= -10 || b.x <= -10 || b.x >= W + 10) bullets.splice(i, 1);
  }
}

// Pre-allocated prev-position buffer — avoids per-frame allocation in updateStrands
let _prevBuf = [];

function updateStrands() {
  let inDanger = false;
  const dangerY = H - CS * 3.5;

  for (let si = strands.length - 1; si >= 0; si--) {
    const seg = strands[si];
    if (seg.length === 0) { strands.splice(si, 1); continue; }

    const lead = seg[0];

    // Snapshot previous positions into reusable buffer (no allocation)
    if (_prevBuf.length < seg.length) {
      while (_prevBuf.length < seg.length) _prevBuf.push({ x: 0, y: 0 });
    }
    for (let i = 0; i < seg.length; i++) { _prevBuf[i].x = seg[i].x; _prevBuf[i].y = seg[i].y; }

    // ⑤ Poisoned bottle speed boost — use squared distance, no sqrt
    let speedMult = 1;
    const poisonR2 = CS2 * 6.25; // (CS*2.5)²
    for (let bi = 0; bi < bottles.length; bi++) {
      const bt = bottles[bi];
      if (bt.poisoned) {
        const dx = lead.x - bt.x, dy = lead.y - bt.y;
        if (dx*dx + dy*dy < poisonR2) { speedMult = 1.75; break; }
      }
    }

    lead.x += lead.speed * lead.dir * speedMult;

    // Bottle collision → reverse & drop down
    const btCollR2 = CS2 * 0.81; // (CS*0.9)²
    for (let bi = 0; bi < bottles.length; bi++) {
      const bt = bottles[bi];
      const dx = lead.x - bt.x, dy = lead.y - bt.y;
      if (dx*dx + dy*dy < btCollR2) {
        lead.dir *= -1;
        lead.y   += CS;
        lead.x   += lead.speed * lead.dir * 2;
        break;
      }
    }

    // Wall bounce
    if (lead.x > W - CS*.5) { lead.dir = -1; lead.y += CS; lead.x = W - CS*.5; }
    else if (lead.x < CS*.5) { lead.dir =  1; lead.y += CS; lead.x = CS*.5; }

    // Trail
    for (let i = 1; i < seg.length; i++) {
      seg[i].x = _prevBuf[i-1].x;
      seg[i].y = _prevBuf[i-1].y;
    }
    for (let i = 0; i < seg.length; i++) { if (seg[i].y < CS*.5) seg[i].y = CS*.5; }

    // ③ Danger check — any segment in player zone?
    if (!inDanger) {
      for (let i = 0; i < seg.length; i++) {
        if (seg[i].y > dangerY) { inDanger = true; break; }
      }
    }
  }

  // ③ Ramp danger flash
  if (inDanger) {
    dangerFlash = Math.min(dangerFlash + 5, 50);
    if (dangerSfxCooldown <= 0) { SFX.danger(); dangerSfxCooldown = 40; }
  } else {
    dangerFlash = Math.max(dangerFlash - 3, 0);
  }
  if (dangerSfxCooldown > 0) dangerSfxCooldown--;
}

function updateDanger() {
  if (dangerFlash > 20 && !isTouchDevice) {
    shakeX = (Math.random() - 0.5) * (dangerFlash / 25) * 3;
    shakeY = (Math.random() - 0.5) * (dangerFlash / 25) * 3;
  } else {
    shakeX = 0; shakeY = 0;
  }
}

function updateSpider() {
  if (--spiderTimer <= 0 && !spider) {
    spider = {
      x: Math.random() < 0.5 ? -CS : W+CS,
      y: H - CS*4 - rand(CS*6),
      dx: (1.5 + level*0.2) * (Math.random()<0.5?1:-1),
      dy: Math.random()*1.5 - 0.75,
      age: 0,
    };
  }
  if (!spider) return;
  spider.x += spider.dx; spider.y += spider.dy; spider.age++;
  if (spider.y < H - CS*13) spider.dy =  Math.abs(spider.dy);
  if (spider.y > H - CS*2)  spider.dy = -Math.abs(spider.dy);
  if (spider.x < -CS*3 || spider.x > W+CS*3 || spider.age > 500) { spider = null; scheduleSpider(); }
}

function updateFlea() {
  if (--fleaTimer <= 0 && !flea) {
    flea = { x: (rand(COLS)+0.5)*CS, y: 0, dy: 3 + rand(2), age: 0 };
  }
  if (!flea) return;
  flea.y += flea.dy; flea.age++;
  if (flea.age % 14 === 0 && flea.y < H - CS*3) {
    let _fleaBottleHere = false;
    for (let _fi = 0; _fi < bottles.length; _fi++) {
      if (Math.abs(bottles[_fi].x - flea.x) < CS && Math.abs(bottles[_fi].y - flea.y) < CS) { _fleaBottleHere = true; break; }
    }
    if (!_fleaBottleHere) bottles.push({ x: flea.x, y: flea.y, hp:1, maxHp:1, poisoned: false });
  }
  if (flea.y > H + CS) { flea = null; scheduleFlea(); }
}

function updateScorpion() {
  if (--scorpionTimer <= 0 && !scorpion) {
    const left = Math.random() < 0.5;
    scorpion = {
      x: left ? -CS : W+CS,
      y: (rand(9)+1)*CS,
      dx: (2 + level*0.15) * (left?1:-1),
    };
  }
  if (!scorpion) return;
  scorpion.x += scorpion.dx;
  for (const bt of bottles) {
    if (Math.abs(bt.x-scorpion.x)<CS*.7 && Math.abs(bt.y-scorpion.y)<CS*.7) bt.poisoned = true;
  }
  if (scorpion.x < -CS*3 || scorpion.x > W+CS*3) { scorpion = null; scheduleScorpion(); }
}

function updatePowerUps() {
  const puPickR2 = CS2 * 1.21; // (CS*1.1)²
  for (let i = powerUps.length - 1; i >= 0; i--) {
    const p = powerUps[i];
    p.y += 0.8;
    if (p.y >= H + CS) { powerUps.splice(i, 1); continue; }
    const dx = p.x - player.x, dy = p.y - player.y;
    if (dx*dx + dy*dy < puPickR2) {
      activatePowerUp(p.type);
      spawnBurst(p.x, p.y, CLR.gold, 20);
      SFX.pickup();
      powerUps.splice(i, 1);
    }
  }
  if (activePU) { activePU.timer--; if (activePU.timer <= 0) activePU = null; }
}

function activatePowerUp(type) {
  if (type === 'detangle') {
    bottles = bottles.filter(b => b.poisoned);
    score += 50;
    spawnBurst(W/2, H/2, CLR.gold, 50);
  } else {
    activePU = { type, timer: PU_DURATION };
  }
}

function dropPowerUp(x, y) {
  if (Math.random() > 0.25) return;
  powerUps.push({ x, y, type: PU_TYPES[rand(PU_TYPES.length)], pulse: 0 });
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.life--;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.alpha = p.life / p.maxLife;
  }
}

function spawnBurst(x, y, color, count) {
  if (particles.length > 80) particles.splice(0, particles.length - 80);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = Math.random() * 4 + 1;
    particles.push({ x, y, vx: Math.cos(a)*s, vy: Math.sin(a)*s - 2,
      color, life: 40 + rand(20), maxLife: 60, alpha: 1, r: 2 + rand(3) });
  }
}

// ══════════════════════════════════════════════════════
//  COLLISIONS
// ══════════════════════════════════════════════════════
function checkCollisions() {
  // Precomputed squared radii (avoids Math.sqrt on every check)
  const bHitStrand2  = CS2 * 0.49;   // (CS*.7)²
  const bHitBottle2  = CS2 * 0.36;   // (CS*.6)²
  const bHitSpider2  = CS2 * 0.81;   // (CS*.9)²
  const bHitFlea2    = CS2 * 0.5625; // (CS*.75)²
  const bHitScorp2   = CS2 * 0.81;   // (CS*.9)²
  const plHitStrand2 = CS2 * 0.7225; // (CS*.85)²
  const plHitSpider2 = CS2 * 1.21;   // (CS*1.1)²

  for (let bi = bullets.length-1; bi >= 0; bi--) {
    const b = bullets[bi];
    let hit = false;
    let bdx, bdy;

    // Bullets vs strands
    outer:
    for (let si = 0; si < strands.length; si++) {
      const seg = strands[si];
      for (let idx = seg.length-1; idx >= 0; idx--) {
        const s = seg[idx];
        bdx = b.x - s.x; bdy = b.y - s.y;
        if (bdx*bdx + bdy*bdy < bHitStrand2) {
          spawnBurst(s.x, s.y, CLR.hot, 8);
          SFX.hit();
          // Check bottle overlap without .find() callback
          let bottleHere = false;
          for (let k = 0; k < bottles.length; k++) {
            if (Math.abs(bottles[k].x - s.x) < CS && Math.abs(bottles[k].y - s.y) < CS) { bottleHere = true; break; }
          }
          if (!bottleHere) bottles.push({ x:s.x, y:s.y, hp:1, maxHp:1, poisoned:false });
          const tail = seg.splice(idx+1);
          seg.splice(idx, 1);
          if (tail.length > 0) { tail[0].dir *= -1; strands.push(tail); }
          score += 10 * level;
          dropPowerUp(s.x, s.y);
          hit = true; break outer;
        }
      }
    }
    if (hit) { bullets.splice(bi, 1); continue; }

    // Bullets vs bottles
    for (let bti = bottles.length-1; bti >= 0; bti--) {
      const bt = bottles[bti];
      bdx = b.x - bt.x; bdy = b.y - bt.y;
      if (bdx*bdx + bdy*bdy < bHitBottle2) {
        bt.hp--;
        SFX.bottle();
        if (bt.hp <= 0) {
          spawnBurst(bt.x, bt.y, CLR.gold, 6);
          bottles.splice(bti, 1);
          score += bt.poisoned ? 15 : 5;
        }
        bullets.splice(bi, 1); hit = true; break;
      }
    }
    if (hit) continue;

    // Bullets vs spider
    if (spider) {
      bdx = b.x - spider.x; bdy = b.y - spider.y;
      if (bdx*bdx + bdy*bdy < bHitSpider2) {
        score += 300;
        spawnBurst(spider.x, spider.y, CLR.lav, 18);
        SFX.spider();
        dropPowerUp(spider.x, spider.y);
        spider = null; scheduleSpider();
        bullets.splice(bi, 1); continue;
      }
    }

    // Bullets vs flea
    if (flea) {
      bdx = b.x - flea.x; bdy = b.y - flea.y;
      if (bdx*bdx + bdy*bdy < bHitFlea2) {
        score += 200;
        spawnBurst(flea.x, flea.y, CLR.hot, 12);
        SFX.hit();
        dropPowerUp(flea.x, flea.y);
        flea = null; scheduleFlea();
        bullets.splice(bi, 1); continue;
      }
    }

    // Bullets vs scorpion
    if (scorpion) {
      bdx = b.x - scorpion.x; bdy = b.y - scorpion.y;
      if (bdx*bdx + bdy*bdy < bHitScorp2) {
        score += 1000;
        spawnBurst(scorpion.x, scorpion.y, CLR.green, 25);
        SFX.scorpion();
        dropPowerUp(scorpion.x, scorpion.y);
        scorpion = null; scheduleScorpion();
        bullets.splice(bi, 1); continue;
      }
    }
  }

  if (invFrames > 0) return;

  // Strand vs player
  for (let si = 0; si < strands.length; si++) {
    const seg = strands[si];
    for (let i = 0; i < seg.length; i++) {
      const s = seg[i];
      const dx = s.x - player.x, dy = s.y - player.y;
      if (dx*dx + dy*dy < plHitStrand2) { loseLife(); return; }
    }
  }

  // Spider vs player
  if (spider) {
    const dx = spider.x - player.x, dy = spider.y - player.y;
    if (dx*dx + dy*dy < plHitSpider2) { loseLife(); return; }
  }
}

function loseLife() {
  lives--;
  SFX.lifeLost();
  spawnBurst(player.x, player.y, CLR.hot, 30);
  if (lives <= 0) { gameOver(); return; }
  player.x = W/2;
  bullets = [];
  spider = null; flea = null;
  scheduleSpider(); scheduleFlea();
  invFrames = 120;
}

function gameOver() {
  gameRunning = false;
  SFX.gameOver();
  // ④ Persist high score
  if (score > hiScore) {
    hiScore = score;
    try { localStorage.setItem('hbbu_hi', hiScore); } catch(e) {}
  }
  cancelAnimationFrame(animId);
  const ov = document.getElementById('hbbu-ov');
  ov.innerHTML = `
    <div class="tagline">✦ HBBU Arcade ✦</div>
    <h2>Bad Hair Day!</h2>
    <p>The strand got you, babe.<br><br>
    You reached <strong style="color:#C8A96E">Level ${level}</strong> — ${theme(level).name}<br><br>
    Final Score: <strong style="color:#FA5185">${score.toLocaleString()}</strong><br>
    High Score: <strong style="color:#015A42">${hiScore.toLocaleString()}</strong><br><br>
    <em style="color:#F8EEE5aa; font-size:12px;">"Confidence behind the chair starts here."</em></p>
    <button id="start-btn" onclick="restartGame()">Try Again</button>
    <div id="controls-hint">SPACE or ENTER to restart</div>
  `;
  ov.style.display = 'flex';
}

function victoryGame() {
  gameRunning = false;
  cancelAnimationFrame(animId);
  // Victory fanfare — ascending chords
  [523, 659, 784, 1047].forEach((f, i) => beep(f, f * 1.1, 0.25, 0.2, 'sine', i * 0.15));
  if (score > hiScore) {
    hiScore = score;
    try { localStorage.setItem('hbbu_hi', hiScore); } catch(e) {}
  }
  const ov = document.getElementById('hbbu-ov');
  const newRecord = score >= hiScore ? `<br><strong style="color:#C8A96E">✦ NEW HIGH SCORE! ✦</strong>` : '';
  ov.innerHTML = `
    <div class="tagline">✦ MASTER STYLIST CERTIFIED ✦</div>
    <h2 style="color:#C8A96E; text-shadow: 0 0 20px #C8A96E, 0 0 40px #C8A96E;">YOU WON!</h2>
    <p>All 9 levels conquered, babe!<br><br>
    Final Score: <strong style="color:#FA5185">${score.toLocaleString()}</strong>${newRecord}<br>
    High Score: <strong style="color:#015A42">${hiScore.toLocaleString()}</strong><br><br>
    <em style="color:#F8EEE5aa; font-size:12px;">"Confidence behind the chair starts here."</em></p>
    <button id="start-btn" onclick="restartGame()">Play Again</button>
    <div id="controls-hint">SPACE or ENTER to restart</div>
  `;
  ov.style.display = 'flex';
}

function restartGame() {
  initAudio();
  score = 0; lives = 3; level = 1;
  invFrames = 0; dangerFlash = 0; shakeX = 0; shakeY = 0; dangerSfxCooldown = 0;
  activePU = null; bullets = []; particles = []; powerUps = [];
  strands = []; bottles = [];
  spider = null; flea = null; scorpion = null;
  // Clear key state so SPACE restart doesn't immediately fire a bullet
  Object.keys(keys).forEach(k => { keys[k] = false; });
  touchFire = false; touchLeft = false; touchRight = false;
  _hudCache = { score: -1, level: -1, hi: -1, lives: -1, puKey: '' };
  const ov = document.getElementById('hbbu-ov');
  ov.style.display = 'none';
  initLevel();
  gameRunning = true;
  if (animId) cancelAnimationFrame(animId);
  loop();
}

// ══════════════════════════════════════════════════════
//  DRAW
// ══════════════════════════════════════════════════════
function draw() {
  // ③ Screen shake transform
  ctx.save();
  ctx.translate(shakeX, shakeY);

  // ① Blit pre-rendered grid (replaces per-frame grid drawing)
  ctx.drawImage(gridCanvas, 0, 0);

  // ③ Danger overlay — red vignette + border flash
  if (dangerFlash > 0) {
    const alpha = dangerFlash / 200;
    const grad = ctx.createRadialGradient(W/2, H, 20, W/2, H/2, H);
    grad.addColorStop(0, `rgba(255,13,88,${alpha * 1.4})`);
    grad.addColorStop(1, 'rgba(255,13,88,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = `rgba(255,13,88,${dangerFlash / 80})`;
    ctx.lineWidth = 5;
    ctx.strokeRect(3, 3, W-6, H-6);
  }

  drawParticles();
  drawBottles();
  for (const seg of strands) drawStrand(seg);
  drawBullets();
  drawPowerUps();
  drawPlayer();
  if (spider)   drawSpider();
  if (flea)     drawFlea();
  if (scorpion) drawScorpion();

  // ⑦ Touch controls overlay
  if (isTouchDevice) drawTouchControls();

  ctx.restore();
}

// ══════════════════════════════════════════════════════
//  DRAW FUNCTIONS
// ══════════════════════════════════════════════════════
function drawBottles() {
  const _poisonPulse = Math.sin(now / 200) * 0.3 + 0.7; // compute once per frame
  for (const bt of bottles) {
    const { x, y, poisoned, hp, maxHp } = bt;
    // ⑤ Poisoned bottles pulse to indicate danger
    if (poisoned) {
      ctx.fillStyle = `rgba(51,170,80,${_poisonPulse})`;
    } else {
      ctx.fillStyle = CLR.gold;
    }
    ctx.beginPath(); ctx.roundRect(x-CS*.28, y-CS*.42, CS*.56, CS*.84, 4); ctx.fill();
    ctx.fillStyle = poisoned ? '#1c6' : CLR.pink;
    ctx.beginPath(); ctx.roundRect(x-CS*.18, y-CS*.52, CS*.36, CS*.14, 2); ctx.fill();
    ctx.fillStyle = poisoned ? '#0a4' : '#F8EEE540';
    ctx.fillRect(x-CS*.26, y-CS*.1, CS*.52, CS*.2);
    if (hp < maxHp) {
      ctx.fillStyle = CLR.hot;
      ctx.fillRect(x-CS*.25, y+CS*.38, CS*.5*(hp/maxHp), CS*.06);
    }
    // ⑤ Poisoned warning symbol
    if (poisoned) {
      ctx.fillStyle = '#ffff00cc';
      ctx.font = `bold ${CS*.4}px Arial`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('!', x, y - CS*.08);
    }
  }
}

function drawStrand(seg) {
  if (seg.length === 0) return;
  ctx.lineCap = 'round';
  for (let i = 0; i < seg.length-1; i++) {
    ctx.strokeStyle = '#FA518570'; ctx.lineWidth = CS*.26;
    ctx.beginPath(); ctx.moveTo(seg[i].x, seg[i].y); ctx.lineTo(seg[i+1].x, seg[i+1].y); ctx.stroke();
  }
  for (let i = seg.length-1; i >= 0; i--) {
    const s = seg[i], isHead = (i === 0);
    const t = now/300 + i*.4;
    const shimmer = Math.sin(t)*.25 + 0.75;
    const r = CS*.44;
    ctx.save(); ctx.translate(s.x, s.y);
    ctx.fillStyle = isHead ? '#FF6BA0' : `rgba(220,55,105,${shimmer})`;
    ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#FF0D5850'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0,0,r*.65,.3,Math.PI-.3); ctx.stroke();
    ctx.beginPath(); ctx.arc(0,0,r*.65,Math.PI+.3,-.3); ctx.stroke();
    if (isHead) {
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(-r*.3,-r*.2,r*.18,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc( r*.3,-r*.2,r*.18,0,Math.PI*2); ctx.fill();
      ctx.fillStyle = '#222';
      ctx.beginPath(); ctx.arc(-r*.28,-r*.18,r*.09,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc( r*.32,-r*.18,r*.09,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#111'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-r*.5,-r*.42); ctx.lineTo(-r*.15,-r*.34); ctx.stroke();
      ctx.beginPath(); ctx.moveTo( r*.5,-r*.42); ctx.lineTo( r*.15,-r*.34); ctx.stroke();
    }
    ctx.restore();
  }
}

function drawBullets() {
  ctx.fillStyle = CLR.hot;
  for (const b of bullets) {
    ctx.beginPath(); ctx.arc(b.x,b.y,CS*.15,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = '#FF0D5828';
    ctx.beginPath(); ctx.arc(b.x,b.y,CS*.28,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = CLR.hot;
  }
}

function drawPowerUps() {
  for (const p of powerUps) {
    p.pulse = (p.pulse || 0) + 0.08;
    const sc = 1 + Math.sin(p.pulse) * 0.12;
    ctx.save(); ctx.translate(p.x, p.y); ctx.scale(sc, sc);
    const colors = { wide: CLR.gold, rapid: CLR.pink, detangle: CLR.green };
    const labels = { wide: 'WIDE', rapid: 'FAST', detangle: 'CLR' };
    ctx.fillStyle = colors[p.type] + '30';
    ctx.beginPath(); ctx.arc(0,0,CS*.6,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = colors[p.type];
    drawStar(ctx, 0, 0, 5, CS*.38, CS*.18);
    ctx.fillStyle = '#171411';
    ctx.font = `bold ${CS*.28}px 'Courier New'`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(labels[p.type], 0, 0);
    ctx.restore();
  }
}

function drawStar(ctx, cx, cy, pts, r1, r2) {
  ctx.beginPath();
  for (let i = 0; i < pts*2; i++) {
    const a = (i * Math.PI / pts) - Math.PI/2;
    const r = i%2===0 ? r1 : r2;
    i === 0 ? ctx.moveTo(cx+r*Math.cos(a), cy+r*Math.sin(a))
             : ctx.lineTo(cx+r*Math.cos(a), cy+r*Math.sin(a));
  }
  ctx.closePath(); ctx.fill();
}

function drawPlayer() {
  const { x, y, w, h } = player;
  if (invFrames > 0 && Math.floor(invFrames/6)%2 === 0) return;
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = CLR.green;
  ctx.beginPath(); ctx.roundRect(-w/2,-h*.3,w,h*.6,6); ctx.fill();
  const teethW = w*.72, toothW = teethW/7 - 2;
  for (let i = 0; i < 7; i++) {
    ctx.fillStyle = i%2===0 ? '#017a5b' : '#013d2d';
    ctx.fillRect(-teethW/2+i*(teethW/7), -h*.56, toothW, h*.28);
  }
  const puColor = activePU ? ({wide:CLR.gold,rapid:CLR.hot,detangle:'#0a8'}[activePU.type]) : CLR.pink;
  ctx.fillStyle = puColor;
  ctx.beginPath(); ctx.roundRect(-CS*.12,-h*.72,CS*.24,h*.46,4); ctx.fill();
  ctx.fillStyle = activePU ? '#fff' : CLR.hot;
  ctx.beginPath(); ctx.arc(0,-h*.74,CS*.14,0,Math.PI*2); ctx.fill();
  ctx.fillStyle = '#ffffff28';
  ctx.beginPath(); ctx.ellipse(-w*.14,-h*.08,w*.14,h*.09,0,0,Math.PI*2); ctx.fill();
  ctx.restore();
}

function drawSpider() {
  const { x, y } = spider;
  const t = now/200;
  ctx.save(); ctx.translate(x,y);
  ctx.strokeStyle = '#C97DC850'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0,-CS); ctx.lineTo(0,0); ctx.stroke();
  ctx.fillStyle = CLR.lav;
  ctx.beginPath(); ctx.ellipse(0,0,CS*.35,CS*.28,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle = '#9a5aaa';
  ctx.beginPath(); ctx.ellipse(0,-CS*.2,CS*.22,CS*.18,0,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle = '#C97DC8'; ctx.lineWidth = 1.2;
  for (let i=0;i<4;i++) {
    const a = (i/4)*Math.PI+t*.3;
    const lx=Math.cos(a)*CS*.7, ly=Math.sin(a)*CS*.4-CS*.1;
    ctx.beginPath(); ctx.moveTo(0,-CS*.1); ctx.lineTo(lx,ly); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0,-CS*.1); ctx.lineTo(-lx,ly); ctx.stroke();
  }
  ctx.fillStyle = CLR.hot;
  ctx.beginPath(); ctx.arc(-CS*.12,-CS*.25,CS*.06,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc( CS*.12,-CS*.25,CS*.06,0,Math.PI*2); ctx.fill();
  ctx.restore();
}

function drawFlea() {
  const { x, y } = flea;
  const b = Math.sin(now/70)*3;
  ctx.save(); ctx.translate(x,y+b);
  ctx.fillStyle = CLR.hot;
  ctx.beginPath(); ctx.ellipse(0,0,CS*.2,CS*.25,0,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle = CLR.hot; ctx.lineWidth = 1;
  [[-.2,.05,-.45,-.1],[.2,.05,.45,-.1],[-.2,.15,-.4,.3],[.2,.15,.4,.3]].forEach(([x1,y1,x2,y2])=>{
    ctx.beginPath(); ctx.moveTo(x1*CS,y1*CS); ctx.lineTo(x2*CS,y2*CS); ctx.stroke();
  });
  ctx.fillStyle='#fff';
  ctx.beginPath(); ctx.arc(-CS*.07,-CS*.08,CS*.06,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc( CS*.07,-CS*.08,CS*.06,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#222';
  ctx.beginPath(); ctx.arc(-CS*.07,-CS*.07,CS*.03,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc( CS*.07,-CS*.07,CS*.03,0,Math.PI*2); ctx.fill();
  ctx.restore();
}

function drawScorpion() {
  const { x, y, dx } = scorpion;
  ctx.save(); ctx.translate(x,y);
  if (dx<0) ctx.scale(-1,1);
  ctx.fillStyle = CLR.green;
  ctx.beginPath(); ctx.ellipse(0,0,CS*.45,CS*.25,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle = '#024032';
  ctx.beginPath(); ctx.ellipse(CS*.4,0,CS*.22,CS*.18,0,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle = '#015A42'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(-CS*.4,0); ctx.bezierCurveTo(-CS*.7,-CS*.4,-CS*.9,-CS*.6,-CS*.6,-CS*.8); ctx.stroke();
  ctx.fillStyle = CLR.pink;
  ctx.beginPath(); ctx.arc(-CS*.6,-CS*.8,CS*.1,0,Math.PI*2); ctx.fill();
  ctx.fillStyle = CLR.green;
  ctx.beginPath(); ctx.arc(CS*.7,-CS*.18,CS*.12,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(CS*.7, CS*.18,CS*.12,0,Math.PI*2); ctx.fill();
  ctx.fillStyle = CLR.pink;
  ctx.beginPath(); ctx.arc(CS*.5,-CS*.07,CS*.05,0,Math.PI*2); ctx.fill();
  ctx.restore();
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ⑦ Touch button overlay
function drawTouchControls() {
  const btnY = H - CS * 1.1;
  const btnH = CS * 1.8, btnW = CS * 4.5;

  // Left
  ctx.fillStyle = touchLeft ? 'rgba(1,90,66,0.75)' : 'rgba(1,90,66,0.35)';
  ctx.beginPath(); ctx.roundRect(CS*.5, btnY - btnH/2, btnW, btnH, 10); ctx.fill();
  ctx.fillStyle = '#F8EEE5cc';
  ctx.font = `bold ${CS*.9}px Arial`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('◀', CS*.5 + btnW/2, btnY);

  // Right
  ctx.fillStyle = touchRight ? 'rgba(1,90,66,0.75)' : 'rgba(1,90,66,0.35)';
  ctx.beginPath(); ctx.roundRect(W - CS*.5 - btnW, btnY - btnH/2, btnW, btnH, 10); ctx.fill();
  ctx.fillStyle = '#F8EEE5cc';
  ctx.fillText('▶', W - CS*.5 - btnW/2, btnY);

  // Fire
  ctx.fillStyle = touchFire ? 'rgba(250,81,133,0.85)' : 'rgba(250,81,133,0.4)';
  ctx.beginPath(); ctx.arc(W/2, btnY, CS*1.3, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#F8EEE5';
  ctx.font = `bold ${CS*.5}px 'Courier New'`;
  ctx.fillText('FIRE', W/2, btnY);
}

// ══════════════════════════════════════════════════════
//  LEVEL-UP SCREEN
// ══════════════════════════════════════════════════════
function drawLevelUpScreen() {
  ctx.fillStyle = '#171411CC';
  ctx.fillRect(0,0,W,H);

  const th = theme(level);
  const progress = 1 - (levelUpTimer / LEVELUP_FRAMES);
  const fadeIn   = Math.min(progress * 5, 1);
  const pulse    = Math.sin(now/120) * 6;

  ctx.globalAlpha = fadeIn;

  const aura = ctx.createRadialGradient(W/2,H/2,40,W/2,H/2,220);
  aura.addColorStop(0, th.glow + '40');
  aura.addColorStop(1, 'transparent');
  ctx.fillStyle = aura;
  ctx.fillRect(0,0,W,H);

  ctx.shadowColor = th.glow; ctx.shadowBlur = 30 + pulse;
  ctx.fillStyle   = '#F8EEE5';
  ctx.font        = `900 ${54+pulse*.5}px 'Courier New'`;
  ctx.textAlign   = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('LEVEL UP!', W/2, H/2 - 80);

  ctx.fillStyle = th.glow; ctx.shadowBlur = 20;
  ctx.font = `bold 28px 'Courier New'`;
  ctx.fillText(`LEVEL  ${level}`, W/2, H/2 - 20);

  ctx.fillStyle = '#F8EEE5'; ctx.shadowBlur = 10;
  ctx.font = `900 32px 'Courier New'`;
  ctx.fillText(th.name.toUpperCase(), W/2, H/2 + 30);

  ctx.fillStyle = '#F8EEE5BB'; ctx.shadowBlur = 0;
  ctx.font = `14px 'Courier New'`;
  ctx.fillText(th.sub, W/2, H/2 + 70);

  if ((level-1) % 3 === 0 && level > 1) {
    ctx.fillStyle = CLR.pink; ctx.shadowColor = CLR.pink; ctx.shadowBlur = 15;
    ctx.font = `bold 16px 'Courier New'`;
    ctx.fillText('✦  BONUS LIFE AWARDED  ✦', W/2, H/2 + 110);
  }

  const barW = 280;
  ctx.shadowBlur = 0;
  ctx.fillStyle  = '#F8EEE520';
  ctx.fillRect(W/2-barW/2, H/2+138, barW, 6);
  ctx.fillStyle  = th.glow;
  ctx.fillRect(W/2-barW/2, H/2+138, barW*progress, 6);

  const ns = level+1 < 3 ? 1 : level+1 < 5 ? 2 : level+1 < 7 ? 3 : 4;
  ctx.fillStyle = '#F8EEE570'; ctx.font = `11px 'Courier New'`;
  ctx.fillText(`Next: ${ns} strand${ns>1?'s':''} · ${20+level*2} bottles · Speed capped at ${MAX_STRAND_SPEED}`, W/2, H/2+160);

  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
}

// ══════════════════════════════════════════════════════
//  HUD — cached DOM updates (only write when value changes)
// ══════════════════════════════════════════════════════
const _hudEl = {
  score: document.getElementById('hbbu-score'),
  level: document.getElementById('hbbu-level'),
  hi:    document.getElementById('hbbu-hi'),
  lives: document.getElementById('hbbu-lives'),
  puBar: document.getElementById('hbbu-pubar'),
};
let _hudCache = { score: -1, level: -1, hi: -1, lives: -1, puKey: '' };

const _puLabels = { wide:'WIDE SHOT', rapid:'RAPID FIRE', detangle:'DETANGLER' };
const _puColors  = { wide: CLR.gold,  rapid: CLR.pink,   detangle: CLR.green };

function updateHUD() {
  if (score !== _hudCache.score) {
    _hudEl.score.textContent = score.toLocaleString();
    _hudCache.score = score;
  }
  if (level !== _hudCache.level) {
    _hudEl.level.textContent = level;
    _hudCache.level = level;
  }
  if (hiScore !== _hudCache.hi) {
    _hudEl.hi.textContent = hiScore.toLocaleString();
    _hudCache.hi = hiScore;
  }
  if (lives !== _hudCache.lives) {
    let h = '';
    for (let i = 0; i < 6; i++)
      h += (i < lives ? '<span style="color:#FA5185">♥</span>' : '<span style="color:#2a2a2a">♥</span>') + (i < 5 ? ' ' : '');
    _hudEl.lives.innerHTML = h;
    _hudCache.lives = lives;
  }

  const puKey = activePU ? `${activePU.type}:${Math.round((activePU.timer / PU_DURATION) * 100)}` : '';
  if (puKey !== _hudCache.puKey) {
    if (activePU) {
      const pct = Math.round((activePU.timer / PU_DURATION) * 100);
      _hudEl.puBar.innerHTML = `<span style="color:${_puColors[activePU.type]}">✦ ${_puLabels[activePU.type]} ACTIVE ✦</span><span style="color:#F8EEE560;font-size:10px"> [${pct}%]</span>`;
    } else {
      _hudEl.puBar.innerHTML = `<span style="color:#F8EEE530">— ${theme(level).name.toUpperCase()} —</span>`;
    }
    _hudCache.puKey = puKey;
  }
}

// ══════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════
function dist(ax,ay,bx,by) { return Math.sqrt((ax-bx)**2+(ay-by)**2); }
function dist2(ax,ay,bx,by) { return (ax-bx)**2+(ay-by)**2; } // squared — no sqrt, use for comparisons

// Initial blank frame
ctx.fillStyle = CLR.dark; ctx.fillRect(0,0,W,H);

// ══════════════════════════════════════════════════════
//  RESPONSIVE SCALING — works standalone + in WP iframe
// ══════════════════════════════════════════════════════
const GAME_NATURAL_W = 564;
const GAME_NATURAL_H = 846; // fallback — scaleGame() measures actual scrollHeight

function scaleGame() {
  const root  = document.getElementById('hbbu-root');
  const shell = document.getElementById('hbbu-shell');

  const avail = shell.getBoundingClientRect().width || shell.clientWidth || GAME_NATURAL_W;
  const scale = Math.min(1, avail / GAME_NATURAL_W);

  root.style.visibility = 'hidden';
  root.style.transform  = 'none';
  const naturalH = root.scrollHeight || GAME_NATURAL_H;
  root.style.visibility = '';

  root.style.transform       = `scale(${scale})`;
  root.style.transformOrigin = 'top center';
  root.style.marginLeft      = '0';

  // Shell height = measured content × scale — pixel perfect, no dead space
  const scaledH = Math.ceil(naturalH * scale);
  shell.style.height         = scaledH + 'px';

  // Tell parent WP iframe to resize (works with iframe-resizer plugin)
  try { window.parent.postMessage({ type: 'hbbu-resize', height: scaledH }, '*'); } catch(e) {}
}

// ── Robust multi-strategy init ─────────────────────────────
function hbbuInit() {
  scaleGame();
  var sb = document.getElementById('hbbu-start');
  if (sb) sb.addEventListener('click', startGame);
  var lg = document.getElementById('hbbu-logo-img');
  if (lg) lg.addEventListener('load', scaleGame);
}
// Event delegation covers start + dynamically-injected retry buttons
// (survives WP sanitization and innerHTML swaps)
document.addEventListener('click', function(e) {
  var t = e.target;
  if (!t) return;
  if (t.id === 'hbbu-start' && !gameRunning) startGame();
  if (t.id === 'hbbu-retry' && !gameRunning) restartGame();
});
window.addEventListener('resize', scaleGame);
// Handle any WPCode injection timing — run now, on load, and after 300ms
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', hbbuInit);
} else {
  hbbuInit();
}
window.addEventListener('load', scaleGame);
setTimeout(scaleGame, 300);