import { useRef, useEffect, useCallback } from 'react';

const W = 400;
const H = 600;

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

/* ---- 3D world ---- */
// Camera sits at d=0. The corridor stretches forward in +d.
// Paddle is held at d=PADDLE_D, back wall at d=COURT_D.
const FOCAL = 320;
const PADDLE_D = 220;
const COURT_D  = 1100;

// Half-extents of the corridor cross-section in world units.
const COURT_HW = 110;
const COURT_HH = 160;

const PADDLE_HW = 48;   // half-width of paddle in world units
const PADDLE_HH = 32;   // half-height
const BALL_R = 14;

const HAND_AMP = 2.5;   // amplifies hand motion so the user doesn't need to fully extend
// Higher = snappier paddle (less lag) but more jitter. 0.6 reaches 90% of the
// target in ~42ms at 60Hz, vs ~100ms at 0.32.
const PADDLE_LERP = 0.6;

const BALL_SPEEDUP = 1.07;
const BALL_VZ_INIT = 3.5;
const BALL_VXY_INIT = 1.0; // half-range for random initial sideways drift

// Speed cap grows in tiers of 50: scores 0-49 → 50, 50-99 → 100, 100-149 → 150, ...
function maxVz(score) { return 50 + Math.floor(score / 50) * 50; }

function project(x, y, d) {
  const dd = Math.max(40, d); // avoid div-by-zero / hyperscale near camera
  const scale = FOCAL / dd;
  return { sx: W / 2 + x * scale, sy: H / 2 - y * scale, scale };
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

function spawnBall() {
  return {
    x: 0,
    y: 0,
    z: PADDLE_D + 80,
    vx: (Math.random() - 0.5) * 2 * BALL_VXY_INIT,
    vy: (Math.random() - 0.5) * 2 * BALL_VXY_INIT,
    vz: BALL_VZ_INIT,
  };
}

function Pong({ getHandPos, gameState, setGameState, videoRef, onBack, handReady }) {
  const canvasRef = useRef(null);
  const stateRef = useRef(null);

  function initState() {
    return {
      paddle: { x: 0, y: 0 },
      ball: spawnBall(),
      score: 0,
      highScore: stateRef.current?.highScore || 0,
      gameState: 'waiting',
      missCooldown: 0,   // frames since the ball passed the paddle
      hitFlash: 0,
      handSeenFrames: 0, // monotonic while a hand is visible (used for waiting → playing)
      restartFrames: 0,  // counts hand-visible frames once we enter 'restart'
    };
  }
  // eslint-disable-next-line react-hooks/refs
  if (!stateRef.current) stateRef.current = initState();

  const restart = useCallback(() => {
    const s = stateRef.current;
    Object.assign(s, initState());
    s.gameState = 'waiting';
    setGameState('waiting');
  }, [setGameState]);

  // Keyboard fallback (Space/Enter to start or restart).
  useEffect(() => {
    function onKey(e) {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        const s = stateRef.current;
        if (s.gameState === 'restart') restart();
        else if (s.gameState === 'waiting') {
          s.gameState = 'playing';
          setGameState('playing');
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [restart, setGameState]);

  // Game loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let raf;

    function loop() {
      const s = stateRef.current;
      const hand = getHandPos?.();

      // Paddle target from hand (mirrored so user's right = screen right).
      if (hand) {
        const nx = -((hand.x - 0.5) * 2) * HAND_AMP;
        const ny = -((hand.y - 0.5) * 2) * HAND_AMP;
        // Paddle edge stays inside the corridor walls (and, by extension, fully
        // covers the ball's bounded range).
        const maxX = COURT_HW - PADDLE_HW;
        const maxY = COURT_HH - PADDLE_HH;
        const targetX = clamp(nx * maxX, -maxX, maxX);
        const targetY = clamp(ny * maxY, -maxY, maxY);
        s.paddle.x += (targetX - s.paddle.x) * PADDLE_LERP;
        s.paddle.y += (targetY - s.paddle.y) * PADDLE_LERP;
        s.handSeenFrames++;
      } else {
        s.handSeenFrames = 0;
      }

      if (s.gameState === 'waiting' && s.handSeenFrames > 30) {
        s.gameState = 'playing';
        setGameState('playing');
      }

      if (s.gameState === 'restart') {
        if (hand) s.restartFrames++;
        else s.restartFrames = 0;
        if (s.restartFrames > 20) {
          const high = s.highScore;
          Object.assign(s, initState());
          s.highScore = high;
          s.gameState = 'playing';
          setGameState('playing');
        }
      }

      update(s);
      draw(ctx, s, !!hand, handReady);
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [getHandPos, setGameState, handReady]);

  // Sync external gameState changes back into the mutable state.
  useEffect(() => {
    stateRef.current.gameState = gameState;
  }, [gameState]);

  return (
    <div className="game-container">
      <canvas ref={canvasRef} width={W} height={H} />
      <button className="back-btn" onClick={onBack}>Menu</button>
      <PipVideo videoRef={videoRef} />
    </div>
  );
}

function update(s) {
  if (s.hitFlash > 0) s.hitFlash--;

  if (s.gameState === 'waiting') {
    // Idle bob: ball hovers behind paddle.
    s.ball.x = Math.sin(Date.now() / 600) * 25;
    s.ball.y = Math.cos(Date.now() / 800) * 15;
    s.ball.z = PADDLE_D + 220 + Math.sin(Date.now() / 500) * 30;
    return;
  }

  if (s.gameState !== 'playing') return;

  const b = s.ball;
  b.x += b.vx;
  b.y += b.vy;
  b.z += b.vz;

  // Side wall bounces.
  if (b.x > COURT_HW - BALL_R) { b.x = COURT_HW - BALL_R; b.vx = -Math.abs(b.vx); }
  if (b.x < -(COURT_HW - BALL_R)) { b.x = -(COURT_HW - BALL_R); b.vx = Math.abs(b.vx); }
  if (b.y > COURT_HH - BALL_R) { b.y = COURT_HH - BALL_R; b.vy = -Math.abs(b.vy); }
  if (b.y < -(COURT_HH - BALL_R)) { b.y = -(COURT_HH - BALL_R); b.vy = Math.abs(b.vy); }

  // Back wall bounce.
  if (b.z > COURT_D - BALL_R) {
    b.z = COURT_D - BALL_R;
    b.vz = -Math.abs(b.vz);
  }

  // Paddle plane: ball moving toward camera and crosses PADDLE_D.
  if (b.vz < 0 && b.z <= PADDLE_D && b.z - b.vz > PADDLE_D) {
    const dx = b.x - s.paddle.x;
    const dy = b.y - s.paddle.y;
    if (Math.abs(dx) < PADDLE_HW + BALL_R * 0.6 && Math.abs(dy) < PADDLE_HH + BALL_R * 0.6) {
      // Hit. Reverse vz, transfer english from hit offset.
      b.z = PADDLE_D + 1;
      b.vz = Math.min(maxVz(s.score), Math.abs(b.vz) * BALL_SPEEDUP);
      b.vx = clamp(b.vx + (dx / PADDLE_HW) * 2.2, -10, 10);
      b.vy = clamp(b.vy + (dy / PADDLE_HH) * 1.8, -8, 8);
      s.score++;
      s.hitFlash = 8;
      if (s.score > s.highScore) s.highScore = s.score;
    }
  }

  // Ball whooshed past the paddle — give it a beat to dramatize, then game over.
  if (b.z < PADDLE_D - 30) s.missCooldown++;
  if (s.missCooldown > 18 && s.gameState === 'playing') {
    s.gameState = 'dead';
    s.restartFrames = 0;
    setTimeout(() => {
      if (s.gameState === 'dead') {
        s.gameState = 'restart';
        s.restartFrames = 0;
      }
    }, 700);
  }
}

/* ----- drawing ----- */

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

function drawCorridor(ctx, t) {
  // Asphalt corridor — back wall projected, then connect to the canvas frame.
  const back = {
    tl: project(-COURT_HW,  COURT_HH, COURT_D),
    tr: project( COURT_HW,  COURT_HH, COURT_D),
    br: project( COURT_HW, -COURT_HH, COURT_D),
    bl: project(-COURT_HW, -COURT_HH, COURT_D),
  };

  // Floor (between back-bottom edge and screen-bottom).
  ctx.fillStyle = ASPHALT;
  ctx.beginPath();
  ctx.moveTo(0, H);
  ctx.lineTo(W, H);
  ctx.lineTo(back.br.sx, back.br.sy);
  ctx.lineTo(back.bl.sx, back.bl.sy);
  ctx.closePath();
  ctx.fill();

  // Ceiling.
  ctx.fillStyle = '#221c14';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(W, 0);
  ctx.lineTo(back.tr.sx, back.tr.sy);
  ctx.lineTo(back.tl.sx, back.tl.sy);
  ctx.closePath();
  ctx.fill();

  // Left wall.
  ctx.fillStyle = '#1a1610';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(back.tl.sx, back.tl.sy);
  ctx.lineTo(back.bl.sx, back.bl.sy);
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.fill();

  // Right wall.
  ctx.fillStyle = '#1a1610';
  ctx.beginPath();
  ctx.moveTo(W, 0);
  ctx.lineTo(back.tr.sx, back.tr.sy);
  ctx.lineTo(back.br.sx, back.br.sy);
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();

  // Depth ribs — rectangles at increasing depths.
  const ribs = [350, 500, 650, 800, 950];
  ctx.lineWidth = 1.2;
  for (const d of ribs) {
    const tl = project(-COURT_HW,  COURT_HH, d);
    const tr = project( COURT_HW,  COURT_HH, d);
    const br = project( COURT_HW, -COURT_HH, d);
    const bl = project(-COURT_HW, -COURT_HH, d);
    ctx.strokeStyle = `rgba(244, 234, 213, ${0.05 + 0.18 * (1 - d / COURT_D)})`;
    ctx.beginPath();
    ctx.moveTo(tl.sx, tl.sy);
    ctx.lineTo(tr.sx, tr.sy);
    ctx.lineTo(br.sx, br.sy);
    ctx.lineTo(bl.sx, bl.sy);
    ctx.closePath();
    ctx.stroke();
  }

  // Yellow center stripe on the floor — running into the distance.
  ctx.strokeStyle = YELLOW;
  ctx.lineWidth = 4;
  ctx.lineCap = 'square';
  ctx.setLineDash([18, 16]);
  ctx.lineDashOffset = -t * 8 % 34;
  const nearMid = project(0, -COURT_HH * 0.95, PADDLE_D - 60);
  const farMid  = project(0, -COURT_HH * 0.95, COURT_D);
  ctx.beginPath();
  ctx.moveTo(nearMid.sx, nearMid.sy);
  ctx.lineTo(farMid.sx, farMid.sy);
  ctx.stroke();
  ctx.setLineDash([]);

  // Back wall — paper colored slab with halftone.
  ctx.fillStyle = PAPER;
  ctx.beginPath();
  ctx.moveTo(back.tl.sx, back.tl.sy);
  ctx.lineTo(back.tr.sx, back.tr.sy);
  ctx.lineTo(back.br.sx, back.br.sy);
  ctx.lineTo(back.bl.sx, back.bl.sy);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = INK;
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(back.tl.sx, back.tl.sy);
  ctx.lineTo(back.tr.sx, back.tr.sy);
  ctx.lineTo(back.br.sx, back.br.sy);
  ctx.lineTo(back.bl.sx, back.bl.sy);
  ctx.closePath();
  ctx.clip();
  dotGrid(ctx, back.tl.sx, back.tl.sy,
          back.tr.sx - back.tl.sx, back.bl.sy - back.tl.sy,
          'rgba(31, 61, 240, 0.22)', 4, 1);
  // a stamp logo on the back wall
  ctx.save();
  const cx = (back.tl.sx + back.tr.sx) / 2;
  const cy = (back.tl.sy + back.bl.sy) / 2;
  ctx.translate(cx, cy);
  ctx.rotate(-0.05);
  ctx.fillStyle = PINK;
  roundRect(ctx, -22, -8, 44, 16, 3);
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fillStyle = PAPER;
  ctx.font = `700 9px ${DISPLAY_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('blinkbird', 0, 0);
  ctx.restore();
  ctx.restore();

  // Reach zone — dashed yellow rect at the paddle plane showing the area
  // where the paddle can actually intercept. Anything outside is unreachable.
  const reach = {
    tl: project(-COURT_HW,  COURT_HH, PADDLE_D),
    tr: project( COURT_HW,  COURT_HH, PADDLE_D),
    br: project( COURT_HW, -COURT_HH, PADDLE_D),
    bl: project(-COURT_HW, -COURT_HH, PADDLE_D),
  };
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 216, 58, 0.55)';
  ctx.lineWidth = 2;
  ctx.setLineDash([7, 6]);
  ctx.beginPath();
  ctx.moveTo(reach.tl.sx, reach.tl.sy);
  ctx.lineTo(reach.tr.sx, reach.tr.sy);
  ctx.lineTo(reach.br.sx, reach.br.sy);
  ctx.lineTo(reach.bl.sx, reach.bl.sy);
  ctx.closePath();
  ctx.stroke();
  // tiny corner ticks so the bound reads even when dashes are between strokes
  ctx.setLineDash([]);
  const corners = [reach.tl, reach.tr, reach.br, reach.bl];
  ctx.fillStyle = 'rgba(255, 216, 58, 0.85)';
  for (const c of corners) {
    ctx.beginPath();
    ctx.arc(c.sx, c.sy, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawBall(ctx, b) {
  const p = project(b.x, b.y, b.z);
  const r = Math.max(2, BALL_R * p.scale);

  // soft drop shadow on the floor (project onto y=-COURT_HH plane).
  const sh = project(b.x, -COURT_HH + 4, b.z);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.ellipse(sh.sx, sh.sy, r * 0.9, r * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();

  // ball — yellow stamp with halftone clip
  ctx.fillStyle = YELLOW;
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(1, r * 0.12);
  ctx.beginPath();
  ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2);
  ctx.clip();
  dotGrid(ctx, p.sx - r, p.sy - r, r * 2, r * 2, 'rgba(24,20,16,0.28)',
          Math.max(2.5, r * 0.18), Math.max(0.6, r * 0.06));
  ctx.restore();

  // pink highlight wedge
  ctx.fillStyle = PINK;
  ctx.beginPath();
  ctx.arc(p.sx - r * 0.35, p.sy - r * 0.35, r * 0.4, 0, Math.PI * 2);
  ctx.fill();
}

function drawPaddle(ctx, paddle, hitFlash) {
  const p = project(paddle.x, paddle.y, PADDLE_D);
  const w = PADDLE_HW * 2 * p.scale;
  const h = PADDLE_HH * 2 * p.scale;
  const x = p.sx - w / 2;
  const y = p.sy - h / 2;
  const BODY_ALPHA = 0.28;

  // translucent body so the ball/court behind stays visible
  ctx.save();
  ctx.globalAlpha = BODY_ALPHA;
  ctx.fillStyle = hitFlash > 0 ? YELLOW : PINK;
  roundRect(ctx, x, y, w, h, 10);
  ctx.fill();
  ctx.restore();

  // outline at full opacity so paddle position reads clearly
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = INK;
  roundRect(ctx, x, y, w, h, 10);
  ctx.stroke();

  // faint halftone shading inside the body
  ctx.save();
  roundRect(ctx, x, y, w, h, 10);
  ctx.clip();
  ctx.globalAlpha = 0.5;
  dotGrid(ctx, x, y, w, h, 'rgba(244,234,213,0.55)', 5, 1.2);
  ctx.restore();

  // crosshair at paddle center for aim — full opacity
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(p.sx, p.sy, Math.max(2, p.scale * 2.5), 0, Math.PI * 2);
  ctx.fill();
  // small ink corner ticks so corners read against the back wall
  const tick = Math.max(4, p.scale * 6);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y + tick); ctx.lineTo(x, y); ctx.lineTo(x + tick, y);
  ctx.moveTo(x + w - tick, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + tick);
  ctx.moveTo(x + w, y + h - tick); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - tick, y + h);
  ctx.moveTo(x + tick, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - tick);
  ctx.stroke();
}

function draw(ctx, s, handVisible, handReady) {
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);

  // sky/grain over the paper before the corridor swallows the middle.
  dotGrid(ctx, 0, 0, W, H, 'rgba(31, 61, 240, 0.06)', 7, 1.1);

  drawCorridor(ctx, Date.now() / 1000);

  const ballBehindPaddle = s.ball.z >= PADDLE_D;

  if (ballBehindPaddle) {
    drawBall(ctx, s.ball);
    drawPaddle(ctx, s.paddle, s.hitFlash);
  } else {
    drawPaddle(ctx, s.paddle, s.hitFlash);
    drawBall(ctx, s.ball);
  }

  // score
  ctx.font = `800 56px ${DISPLAY_FONT}`;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 6;
  ctx.textAlign = 'center';
  ctx.strokeText(s.score, W / 2, 70);
  ctx.fillStyle = YELLOW;
  ctx.fillText(s.score, W / 2, 70);

  // tiny hand indicator dot in the corner so the player knows tracking is alive
  ctx.fillStyle = handVisible ? PINK : 'rgba(244,234,213,0.5)';
  ctx.beginPath();
  ctx.arc(W - 22, H - 22, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = `500 10px ${MONO_FONT}`;
  ctx.textAlign = 'right';
  ctx.fillStyle = handVisible ? PAPER : 'rgba(244,234,213,0.55)';
  ctx.fillText(handVisible ? 'hand · ok' : 'no hand', W - 32, H - 18);

  if (s.gameState === 'waiting') {
    drawCardOverlay(ctx);
    ctx.textAlign = 'center';
    ctx.fillStyle = INK;
    ctx.font = `800 42px ${DISPLAY_FONT}`;
    ctx.fillText('hand pong', W / 2, H / 2 - 50);

    ctx.save();
    ctx.translate(W / 2, H / 2 - 18);
    ctx.rotate(-0.04);
    const stamp = handReady ? 'raise your hand' : 'loading hand model…';
    ctx.font = `700 16px ${DISPLAY_FONT}`;
    const sw = ctx.measureText(stamp).width + 24;
    roundRect(ctx, -sw / 2, -16, sw, 26, 4);
    ctx.fillStyle = BLUE;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.fillStyle = PAPER;
    ctx.fillText(stamp, 0, 4);
    ctx.restore();

    ctx.font = `italic 500 14px ${SERIF_FONT}`;
    ctx.fillStyle = INK;
    ctx.globalAlpha = 0.6;
    ctx.fillText('open palm to the camera, the paddle follows', W / 2, H / 2 + 22);
    ctx.fillText('(or press space)', W / 2, H / 2 + 42);
    ctx.globalAlpha = 1;
  }

  if (s.gameState === 'dead' || s.gameState === 'restart') {
    drawCardOverlay(ctx);
    ctx.textAlign = 'center';
    ctx.font = `800 46px ${DISPLAY_FONT}`;
    ctx.fillStyle = INK;
    ctx.fillText('miss', W / 2, H / 2 - 36);
    ctx.font = `800 32px ${DISPLAY_FONT}`;
    ctx.fillStyle = PINK;
    ctx.fillText(s.score, W / 2, H / 2 + 6);
    ctx.font = `500 12px ${MONO_FONT}`;
    ctx.fillStyle = INK;
    ctx.globalAlpha = 0.6;
    ctx.fillText(`best · ${s.highScore}`, W / 2, H / 2 + 40);
    if (s.gameState === 'restart') {
      ctx.font = `italic 500 14px ${SERIF_FONT}`;
      ctx.fillText('raise your hand to restart', W / 2, H / 2 + 64);
    }
    ctx.globalAlpha = 1;
  }
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

export default Pong;
