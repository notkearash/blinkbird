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

const P1_COLORS = { body: '#f5c542', wing: '#e6a817', beak: '#e85d04' };
const P2_COLORS = { body: '#c084fc', wing: '#9333ea', beak: '#7c3aed' };

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

function draw(ctx, s, mode, mp, role) {
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#4dc9f6');
  grad.addColorStop(1, '#a8e6cf');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  const t = Date.now() / 5000;
  for (let i = 0; i < 5; i++) {
    const cx = ((i * 97 + t * 50) % (W + 100)) - 50;
    const cy = 50 + i * 55;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 38, 16, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + 22, cy - 4, 28, 13, 0, 0, Math.PI * 2);
    ctx.ellipse(cx - 18, cy + 2, 22, 10, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const p of s.pipes) drawPipe(ctx, p);

  ctx.fillStyle = '#4CAF50';
  ctx.fillRect(0, H - GROUND_H - 4, W, 8);
  ctx.fillStyle = '#8B6914';
  ctx.fillRect(0, H - GROUND_H, W, GROUND_H);
  ctx.fillStyle = '#6B4F12';
  ctx.fillRect(0, H - GROUND_H, W, 3);

  // Highlight "you" bird
  const myColors = role === 'guest' ? P2_COLORS : P1_COLORS;
  const otherColors = role === 'guest' ? P1_COLORS : P2_COLORS;

  if (s.p1.alive) drawBird(ctx, s.p1, P1_COLORS);
  else drawGhost(ctx, s.p1, P1_COLORS);

  if (mp && s.p2) {
    if (s.p2.alive) drawBird(ctx, s.p2, P2_COLORS);
    else drawGhost(ctx, s.p2, P2_COLORS);
  }

  // Scores
  if (mp) {
    ctx.font = 'bold 36px system-ui, sans-serif';
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 3;
    ctx.textAlign = 'left';
    ctx.fillStyle = P1_COLORS.body;
    ctx.strokeText(s.p1.score, 20, 60);
    ctx.fillText(s.p1.score, 20, 60);
    ctx.textAlign = 'right';
    ctx.fillStyle = P2_COLORS.body;
    ctx.strokeText(s.p2?.score || 0, W - 20, 60);
    ctx.fillText(s.p2?.score || 0, W - 20, 60);
    ctx.font = '12px system-ui, sans-serif';
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = 'white';
    ctx.textAlign = 'left';
    ctx.fillText(role === 'host' ? 'YOU' : 'P1', 20, 75);
    ctx.textAlign = 'right';
    ctx.fillText(role === 'guest' ? 'YOU' : 'P2', W - 20, 75);
    ctx.globalAlpha = 1;
  } else {
    ctx.fillStyle = 'white';
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 4;
    ctx.font = 'bold 48px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.strokeText(s.p1.score, W / 2, 65);
    ctx.fillText(s.p1.score, W / 2, 65);
  }

  const actionWord = mode === 'tongue' ? 'Tongue out' : 'Blink';

  if (s.gameState === 'waiting') {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'white';
    ctx.font = 'bold 42px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('BlinkBird', W / 2, H / 2 - 60);
    ctx.font = '18px system-ui, sans-serif';
    ctx.globalAlpha = 0.8;
    ctx.fillText(mp ? `Both ${actionWord.toLowerCase()} to fly!` : `${actionWord} to fly!`, W / 2, H / 2 - 20);
    ctx.font = '14px system-ui, sans-serif';
    ctx.globalAlpha = 0.5;
    ctx.fillText(mp ? 'Each player on their own device' : '(or press Space)', W / 2, H / 2 + 10);
    ctx.globalAlpha = 1;
  }

  if (s.gameState === 'dead' || s.gameState === 'restart') {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'white';
    ctx.font = 'bold 42px system-ui, sans-serif';
    ctx.textAlign = 'center';

    if (mp) {
      const p1s = s.p1.score;
      const p2s = s.p2?.score || 0;
      const youWon = (role === 'host' && p1s > p2s) || (role === 'guest' && p2s > p1s);
      const youLost = (role === 'host' && p2s > p1s) || (role === 'guest' && p1s > p2s);
      if (youWon) { ctx.fillStyle = '#4cd964'; ctx.fillText('You Win!', W / 2, H / 2 - 40); }
      else if (youLost) { ctx.fillStyle = '#e74c3c'; ctx.fillText('You Lose!', W / 2, H / 2 - 40); }
      else { ctx.fillStyle = 'white'; ctx.fillText('Tie!', W / 2, H / 2 - 40); }
      ctx.fillStyle = 'white';
      ctx.font = '20px system-ui, sans-serif';
      ctx.fillText(`${p1s}  -  ${p2s}`, W / 2, H / 2 + 10);
    } else {
      ctx.fillText('Game Over', W / 2, H / 2 - 40);
      ctx.font = 'bold 28px system-ui, sans-serif';
      ctx.fillText(s.p1.score, W / 2, H / 2 + 10);
    }

    ctx.fillStyle = 'white';
    ctx.font = '16px system-ui, sans-serif';
    ctx.globalAlpha = 0.6;
    ctx.fillText(`Best: ${s.highScore}`, W / 2, H / 2 + 40);
    if (s.gameState === 'restart') ctx.fillText(`${actionWord} to restart`, W / 2, H / 2 + 70);
    ctx.globalAlpha = 1;
  }
}

function drawPipe(ctx, p) {
  const bottomY = p.topH + PIPE_GAP;
  const capH = 20, capOverhang = 4;
  ctx.fillStyle = '#2ecc40';
  ctx.fillRect(p.x, 0, PIPE_WIDTH, p.topH);
  ctx.fillStyle = '#5eef70';
  ctx.fillRect(p.x, 0, 5, p.topH);
  ctx.fillStyle = '#1a9928';
  ctx.fillRect(p.x + PIPE_WIDTH - 4, 0, 4, p.topH);
  ctx.fillStyle = '#2ecc40';
  ctx.fillRect(p.x - capOverhang, p.topH - capH, PIPE_WIDTH + capOverhang * 2, capH);
  ctx.fillStyle = '#5eef70';
  ctx.fillRect(p.x - capOverhang, p.topH - capH, 5, capH);
  ctx.fillStyle = '#2ecc40';
  ctx.fillRect(p.x, bottomY, PIPE_WIDTH, H - bottomY);
  ctx.fillStyle = '#5eef70';
  ctx.fillRect(p.x, bottomY, 5, H - bottomY);
  ctx.fillStyle = '#1a9928';
  ctx.fillRect(p.x + PIPE_WIDTH - 4, bottomY, 4, H - bottomY);
  ctx.fillStyle = '#2ecc40';
  ctx.fillRect(p.x - capOverhang, bottomY, PIPE_WIDTH + capOverhang * 2, capH);
  ctx.fillStyle = '#5eef70';
  ctx.fillRect(p.x - capOverhang, bottomY, 5, capH);
}

function drawBird(ctx, bird, colors) {
  ctx.save();
  ctx.translate(bird.x, bird.y);
  ctx.rotate(Math.min(Math.max(bird.vy * 3, -30), 70) * (Math.PI / 180));
  ctx.fillStyle = colors.wing;
  ctx.beginPath();
  ctx.ellipse(-4, bird.flapFrame > 0 ? -8 : 4, 12, 7, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = colors.body;
  ctx.beginPath();
  ctx.ellipse(0, 0, BIRD_RADIUS + 4, BIRD_RADIUS, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'white';
  ctx.beginPath();
  ctx.arc(10, -6, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.arc(12, -5, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = colors.beak;
  ctx.beginPath();
  ctx.moveTo(18, -2); ctx.lineTo(28, 3); ctx.lineTo(18, 8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawGhost(ctx, bird, colors) {
  ctx.save();
  ctx.globalAlpha = 0.25;
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
