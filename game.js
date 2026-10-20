(function () {
  "use strict";

  var STORAGE_BEST_TIME = "neonneko_best_time";
  var STORAGE_HIGH_SCORE = "neonneko_high_score";
  var TOTAL_STAGES = 5;
  var KEYS_NEEDED = 3;
  var MOVE_MS = 140;

  var STAGE_CONFIG = [
    { size: 9, time: 55 },
    { size: 11, time: 60 },
    { size: 13, time: 70 },
    { size: 15, time: 80 },
    { size: 17, time: 95 },
  ];

  var canvas = document.getElementById("gameCanvas");
  var ctx = canvas.getContext("2d");

  var els = {
    hud: document.getElementById("hud"),
    stageLabel: document.getElementById("stageLabel"),
    timerLabel: document.getElementById("timerLabel"),
    scoreLabel: document.getElementById("scoreLabel"),
    keysLabel: document.getElementById("keysLabel"),
    muteBtn: document.getElementById("muteBtn"),
    titleScreen: document.getElementById("titleScreen"),
    stageScreen: document.getElementById("stageScreen"),
    gameScreen: document.getElementById("gameScreen"),
    resultScreen: document.getElementById("resultScreen"),
    stageAnnounce: document.getElementById("stageAnnounce"),
    bestTimeDisplay: document.getElementById("bestTimeDisplay"),
    highScoreDisplay: document.getElementById("highScoreDisplay"),
    startBtn: document.getElementById("startBtn"),
    restartBtn: document.getElementById("restartBtn"),
    titleBtn: document.getElementById("titleBtn"),
    resultTitle: document.getElementById("resultTitle"),
    resultMessage: document.getElementById("resultMessage"),
    resultScore: document.getElementById("resultScore"),
    resultTime: document.getElementById("resultTime"),
    dpad: document.getElementById("dpad"),
  };

  var state = {
    mode: "title",
    stage: 0,
    maze: null,
    cols: 0,
    rows: 0,
    player: { x: 1, y: 1, drawX: 1, drawY: 1 },
    moving: false,
    moveFrom: null,
    moveTo: null,
    moveStart: 0,
    facing: 1,
    items: [],
    keys: 0,
    doorOpen: false,
    goal: { x: 0, y: 0 },
    timeLeft: 0,
    score: 0,
    totalElapsed: 0,
    lastTick: 0,
    particles: [],
    muted: false,
    animId: 0,
    cellSize: 24,
    bobPhase: 0,
    lastBump: null,
  };

  var audioCtx = null;

  function ensureAudio() {
    if (!audioCtx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume().catch(function () {});
    }
  }

  function beep(freq, duration, type, volume) {
    if (state.muted || !audioCtx) return;
    try {
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.type = type || "square";
      osc.frequency.value = freq;
      gain.gain.value = volume == null ? 0.06 : volume;
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      var now = audioCtx.currentTime;
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      osc.start(now);
      osc.stop(now + duration);
    } catch (e) {
      /* ignore */
    }
  }

  function sfxMove() {
    beep(320, 0.05, "triangle", 0.04);
  }
  function sfxPickup() {
    beep(660, 0.08, "sine", 0.07);
    setTimeout(function () {
      beep(880, 0.1, "sine", 0.06);
    }, 60);
  }
  function sfxDoor() {
    beep(220, 0.12, "sawtooth", 0.05);
    setTimeout(function () {
      beep(440, 0.15, "sawtooth", 0.05);
    }, 100);
  }
  function sfxClear() {
    [523, 659, 784, 1046].forEach(function (f, i) {
      setTimeout(function () {
        beep(f, 0.18, "sine", 0.07);
      }, i * 120);
    });
  }
  function sfxFail() {
    beep(180, 0.25, "sawtooth", 0.06);
    setTimeout(function () {
      beep(120, 0.35, "sawtooth", 0.05);
    }, 180);
  }
  function sfxWin() {
    [392, 523, 659, 784, 1046].forEach(function (f, i) {
      setTimeout(function () {
        beep(f, 0.22, "triangle", 0.07);
      }, i * 100);
    });
  }

  function showScreen(id) {
    ["titleScreen", "stageScreen", "gameScreen", "resultScreen"].forEach(function (key) {
      els[key].classList.toggle("active", key === id);
    });
    els.hud.hidden = id !== "gameScreen";
  }

  function formatTime(sec) {
    if (sec == null || !isFinite(sec)) return "---";
    var s = Math.max(0, Math.floor(sec));
    var m = Math.floor(s / 60);
    var r = s % 60;
    return m + ":" + (r < 10 ? "0" : "") + r;
  }

  function storageGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function storageSet(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (e) {
      return false;
    }
  }

  function readRecordNumber(key) {
    var raw = storageGet(key);
    if (raw == null || raw === "") return null;
    var n = Number(raw);
    if (!isFinite(n) || n < 0) return null;
    return n;
  }

  function loadRecords() {
    var best = readRecordNumber(STORAGE_BEST_TIME);
    var high = readRecordNumber(STORAGE_HIGH_SCORE);
    els.bestTimeDisplay.textContent = best != null ? formatTime(best) : "---";
    els.highScoreDisplay.textContent = high != null ? String(Math.floor(high)) : "0";
  }

  function saveRecords(totalTime, score) {
    if (totalTime != null) {
      var time = Math.floor(totalTime);
      var prevBest = readRecordNumber(STORAGE_BEST_TIME);
      if (isFinite(time) && time >= 0 && (prevBest == null || time < prevBest)) {
        storageSet(STORAGE_BEST_TIME, String(time));
      }
    }
    var points = Math.floor(score);
    var prevHigh = readRecordNumber(STORAGE_HIGH_SCORE);
    if (isFinite(points) && points >= 0 && (prevHigh == null || points > prevHigh)) {
      storageSet(STORAGE_HIGH_SCORE, String(points));
    }
    loadRecords();
  }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  /** Recursive backtracking maze. 1 = wall, 0 = path */
  function generateMaze(cols, rows) {
    var grid = [];
    var r, c;
    for (r = 0; r < rows; r++) {
      grid[r] = [];
      for (c = 0; c < cols; c++) {
        grid[r][c] = 1;
      }
    }

    function carve(x, y) {
      grid[y][x] = 0;
      var dirs = shuffle([
        [0, -2],
        [0, 2],
        [-2, 0],
        [2, 0],
      ]);
      for (var i = 0; i < dirs.length; i++) {
        var nx = x + dirs[i][0];
        var ny = y + dirs[i][1];
        if (nx > 0 && ny > 0 && nx < cols - 1 && ny < rows - 1 && grid[ny][nx] === 1) {
          grid[y + dirs[i][1] / 2][x + dirs[i][0] / 2] = 0;
          carve(nx, ny);
        }
      }
    }

    carve(1, 1);
    grid[1][1] = 0;
    grid[rows - 2][cols - 2] = 0;
    return grid;
  }

  function openingsAt(maze, x, y) {
    var n = 0;
    if (y > 0 && maze[y - 1][x] === 0) n++;
    if (y + 1 < maze.length && maze[y + 1][x] === 0) n++;
    if (x > 0 && maze[y][x - 1] === 0) n++;
    if (x + 1 < maze[0].length && maze[y][x + 1] === 0) n++;
    return n;
  }

  /** Cells reachable from start while the goal cell is still locked. */
  function reachableCells(maze, start, blocked) {
    var h = maze.length;
    var w = maze[0].length;
    var seen = [];
    var y;
    var x;
    for (y = 0; y < h; y++) {
      seen[y] = [];
      for (x = 0; x < w; x++) seen[y][x] = 0;
    }
    var q = [{ x: start.x, y: start.y }];
    seen[start.y][start.x] = 1;
    var cells = [];
    var head = 0;
    var dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    while (head < q.length) {
      var p = q[head++];
      cells.push(p);
      for (var i = 0; i < dirs.length; i++) {
        var nx = p.x + dirs[i][0];
        var ny = p.y + dirs[i][1];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (maze[ny][nx] !== 0) continue;
        if (blocked && nx === blocked.x && ny === blocked.y) continue;
        if (seen[ny][nx]) continue;
        seen[ny][nx] = 1;
        q.push({ x: nx, y: ny });
      }
    }
    return cells;
  }

  function placeItems(spots) {
    var cells = shuffle(spots);
    var items = [];
    var limit = Math.min(cells.length, KEYS_NEEDED + 3);
    for (var i = 0; i < limit; i++) {
      items.push({
        x: cells[i].x,
        y: cells[i].y,
        type: i < KEYS_NEEDED ? "star" : "fish",
        taken: false,
      });
    }
    return items;
  }

  /**
   * The door blocks the goal until 3 stars are collected, and stepping on it
   * clears the stage. A goal with two openings hides a side branch that can
   * never be entered — if a star lands there, the stage cannot be finished.
   * Prefer a dead-end goal, and only place items on cells reachable while locked.
   */
  function createLevel(size) {
    var start = { x: 1, y: 1 };
    var goal = { x: size - 2, y: size - 2 };
    var fallback = null;
    for (var attempt = 0; attempt < 80; attempt++) {
      var maze = generateMaze(size, size);
      var reachable = reachableCells(maze, start, goal);
      var spots = [];
      var goalConnected = false;
      for (var i = 0; i < reachable.length; i++) {
        var p = reachable[i];
        if (Math.abs(p.x - goal.x) + Math.abs(p.y - goal.y) === 1) goalConnected = true;
        if (p.x === start.x && p.y === start.y) continue;
        spots.push(p);
      }
      if (!goalConnected || spots.length < KEYS_NEEDED) continue;
      var level = { maze: maze, goal: goal, items: placeItems(spots) };
      if (!fallback || spots.length > fallback.spots) {
        fallback = { maze: level.maze, goal: level.goal, items: level.items, spots: spots.length };
      }
      if (openingsAt(maze, goal.x, goal.y) === 1 && spots.length >= KEYS_NEEDED + 3) {
        return { maze: maze, goal: goal, items: level.items };
      }
    }
    if (fallback) {
      return { maze: fallback.maze, goal: fallback.goal, items: fallback.items };
    }
    var mazeLast = generateMaze(size, size);
    var reachableLast = reachableCells(mazeLast, start, goal);
    var spotsLast = [];
    for (var n = 0; n < reachableLast.length; n++) {
      if (reachableLast[n].x === start.x && reachableLast[n].y === start.y) continue;
      spotsLast.push(reachableLast[n]);
    }
    return { maze: mazeLast, goal: goal, items: placeItems(spotsLast) };
  }

  function updateHud() {
    els.stageLabel.textContent = "ステージ " + (state.stage + 1) + "/" + TOTAL_STAGES;
    els.timerLabel.textContent = "⏱ " + Math.ceil(state.timeLeft);
    els.scoreLabel.textContent = "スコア " + state.score;
    els.keysLabel.textContent = "★ " + state.keys + "/" + KEYS_NEEDED;
    if (state.timeLeft <= 10) {
      els.timerLabel.style.color = "#ff6b9d";
    } else {
      els.timerLabel.style.color = "";
    }
  }

  function spawnParticles(cx, cy, color, count) {
    for (var i = 0; i < count; i++) {
      var ang = Math.random() * Math.PI * 2;
      var spd = 40 + Math.random() * 80;
      state.particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        life: 0.45 + Math.random() * 0.35,
        maxLife: 0.8,
        color: color,
        size: 2 + Math.random() * 3,
      });
    }
  }

  function startStage(index) {
    state.stage = index;
    var cfg = STAGE_CONFIG[index];
    state.cols = cfg.size;
    state.rows = cfg.size;
    var level = createLevel(cfg.size);
    state.maze = level.maze;
    state.goal = level.goal;
    state.player = { x: 1, y: 1, drawX: 1, drawY: 1 };
    state.moving = false;
    state.moveFrom = null;
    state.moveTo = null;
    state.facing = 1;
    state.keys = 0;
    state.doorOpen = false;
    state.items = level.items;
    state.lastBump = null;
    state.timeLeft = cfg.time;
    state.particles = [];
    state.cellSize = canvas.width / cfg.size;
    state.lastTick = performance.now();

    showScreen("stageScreen");
    els.stageAnnounce.textContent = "ステージ " + (index + 1);
    updateHud();

    setTimeout(function () {
      if (state.mode !== "playing" && state.mode !== "stageintro") return;
      state.mode = "playing";
      showScreen("gameScreen");
      state.lastTick = performance.now();
      queueHeldMove();
      if (!state.animId) loop(state.lastTick);
    }, 1100);

    state.mode = "stageintro";
  }

  function startGame() {
    ensureAudio();
    state.score = 0;
    state.totalElapsed = 0;
    cancelAnimationFrame(state.animId);
    state.animId = 0;
    startStage(0);
  }

  function tryMove(dx, dy) {
    if (state.mode !== "playing" || state.moving) return;
    var nx = state.player.x + dx;
    var ny = state.player.y + dy;
    if (nx < 0 || ny < 0 || nx >= state.cols || ny >= state.rows) {
      state.lastBump = null;
      return;
    }
    if (state.maze[ny][nx] === 1) {
      state.lastBump = null;
      return;
    }

    if (nx === state.goal.x && ny === state.goal.y && !state.doorOpen) {
      var bumpKey = nx + "," + ny;
      if (state.lastBump !== bumpKey) {
        state.lastBump = bumpKey;
        beep(150, 0.08, "square", 0.04);
      }
      return;
    }
    state.lastBump = null;

    if (dx !== 0) state.facing = dx > 0 ? 1 : -1;

    state.moving = true;
    state.moveFrom = { x: state.player.x, y: state.player.y };
    state.moveTo = { x: nx, y: ny };
    state.moveStart = performance.now();
    state.player.x = nx;
    state.player.y = ny;
    sfxMove();
  }

  function finishMove() {
    state.moving = false;
    state.player.drawX = state.player.x;
    state.player.drawY = state.player.y;
    checkPickup();
    if (state.player.x === state.goal.x && state.player.y === state.goal.y && state.doorOpen) {
      onStageClear();
      return;
    }
    queueHeldMove();
  }

  function queueHeldMove() {
    if (state.mode !== "playing" || state.moving) return;
    if (heldPad) {
      var pv = padDir[heldPad];
      if (pv) tryMove(pv[0], pv[1]);
      return;
    }
    var keys = Object.keys(heldKeys);
    if (!keys.length) return;
    var d = keyMap[keys[keys.length - 1]];
    if (d) tryMove(d[0], d[1]);
  }

  function checkPickup() {
    for (var i = 0; i < state.items.length; i++) {
      var it = state.items[i];
      if (it.taken) continue;
      if (it.x === state.player.x && it.y === state.player.y) {
        it.taken = true;
        var cx = (it.x + 0.5) * state.cellSize;
        var cy = (it.y + 0.5) * state.cellSize;
        if (it.type === "star") {
          state.keys += 1;
          state.score += 150;
          spawnParticles(cx, cy, "#ffe566", 14);
          sfxPickup();
          if (state.keys >= KEYS_NEEDED && !state.doorOpen) {
            state.doorOpen = true;
            sfxDoor();
            spawnParticles(
              (state.goal.x + 0.5) * state.cellSize,
              (state.goal.y + 0.5) * state.cellSize,
              "#3df0ff",
              20
            );
          }
        } else if (it.type === "fish") {
          state.timeLeft += 5;
          state.score += 50;
          spawnParticles(cx, cy, "#3df0ff", 12);
          sfxPickup();
        }
        updateHud();
      }
    }
  }

  function onStageClear() {
    state.mode = "cleared";
    var cfg = STAGE_CONFIG[state.stage];
    var bonus = Math.floor(state.timeLeft) * 10;
    state.score += 300 + bonus;
    sfxClear();
    updateHud();

    if (state.stage + 1 >= TOTAL_STAGES) {
      setTimeout(function () {
        allClear();
      }, 600);
    } else {
      setTimeout(function () {
        startStage(state.stage + 1);
      }, 700);
    }
  }

  function allClear() {
    state.mode = "win";
    cancelAnimationFrame(state.animId);
    state.animId = 0;
    sfxWin();
    saveRecords(state.totalElapsed, state.score);
    showScreen("resultScreen");
    els.resultTitle.textContent = "全クリア！";
    els.resultTitle.className = "win";
    els.resultMessage.textContent = "ねこちゃん、夜の迷路をかけぬけたよ！";
    els.resultScore.textContent = String(state.score);
    els.resultTime.textContent = formatTime(state.totalElapsed);
  }

  function gameOver(reason) {
    state.mode = "lose";
    cancelAnimationFrame(state.animId);
    state.animId = 0;
    sfxFail();
    saveRecords(null, state.score);
    showScreen("resultScreen");
    els.resultTitle.textContent = "ゲームオーバー";
    els.resultTitle.className = "lose";
    els.resultMessage.textContent = reason || "時間切れ…もう一度挑戦しよう！";
    els.resultScore.textContent = String(state.score);
    els.resultTime.textContent = formatTime(state.totalElapsed);
  }

  function easeOutQuad(t) {
    return 1 - (1 - t) * (1 - t);
  }

  function update(now) {
    if (state.mode !== "playing") return;

    var dt = Math.min(0.05, Math.max(0, (now - state.lastTick) / 1000));
    state.lastTick = now;
    state.timeLeft -= dt;
    if (state.timeLeft < 0) state.timeLeft = 0;
    state.totalElapsed += dt;
    state.bobPhase += dt * 6;

    if (state.moving && state.moveFrom && state.moveTo) {
      var t = (now - state.moveStart) / MOVE_MS;
      if (t < 0) t = 0;
      if (t > 1) t = 1;
      if (t >= 1) {
        finishMove();
      } else {
        var e = easeOutQuad(t);
        state.player.drawX = state.moveFrom.x + (state.moveTo.x - state.moveFrom.x) * e;
        state.player.drawY = state.moveFrom.y + (state.moveTo.y - state.moveFrom.y) * e;
      }
    } else if (state.mode === "playing") {
      queueHeldMove();
    }

    if (state.mode !== "playing") return;

    if (state.timeLeft <= 0) {
      state.timeLeft = 0;
      updateHud();
      gameOver("時間切れ…もう一度挑戦しよう！");
      return;
    }

    for (var i = state.particles.length - 1; i >= 0; i--) {
      var p = state.particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 60 * dt;
      if (p.life <= 0) state.particles.splice(i, 1);
    }

    updateHud();
  }

  function draw() {
    var cs = state.cellSize;
    var maze = state.maze;
    if (!maze) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    var g = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    g.addColorStop(0, "#0c0620");
    g.addColorStop(1, "#140a30");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    var r, c;
    for (r = 0; r < state.rows; r++) {
      for (c = 0; c < state.cols; c++) {
        var x = c * cs;
        var y = r * cs;
        if (maze[r][c] === 1) {
          ctx.fillStyle = "#1a1035";
          ctx.fillRect(x, y, cs + 0.5, cs + 0.5);
          ctx.strokeStyle = "rgba(255, 79, 216, 0.35)";
          ctx.lineWidth = Math.max(1, cs * 0.06);
          ctx.shadowBlur = 6;
          ctx.shadowColor = "rgba(255, 79, 216, 0.45)";
          ctx.strokeRect(x + 2, y + 2, cs - 4, cs - 4);
          ctx.shadowBlur = 0;
        } else {
          ctx.fillStyle = "rgba(61, 240, 255, 0.04)";
          ctx.fillRect(x, y, cs, cs);
        }
      }
    }

    // Goal door
    var gx = state.goal.x * cs;
    var gy = state.goal.y * cs;
    if (state.doorOpen) {
      ctx.save();
      ctx.shadowBlur = 16;
      ctx.shadowColor = "#5dffb0";
      ctx.fillStyle = "rgba(93, 255, 176, 0.35)";
      ctx.fillRect(gx + cs * 0.15, gy + cs * 0.15, cs * 0.7, cs * 0.7);
      ctx.fillStyle = "#5dffb0";
      ctx.font = "bold " + Math.floor(cs * 0.55) + "px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("🚪", gx + cs / 2, gy + cs / 2 + 1);
      ctx.restore();
    } else {
      ctx.save();
      ctx.shadowBlur = 12;
      ctx.shadowColor = "#a78bfa";
      ctx.fillStyle = "rgba(167, 139, 250, 0.4)";
      ctx.fillRect(gx + cs * 0.1, gy + cs * 0.1, cs * 0.8, cs * 0.8);
      ctx.fillStyle = "#c4b5fd";
      ctx.font = "bold " + Math.floor(cs * 0.5) + "px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("🔒", gx + cs / 2, gy + cs / 2 + 1);
      ctx.restore();
    }

    // Items
    for (var i = 0; i < state.items.length; i++) {
      var it = state.items[i];
      if (it.taken) continue;
      var ix = (it.x + 0.5) * cs;
      var iy = (it.y + 0.5) * cs + Math.sin(state.bobPhase + it.x) * 2;
      ctx.save();
      ctx.shadowBlur = 14;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = Math.floor(cs * 0.55) + "px sans-serif";
      if (it.type === "star") {
        ctx.shadowColor = "#ffe566";
        ctx.fillText("⭐", ix, iy);
      } else {
        ctx.shadowColor = "#3df0ff";
        ctx.fillText("🐟", ix, iy);
      }
      ctx.restore();
    }

    // Cat player
    var px = (state.player.drawX + 0.5) * cs;
    var py = (state.player.drawY + 0.5) * cs + Math.sin(state.bobPhase * 1.2) * 1.5;
    ctx.save();
    ctx.translate(px, py);
    ctx.scale(state.facing, 1);
    ctx.shadowBlur = 18;
    ctx.shadowColor = "#ff4fd8";
    ctx.font = Math.floor(cs * 0.7) + "px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🐱", 0, 0);
    ctx.restore();

    // Soft neon trail under cat
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.shadowBlur = 20;
    ctx.shadowColor = "#3df0ff";
    ctx.fillStyle = "#3df0ff";
    ctx.beginPath();
    ctx.arc(px, py + cs * 0.28, cs * 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Particles
    for (var j = 0; j < state.particles.length; j++) {
      var p = state.particles[j];
      var alpha = Math.max(0, p.life / p.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.shadowBlur = 8;
      ctx.shadowColor = p.color;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function loop(now) {
    if (state.mode === "playing" || state.mode === "cleared" || state.mode === "stageintro") {
      if (state.mode === "playing") update(now);
      draw();
      state.animId = requestAnimationFrame(loop);
    } else {
      state.animId = 0;
    }
  }

  var keyMap = {
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    w: [0, -1],
    W: [0, -1],
    s: [0, 1],
    S: [0, 1],
    a: [-1, 0],
    A: [-1, 0],
    d: [1, 0],
    D: [1, 0],
  };

  var heldKeys = {};
  var heldPad = null;
  var padDir = {
    up: [0, -1],
    down: [0, 1],
    left: [-1, 0],
    right: [1, 0],
  };

  window.addEventListener("keydown", function (e) {
    if (keyMap[e.key]) {
      e.preventDefault();
      if (heldKeys[e.key]) return;
      heldKeys[e.key] = true;
      ensureAudio();
      var d = keyMap[e.key];
      tryMove(d[0], d[1]);
    }
  });

  window.addEventListener("keyup", function (e) {
    delete heldKeys[e.key];
  });

  window.addEventListener("blur", function () {
    heldKeys = {};
    heldPad = null;
  });

  function bindDpad() {
    var buttons = els.dpad.querySelectorAll(".dpad-btn");

    els.dpad.addEventListener("contextmenu", function (ev) {
      ev.preventDefault();
    });

    buttons.forEach(function (btn) {
      var dir = btn.getAttribute("data-dir");
      var press = function (ev) {
        ev.preventDefault();
        try {
          btn.setPointerCapture(ev.pointerId);
        } catch (e) {
          /* pointer capture is unavailable for this event */
        }
        btn.classList.add("active");
        heldPad = dir;
        ensureAudio();
        var v = padDir[dir];
        if (v) tryMove(v[0], v[1]);
      };
      var release = function (ev) {
        if (ev) ev.preventDefault();
        btn.classList.remove("active");
        if (heldPad === dir) heldPad = null;
      };
      btn.addEventListener("pointerdown", press);
      btn.addEventListener("pointerup", release);
      btn.addEventListener("pointercancel", release);
      btn.addEventListener("pointerleave", function (ev) {
        if (btn.hasPointerCapture && ev && btn.hasPointerCapture(ev.pointerId)) return;
        release(ev);
      });
    });
  }

  els.startBtn.addEventListener("click", function () {
    ensureAudio();
    startGame();
  });

  els.restartBtn.addEventListener("click", function () {
    ensureAudio();
    startGame();
  });

  els.titleBtn.addEventListener("click", function () {
    state.mode = "title";
    cancelAnimationFrame(state.animId);
    state.animId = 0;
    showScreen("titleScreen");
    loadRecords();
  });

  els.muteBtn.addEventListener("click", function () {
    state.muted = !state.muted;
    els.muteBtn.textContent = state.muted ? "🔇" : "🔊";
    els.muteBtn.setAttribute("aria-label", state.muted ? "ミュート解除" : "ミュート");
  });

  bindDpad();
  loadRecords();
  showScreen("titleScreen");
})();
