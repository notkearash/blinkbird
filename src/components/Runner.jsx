import { useRef, useEffect, useCallback } from 'react';

const W = 400;
const H = 600;

const LANE_X = [W / 2 - 55, W / 2 + 55];
const PLAYER_SIZE = 20;
const OBSTACLE_SIZE = 44;
const INITIAL_SPEED = 2.5;
const SPEED_INCREMENT = 0.12;
const SPAWN_INTERVAL_BASE = 1800;
const SPAWN_INTERVAL_MIN = 900;
const PLAYER_Y_P1 = H - 100;
const PLAYER_Y_P2 = H - 160;

/* ---- riso-zine theme ---- */
const INK    = '#181410';
const PAPER  = '#f4ead5';
const PINK   = '#ff3a86';
const BLUE   = '#1f3df0';
const YELLOW = '#ffd83a';
const ASPHALT = '#1f1a14';
const DISPLAY_FONT = '"Bricolage Grotesque", system-ui, sans-serif';
const SERIF_FONT   = '"Newsreader", "Times New Roman", serif';
const MONO_FONT    = '"JetBrains Mono", ui-monospace, monospace';

const P1_COLOR = PINK;
const P2_COLOR = BLUE;

function makePlayer(lane) {
  return { lane, x: LANE_X[lane], alive: true, score: 0 };
}

function Runner({
  setOnHeadSwipe,
  gameState, setGameState, videoRef, onBack,
  multiplayer, mp,
}) {
  const canvasRef = useRef(null);
  const mpRef = useRef(multiplayer);
  mpRef.current = multiplayer;

  const isHost = !multiplayer || mp?.role === 'host';
  const isHostRef = useRef(isHost);
  isHostRef.current = isHost;

  const stateRef = useRef(null);

  function initState() {
    return {
      p1: makePlayer(0),
      p2: multiplayer ? makePlayer(1) : null,
      obstacles: [],
      highScore: stateRef.current?.highScore || 0,
      lastSpawnTime: 0,
      gameState: 'waiting',
      speed: INITIAL_SPEED,
      animOffset: 0,
    };
  }

  if (!stateRef.current) stateRef.current = initState();

  useEffect(() => {
    if (multiplayer && !stateRef.current.p2) stateRef.current.p2 = makePlayer(1);
  }, [multiplayer]);

  const switchLane = useCallback((direction) => {
    const s = stateRef.current;
    if (s.gameState === 'dead') return;
    if (s.gameState === 'restart') {
      Object.assign(s, initState());
      s.gameState = 'waiting';
      setGameState('waiting');
    }
    if (s.gameState === 'waiting') {
      s.gameState = 'playing';
      setGameState('playing');
    }

    if (multiplayer) {
      if (isHostRef.current) {
        if (!s.p1.alive) return;
        if (direction === 'left' && s.p1.lane === 1) s.p1.lane = 0;
        else if (direction === 'right' && s.p1.lane === 0) s.p1.lane = 1;
        mp?.send({ type: 'start' });
      } else {
        mp?.send({ type: 'switch', direction });
      }
    } else {
      if (!s.p1.alive) return;
      if (direction === 'left' && s.p1.lane === 1) s.p1.lane = 0;
      else if (direction === 'right' && s.p1.lane === 0) s.p1.lane = 1;
    }
  }, [setGameState, multiplayer, mp]);

  useEffect(() => { setOnHeadSwipe(switchLane); }, [setOnHeadSwipe, switchLane]);

  useEffect(() => {
    function onKey(e) {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') { e.preventDefault(); switchLane('left'); }
      else if (e.code === 'ArrowRight' || e.code === 'KeyD') { e.preventDefault(); switchLane('right'); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [switchLane]);

  // Network messages
  useEffect(() => {
    if (!multiplayer || !mp) return;

    mp.setOnMessage((data) => {
      const s = stateRef.current;

      if (isHostRef.current) {
        if (data.type === 'switch') {
          if (!s.p2?.alive) return;
          if (data.direction === 'left' && s.p2.lane === 1) s.p2.lane = 0;
          else if (data.direction === 'right' && s.p2.lane === 0) s.p2.lane = 1;
          if (s.gameState === 'waiting') { s.gameState = 'playing'; setGameState('playing'); }
          if (s.gameState === 'restart') {
            Object.assign(s, initState());
            s.gameState = 'waiting';
            setGameState('waiting');
          }
        }
      } else {
        if (data.type === 'state') {
          s.p1 = data.p1;
          s.p2 = data.p2;
          s.obstacles = data.obstacles;
          s.gameState = data.gameState;
          s.highScore = data.highScore;
          s.speed = data.speed;
          s.animOffset = data.animOffset;
          if (data.gameState === 'playing') setGameState('playing');
          if (data.gameState === 'dead' || data.gameState === 'restart') setGameState(data.gameState);
        }
      }
    });
  }, [multiplayer, mp, setGameState]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let raf;
    let syncCounter = 0;

    function loop() {
      const s = stateRef.current;

      if (isHostRef.current || !mpRef.current) {
        update(s, mpRef.current);

        if (mpRef.current && syncCounter++ % 3 === 0) {
          mp?.send({
            type: 'state',
            p1: s.p1, p2: s.p2,
            obstacles: s.obstacles,
            gameState: s.gameState,
            highScore: s.highScore,
            speed: s.speed,
            animOffset: s.animOffset,
          });
        }
      }

      draw(ctx, s, mpRef.current, mp?.role);
      raf = requestAnimationFrame(loop);
    }

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [mp]);

  useEffect(() => {
    stateRef.current.gameState = gameState;
  }, [gameState]);

  return (
    <div className="game-container">
      <canvas ref={canvasRef} width={W} height={H} />
      <button className="back-btn" onClick={onBack}>Menu</button>
      {multiplayer && (
        <div className="mp-role-badge">
          {mp?.role === 'host' ? 'P1 (Host)' : 'P2 (Guest)'}
        </div>
      )}
      <PipVideo videoRef={videoRef} />
    </div>
  );
}

function update(s, mp) {
  if (s.gameState === 'waiting') return;
  if (s.gameState !== 'playing') return;

  const bestScore = Math.max(s.p1.score, s.p2?.score || 0);
  s.speed = INITIAL_SPEED + bestScore * SPEED_INCREMENT;
  s.animOffset += s.speed;

  if (s.p1.alive) s.p1.x += (LANE_X[s.p1.lane] - s.p1.x) * 0.2;
  if (mp && s.p2?.alive) s.p2.x += (LANE_X[s.p2.lane] - s.p2.x) * 0.2;

  const now = Date.now();
  const interval = Math.max(SPAWN_INTERVAL_MIN, SPAWN_INTERVAL_BASE - bestScore * 50);
  if (now - s.lastSpawnTime > interval) {
    s.obstacles.push({ y: -OBSTACLE_SIZE, lane: Math.random() < 0.5 ? 0 : 1, p1Scored: false, p2Scored: false });
    s.lastSpawnTime = now;
  }

  for (let i = s.obstacles.length - 1; i >= 0; i--) {
    s.obstacles[i].y += s.speed;
    if (s.p1.alive && !s.obstacles[i].p1Scored && s.obstacles[i].y > PLAYER_Y_P1 + PLAYER_SIZE) {
      s.obstacles[i].p1Scored = true; s.p1.score++;
    }
    if (mp && s.p2?.alive && !s.obstacles[i].p2Scored && s.obstacles[i].y > PLAYER_Y_P2 + PLAYER_SIZE) {
      s.obstacles[i].p2Scored = true; s.p2.score++;
    }
    if (s.obstacles[i].y > H + OBSTACLE_SIZE) s.obstacles.splice(i, 1);
  }

  for (const ob of s.obstacles) {
    const obX = LANE_X[ob.lane];
    if (s.p1.alive && Math.abs(s.p1.x - obX) < PLAYER_SIZE + OBSTACLE_SIZE / 2 - 8 &&
        Math.abs(PLAYER_Y_P1 - ob.y) < PLAYER_SIZE + OBSTACLE_SIZE / 2 - 8) {
      s.p1.alive = false;
    }
    if (mp && s.p2?.alive && Math.abs(s.p2.x - obX) < PLAYER_SIZE + OBSTACLE_SIZE / 2 - 8 &&
        Math.abs(PLAYER_Y_P2 - ob.y) < PLAYER_SIZE + OBSTACLE_SIZE / 2 - 8) {
      s.p2.alive = false;
    }
  }

  if (!s.p1.alive && (!mp || !s.p2?.alive)) {
    s.gameState = 'dead';
    const best = Math.max(s.p1.score, s.p2?.score || 0);
    if (best > s.highScore) s.highScore = best;
    setTimeout(() => { s.gameState = 'restart'; }, 600);
  }
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

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCardOverlay(ctx) {
  ctx.fillStyle = 'rgba(244, 234, 213, 0.86)';
  ctx.fillRect(0, 0, W, H);
  const cw = 280, ch = 200, cx = (W - cw) / 2, cy = (H - ch) / 2 - 10;
  ctx.fillStyle = INK;
  roundRect(ctx, cx + 6, cy + 6, cw, ch, 14);
  ctx.fill();
  ctx.fillStyle = PAPER;
  roundRect(ctx, cx, cy, cw, ch, 14);
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

function draw(ctx, s, mp, role) {
  // paper background
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);

  // halftone shoulder fields
  dotGrid(ctx, 0, 0, W, H, 'rgba(31, 61, 240, 0.08)', 7, 1.1);

  // road slab
  const roadLeft = W / 2 - 110, roadRight = W / 2 + 110;
  ctx.fillStyle = ASPHALT;
  ctx.fillRect(roadLeft, 0, roadRight - roadLeft, H);

  // ink shoulder rules
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(roadLeft, 0); ctx.lineTo(roadLeft, H);
  ctx.moveTo(roadRight, 0); ctx.lineTo(roadRight, H);
  ctx.stroke();

  // pink rumble strips
  ctx.fillStyle = PINK;
  for (let i = 0; i < 12; i++) {
    const markY = ((i * 60 + s.animOffset * 1.2) % (H + 40)) - 20;
    ctx.fillRect(roadLeft - 5, markY, 8, 24);
    ctx.fillRect(roadRight - 3, markY, 8, 24);
  }

  // yellow center dashes
  ctx.strokeStyle = YELLOW;
  ctx.lineWidth = 5;
  ctx.lineCap = 'square';
  ctx.setLineDash([22, 18]);
  ctx.lineDashOffset = -s.animOffset % 40;
  ctx.beginPath();
  ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H);
  ctx.stroke();
  ctx.setLineDash([]);

  // ink shadow over center stripe to give it a hand-printed mis-registration vibe
  ctx.strokeStyle = 'rgba(24, 20, 16, 0.22)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([22, 18]);
  ctx.lineDashOffset = -s.animOffset % 40 + 1.5;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 2, 0); ctx.lineTo(W / 2 - 2, H);
  ctx.stroke();
  ctx.setLineDash([]);

  // lane separators (faint)
  ctx.strokeStyle = 'rgba(244, 234, 213, 0.06)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 18; i++) {
    const markY = ((i * 60 + s.animOffset * 1.2) % (H + 40)) - 20;
    ctx.beginPath();
    ctx.moveTo(roadLeft + 8, markY);
    ctx.lineTo(roadLeft + 24, markY);
    ctx.moveTo(roadRight - 24, markY);
    ctx.lineTo(roadRight - 8, markY);
    ctx.stroke();
  }

  for (const ob of s.obstacles) drawObstacle(ctx, LANE_X[ob.lane], ob.y);

  if (s.p1.alive) drawPlayer(ctx, s.p1.x, PLAYER_Y_P1, s.animOffset, P1_COLOR);
  else drawGhostPlayer(ctx, s.p1.x, PLAYER_Y_P1, s.animOffset, P1_COLOR);

  if (mp && s.p2) {
    if (s.p2.alive) drawPlayer(ctx, s.p2.x, PLAYER_Y_P2, s.animOffset, P2_COLOR);
    else drawGhostPlayer(ctx, s.p2.x, PLAYER_Y_P2, s.animOffset, P2_COLOR);
  }

  // scores
  if (mp) {
    ctx.font = `800 38px ${DISPLAY_FONT}`;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 5;
    ctx.textAlign = 'left';
    ctx.strokeText(s.p1.score, 20, 60);
    ctx.fillStyle = PINK;
    ctx.fillText(s.p1.score, 20, 60);
    ctx.textAlign = 'right';
    ctx.strokeText(s.p2?.score || 0, W - 20, 60);
    ctx.fillStyle = BLUE;
    ctx.fillText(s.p2?.score || 0, W - 20, 60);

    ctx.font = `500 11px ${MONO_FONT}`;
    ctx.fillStyle = PAPER;
    ctx.globalAlpha = 0.85;
    ctx.textAlign = 'left';
    ctx.fillText(role === 'host' ? 'you' : 'p1', 20, 76);
    ctx.textAlign = 'right';
    ctx.fillText(role === 'guest' ? 'you' : 'p2', W - 20, 76);
    ctx.globalAlpha = 1;
  } else {
    ctx.font = `800 56px ${DISPLAY_FONT}`;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 6;
    ctx.textAlign = 'center';
    ctx.strokeText(s.p1.score, W / 2, 70);
    ctx.fillStyle = YELLOW;
    ctx.fillText(s.p1.score, W / 2, 70);
  }

  if (s.gameState === 'waiting') {
    drawCardOverlay(ctx);
    ctx.textAlign = 'center';
    ctx.fillStyle = INK;
    ctx.font = `800 38px ${DISPLAY_FONT}`;
    ctx.fillText('lane runner', W / 2, H / 2 - 50);

    ctx.save();
    ctx.translate(W / 2, H / 2 - 18);
    ctx.rotate(-0.04);
    const stampLabel = mp ? 'tilt to dodge' : 'tilt your head';
    ctx.font = `700 16px ${DISPLAY_FONT}`;
    const stampW = ctx.measureText(stampLabel).width + 24;
    roundRect(ctx, -stampW / 2, -16, stampW, 26, 4);
    ctx.fillStyle = BLUE;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.fillStyle = PAPER;
    ctx.fillText(stampLabel, 0, 4);
    ctx.restore();

    ctx.font = `italic 500 14px ${SERIF_FONT}`;
    ctx.fillStyle = INK;
    ctx.globalAlpha = 0.6;
    ctx.fillText(mp ? 'each player on their own device' : '(or press ← / →)', W / 2, H / 2 + 22);
    ctx.globalAlpha = 1;
  }

  if (s.gameState === 'dead' || s.gameState === 'restart') {
    drawCardOverlay(ctx);
    ctx.textAlign = 'center';

    if (mp) {
      const p1s = s.p1.score, p2s = s.p2?.score || 0;
      const youWon = (role === 'host' && p1s > p2s) || (role === 'guest' && p2s > p1s);
      const youLost = (role === 'host' && p2s > p1s) || (role === 'guest' && p1s > p2s);
      ctx.font = `800 46px ${DISPLAY_FONT}`;
      if (youWon) { ctx.fillStyle = PINK; ctx.fillText('you win', W / 2, H / 2 - 36); }
      else if (youLost) { ctx.fillStyle = INK; ctx.fillText('you lose', W / 2, H / 2 - 36); }
      else { ctx.fillStyle = BLUE; ctx.fillText('a tie', W / 2, H / 2 - 36); }
      ctx.font = `italic 500 22px ${SERIF_FONT}`;
      ctx.fillStyle = INK;
      ctx.fillText(`${p1s}  ·  ${p2s}`, W / 2, H / 2 + 4);
    } else {
      ctx.font = `800 46px ${DISPLAY_FONT}`;
      ctx.fillStyle = INK;
      ctx.fillText('crash', W / 2, H / 2 - 36);
      ctx.font = `800 32px ${DISPLAY_FONT}`;
      ctx.fillStyle = PINK;
      ctx.fillText(s.p1.score, W / 2, H / 2 + 6);
    }

    ctx.font = `500 12px ${MONO_FONT}`;
    ctx.fillStyle = INK;
    ctx.globalAlpha = 0.6;
    ctx.fillText(`best · ${s.highScore}`, W / 2, H / 2 + 40);
    if (s.gameState === 'restart') {
      ctx.font = `italic 500 14px ${SERIF_FONT}`;
      ctx.fillText('tilt to restart', W / 2, H / 2 + 64);
    }
    ctx.globalAlpha = 1;
  }
}

function drawPlayer(ctx, x, y, animOffset, color) {
  ctx.save();
  ctx.translate(x, y);
  const bob = Math.sin(animOffset * 0.15) * 2;

  // body
  ctx.fillStyle = color;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(0, bob, 14, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // halftone shirt
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, bob + 2, 12, 14, 0, 0, Math.PI * 2);
  ctx.clip();
  dotGrid(ctx, -14, bob - 14, 28, 32, 'rgba(244,234,213,0.45)', 4, 0.9);
  ctx.restore();

  // head
  ctx.fillStyle = PAPER;
  ctx.beginPath();
  ctx.arc(0, -20 + bob, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // eyes
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(-3, -21 + bob, 1.8, 0, Math.PI * 2);
  ctx.arc(3, -21 + bob, 1.8, 0, Math.PI * 2);
  ctx.fill();

  // legs
  const legAngle = Math.sin(animOffset * 0.15) * 0.5;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-3, 14 + bob); ctx.lineTo(-3 - Math.sin(legAngle) * 8, 28 + bob);
  ctx.moveTo(3, 14 + bob); ctx.lineTo(3 + Math.sin(legAngle) * 8, 28 + bob);
  ctx.stroke();
  // boots in player color
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-3 - Math.sin(legAngle) * 8 - 2, 28 + bob);
  ctx.lineTo(-3 - Math.sin(legAngle) * 8 + 2, 28 + bob);
  ctx.moveTo(3 + Math.sin(legAngle) * 8 - 2, 28 + bob);
  ctx.lineTo(3 + Math.sin(legAngle) * 8 + 2, 28 + bob);
  ctx.stroke();
  ctx.restore();
}

function drawGhostPlayer(ctx, x, y, animOffset, color) {
  ctx.save();
  ctx.globalAlpha = 0.3;
  drawPlayer(ctx, x, y, animOffset, color);
  ctx.restore();
}

function drawObstacle(ctx, x, y) {
  // hazard ink stamp with halftone fill + yellow trim
  ctx.save();
  ctx.translate(x, y);

  // outer ink shape
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.moveTo(0, -22);
  ctx.lineTo(14, -8);
  ctx.lineTo(22, -20);
  ctx.lineTo(20, 5);
  ctx.lineTo(12, 22);
  ctx.lineTo(-5, 18);
  ctx.lineTo(-18, 22);
  ctx.lineTo(-22, 2);
  ctx.lineTo(-20, -16);
  ctx.lineTo(-8, -6);
  ctx.closePath();
  ctx.fill();

  // pink halftone interior
  ctx.save();
  ctx.clip();
  dotGrid(ctx, -24, -24, 48, 48, PINK, 4, 1.4);
  ctx.restore();

  // yellow danger flash
  ctx.fillStyle = YELLOW;
  ctx.beginPath();
  ctx.moveTo(-3, -10);
  ctx.lineTo(6, -2);
  ctx.lineTo(0, 2);
  ctx.lineTo(4, 10);
  ctx.lineTo(-6, 1);
  ctx.lineTo(-1, -3);
  ctx.closePath();
  ctx.fill();

  // outline
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -22);
  ctx.lineTo(14, -8);
  ctx.lineTo(22, -20);
  ctx.lineTo(20, 5);
  ctx.lineTo(12, 22);
  ctx.lineTo(-5, 18);
  ctx.lineTo(-18, 22);
  ctx.lineTo(-22, 2);
  ctx.lineTo(-20, -16);
  ctx.lineTo(-8, -6);
  ctx.closePath();
  ctx.stroke();

  ctx.restore();
}

function PipVideo({ videoRef }) {
  const pipRef = useRef(null);
  useEffect(() => {
    const el = pipRef.current, src = videoRef.current;
    if (!el || !src) return;
    function tryAttach() { if (src.srcObject) el.srcObject = src.srcObject; }
    tryAttach();
    src.addEventListener('loadeddata', tryAttach);
    return () => src.removeEventListener('loadeddata', tryAttach);
  }, [videoRef]);
  return (
    <div className="webcam-pip">
      <video ref={pipRef} autoPlay playsInline muted />
    </div>
  );
}

export default Runner;
