import { useRef, useEffect, useCallback } from 'react';

const W = 1080;
const H = 600;
const HALF = W / 2;

/* ---- riso-zine theme ---- */
const INK    = '#181410';
const PAPER  = '#f4ead5';
const PAPER2 = '#ece1c8';
const PINK   = '#ff3a86';
const BLUE   = '#1f3df0';
const YELLOW = '#ffd83a';
const GREEN  = '#1aa672';
const DISPLAY_FONT = '"Bricolage Grotesque", system-ui, sans-serif';
const SERIF_FONT   = '"Newsreader", "Times New Roman", serif';
const MONO_FONT    = '"JetBrains Mono", ui-monospace, monospace';

/* ---- tuning ---- */
const SUB_X = 170;
const SUB_RX = 38;
const SUB_RY = 20;
const SUB_HITBOX = 22;
const SUB_MIN_SPEED = 110;
const SUB_MAX_SPEED = 380;
const POWER_CRANK = 38;
const POWER_DECAY = 9;
const LEAK_FILL_RATE = 11;
const LEAK_DRAIN_RATE = 55;
const HIT_COOLDOWN = 0.9;
const ROCK_SPEED_BASE = 280;
const ROCK_SPAWN_BASE = 1.4;
const ROCK_SPAWN_RAMP = 0.075;
const ROCK_SPEED_RAMP = 4.0;

const TORPEDO_SPEED = 620;
const TORPEDO_COST = 20;
const TORPEDO_COOLDOWN = 0.55;
const TORPEDO_MAG_MAX = 3;
const TORPEDO_RELOAD = 4.2;
const TORPEDO_LEN = 22;
const TORPEDO_R = 6;

const ROCKET_FIRST_SPAWN = 10;
const ROCKET_SPAWN_BASE = 0.13;
const ROCKET_SPAWN_RAMP = 0.008;
const ROCKET_DIST_SPEED = 0.14;
const ROCKET_HIT_TOLERANCE = 55;
const ROCKET_HIT_POWER_DRAIN = 25;
const ROCKET_HIT_LEAK_COUNT = 2;
const FLARE_COST = 8;
const FLARE_COOLDOWN = 0.4;
const ROCKET_TY_MIN = 60;
const ROCKET_TY_MAX = H - 60;

// Sonar strip layout (engineer panel only)
const SONAR_X = HALF + 28;
const SONAR_Y = 350;
const SONAR_W = HALF - 56;
const SONAR_H = 165;
const SONAR_TRACK_X0 = HALF + 110;
const SONAR_TRACK_X1 = W - 50;
const SONAR_TRACK_Y0 = 380;
const SONAR_TRACK_Y1 = 500;
const SONAR_BLIP_HIT_R = 18;

const LEAK_POSITIONS = [
  { x: HALF + 130, y: 130 },
  { x: HALF + 380, y: 130 },
  { x: HALF + 130, y: 270 },
  { x: HALF + 380, y: 270 },
];
const LEAK_RADIUS = 40;
const HULL_RECT = { x: HALF + 60, y: 70, w: HALF - 120, h: 270, r: 50 };

function spawnBubble(initial) {
  return {
    x: Math.random() * HALF,
    y: initial ? Math.random() * H : H + 8,
    r: 1.4 + Math.random() * 2.6,
    vy: 16 + Math.random() * 26,
    wob: Math.random() * Math.PI * 2,
  };
}

function Submarine({ gameState, setGameState, onBack, multiplayer, mp }) {
  const canvasRef = useRef(null);
  const stateRef = useRef(null);
  const keysRef = useRef(Object.create(null));
  const mouseRef = useRef({ x: 0, y: 0, down: false });

  const inMP = !!multiplayer;
  const role = mp?.role;
  const isCaptain = !inMP || role === 'host';
  const isEngineer = inMP && role === 'guest';
  const isHostSim = !inMP || role === 'host';

  const inMPRef = useRef(inMP); inMPRef.current = inMP;
  const isHostSimRef = useRef(isHostSim); isHostSimRef.current = isHostSim;
  const isCaptainRef = useRef(isCaptain); isCaptainRef.current = isCaptain;
  const isEngineerRef = useRef(isEngineer); isEngineerRef.current = isEngineer;
  const prevRepairRef = useRef(null);

  function initState() {
    const bubbles = [];
    for (let i = 0; i < 26; i++) bubbles.push(spawnBubble(true));
    return {
      gameState: 'waiting',
      sub: { y: H / 2 },
      rocks: [],
      torpedoes: [],
      particles: [],
      leaks: LEAK_POSITIONS.map((p) => ({ ...p, fill: 0, active: false })),
      bubbles,
      power: 28,
      elapsed: 0,
      best: 0,
      hitCooldown: 0,
      flashTimer: 0,
      shake: 0,
      lastSpawn: 0,
      fireCooldown: 0,
      firePressed: false,
      torpedoMag: TORPEDO_MAG_MAX,
      torpedoReload: 0,
      engineerCranking: false,
      engineerRepairLeak: null,
      rockets: [],
      flareCooldown: 0,
      lastRocketSpawn: 0,
      nextRocketId: 1,
      finalScore: 0,
    };
  }
  // eslint-disable-next-line react-hooks/refs
  if (!stateRef.current) stateRef.current = initState();

  const restart = useCallback(() => {
    const s = stateRef.current;
    const best = s.best;
    Object.assign(s, initState());
    s.best = best;
    s.gameState = 'playing';
    setGameState('playing');
  }, [setGameState]);

  // Keyboard.
  useEffect(() => {
    function onDown(e) {
      const k = e.key.toLowerCase();
      keysRef.current[k] = true;
      if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
      }
      const s = stateRef.current;
      const inMpNow = inMPRef.current;
      const isHostNow = isHostSimRef.current;
      const isEngineerNow = isEngineerRef.current;

      // Start the round — only the host (captain) starts it.
      if (s.gameState === 'waiting' && (k === ' ' || k === 'enter')) {
        if (isHostNow) {
          s.gameState = 'playing';
          setGameState('playing');
        }
      }
      // Restart on gameover.
      if (s.gameState === 'gameover' && (k === 'r' || k === 'enter')) {
        if (isHostNow) restart();
        else mp?.send({ type: 'restart' });
        return;
      }

      if (s.gameState !== 'playing') return;

      if (isEngineerNow) {
        if (k === ' ' && !s.engineerCranking) {
          s.engineerCranking = true;
          mp?.send({ type: 'crank', pressed: true });
        } else if (k === 'f') {
          mp?.send({ type: 'fire' });
        }
      } else if (!inMpNow) {
        if (k === ' ') s.engineerCranking = true;
        else if (k === 'f') s.firePressed = true;
      }
    }
    function onUp(e) {
      const k = e.key.toLowerCase();
      keysRef.current[k] = false;
      const s = stateRef.current;
      if (isEngineerRef.current) {
        if (k === ' ' && s.engineerCranking) {
          s.engineerCranking = false;
          mp?.send({ type: 'crank', pressed: false });
        }
      } else if (!inMPRef.current) {
        if (k === ' ') s.engineerCranking = false;
      }
    }
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, [restart, setGameState, mp]);

  // Mouse.
  useEffect(() => {
    const canvas = canvasRef.current;
    function toCanvas(e) {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current.x = (e.clientX - rect.left) * (W / rect.width);
      mouseRef.current.y = (e.clientY - rect.top) * (H / rect.height);
    }
    function down(e) {
      mouseRef.current.down = true;
      toCanvas(e);
      const s = stateRef.current;
      if (s.gameState !== 'playing') return;

      // Flare a rocket on click — engineer (or solo player) only.
      if (isCaptainRef.current && inMPRef.current) return; // captain has no rocket UI
      const m = mouseRef.current;
      if (m.x > SONAR_TRACK_X0 - 10 && m.x < SONAR_TRACK_X1 + 10 &&
          m.y > SONAR_TRACK_Y0 - 10 && m.y < SONAR_TRACK_Y1 + 10) {
        let closest = null;
        let closestSq = SONAR_BLIP_HIT_R * SONAR_BLIP_HIT_R;
        for (const r of s.rockets) {
          if (r.destroyed) continue;
          const rx = SONAR_TRACK_X0 + r.distance * (SONAR_TRACK_X1 - SONAR_TRACK_X0);
          const ryRatio = (r.targetY - ROCKET_TY_MIN) / (ROCKET_TY_MAX - ROCKET_TY_MIN);
          const ry = SONAR_TRACK_Y0 + ryRatio * (SONAR_TRACK_Y1 - SONAR_TRACK_Y0);
          const dx = rx - m.x, dy = ry - m.y;
          const dsq = dx * dx + dy * dy;
          if (dsq < closestSq) { closestSq = dsq; closest = r; }
        }
        if (closest) {
          if (isEngineerRef.current) {
            mp?.send({ type: 'flare', id: closest.id });
          } else if (!inMPRef.current) {
            // Solo: apply locally
            if (s.flareCooldown <= 0 && s.power >= FLARE_COST) {
              s.power -= FLARE_COST;
              s.flareCooldown = FLARE_COOLDOWN;
              closest.destroyed = true;
              closest.destroyTime = 0;
              closest.impacted = false;
            }
          }
        }
      }
    }
    function up() { mouseRef.current.down = false; }
    canvas.addEventListener('mousedown', down);
    canvas.addEventListener('mousemove', toCanvas);
    canvas.addEventListener('mouseleave', up);
    window.addEventListener('mouseup', up);
    return () => {
      canvas.removeEventListener('mousedown', down);
      canvas.removeEventListener('mousemove', toCanvas);
      canvas.removeEventListener('mouseleave', up);
      window.removeEventListener('mouseup', up);
    };
  }, [mp]);

  // Sync external gameState into mutable state.
  useEffect(() => {
    stateRef.current.gameState = gameState;
  }, [gameState]);

  // Network messages.
  useEffect(() => {
    if (!multiplayer || !mp) return;
    mp.setOnMessage((data) => {
      const s = stateRef.current;
      if (isHostSimRef.current) {
        if (data.type === 'crank') {
          s.engineerCranking = !!data.pressed;
        } else if (data.type === 'repair-start') {
          s.engineerRepairLeak = data.index;
        } else if (data.type === 'repair-stop') {
          s.engineerRepairLeak = null;
        } else if (data.type === 'fire') {
          s.firePressed = true;
        } else if (data.type === 'flare') {
          if (s.flareCooldown > 0 || s.power < FLARE_COST) return;
          const target = s.rockets.find((r) => r.id === data.id && !r.destroyed);
          if (!target) return;
          s.power -= FLARE_COST;
          s.flareCooldown = FLARE_COOLDOWN;
          target.destroyed = true;
          target.destroyTime = 0;
          target.impacted = false;
        } else if (data.type === 'restart') {
          if (s.gameState === 'gameover') restart();
        }
      } else {
        if (data.type === 'state') {
          s.sub.y = data.sub_y;
          s.power = data.power;
          s.elapsed = data.elapsed;
          s.fireCooldown = data.fireCooldown;
          s.torpedoMag = data.torpedoMag ?? TORPEDO_MAG_MAX;
          s.torpedoReload = data.torpedoReload ?? 0;
          s.flareCooldown = data.flareCooldown ?? 0;
          s.shake = data.shake;
          s.flashTimer = data.flashTimer;
          s.best = data.best;
          s.finalScore = data.finalScore;
          if (Array.isArray(data.leaks)) {
            for (let i = 0; i < s.leaks.length && i < data.leaks.length; i++) {
              s.leaks[i].active = data.leaks[i].active;
              s.leaks[i].fill = data.leaks[i].fill;
            }
          }
          if (Array.isArray(data.rockets)) s.rockets = data.rockets;
          if (data.gameState !== s.gameState) {
            s.gameState = data.gameState;
            setGameState(data.gameState);
          }
        }
      }
    });
  }, [multiplayer, mp, restart, setGameState]);

  // Main loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let raf;
    let last = performance.now();
    let syncCounter = 0;
    function loop(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const s = stateRef.current;
      const inMpNow = inMPRef.current;
      const isHostNow = isHostSimRef.current;

      if (isHostNow) {
        if (s.gameState === 'playing') {
          update(s, dt, keysRef.current, mouseRef.current, inMpNow);
          if (s.gameState === 'gameover') {
            s.finalScore = s.elapsed;
            if (s.elapsed > s.best) s.best = s.elapsed;
            setGameState('gameover');
          }
        } else {
          for (const b of s.bubbles) {
            b.y -= b.vy * dt;
            b.wob += dt * 2;
            b.x += Math.sin(b.wob) * 8 * dt;
            if (b.y < -10) Object.assign(b, spawnBubble(false));
          }
        }
        s.flashTimer = Math.max(0, s.flashTimer - dt);
        s.shake = Math.max(0, s.shake - dt * 4);

        if (inMpNow && (syncCounter++ % 3 === 0)) {
          mp?.send({
            type: 'state',
            sub_y: s.sub.y,
            power: s.power,
            elapsed: s.elapsed,
            fireCooldown: s.fireCooldown,
            torpedoMag: s.torpedoMag,
            torpedoReload: s.torpedoReload,
            flareCooldown: s.flareCooldown,
            shake: s.shake,
            flashTimer: s.flashTimer,
            leaks: s.leaks.map((l) => ({ active: l.active, fill: l.fill })),
            rockets: s.rockets.map((r) => ({
              id: r.id,
              distance: r.distance,
              targetY: r.targetY,
              destroyed: !!r.destroyed,
              destroyTime: r.destroyTime || 0,
              impacted: !!r.impacted,
            })),
            gameState: s.gameState,
            best: s.best,
            finalScore: s.finalScore,
          });
        }
      } else {
        // Engineer: detect mouse-on-leak transitions, emit intents.
        if (s.gameState === 'playing') {
          const m = mouseRef.current;
          let curIdx = null;
          if (m.down && m.x > HALF) {
            let bestDist = Infinity;
            for (let i = 0; i < s.leaks.length; i++) {
              const l = s.leaks[i];
              if (!l.active) continue;
              const dx = l.x - m.x, dy = l.y - m.y;
              const d = dx * dx + dy * dy;
              if (d < LEAK_RADIUS * LEAK_RADIUS && d < bestDist) {
                bestDist = d;
                curIdx = i;
              }
            }
          }
          if (curIdx !== prevRepairRef.current) {
            prevRepairRef.current = curIdx;
            if (curIdx !== null) mp?.send({ type: 'repair-start', index: curIdx });
            else mp?.send({ type: 'repair-stop' });
          }
        }
        // Local-only visual timers (host's are authoritative via state sync).
        s.flashTimer = Math.max(0, s.flashTimer - dt);
        s.shake = Math.max(0, s.shake - dt * 4);
      }

      const view = inMpNow
        ? { isCaptain: isCaptainRef.current, isEngineer: isEngineerRef.current }
        : null;
      draw(ctx, s, keysRef.current, mouseRef.current, view);
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [setGameState, mp]);

  const cropOffset = isEngineer ? -HALF : 0;

  return (
    <div className="game-container">
      {inMP ? (
        <div
          style={{
            width: HALF,
            height: H,
            overflow: 'hidden',
            position: 'relative',
            borderRadius: 10,
          }}
        >
          <canvas
            ref={canvasRef}
            width={W}
            height={H}
            style={{
              display: 'block',
              transform: `translateX(${cropOffset}px)`,
              background: PAPER,
            }}
          />
        </div>
      ) : (
        <canvas ref={canvasRef} width={W} height={H} />
      )}
      <button className="back-btn" onClick={onBack}>Menu</button>
      {inMP && (
        <div className="mp-role-badge" style={isEngineer ? { background: BLUE } : undefined}>
          {isCaptain ? 'captain · pilot' : 'engineer · hull/power/weapons'}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   Update
   ============================================================ */

function update(s, dt, keys, mouse, inMP) {
  s.elapsed += dt;

  // Power
  const cranking = inMP ? s.engineerCranking : !!keys[' '];
  if (cranking) s.power = Math.min(100, s.power + POWER_CRANK * dt);
  s.power = Math.max(0, s.power - POWER_DECAY * dt);

  // Sub
  const speed = SUB_MIN_SPEED + (SUB_MAX_SPEED - SUB_MIN_SPEED) * (s.power / 100);
  if (keys['w'] || keys['arrowup']) s.sub.y -= speed * dt;
  if (keys['s'] || keys['arrowdown']) s.sub.y += speed * dt;
  s.sub.y = Math.max(SUB_RY + 12, Math.min(H - SUB_RY - 12, s.sub.y));

  // Rocks
  const rockSpeed = ROCK_SPEED_BASE + ROCK_SPEED_RAMP * s.elapsed;
  const spawnRate = ROCK_SPAWN_BASE + ROCK_SPAWN_RAMP * s.elapsed;
  s.lastSpawn += dt;
  if (s.lastSpawn > 1 / spawnRate) {
    s.lastSpawn = 0;
    s.rocks.push({
      x: HALF + 60,
      y: 50 + Math.random() * (H - 100),
      r: 18 + Math.random() * 20,
      spin: Math.random() * Math.PI * 2,
      seed: Math.random() * 1000,
    });
  }
  for (const r of s.rocks) {
    r.x -= rockSpeed * dt;
    r.spin += dt * 0.6;
  }
  s.rocks = s.rocks.filter((r) => r.x > -60);

  // Torpedoes — fire request
  s.fireCooldown = Math.max(0, s.fireCooldown - dt);
  // Magazine slow-reloads when below cap.
  if (s.torpedoMag < TORPEDO_MAG_MAX) {
    s.torpedoReload += dt;
    while (s.torpedoReload >= TORPEDO_RELOAD && s.torpedoMag < TORPEDO_MAG_MAX) {
      s.torpedoReload -= TORPEDO_RELOAD;
      s.torpedoMag++;
    }
  } else {
    s.torpedoReload = 0;
  }
  if (
    s.firePressed &&
    s.fireCooldown === 0 &&
    s.torpedoMag > 0 &&
    s.power >= TORPEDO_COST
  ) {
    s.torpedoes.push({ x: SUB_X + SUB_RX + 4, y: s.sub.y, age: 0 });
    s.power -= TORPEDO_COST;
    s.torpedoMag--;
    s.fireCooldown = TORPEDO_COOLDOWN;
  }
  s.firePressed = false;
  for (const t of s.torpedoes) {
    t.x += TORPEDO_SPEED * dt;
    t.age += dt;
  }
  // Torpedo vs rock
  const killedRocks = new Set();
  const killedTorps = new Set();
  for (let ti = 0; ti < s.torpedoes.length; ti++) {
    if (killedTorps.has(ti)) continue;
    const t = s.torpedoes[ti];
    for (let ri = 0; ri < s.rocks.length; ri++) {
      if (killedRocks.has(ri)) continue;
      const r = s.rocks[ri];
      const dx = r.x - t.x, dy = r.y - t.y;
      if (dx * dx + dy * dy < (r.r + TORPEDO_R) ** 2) {
        killedTorps.add(ti);
        killedRocks.add(ri);
        s.particles.push({ x: r.x, y: r.y, t: 0, life: 0.35, r0: r.r });
        break;
      }
    }
  }
  s.rocks = s.rocks.filter((_, i) => !killedRocks.has(i));
  s.torpedoes = s.torpedoes
    .filter((_, i) => !killedTorps.has(i))
    .filter((t) => t.x < HALF + 30);
  for (const p of s.particles) p.t += dt;
  s.particles = s.particles.filter((p) => p.t < p.life);

  // Bubbles
  for (const b of s.bubbles) {
    b.y -= b.vy * dt;
    b.wob += dt * 2;
    b.x += Math.sin(b.wob) * 8 * dt;
    if (b.y < -10) Object.assign(b, spawnBubble(false));
  }

  // Sub vs rock
  s.hitCooldown = Math.max(0, s.hitCooldown - dt);
  if (s.hitCooldown === 0) {
    for (const r of s.rocks) {
      const dx = r.x - SUB_X, dy = r.y - s.sub.y;
      if (dx * dx + dy * dy < (r.r + SUB_HITBOX) ** 2) {
        onHit(s);
        break;
      }
    }
  }

  // Rockets — spawn after a grace period, scale frequency over time.
  s.flareCooldown = Math.max(0, s.flareCooldown - dt);
  if (s.elapsed > ROCKET_FIRST_SPAWN) {
    const sinceFirst = s.elapsed - ROCKET_FIRST_SPAWN;
    const rate = ROCKET_SPAWN_BASE + ROCKET_SPAWN_RAMP * sinceFirst;
    s.lastRocketSpawn += dt;
    if (s.lastRocketSpawn > 1 / rate) {
      s.lastRocketSpawn = 0;
      s.rockets.push({
        id: s.nextRocketId++,
        distance: 1.0,
        targetY: ROCKET_TY_MIN + Math.random() * (ROCKET_TY_MAX - ROCKET_TY_MIN),
        destroyed: false,
        destroyTime: 0,
      });
    }
  }
  for (const r of s.rockets) {
    if (r.destroyed) { r.destroyTime += dt; continue; }
    r.distance -= ROCKET_DIST_SPEED * dt;
    if (r.distance <= 0) {
      // Impact resolution: sub Y close to target Y => hit
      const dy = Math.abs(r.targetY - s.sub.y);
      if (dy < ROCKET_HIT_TOLERANCE) {
        s.flashTimer = 0.4;
        s.shake = 0.95;
        for (let n = 0; n < ROCKET_HIT_LEAK_COUNT; n++) spawnLeak(s);
        s.power = Math.max(0, s.power - ROCKET_HIT_POWER_DRAIN);
      } else {
        // graze: small jolt, no damage
        s.shake = Math.max(s.shake, 0.25);
      }
      r.destroyed = true;
      r.destroyTime = 0;
      r.impacted = true;
    }
  }
  s.rockets = s.rockets.filter((r) => !r.destroyed || r.destroyTime < 0.45);

  // Leaks
  let mouseOnLeak = -1;
  if (inMP) {
    mouseOnLeak = s.engineerRepairLeak == null ? -1 : s.engineerRepairLeak;
  } else if (mouse.down && mouse.x > HALF) {
    let bestDist = Infinity;
    for (let i = 0; i < s.leaks.length; i++) {
      const l = s.leaks[i];
      if (!l.active) continue;
      const dx = l.x - mouse.x, dy = l.y - mouse.y;
      const d = dx * dx + dy * dy;
      if (d < LEAK_RADIUS * LEAK_RADIUS && d < bestDist) {
        bestDist = d;
        mouseOnLeak = i;
      }
    }
  }
  for (let i = 0; i < s.leaks.length; i++) {
    const l = s.leaks[i];
    if (!l.active) continue;
    if (i === mouseOnLeak) {
      l.fill = Math.max(0, l.fill - LEAK_DRAIN_RATE * dt);
      if (l.fill === 0) l.active = false;
    } else {
      l.fill = Math.min(100, l.fill + LEAK_FILL_RATE * dt);
      if (l.fill >= 100) {
        s.gameState = 'gameover';
        return;
      }
    }
  }
}

function onHit(s) {
  s.hitCooldown = HIT_COOLDOWN;
  s.flashTimer = 0.28;
  s.shake = 0.5;
  spawnLeak(s);
}

function spawnLeak(s) {
  const empty = s.leaks
    .map((l, i) => (l.active ? -1 : i))
    .filter((i) => i >= 0);
  if (empty.length === 0) {
    let worst = 0;
    for (let i = 1; i < s.leaks.length; i++) {
      if (s.leaks[i].fill > s.leaks[worst].fill) worst = i;
    }
    s.leaks[worst].fill = Math.min(100, s.leaks[worst].fill + 28);
    if (s.leaks[worst].fill >= 100) s.gameState = 'gameover';
    return;
  }
  const idx = empty[Math.floor(Math.random() * empty.length)];
  s.leaks[idx].active = true;
  s.leaks[idx].fill = Math.max(s.leaks[idx].fill, 10);
}

/* ============================================================
   Render
   ============================================================ */

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function dotGrid(ctx, x, y, w, h, color, spacing = 5, radius = 1.1) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let py = y + spacing / 2; py < y + h; py += spacing) {
    for (let px = x + spacing / 2; px < x + w; px += spacing) {
      ctx.moveTo(px + radius, py);
      ctx.arc(px, py, radius, 0, Math.PI * 2);
    }
  }
  ctx.fill();
  ctx.restore();
}

function draw(ctx, s, keys, mouse, view) {
  // Apply screen shake by translating before drawing.
  const sx = (Math.random() - 0.5) * s.shake * 6;
  const sy = (Math.random() - 0.5) * s.shake * 6;
  ctx.save();
  ctx.translate(sx, sy);

  // base paper
  ctx.fillStyle = PAPER;
  ctx.fillRect(-10, -10, W + 20, H + 20);

  const wantsExterior = !view || view.isCaptain;
  const wantsInterior = !view || view.isEngineer;

  if (wantsExterior) drawExterior(ctx, s);
  if (!view) drawDivider(ctx);
  if (wantsInterior) drawInterior(ctx, s, keys, mouse);
  drawHUD(ctx, s, view);

  ctx.restore();

  const vc = !view ? W / 2 : view.isCaptain ? W / 4 : (W * 3) / 4;
  if (s.gameState === 'waiting') drawWaitingOverlay(ctx, vc, view);
  if (s.gameState === 'gameover') drawGameoverOverlay(ctx, s, vc, view);
}

function drawExterior(ctx, s) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, HALF, H);
  ctx.clip();

  // depth halftone — bluer as you go down
  for (let band = 0; band < 6; band++) {
    const y0 = (H / 6) * band;
    const alpha = 0.04 + band * 0.04;
    dotGrid(ctx, 0, y0, HALF, H / 6, `rgba(31, 61, 240, ${alpha})`, 6, 1.2);
  }

  // bubbles
  ctx.fillStyle = 'rgba(31, 61, 240, 0.55)';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1;
  for (const b of s.bubbles) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
  }

  // rocks
  for (const r of s.rocks) drawRock(ctx, r);

  // torpedoes
  for (const t of s.torpedoes) drawTorpedo(ctx, t);

  // impact particles
  for (const p of s.particles) drawImpact(ctx, p);

  // sub
  drawSub(ctx, s);

  ctx.restore();
}

function drawTorpedo(ctx, t) {
  ctx.save();
  // wake — thin yellow streak behind
  ctx.strokeStyle = 'rgba(255, 216, 58, 0.55)';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(t.x - TORPEDO_LEN - 10, t.y);
  ctx.lineTo(t.x - TORPEDO_LEN / 2, t.y);
  ctx.stroke();
  // body
  ctx.fillStyle = YELLOW;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  roundRect(ctx, t.x - TORPEDO_LEN, t.y - 4, TORPEDO_LEN, 8, 3);
  ctx.fill();
  ctx.stroke();
  // pink tip
  ctx.fillStyle = PINK;
  ctx.beginPath();
  ctx.moveTo(t.x, t.y);
  ctx.lineTo(t.x - 5, t.y - 4);
  ctx.lineTo(t.x - 5, t.y + 4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawImpact(ctx, p) {
  const a = 1 - p.t / p.life;
  const r = p.r0 + p.t * 120;
  ctx.save();
  ctx.lineWidth = 3 * a + 1;
  ctx.strokeStyle = `rgba(255, 216, 58, ${a})`;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = `rgba(255, 58, 134, ${a * 0.7})`;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r * 0.45, 0, Math.PI * 2);
  ctx.fill();
  // ink spokes
  ctx.strokeStyle = `rgba(24, 20, 16, ${a * 0.9})`;
  ctx.lineWidth = 2 * a;
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2 + p.t * 4;
    ctx.beginPath();
    ctx.moveTo(p.x + Math.cos(ang) * r * 0.5, p.y + Math.sin(ang) * r * 0.5);
    ctx.lineTo(p.x + Math.cos(ang) * r * 0.95, p.y + Math.sin(ang) * r * 0.95);
    ctx.stroke();
  }
  ctx.restore();
}

function drawRock(ctx, r) {
  ctx.save();
  ctx.translate(r.x, r.y);
  ctx.rotate(r.spin);

  const pts = 8;
  ctx.beginPath();
  for (let i = 0; i < pts; i++) {
    const a = (i / pts) * Math.PI * 2;
    const wob = 0.74 + 0.26 * Math.sin(r.seed + i * 1.6);
    const x = Math.cos(a) * r.r * wob;
    const y = Math.sin(a) * r.r * wob;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = INK;
  ctx.fill();

  // halftone shading on top half
  ctx.save();
  ctx.clip();
  dotGrid(ctx, -r.r, -r.r, r.r * 2, r.r * 2, 'rgba(244, 234, 213, 0.35)', 4, 1);
  ctx.restore();

  ctx.lineWidth = 2;
  ctx.strokeStyle = INK;
  ctx.stroke();

  // pink nub for warning energy
  ctx.fillStyle = PINK;
  ctx.beginPath();
  ctx.arc(-r.r * 0.4, -r.r * 0.4, r.r * 0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.restore();
}

function drawSub(ctx, s) {
  const flash = s.flashTimer > 0 && Math.floor(s.flashTimer * 32) % 2 === 0;
  const body = flash ? PINK : YELLOW;
  const tower = flash ? '#c4276a' : PINK;

  ctx.save();
  ctx.translate(SUB_X, s.sub.y);

  // propeller wash — scales with power
  const wash = s.power / 100;
  ctx.save();
  ctx.globalAlpha = 0.55 + 0.35 * wash;
  ctx.strokeStyle = BLUE;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  for (let i = 0; i < 4; i++) {
    const len = 12 + i * 6 + wash * 22;
    const yo = -8 + i * 5;
    ctx.beginPath();
    ctx.moveTo(-SUB_RX - 2, yo);
    ctx.lineTo(-SUB_RX - 2 - len, yo);
    ctx.stroke();
  }
  ctx.restore();

  // body
  ctx.fillStyle = body;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.ellipse(0, 0, SUB_RX, SUB_RY, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // body halftone
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, 0, SUB_RX, SUB_RY, 0, 0, Math.PI * 2);
  ctx.clip();
  dotGrid(ctx, -SUB_RX, -SUB_RY, SUB_RX * 2, SUB_RY * 2, 'rgba(24,20,16,0.18)', 4, 1);
  ctx.restore();

  // conning tower
  ctx.fillStyle = tower;
  roundRect(ctx, -10, -SUB_RY - 14, 20, 14, 3);
  ctx.fill();
  ctx.stroke();

  // antenna
  ctx.beginPath();
  ctx.moveTo(0, -SUB_RY - 14);
  ctx.lineTo(0, -SUB_RY - 22);
  ctx.stroke();
  ctx.fillStyle = YELLOW;
  ctx.beginPath();
  ctx.arc(0, -SUB_RY - 22, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // porthole
  ctx.fillStyle = BLUE;
  ctx.beginPath();
  ctx.arc(SUB_RX * 0.45, 0, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = PAPER;
  ctx.beginPath();
  ctx.arc(SUB_RX * 0.45 - 2, -2, 2, 0, Math.PI * 2);
  ctx.fill();

  // nose tick
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(SUB_RX - 4, 0);
  ctx.lineTo(SUB_RX + 6, 0);
  ctx.stroke();

  ctx.restore();
}

function drawDivider(ctx) {
  ctx.save();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.moveTo(HALF, 0);
  ctx.lineTo(HALF, H);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function drawInterior(ctx, s, keys, mouse) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(HALF + 2, 0, HALF, H);
  ctx.clip();

  // panel background — slightly darker paper
  ctx.fillStyle = PAPER2;
  ctx.fillRect(HALF, 0, HALF, H);

  // header — hull integrity
  ctx.fillStyle = INK;
  ctx.font = `700 12px ${MONO_FONT}`;
  ctx.fillText('HULL INTEGRITY', HALF + 28, 38);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = INK;
  ctx.beginPath();
  ctx.moveTo(HALF + 28, 46);
  ctx.lineTo(HALF + 200, 46);
  ctx.stroke();

  // header — weapons (right side)
  drawTorpedoStatus(ctx, s);

  // hull outline
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.5;
  roundRect(ctx, HULL_RECT.x, HULL_RECT.y, HULL_RECT.w, HULL_RECT.h, HULL_RECT.r);
  ctx.stroke();

  // hull halftone interior
  ctx.save();
  ctx.beginPath();
  roundRect(ctx, HULL_RECT.x, HULL_RECT.y, HULL_RECT.w, HULL_RECT.h, HULL_RECT.r);
  ctx.clip();
  dotGrid(ctx, HULL_RECT.x, HULL_RECT.y, HULL_RECT.w, HULL_RECT.h, 'rgba(24,20,16,0.07)', 5, 1);
  ctx.strokeStyle = 'rgba(24,20,16,0.18)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  const hMidY = HULL_RECT.y + HULL_RECT.h / 2;
  const hMidX = HULL_RECT.x + HULL_RECT.w / 2;
  ctx.moveTo(HULL_RECT.x, hMidY); ctx.lineTo(HULL_RECT.x + HULL_RECT.w, hMidY);
  ctx.moveTo(hMidX, HULL_RECT.y); ctx.lineTo(hMidX, HULL_RECT.y + HULL_RECT.h);
  ctx.stroke();
  ctx.restore();

  // section labels
  ctx.fillStyle = 'rgba(24,20,16,0.55)';
  ctx.font = `500 9px ${MONO_FONT}`;
  ctx.fillText('FORE · UPPER', HULL_RECT.x + 12, HULL_RECT.y + 14);
  ctx.fillText('AFT · UPPER', HULL_RECT.x + HULL_RECT.w - 84, HULL_RECT.y + 14);
  ctx.fillText('FORE · LOWER', HULL_RECT.x + 12, HULL_RECT.y + HULL_RECT.h - 6);
  ctx.fillText('AFT · LOWER', HULL_RECT.x + HULL_RECT.w - 84, HULL_RECT.y + HULL_RECT.h - 6);

  // leaks
  let hoveredLeak = -1;
  if (mouse.x > HALF) {
    for (let i = 0; i < s.leaks.length; i++) {
      const l = s.leaks[i];
      const dx = l.x - mouse.x, dy = l.y - mouse.y;
      if (dx * dx + dy * dy < LEAK_RADIUS * LEAK_RADIUS) { hoveredLeak = i; break; }
    }
  }
  for (let i = 0; i < s.leaks.length; i++) drawLeak(ctx, s.leaks[i], i === hoveredLeak, mouse.down, s.elapsed);

  // sonar strip — engineer panel
  drawSonarStrip(ctx, s, mouse);

  // power gauge
  drawPowerGauge(ctx, s, keys);

  // mouse cursor (only on right panel)
  if (mouse.x > HALF + 4 && mouse.x < W - 4 && mouse.y > 4 && mouse.y < H - 4) {
    ctx.save();
    const cr = mouse.down ? 13 : 9;
    ctx.strokeStyle = mouse.down ? PINK : INK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(mouse.x, mouse.y, cr, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(mouse.x - 3, mouse.y); ctx.lineTo(mouse.x + 3, mouse.y);
    ctx.moveTo(mouse.x, mouse.y - 3); ctx.lineTo(mouse.x, mouse.y + 3);
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}

function drawLeak(ctx, l, hovered, mouseDown, elapsed) {
  // socket
  ctx.save();
  ctx.fillStyle = PAPER;
  ctx.beginPath();
  ctx.arc(l.x, l.y, LEAK_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = INK;
  ctx.stroke();

  if (l.active) {
    // water fill rising from bottom of socket
    const ratio = l.fill / 100;
    const fillHeight = ratio * (LEAK_RADIUS * 2);
    ctx.save();
    ctx.beginPath();
    ctx.arc(l.x, l.y, LEAK_RADIUS - 2, 0, Math.PI * 2);
    ctx.clip();
    // water body
    ctx.fillStyle = PINK;
    ctx.fillRect(
      l.x - LEAK_RADIUS,
      l.y + LEAK_RADIUS - fillHeight,
      LEAK_RADIUS * 2,
      fillHeight
    );
    // halftone over water
    dotGrid(
      ctx,
      l.x - LEAK_RADIUS,
      l.y + LEAK_RADIUS - fillHeight,
      LEAK_RADIUS * 2,
      fillHeight,
      'rgba(24,20,16,0.25)',
      4,
      1.1
    );
    // wave line
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    const yWave = l.y + LEAK_RADIUS - fillHeight;
    for (let x = -LEAK_RADIUS; x <= LEAK_RADIUS; x += 3) {
      const yy = yWave + Math.sin((x + elapsed * 80) * 0.18) * 2.5;
      if (x === -LEAK_RADIUS) ctx.moveTo(l.x + x, yy); else ctx.lineTo(l.x + x, yy);
    }
    ctx.stroke();
    ctx.restore();

    // urgency outer ring as fill approaches 100
    const urg = Math.min(1, l.fill / 100);
    if (urg > 0.55) {
      ctx.lineWidth = 3 + urg * 3;
      ctx.strokeStyle = urg > 0.85 && Math.floor(elapsed * 6) % 2 === 0 ? YELLOW : PINK;
      ctx.beginPath();
      ctx.arc(l.x, l.y, LEAK_RADIUS + 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    // pct label below
    ctx.fillStyle = INK;
    ctx.font = `700 13px ${MONO_FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.round(l.fill)}%`, l.x, l.y + LEAK_RADIUS + 18);

    // hover / dragging emphasis
    if (hovered) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = mouseDown ? GREEN : INK;
      ctx.setLineDash(mouseDown ? [] : [4, 4]);
      ctx.beginPath();
      ctx.arc(l.x, l.y, LEAK_RADIUS + 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  } else {
    // sealed badge
    ctx.fillStyle = 'rgba(24,20,16,0.6)';
    ctx.font = `700 10px ${MONO_FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('SEALED', l.x, l.y - 2);
    // tiny tick
    ctx.strokeStyle = GREEN;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(l.x - 6, l.y + 8);
    ctx.lineTo(l.x - 2, l.y + 12);
    ctx.lineTo(l.x + 8, l.y + 2);
    ctx.stroke();
  }
  ctx.textAlign = 'start';
  ctx.restore();
}

function drawTorpedoStatus(ctx, s) {
  const x = HALF + HALF - 200;
  const y = 38;
  ctx.save();
  ctx.fillStyle = INK;
  ctx.font = `700 12px ${MONO_FONT}`;
  ctx.fillText('TORPEDO', x, y);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = INK;
  ctx.beginPath();
  ctx.moveTo(x, y + 8);
  ctx.lineTo(x + 172, y + 8);
  ctx.stroke();

  // status logic
  const ready = s.fireCooldown === 0 && s.torpedoMag > 0 && s.power >= TORPEDO_COST;
  let status;
  let statusColor;
  if (s.torpedoMag <= 0) { status = 'EMPTY'; statusColor = 'rgba(180, 50, 70, 0.95)'; }
  else if (s.fireCooldown > 0) { status = 'RELOAD'; statusColor = 'rgba(24,20,16,0.55)'; }
  else if (s.power < TORPEDO_COST) { status = 'NO PWR'; statusColor = 'rgba(24,20,16,0.55)'; }
  else { status = 'READY'; statusColor = GREEN; }

  const ty = y + 24;

  // status text + cost
  ctx.fillStyle = statusColor;
  ctx.font = `700 11px ${MONO_FONT}`;
  ctx.fillText(status, x, ty);
  ctx.fillStyle = 'rgba(24,20,16,0.65)';
  ctx.font = `500 10px ${MONO_FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText(`F · -${TORPEDO_COST}%`, x + 172, ty);
  ctx.textAlign = 'start';

  // ammo pips
  const pipY = y + 34;
  const pipW = 44, pipH = 13, pipGap = 6;
  for (let i = 0; i < TORPEDO_MAG_MAX; i++) {
    const px = x + i * (pipW + pipGap);
    const loaded = i < s.torpedoMag;
    // socket
    ctx.fillStyle = loaded ? YELLOW : 'rgba(24,20,16,0.08)';
    ctx.strokeStyle = loaded ? INK : 'rgba(24,20,16,0.3)';
    ctx.lineWidth = 1.5;
    roundRect(ctx, px, pipY, pipW, pipH, 3);
    ctx.fill();
    ctx.stroke();
    if (loaded) {
      // tip
      ctx.fillStyle = PINK;
      ctx.beginPath();
      ctx.moveTo(px + pipW - 6, pipY + pipH / 2);
      ctx.lineTo(px + pipW - 14, pipY + 2);
      ctx.lineTo(px + pipW - 14, pipY + pipH - 2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1;
      ctx.stroke();
    } else if (i === s.torpedoMag) {
      // reload progress into this empty slot
      const progress = s.torpedoReload / TORPEDO_RELOAD;
      ctx.save();
      ctx.beginPath();
      roundRect(ctx, px, pipY, pipW, pipH, 3);
      ctx.clip();
      ctx.fillStyle = 'rgba(255, 58, 134, 0.5)';
      ctx.fillRect(px, pipY, pipW * progress, pipH);
      ctx.restore();
    }
  }

  // cooldown bar under the pips (cooldown between shots)
  if (s.fireCooldown > 0) {
    const cdRatio = s.fireCooldown / TORPEDO_COOLDOWN;
    ctx.fillStyle = 'rgba(24,20,16,0.15)';
    ctx.fillRect(x, pipY + pipH + 3, 172, 2);
    ctx.fillStyle = PINK;
    ctx.fillRect(x, pipY + pipH + 3, 172 * (1 - cdRatio), 2);
  }

  ctx.restore();
  void ready; // ready computed for clarity, used implicitly via status
}

function drawSonarStrip(ctx, s, mouse) {
  // outer card
  ctx.save();
  ctx.fillStyle = INK;
  roundRect(ctx, SONAR_X + 3, SONAR_Y + 3, SONAR_W, SONAR_H, 8);
  ctx.fill();
  ctx.fillStyle = '#0c1422';
  roundRect(ctx, SONAR_X, SONAR_Y, SONAR_W, SONAR_H, 8);
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = INK;
  roundRect(ctx, SONAR_X, SONAR_Y, SONAR_W, SONAR_H, 8);
  ctx.stroke();

  // header
  ctx.fillStyle = YELLOW;
  ctx.font = `700 11px ${MONO_FONT}`;
  ctx.fillText('SONAR · inbound', SONAR_X + 12, SONAR_Y + 16);
  ctx.fillStyle = 'rgba(244,234,213,0.45)';
  ctx.font = `500 9px ${MONO_FONT}`;
  ctx.fillText('click rocket to flare', SONAR_X + 12, SONAR_Y + 28);
  ctx.textAlign = 'right';
  ctx.fillStyle = `rgba(255, 216, 58, ${s.flareCooldown > 0 ? 0.35 : 0.95})`;
  ctx.fillText(s.flareCooldown > 0 ? 'RELOADING' : 'FLARE READY', SONAR_X + SONAR_W - 12, SONAR_Y + 16);
  ctx.fillStyle = 'rgba(244,234,213,0.45)';
  ctx.fillText(`-${FLARE_COST}% pwr`, SONAR_X + SONAR_W - 12, SONAR_Y + 28);
  ctx.textAlign = 'start';

  // clip to track area for visuals
  ctx.save();
  ctx.beginPath();
  ctx.rect(SONAR_TRACK_X0 - 30, SONAR_TRACK_Y0 - 6, (SONAR_TRACK_X1 - SONAR_TRACK_X0) + 60, (SONAR_TRACK_Y1 - SONAR_TRACK_Y0) + 12);
  ctx.clip();

  // background grid lines (horizontal Y refs)
  ctx.strokeStyle = 'rgba(244,234,213,0.06)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = SONAR_TRACK_Y0 + (i / 4) * (SONAR_TRACK_Y1 - SONAR_TRACK_Y0);
    ctx.beginPath();
    ctx.moveTo(SONAR_TRACK_X0, y);
    ctx.lineTo(SONAR_TRACK_X1, y);
    ctx.stroke();
  }

  // scanning sweep (cosmetic)
  const sweep = (s.elapsed * 0.55) % 1.0;
  const sweepX = SONAR_TRACK_X1 - sweep * (SONAR_TRACK_X1 - SONAR_TRACK_X0);
  const grad = ctx.createLinearGradient(sweepX - 30, 0, sweepX, 0);
  grad.addColorStop(0, 'rgba(143, 220, 255, 0)');
  grad.addColorStop(1, 'rgba(143, 220, 255, 0.25)');
  ctx.fillStyle = grad;
  ctx.fillRect(sweepX - 30, SONAR_TRACK_Y0, 32, SONAR_TRACK_Y1 - SONAR_TRACK_Y0);

  // impact line (pink, dashed)
  ctx.strokeStyle = PINK;
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(SONAR_TRACK_X0, SONAR_TRACK_Y0);
  ctx.lineTo(SONAR_TRACK_X0, SONAR_TRACK_Y1);
  ctx.stroke();
  ctx.setLineDash([]);

  // current sub-Y marker (yellow band on the impact line)
  const subTrackTop = SUB_RY + 12;
  const subTrackBot = H - SUB_RY - 12;
  const subYRatio = clamp01((s.sub.y - subTrackTop) / (subTrackBot - subTrackTop));
  const subMarkY = SONAR_TRACK_Y0 + subYRatio * (SONAR_TRACK_Y1 - SONAR_TRACK_Y0);
  // tolerance band
  const tolRatio = ROCKET_HIT_TOLERANCE / (subTrackBot - subTrackTop);
  const bandH = tolRatio * (SONAR_TRACK_Y1 - SONAR_TRACK_Y0) * 2;
  ctx.fillStyle = 'rgba(255, 216, 58, 0.15)';
  ctx.fillRect(SONAR_TRACK_X0 - 6, subMarkY - bandH / 2, 12, bandH);
  // marker
  ctx.fillStyle = YELLOW;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(SONAR_TRACK_X0 - 14, subMarkY);
  ctx.lineTo(SONAR_TRACK_X0 - 4, subMarkY - 6);
  ctx.lineTo(SONAR_TRACK_X0 - 4, subMarkY + 6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // rockets
  for (const r of s.rockets) {
    const rx = SONAR_TRACK_X0 + Math.max(0, r.distance) * (SONAR_TRACK_X1 - SONAR_TRACK_X0);
    const tyRatio = clamp01((r.targetY - ROCKET_TY_MIN) / (ROCKET_TY_MAX - ROCKET_TY_MIN));
    const ry = SONAR_TRACK_Y0 + tyRatio * (SONAR_TRACK_Y1 - SONAR_TRACK_Y0);

    if (r.destroyed) {
      const a = 1 - (r.destroyTime || 0) / 0.45;
      const rr = 8 + (r.destroyTime || 0) * 80;
      ctx.strokeStyle = r.impacted
        ? `rgba(255, 58, 134, ${a})`
        : `rgba(255, 216, 58, ${a})`;
      ctx.lineWidth = 3 * a + 1;
      ctx.beginPath();
      ctx.arc(rx, ry, rr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = r.impacted
        ? `rgba(255, 58, 134, ${a * 0.5})`
        : `rgba(255, 216, 58, ${a * 0.4})`;
      ctx.beginPath();
      ctx.arc(rx, ry, rr * 0.4, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }

    // tether line from blip to its target Y on the impact line
    ctx.strokeStyle = 'rgba(255, 58, 134, 0.25)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(rx, ry);
    ctx.lineTo(SONAR_TRACK_X0, ry);
    ctx.stroke();
    ctx.setLineDash([]);

    // target ghost on impact line
    ctx.fillStyle = 'rgba(255, 58, 134, 0.7)';
    ctx.beginPath();
    ctx.arc(SONAR_TRACK_X0, ry, 3, 0, Math.PI * 2);
    ctx.fill();

    // rocket body
    const urg = clamp01(1 - r.distance);
    ctx.fillStyle = `rgb(${220 + urg * 35}, ${60 - urg * 40}, ${70 - urg * 50})`;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(rx - 9, ry);
    ctx.lineTo(rx + 7, ry - 6);
    ctx.lineTo(rx + 7, ry + 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // exhaust streak
    ctx.strokeStyle = `rgba(255, 216, 58, ${0.5 + urg * 0.4})`;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(rx + 9, ry);
    ctx.lineTo(rx + 16 + urg * 8, ry);
    ctx.stroke();

    // ETA
    const eta = Math.max(0, r.distance / ROCKET_DIST_SPEED);
    ctx.fillStyle = 'rgba(244,234,213,0.85)';
    ctx.font = `700 9px ${MONO_FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(`${eta.toFixed(1)}s`, rx, ry - 10);

    // targetY label on the impact-line ghost
    ctx.fillStyle = 'rgba(244,234,213,0.6)';
    ctx.font = `500 9px ${MONO_FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText(`y=${Math.round(r.targetY)}`, SONAR_TRACK_X0 - 6, ry - 4);
    ctx.textAlign = 'start';

    // hover ring
    const dx = rx - mouse.x, dy = ry - mouse.y;
    if (dx * dx + dy * dy < SONAR_BLIP_HIT_R * SONAR_BLIP_HIT_R) {
      const ready = s.flareCooldown <= 0 && s.power >= FLARE_COST;
      ctx.strokeStyle = ready ? YELLOW : 'rgba(244,234,213,0.4)';
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(rx, ry, SONAR_BLIP_HIT_R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  ctx.restore();
  ctx.restore();
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

function drawPowerGauge(ctx, s, keys) {
  const gx = HALF + 28;
  const gy = H - 70;
  const gw = HALF - 56;
  const gh = 30;

  ctx.fillStyle = INK;
  ctx.font = `700 12px ${MONO_FONT}`;
  ctx.fillText('POWER', gx, gy - 10);

  // ink shadow
  ctx.fillStyle = INK;
  roundRect(ctx, gx + 3, gy + 3, gw, gh, 6);
  ctx.fill();

  // gauge body
  ctx.fillStyle = PAPER;
  roundRect(ctx, gx, gy, gw, gh, 6);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  roundRect(ctx, gx, gy, gw, gh, 6);
  ctx.stroke();

  // fill — color shifts pink → yellow as power rises
  const pct = s.power / 100;
  const fillW = (gw - 6) * pct;
  const color = pct > 0.6 ? YELLOW : pct > 0.25 ? PINK : '#a91f55';
  ctx.save();
  ctx.beginPath();
  roundRect(ctx, gx + 3, gy + 3, gw - 6, gh - 6, 4);
  ctx.clip();
  ctx.fillStyle = color;
  ctx.fillRect(gx + 3, gy + 3, fillW, gh - 6);
  // halftone over fill
  dotGrid(ctx, gx + 3, gy + 3, fillW, gh - 6, 'rgba(24,20,16,0.18)', 4, 1);
  ctx.restore();

  // tick marks
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  for (let i = 1; i < 10; i++) {
    const x = gx + (gw * i) / 10;
    ctx.beginPath();
    ctx.moveTo(x, gy + gh - 6);
    ctx.lineTo(x, gy + gh - 2);
    ctx.stroke();
  }

  // % label
  ctx.fillStyle = INK;
  ctx.font = `700 13px ${MONO_FONT}`;
  ctx.fillText(`${Math.round(s.power)}%`, gx + 8, gy + 20);

  // crank hint
  const cranking = !!keys[' '];
  ctx.font = `500 11px ${MONO_FONT}`;
  ctx.fillStyle = cranking ? GREEN : 'rgba(24,20,16,0.6)';
  ctx.textAlign = 'right';
  ctx.fillText(cranking ? 'CRANKING…' : 'hold SPACE to crank', gx + gw - 8, gy + 20);
  ctx.textAlign = 'start';
}

function drawHUD(ctx, s, view) {
  const showCaptain = !view || view.isCaptain;
  const showEngineer = !view || view.isEngineer;

  if (showCaptain) {
    // timer top-left of exterior
    ctx.save();
    ctx.fillStyle = INK;
    roundRect(ctx, 24, 22, 110, 36, 6);
    ctx.fill();
    ctx.fillStyle = YELLOW;
    ctx.font = `800 22px ${DISPLAY_FONT}`;
    ctx.fillText(`${s.elapsed.toFixed(1)}s`, 34, 49);
    ctx.fillStyle = PAPER;
    ctx.font = `500 9px ${MONO_FONT}`;
    ctx.fillText('SURVIVED', 92, 38);
    ctx.restore();

    ctx.save();
    ctx.fillStyle = 'rgba(24,20,16,0.55)';
    ctx.font = `500 11px ${MONO_FONT}`;
    ctx.fillText(view ? 'CAPTAIN · W / S' : 'P1 · W / S', 24, H - 34);
    ctx.fillText('dodge rocks', 24, H - 18);
    ctx.restore();
  }

  if (showEngineer) {
    // For engineer-only view, mirror the timer onto their side so they can see it.
    if (view && view.isEngineer) {
      ctx.save();
      ctx.fillStyle = INK;
      roundRect(ctx, HALF + 28, H - 60, 110, 36, 6);
      ctx.fill();
      ctx.fillStyle = YELLOW;
      ctx.font = `800 22px ${DISPLAY_FONT}`;
      ctx.fillText(`${s.elapsed.toFixed(1)}s`, HALF + 38, H - 33);
      ctx.fillStyle = PAPER;
      ctx.font = `500 9px ${MONO_FONT}`;
      ctx.fillText('SURVIVED', HALF + 96, H - 44);
      ctx.restore();
    }

    ctx.save();
    ctx.fillStyle = 'rgba(24,20,16,0.55)';
    ctx.font = `500 11px ${MONO_FONT}`;
    ctx.textAlign = 'right';
    if (view) {
      ctx.fillText('ENGINEER · SPACE + F + mouse', W - 24, H - 34);
      ctx.fillText('crank · fire · seal leaks', W - 24, H - 18);
    } else {
      ctx.fillText('P2 · SPACE + F + MOUSE', W - 24, H - 34);
      ctx.fillText('crank power, fire torpedoes, plug leaks', W - 24, H - 18);
    }
    ctx.textAlign = 'start';
    ctx.restore();
  }
}

/* ============================================================
   Overlays (drawn unshaken, on top)
   ============================================================ */

function drawCardOverlay(ctx, w, h, vc) {
  ctx.fillStyle = 'rgba(244, 234, 213, 0.88)';
  ctx.fillRect(0, 0, W, H);
  const cw = w, ch = h, cx = vc - cw / 2, cy = (H - ch) / 2 - 10;
  ctx.fillStyle = INK;
  roundRect(ctx, cx + 6, cy + 6, cw, ch, 14);
  ctx.fill();
  ctx.fillStyle = PAPER;
  roundRect(ctx, cx, cy, cw, ch, 14);
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = INK;
  ctx.stroke();
  return { cx, cy, cw, ch };
}

function drawStamp(ctx, x, y, text, color, rot) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.font = `800 14px ${DISPLAY_FONT}`;
  const sw = ctx.measureText(text).width + 24;
  roundRect(ctx, -sw / 2, -14, sw, 24, 4);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fillStyle = PAPER;
  ctx.textAlign = 'center';
  ctx.fillText(text, 0, 4);
  ctx.textAlign = 'start';
  ctx.restore();
}

function drawWaitingOverlay(ctx, vc, view) {
  const cardW = view ? 460 : 540;
  const cardH = view ? 300 : 360;
  drawCardOverlay(ctx, cardW, cardH, vc);

  ctx.textAlign = 'center';
  ctx.fillStyle = INK;
  ctx.font = `800 44px ${DISPLAY_FONT}`;
  ctx.fillText('submarine', vc, H / 2 - 90);

  const stamp = !view
    ? 'two-player coop · one keyboard'
    : view.isCaptain
      ? 'you are the CAPTAIN'
      : 'you are the ENGINEER';
  drawStamp(ctx, vc, H / 2 - 50, stamp, BLUE, -0.03);

  ctx.fillStyle = INK;
  ctx.font = `700 13px ${MONO_FONT}`;
  ctx.textAlign = 'left';
  const lx = vc - (view ? 180 : 220);
  let ly = H / 2 - 14;

  if (!view) {
    // Solo: show both roles
    ctx.fillStyle = PINK;
    ctx.fillText('P1 · PILOT', lx, ly);
    ctx.fillStyle = INK;
    ctx.font = `italic 500 14px ${SERIF_FONT}`;
    ly += 20;
    ctx.fillText('W / S — dive and surface, dodge the rocks', lx, ly);

    ly += 30;
    ctx.fillStyle = BLUE;
    ctx.font = `700 13px ${MONO_FONT}`;
    ctx.fillText('P2 · ENGINEER', lx, ly);
    ctx.fillStyle = INK;
    ctx.font = `italic 500 14px ${SERIF_FONT}`;
    ly += 20;
    ctx.fillText('hold SPACE to crank power', lx, ly);
    ly += 18;
    ctx.fillText('click + hold on leaks to seal them', lx, ly);
    ly += 18;
    ctx.fillText('F to fire a torpedo (costs power)', lx, ly);

    ly += 22;
    ctx.font = `500 11px ${MONO_FONT}`;
    ctx.fillStyle = 'rgba(24,20,16,0.65)';
    ctx.textAlign = 'center';
    ctx.fillText('low power = sluggish sub · any leak hits 100 % = game over', vc, ly);
  } else if (view.isCaptain) {
    ctx.fillStyle = PINK;
    ctx.fillText('YOUR JOB', lx, ly);
    ctx.fillStyle = INK;
    ctx.font = `italic 500 14px ${SERIF_FONT}`;
    ly += 22;
    ctx.fillText('W / S — dive and surface', lx, ly);
    ly += 18;
    ctx.fillText('dodge rocks. dodge rockets when called.', lx, ly);

    ly += 26;
    ctx.fillStyle = BLUE;
    ctx.font = `700 13px ${MONO_FONT}`;
    ctx.fillText('YOUR ENGINEER', lx, ly);
    ctx.fillStyle = INK;
    ctx.font = `italic 500 14px ${SERIF_FONT}`;
    ly += 22;
    ctx.fillText('sees incoming rockets you can\'t see.', lx, ly);
    ly += 18;
    ctx.fillText('listen for "dodge to Y=…" — move fast.', lx, ly);
  } else {
    ctx.fillStyle = BLUE;
    ctx.fillText('YOUR JOB', lx, ly);
    ctx.fillStyle = INK;
    ctx.font = `italic 500 14px ${SERIF_FONT}`;
    ly += 20;
    ctx.fillText('SPACE — crank power', lx, ly);
    ly += 17;
    ctx.fillText('click + hold leaks to seal them', lx, ly);
    ly += 17;
    ctx.fillText('F — fire torpedoes at rocks', lx, ly);
    ly += 17;
    ctx.fillText('click rockets on SONAR to flare them', lx, ly);

    ly += 22;
    ctx.fillStyle = PINK;
    ctx.font = `700 13px ${MONO_FONT}`;
    ctx.fillText('YOUR CAPTAIN', lx, ly);
    ctx.fillStyle = INK;
    ctx.font = `italic 500 14px ${SERIF_FONT}`;
    ly += 20;
    ctx.fillText('pilots blind to rockets — call dodges.', lx, ly);
  }

  const stampText = !view
    ? 'press SPACE to dive'
    : view.isCaptain
      ? 'press SPACE to dive'
      : 'waiting for captain…';
  drawStamp(ctx, vc, H / 2 + (view ? 110 : 138), stampText, PINK, 0.025);
  ctx.textAlign = 'start';
}

function drawGameoverOverlay(ctx, s, vc, view) {
  drawCardOverlay(ctx, 460, 260, vc);

  ctx.textAlign = 'center';
  ctx.fillStyle = INK;
  ctx.font = `800 38px ${DISPLAY_FONT}`;
  ctx.fillText('hull breached', vc, H / 2 - 56);

  ctx.font = `italic 500 14px ${SERIF_FONT}`;
  ctx.fillStyle = 'rgba(24,20,16,0.7)';
  ctx.fillText('you survived', vc, H / 2 - 26);

  ctx.font = `800 56px ${DISPLAY_FONT}`;
  ctx.fillStyle = PINK;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  const score = `${s.finalScore.toFixed(1)}s`;
  ctx.strokeText(score, vc, H / 2 + 22);
  ctx.fillText(score, vc, H / 2 + 22);

  ctx.font = `500 12px ${MONO_FONT}`;
  ctx.fillStyle = 'rgba(24,20,16,0.65)';
  ctx.fillText(`best · ${s.best.toFixed(1)}s`, vc, H / 2 + 56);

  const stamp = !view || view.isCaptain
    ? 'press R to dive again'
    : 'waiting for captain…';
  drawStamp(ctx, vc, H / 2 + 96, stamp, BLUE, -0.02);
  ctx.textAlign = 'start';
}

export default Submarine;
