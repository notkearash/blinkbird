import { useRef, useEffect, useCallback } from 'react';

const W = 400;
const H = 600;

const GRAVITY = 0.12;
const FLAP_STRENGTH = -5.5;
const PIPE_WIDTH = 50;
const PIPE_GAP = 250;
const PIPE_SPEED = 0.8;
const PIPE_INTERVAL = 3500;
const BIRD_RADIUS = 16;
const GROUND_H = 40;

/* ---- riso-zine theme ---- */
const INK    = '#181410';
const PAPER  = '#f4ead5';
const PAPER2 = '#ece1c8';
const PINK   = '#ff3a86';
const BLUE   = '#1f3df0';
const YELLOW = '#ffd83a';
const DISPLAY_FONT = '"Bricolage Grotesque", system-ui, sans-serif';
const SERIF_FONT   = '"Newsreader", "Times New Roman", serif';
const MONO_FONT    = '"JetBrains Mono", ui-monospace, monospace';

const P1_COLORS = { body: PINK,   wing: '#d11a66', beak: YELLOW };
const P2_COLORS = { body: BLUE,   wing: '#0c2bc0', beak: YELLOW };

function makeBird(x) {
  return { x, y: H / 2, vy: 0, flapFrame: 0, alive: true, score: 0 };
}

function Game({
  setOnBlink, p1Triggered,
  gameState, setGameState, videoRef, mode, setMode,
  onBack, multiplayer, mp,
}) {
  const canvasRef = useRef(null);
  const modeRef = useRef(mode);
  const mpRef = useRef(multiplayer);
  modeRef.current = mode;
  mpRef.current = multiplayer;

  const stateRef = useRef(null);
  const isHost = !multiplayer || mp?.role === 'host';
  const isHostRef = useRef(isHost);
  isHostRef.current = isHost;

  function initState() {
    return {
      p1: makeBird(70),
      p2: multiplayer ? makeBird(100) : null,
      pipes: [],
      highScore: stateRef.current?.highScore || 0,
      lastPipeTime: 0,
      gameState: 'waiting',
    };
  }

  if (!stateRef.current) stateRef.current = initState();

  // Ensure p2 exists in multiplayer
  useEffect(() => {
    if (multiplayer && !stateRef.current.p2) stateRef.current.p2 = makeBird(100);
  }, [multiplayer]);

  const flapLocal = useCallback(() => {
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
        if (s.p1.alive) { s.p1.vy = FLAP_STRENGTH; s.p1.flapFrame = 8; }
        mp?.send({ type: 'start' }); // tell guest game started
      } else {
        // Guest: send flap to host
        mp?.send({ type: 'flap' });
      }
    } else {
      if (s.p1.alive) { s.p1.vy = FLAP_STRENGTH; s.p1.flapFrame = 8; }
    }
  }, [setGameState, multiplayer, mp]);

  // Register blink
  useEffect(() => { setOnBlink(flapLocal); }, [setOnBlink, flapLocal]);

  // Keyboard
  useEffect(() => {
    function onKey(e) {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault();
        flapLocal();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flapLocal]);

  // Network message handler
  useEffect(() => {
    if (!multiplayer || !mp) return;

    mp.setOnMessage((data) => {
      const s = stateRef.current;

      if (isHostRef.current) {
        // Host receives guest inputs
        if (data.type === 'flap') {
          if (s.p2?.alive) { s.p2.vy = FLAP_STRENGTH; s.p2.flapFrame = 8; }
          if (s.gameState === 'waiting') {
            s.gameState = 'playing';
            setGameState('playing');
          }
          if (s.gameState === 'restart') {
            Object.assign(s, initState());
            s.gameState = 'waiting';
            setGameState('waiting');
          }
        }
      } else {
        // Guest receives game state from host
        if (data.type === 'state') {
          s.p1 = data.p1;
          s.p2 = data.p2;
          s.pipes = data.pipes;
          s.gameState = data.gameState;
          s.highScore = data.highScore;
          if (data.gameState === 'playing') setGameState('playing');
          if (data.gameState === 'dead' || data.gameState === 'restart') setGameState(data.gameState);
        }
        if (data.type === 'start') {
          s.gameState = 'playing';
          setGameState('playing');
        }
      }
    });
  }, [multiplayer, mp, setGameState]);

  // Game loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let raf;
    let syncCounter = 0;

    function loop() {
      const s = stateRef.current;

      // Only host runs physics
      if (isHostRef.current || !mpRef.current) {
        update(s, mpRef.current);

        // Host broadcasts state every 3 frames
        if (mpRef.current && syncCounter++ % 3 === 0) {
          mp?.send({
            type: 'state',
            p1: s.p1,
            p2: s.p2,
            pipes: s.pipes,
            gameState: s.gameState,
            highScore: s.highScore,
          });
        }
      }

      draw(ctx, s, modeRef.current, mpRef.current, mp?.role);
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
      {!multiplayer && (
        <div className="mode-toggle">
          <button className={mode === 'blink' ? 'active' : ''} onClick={() => setMode('blink')}>Blink</button>
          <button className={mode === 'tongue' ? 'active' : ''} onClick={() => setMode('tongue')}>Tongue</button>
        </div>
      )}
      {multiplayer && (
        <div className="mp-role-badge">
          {mp?.role === 'host' ? 'P1 (Host)' : 'P2 (Guest)'}
        </div>
      )}
      <PipVideo videoRef={videoRef} />
    </div>
  );
}

function updateBird(bird, pipes) {
  if (!bird || !bird.alive) return;
  bird.vy += GRAVITY;
  bird.y += bird.vy;
  if (bird.flapFrame > 0) bird.flapFrame--;

  const r = BIRD_RADIUS;
  if (bird.y + r > H - GROUND_H || bird.y - r < 0) { bird.alive = false; return; }
  for (const p of pipes) {
    const bottomY = p.topH + PIPE_GAP;
    if (bird.x + r > p.x && bird.x - r < p.x + PIPE_WIDTH) {
      if (bird.y - r < p.topH || bird.y + r > bottomY) { bird.alive = false; return; }
    }
  }
}

function update(s, mp) {
  if (s.gameState === 'waiting') {
    s.p1.y = H / 2 + Math.sin(Date.now() / 300) * 12;
    if (s.p2) s.p2.y = H / 2 + Math.sin(Date.now() / 300 + 1) * 12;
    return;
  }
  if (s.gameState !== 'playing') return;

  const now = Date.now();
  if (now - s.lastPipeTime > PIPE_INTERVAL) {
    const minTop = 60;
    const maxTop = H - GROUND_H - PIPE_GAP - 60;
    const topH = minTop + Math.random() * (maxTop - minTop);
    s.pipes.push({ x: W, topH, p1Scored: false, p2Scored: false });
    s.lastPipeTime = now;
  }

  for (let i = s.pipes.length - 1; i >= 0; i--) {
    s.pipes[i].x -= PIPE_SPEED;
    if (s.pipes[i].x + PIPE_WIDTH < 0) { s.pipes.splice(i, 1); continue; }
    if (s.p1.alive && !s.pipes[i].p1Scored && s.pipes[i].x + PIPE_WIDTH < s.p1.x) {
      s.pipes[i].p1Scored = true; s.p1.score++;
    }
    if (s.p2?.alive && !s.pipes[i].p2Scored && s.pipes[i].x + PIPE_WIDTH < s.p2.x) {
      s.pipes[i].p2Scored = true; s.p2.score++;
    }
  }

  updateBird(s.p1, s.pipes);
  if (mp) updateBird(s.p2, s.pipes);

  const allDead = !s.p1.alive && (!mp || !s.p2?.alive);
  if (allDead) {
    s.gameState = 'dead';
    const best = Math.max(s.p1.score, s.p2?.score || 0);
    if (best > s.highScore) s.highScore = best;
    setTimeout(() => { s.gameState = 'restart'; }, 600);
  }
}

/* ---- halftone helpers ---- */
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

function draw(ctx, s, mode, mp, role) {
  // paper background
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);

  // drifting halftone "clouds"
  const t = Date.now() / 5000;
  for (let i = 0; i < 4; i++) {
    const cx = ((i * 137 + t * 28) % (W + 160)) - 80;
    const cy = 60 + i * 70;
    ctx.save();
    ctx.translate(cx, cy);
    dotGrid(ctx, -42, -14, 84, 28, 'rgba(31, 61, 240, 0.22)', 5, 1.4);
    ctx.restore();
  }

  // pipes
  for (const p of s.pipes) drawPipe(ctx, p);

  // ground: ink slab + yellow stripe + serif "label" texture
  ctx.fillStyle = INK;
  ctx.fillRect(0, H - GROUND_H, W, GROUND_H);
  ctx.fillStyle = YELLOW;
  ctx.fillRect(0, H - GROUND_H, W, 4);
  // newsprint hatching
  ctx.strokeStyle = 'rgba(244, 234, 213, 0.18)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = -GROUND_H; x < W + GROUND_H; x += 9) {
    ctx.moveTo(x, H - GROUND_H + 6);
    ctx.lineTo(x + GROUND_H - 6, H);
  }
  ctx.stroke();

  if (s.p1.alive) drawBird(ctx, s.p1, P1_COLORS);
  else drawGhost(ctx, s.p1, P1_COLORS);

  if (mp && s.p2) {
    if (s.p2.alive) drawBird(ctx, s.p2, P2_COLORS);
    else drawGhost(ctx, s.p2, P2_COLORS);
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
    ctx.fillStyle = INK;
    ctx.globalAlpha = 0.7;
    ctx.textAlign = 'left';
    ctx.fillText(role === 'host' ? 'you ↓' : 'p1', 20, 76);
    ctx.textAlign = 'right';
    ctx.fillText(role === 'guest' ? 'you ↓' : 'p2', W - 20, 76);
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

  const actionWord = mode === 'tongue' ? 'tongue out' : 'blink';

  if (s.gameState === 'waiting') {
    drawCardOverlay(ctx);
    ctx.textAlign = 'center';
    ctx.fillStyle = INK;
    ctx.font = `800 44px ${DISPLAY_FONT}`;
    ctx.fillText('blinkbird', W / 2, H / 2 - 56);
    // pink stamp under title
    ctx.save();
    ctx.translate(W / 2, H / 2 - 22);
    ctx.rotate(-0.04);
    ctx.fillStyle = PINK;
    const stampLabel = mp ? `both ${actionWord} to fly` : `${actionWord} to fly`;
    ctx.font = `700 16px ${DISPLAY_FONT}`;
    const stampW = ctx.measureText(stampLabel).width + 24;
    roundRect(ctx, -stampW / 2, -16, stampW, 26, 4);
    ctx.fillStyle = PINK;
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
    ctx.fillText(mp ? 'each player on their own device' : '(or press space)', W / 2, H / 2 + 18);
    ctx.globalAlpha = 1;
  }

  if (s.gameState === 'dead' || s.gameState === 'restart') {
    drawCardOverlay(ctx);
    ctx.textAlign = 'center';

    if (mp) {
      const p1s = s.p1.score;
      const p2s = s.p2?.score || 0;
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
      ctx.fillText('game over', W / 2, H / 2 - 36);
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
      ctx.fillText(`${actionWord} to restart`, W / 2, H / 2 + 64);
    }
    ctx.globalAlpha = 1;
  }
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
  // soft cream wash so the canvas behind reads through faintly
  ctx.fillStyle = 'rgba(244, 234, 213, 0.86)';
  ctx.fillRect(0, 0, W, H);
  // centered card with offset shadow
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

function drawPipe(ctx, p) {
  const bottomY = p.topH + PIPE_GAP;
  const capH = 22, capOverhang = 5;

  // top pipe shaft
  ctx.fillStyle = INK;
  ctx.fillRect(p.x, 0, PIPE_WIDTH, p.topH);
  dotGrid(ctx, p.x + 4, 0, PIPE_WIDTH - 8, p.topH, 'rgba(255, 216, 58, 0.45)', 5, 1.2);
  // top pipe cap (pink stamp)
  ctx.fillStyle = PINK;
  ctx.fillRect(p.x - capOverhang, p.topH - capH, PIPE_WIDTH + capOverhang * 2, capH);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = INK;
  ctx.strokeRect(p.x - capOverhang + 0.75, p.topH - capH + 0.75, PIPE_WIDTH + capOverhang * 2 - 1.5, capH - 1.5);
  // accent stripe inside cap
  ctx.fillStyle = PAPER;
  ctx.fillRect(p.x - capOverhang + 5, p.topH - capH + 6, PIPE_WIDTH + capOverhang * 2 - 10, 3);

  // shaft side outlines
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(p.x - 0.75, 0); ctx.lineTo(p.x - 0.75, p.topH - capH);
  ctx.moveTo(p.x + PIPE_WIDTH + 0.75, 0); ctx.lineTo(p.x + PIPE_WIDTH + 0.75, p.topH - capH);
  ctx.stroke();

  // bottom pipe shaft
  ctx.fillStyle = INK;
  ctx.fillRect(p.x, bottomY, PIPE_WIDTH, H - bottomY);
  dotGrid(ctx, p.x + 4, bottomY, PIPE_WIDTH - 8, H - bottomY, 'rgba(255, 216, 58, 0.45)', 5, 1.2);
  // bottom cap
  ctx.fillStyle = PINK;
  ctx.fillRect(p.x - capOverhang, bottomY, PIPE_WIDTH + capOverhang * 2, capH);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = INK;
  ctx.strokeRect(p.x - capOverhang + 0.75, bottomY + 0.75, PIPE_WIDTH + capOverhang * 2 - 1.5, capH - 1.5);
  ctx.fillStyle = PAPER;
  ctx.fillRect(p.x - capOverhang + 5, bottomY + capH - 9, PIPE_WIDTH + capOverhang * 2 - 10, 3);

  ctx.beginPath();
  ctx.moveTo(p.x - 0.75, bottomY + capH); ctx.lineTo(p.x - 0.75, H);
  ctx.moveTo(p.x + PIPE_WIDTH + 0.75, bottomY + capH); ctx.lineTo(p.x + PIPE_WIDTH + 0.75, H);
  ctx.stroke();
}

function drawBird(ctx, bird, colors) {
  ctx.save();
  ctx.translate(bird.x, bird.y);
  ctx.rotate(Math.min(Math.max(bird.vy * 3, -30), 70) * (Math.PI / 180));

  // wing (back)
  ctx.fillStyle = colors.wing;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(-4, bird.flapFrame > 0 ? -8 : 4, 12, 7, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // body
  ctx.fillStyle = colors.body;
  ctx.beginPath();
  ctx.ellipse(0, 0, BIRD_RADIUS + 4, BIRD_RADIUS, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // halftone belly
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, 4, BIRD_RADIUS + 1, BIRD_RADIUS - 4, 0, 0, Math.PI * 2);
  ctx.clip();
  dotGrid(ctx, -BIRD_RADIUS, -BIRD_RADIUS, BIRD_RADIUS * 2 + 8, BIRD_RADIUS * 2, 'rgba(24,20,16,0.25)', 4, 0.9);
  ctx.restore();

  // eye
  ctx.fillStyle = PAPER;
  ctx.beginPath();
  ctx.arc(10, -6, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(12, -5, 3.5, 0, Math.PI * 2);
  ctx.fill();

  // beak
  ctx.fillStyle = colors.beak;
  ctx.beginPath();
  ctx.moveTo(18, -2); ctx.lineTo(28, 3); ctx.lineTo(18, 8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

function drawGhost(ctx, bird, colors) {
  ctx.save();
  ctx.globalAlpha = 0.3;
  drawBird(ctx, bird, colors);
  ctx.restore();
}

function PipVideo({ videoRef }) {
  const pipRef = useRef(null);
  useEffect(() => {
    const el = pipRef.current;
    const src = videoRef.current;
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

export default Game;
