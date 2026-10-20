const W = 224;
const H = 240;
const COLS = 8;
const ROWS = 4;

const SPRITES = [
  [
    ["--o----o--", "o-oooooo-o", "-oooooooo-", "o-o-oo-o-o", "--o----o--", "-o------o-"],
    ["--o----o--", "o-oooooo-o", "-oooooooo-", "o-o-oo-o-o", "-o--oo--o-", "o--------o"],
  ],
  [
    ["-o--oo--o-", "o-oooooo-o", "oooooooooo", "oo-oooo-oo", "-oo----oo-", "o-o----o-o"],
    ["-o--oo--o-", "o-oooooo-o", "oooooooooo", "oo-oooo-oo", "o-o----o-o", "--o----o--"],
  ],
  [
    ["---oooo---", "-oooooooo-", "ooo-oo-ooo", "oooooooooo", "--o-oo-o--", "-o------o-"],
    ["---oooo---", "-oooooooo-", "ooo-oo-ooo", "oooooooooo", "-o-o--o-o-", "o---oo---o"],
  ],
  [
    ["----oo----", "---oooo---", "--oooooo--", "-ooo--ooo-", "oooooooooo", "--o----o--"],
    ["----oo----", "---oooo---", "--oooooo--", "-ooo--ooo-", "oooooooooo", "---o--o---"],
  ],
];

const COLORS = ["#7ec8ff", "#3dff6e", "#ffe14a", "#ff2d6a"];
const PLAYER = ["----oo----", "---oooo---", "--oooooo--", "oooooooooo", "oooooooooo"];
const UFO = ["--oooooo--", "-oo-oo-oo-", "oooooooooo", "-o-o--o-o-", "--o----o--"];

const canvas = document.querySelector("#playfield");
const ctx = canvas.getContext("2d");
const scoreEl = document.querySelector("#score");
const hiEl = document.querySelector("#hi");
const livesEl = document.querySelector("#lives");
const overlay = document.querySelector("#overlay");
const overlayKicker = document.querySelector("#overlay-kicker");
const overlayTitle = document.querySelector("#overlay-title");
const startBtn = document.querySelector("#start");
const muteBtn = document.querySelector("#mute");

const keys = { left: false, right: false, fire: false };
const hiKey = "lancer-invaders-hi";

function loadHi() {
  try {
    return Number(localStorage.getItem(hiKey)) || 0;
  } catch {
    return 0;
  }
}

function saveHi(value) {
  try {
    localStorage.setItem(hiKey, String(value));
  } catch {
    // Storage is unavailable; the high score lasts for this visit only.
  }
}

const sfx = {
  ctx: null,
  muted: false,
  note: 0,
  unlock() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!this.ctx) this.ctx = new AudioCtx();
    if (this.ctx.state === "suspended") this.ctx.resume();
  },
  tone(freq, duration, type = "square", gain = 0.08, slide = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + duration);
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(amp);
    amp.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + duration);
  },
  noise(duration, freq = 900, gain = 0.18) {
    if (!this.ctx || this.muted) return;
    const rate = this.ctx.sampleRate;
    const length = Math.floor(rate * duration);
    const buffer = this.ctx.createBuffer(1, length, rate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = freq;
    const amp = this.ctx.createGain();
    amp.gain.value = gain;
    src.connect(filter);
    filter.connect(amp);
    amp.connect(this.ctx.destination);
    src.start();
  },
  march() {
    const notes = [392, 330, 294, 262];
    this.tone(notes[this.note % notes.length], 0.07, "square", 0.05);
    this.note += 1;
  },
  shoot() {
    this.tone(880, 0.09, "square", 0.06, -640);
  },
  explode() {
    this.noise(0.18, 700, 0.2);
  },
  die() {
    this.tone(420, 0.35, "sawtooth", 0.07, -340);
  },
  ufo() {
    this.tone(this.note % 2 ? 520 : 410, 0.08, "sine", 0.04);
  },
  start() {
    [523, 659, 784, 1046].forEach((freq, i) => {
      setTimeout(() => this.tone(freq, 0.1, "square", 0.06), i * 90);
    });
  },
  clear() {
    [784, 988, 1175].forEach((freq, i) => {
      setTimeout(() => this.tone(freq, 0.12, "square", 0.06), i * 110);
    });
  },
};

const state = {
  mode: "attract",
  score: 0,
  hi: loadHi(),
  lives: 3,
  wave: 1,
  frame: 0,
  acc: 0,
  last: 0,
  form: { x: 18, y: 28, dir: 1 },
  invaders: [],
  player: { x: 100, cooldown: 0 },
  shot: null,
  alienShots: [],
  ufo: null,
  ufoTimer: 6,
  particles: [],
  shake: 0,
};

function pad(n) {
  return String(n).padStart(4, "0");
}

function blit(rows, x, y, color) {
  ctx.fillStyle = color;
  for (let r = 0; r < rows.length; r += 1) {
    for (let c = 0; c < rows[r].length; c += 1) {
      if (rows[r][c] === "o") ctx.fillRect((x + c) | 0, (y + r) | 0, 1, 1);
    }
  }
}

function resetWave(keepScore) {
  state.invaders = [];
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      state.invaders.push({ c, r, alive: true, type: r });
    }
  }
  state.form = { x: 18, y: 22 + Math.min(24, (state.wave - 1) * 8), dir: 1 };
  state.shot = null;
  state.alienShots = [];
  state.ufo = null;
  state.ufoTimer = 5;
  state.player.x = 100;
  if (!keepScore) {
    state.score = 0;
    state.lives = 3;
    state.wave = 1;
  }
}

function aliveInvaders() {
  return state.invaders.filter((inv) => inv.alive);
}

function posOf(inv, origin = state.form) {
  return { x: origin.x + inv.c * 18, y: origin.y + inv.r * 16 };
}

function bounds(origin) {
  let left = W;
  let right = 0;
  let bottom = 0;
  for (const inv of aliveInvaders()) {
    const p = posOf(inv, origin);
    left = Math.min(left, p.x);
    right = Math.max(right, p.x + 10);
    bottom = Math.max(bottom, p.y + 8);
  }
  return { left, right, bottom };
}

function march() {
  const next = { ...state.form, x: state.form.x + state.form.dir * 2 };
  const box = bounds(next);
  if (box.left < 6 || box.right > W - 6) {
    state.form.dir *= -1;
    state.form.y += 6;
  } else {
    state.form.x = next.x;
  }
  state.frame ^= 1;
  if (state.mode === "play") {
    sfx.march();
    if (state.ufo) sfx.ufo();
  }
  if (state.mode !== "play" && state.form.y > 150) {
    state.form.y = 28;
    state.form.x = 18;
  }
}

function fire() {
  if (state.shot || state.player.cooldown > 0 || state.mode !== "play") return;
  state.shot = { x: state.player.x + 4, y: 208 };
  state.player.cooldown = 0.25;
  sfx.shoot();
}

function alienFire() {
  if (state.alienShots.length > 2 || state.mode !== "play") return;
  const columns = new Map();
  for (const inv of aliveInvaders()) {
    const prev = columns.get(inv.c);
    if (!prev || inv.r > prev.r) columns.set(inv.c, inv);
  }
  const choices = [...columns.values()];
  if (!choices.length) return;
  const inv = choices[(Math.random() * choices.length) | 0];
  const p = posOf(inv);
  state.alienShots.push({ x: p.x + 4, y: p.y + 8 });
}

function burst(x, y, color) {
  for (let i = 0; i < 8; i += 1) {
    state.particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 40,
      vy: (Math.random() - 0.8) * 36,
      life: 0.35,
      color,
    });
  }
  state.shake = 4;
}

function addScore(n) {
  state.score += n;
  if (state.score > state.hi) {
    state.hi = state.score;
    saveHi(state.hi);
  }
}

function loseLife() {
  state.lives -= 1;
  state.shot = null;
  state.alienShots = [];
  sfx.die();
  burst(state.player.x + 5, 214, "#fff");
  if (state.lives <= 0) {
    state.mode = "over";
    showOverlay(`Score ${pad(state.score)}`, "Game over", "Press start");
  }
}

function showOverlay(kicker, title, button) {
  overlay.hidden = false;
  overlayKicker.textContent = kicker;
  overlayTitle.textContent = title;
  startBtn.textContent = button;
}

function hideOverlay() {
  overlay.hidden = true;
}

function startGame() {
  sfx.unlock();
  sfx.start();
  state.mode = "play";
  state.wave = 1;
  resetWave(false);
  hideOverlay();
}

function nextWave() {
  state.wave += 1;
  if (state.wave > 3) {
    state.mode = "over";
    showOverlay(`Score ${pad(state.score)}`, "Earth stands", "Play again");
    return;
  }
  resetWave(true);
}

function hitInvader(inv) {
  inv.alive = false;
  const p = posOf(inv);
  burst(p.x + 5, p.y + 4, COLORS[inv.type]);
  addScore((4 - inv.type) * 10);
  sfx.explode();
  if (!aliveInvaders().length) {
    sfx.clear();
    nextWave();
  }
}

function update(dt) {
  state.player.cooldown = Math.max(0, state.player.cooldown - dt);
  state.ufoTimer -= dt;
  state.shake = Math.max(0, state.shake - dt * 18);

  const pace = state.mode === "play" ? Math.max(0.12, 0.55 - (COLS * ROWS - aliveInvaders().length) * 0.012) : 0.62;
  state.acc += dt;
  if (state.acc >= pace) {
    state.acc = 0;
    if (aliveInvaders().length) march();
    if (state.mode === "play" && Math.random() < 0.35) alienFire();
  }

  if (state.mode !== "play") return;

  if (keys.left) state.player.x -= 70 * dt;
  if (keys.right) state.player.x += 70 * dt;
  state.player.x = Math.max(8, Math.min(W - 20, state.player.x));
  if (keys.fire) fire();

  if (state.shot) {
    state.shot.y -= 160 * dt;
    if (state.shot.y < 16) state.shot = null;
  }

  state.alienShots.forEach((shot) => {
    shot.y += 70 * dt;
  });
  state.alienShots = state.alienShots.filter((shot) => shot.y < H - 8);

  if (!state.ufo && state.ufoTimer <= 0) {
    state.ufo = { x: -16, y: 16, dir: 1 };
    state.ufoTimer = 8 + Math.random() * 6;
  }
  if (state.ufo) {
    state.ufo.x += 46 * dt * state.ufo.dir;
    if (state.ufo.x > W + 8) state.ufo = null;
  }

  if (state.shot) {
    for (const inv of aliveInvaders()) {
      const p = posOf(inv);
      if (overlap(state.shot.x, state.shot.y, 2, 6, p.x, p.y, 10, 8)) {
        state.shot = null;
        hitInvader(inv);
        break;
      }
    }
  }

  if (state.shot && state.ufo && overlap(state.shot.x, state.shot.y, 2, 6, state.ufo.x, state.ufo.y, 12, 6)) {
    burst(state.ufo.x + 6, state.ufo.y, "#ff2d6a");
    addScore(100 + ((Math.random() * 3) | 0) * 50);
    sfx.explode();
    state.ufo = null;
    state.shot = null;
  }

  for (const shot of state.alienShots) {
    if (overlap(shot.x, shot.y, 2, 5, state.player.x, 208, 10, 8)) {
      state.alienShots = state.alienShots.filter((item) => item !== shot);
      loseLife();
      break;
    }
  }

  if (state.mode === "play" && aliveInvaders().length && bounds(state.form).bottom >= 206) {
    state.lives = 0;
    sfx.die();
    state.mode = "over";
    showOverlay(`Score ${pad(state.score)}`, "Game over", "Press start");
  }

  state.particles.forEach((p) => {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  });
  state.particles = state.particles.filter((p) => p.life > 0);
}

function overlap(x, y, w, h, x2, y2, w2, h2) {
  return x < x2 + w2 && x + w > x2 && y < y2 + h2 && y + h > y2;
}

function drawStars() {
  ctx.fillStyle = "#9ad7ff";
  for (let i = 0; i < 28; i += 1) {
    const x = (i * 47 + state.frame * 3) % W;
    const y = (i * 29) % 180;
    ctx.fillRect(x, y, 1, 1);
  }
}

function draw() {
  ctx.save();
  const jolt = state.shake ? (Math.random() - 0.5) * state.shake : 0;
  ctx.translate(jolt, 0);
  ctx.fillStyle = "#020403";
  ctx.fillRect(-4, 0, W + 8, H);
  drawStars();

  for (const inv of aliveInvaders()) {
    const p = posOf(inv);
    blit(SPRITES[inv.type][state.frame], p.x, p.y, COLORS[inv.type]);
  }

  if (state.ufo) blit(UFO, state.ufo.x, state.ufo.y, "#ff2d6a");
  if (state.shot) {
    ctx.fillStyle = "#fff";
    ctx.fillRect(state.shot.x, state.shot.y, 2, 6);
  }
  ctx.fillStyle = "#ffe14a";
  for (const shot of state.alienShots) ctx.fillRect(shot.x, shot.y, 2, 5);

  blit(PLAYER, state.player.x, 208, "#3dff6e");
  ctx.fillStyle = "#1d6b38";
  ctx.fillRect(0, 222, W, 2);

  for (const p of state.particles) {
    ctx.globalAlpha = Math.max(0, p.life * 3);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, 2, 2);
  }
  ctx.restore();
  ctx.globalAlpha = 1;

  scoreEl.textContent = pad(state.score);
  hiEl.textContent = pad(state.hi);
  livesEl.textContent = String(Math.max(0, state.lives));
}

function frame(now) {
  const dt = Math.min(0.05, (now - state.last) / 1000 || 0);
  state.last = now;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}

function hold(button, key) {
  const down = (event) => {
    event.preventDefault();
    keys[key] = true;
    if (key === "fire") fire();
  };
  const up = () => {
    keys[key] = false;
  };
  button.addEventListener("pointerdown", down);
  button.addEventListener("pointerup", up);
  button.addEventListener("pointerleave", up);
  button.addEventListener("pointercancel", up);
}

hold(document.querySelector("#left"), "left");
hold(document.querySelector("#right"), "right");
hold(document.querySelector("#fire"), "fire");

function onScreen() {
  const box = canvas.getBoundingClientRect();
  return box.bottom > 0 && box.top < window.innerHeight;
}

function control(key) {
  if (key === "ArrowLeft" || key === "a" || key === "A") return "left";
  if (key === "ArrowRight" || key === "d" || key === "D") return "right";
  if (key === " " || key === "ArrowUp") return "fire";
  return null;
}

startBtn.addEventListener("click", startGame);
window.addEventListener("keydown", (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if ((event.key === "m" || event.key === "M") && !event.repeat) {
    toggleMute();
    return;
  }
  const playing = state.mode === "play";
  const focused = event.target.closest?.("a, button, input, textarea, select");
  if (!playing && (focused || !onScreen())) return;

  const key = control(event.key);
  if (key) {
    event.preventDefault();
    keys[key] = true;
    if (key === "fire" && !event.repeat) {
      if (playing) fire();
      else startGame();
    }
  }
  if (event.key === "Enter" && !playing && !event.repeat) startGame();
});
window.addEventListener("keyup", (event) => {
  const key = control(event.key);
  if (key) keys[key] = false;
});
window.addEventListener("blur", () => {
  keys.left = false;
  keys.right = false;
  keys.fire = false;
});

function toggleMute() {
  sfx.muted = !sfx.muted;
  sfx.unlock();
  muteBtn.textContent = sfx.muted ? "Sound off" : "Sound on";
  muteBtn.setAttribute("aria-pressed", String(sfx.muted));
}
muteBtn.addEventListener("click", toggleMute);

resetWave(false);
showOverlay("Credit 00", "Press start", "Insert coin");
hiEl.textContent = pad(state.hi);
requestAnimationFrame(frame);
