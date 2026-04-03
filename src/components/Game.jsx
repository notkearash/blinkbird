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

function Game({ setOnBlink, isTriggered, gameState, setGameState, videoRef, mode, setMode }) {
  const canvasRef = useRef(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const stateRef = useRef({
    bird: { x: 80, y: H / 2, vy: 0, flapFrame: 0 },
    pipes: [],
    score: 0,
    highScore: 0,
    lastPipeTime: 0,
    gameState: 'waiting',
  });

  const flap = useCallback(() => {
    const s = stateRef.current;
    if (s.gameState === 'dead') return;
    if (s.gameState === 'restart') {
      s.bird = { x: 80, y: H / 2, vy: 0, flapFrame: 0 };
      s.pipes = [];
      s.score = 0;
      s.lastPipeTime = 0;
      s.gameState = 'waiting';
      setGameState('waiting');
    }
    if (s.gameState === 'waiting') {
      s.gameState = 'playing';
      setGameState('playing');
    }
    s.bird.vy = FLAP_STRENGTH;
    s.bird.flapFrame = 8;
  }, [setGameState]);

  useEffect(() => {
    setOnBlink(flap);
  }, [setOnBlink, flap]);

  useEffect(() => {
    function onKey(e) {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault();
        flap();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flap]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let raf;

    function loop() {
      const s = stateRef.current;
      update(s);
      draw(ctx, s, modeRef.current);
      raf = requestAnimationFrame(loop);
    }

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    stateRef.current.gameState = gameState;
  }, [gameState]);

  return (
    <div className="game-container">
      <canvas ref={canvasRef} width={W} height={H} />
      <div className="mode-toggle">
        <button
          className={mode === 'blink' ? 'active' : ''}
          onClick={() => setMode('blink')}
        >
          Blink
        </button>
        <button
          className={mode === 'tongue' ? 'active' : ''}
          onClick={() => setMode('tongue')}
        >
          Tongue
        </button>
      </div>
      <PipVideo videoRef={videoRef} isTriggered={isTriggered} />
    </div>
  );
}

function update(s) {
  if (s.gameState === 'waiting') {
    s.bird.y = H / 2 + Math.sin(Date.now() / 300) * 12;
    return;
  }
  if (s.gameState !== 'playing') return;

  s.bird.vy += GRAVITY;
  s.bird.y += s.bird.vy;
  if (s.bird.flapFrame > 0) s.bird.flapFrame--;

  const now = Date.now();
  if (now - s.lastPipeTime > PIPE_INTERVAL) {
    const minTop = 60;
    const maxTop = H - GROUND_H - PIPE_GAP - 60;
    const topH = minTop + Math.random() * (maxTop - minTop);
    s.pipes.push({ x: W, topH, scored: false });
    s.lastPipeTime = now;
  }

  for (let i = s.pipes.length - 1; i >= 0; i--) {
    s.pipes[i].x -= PIPE_SPEED;
    if (s.pipes[i].x + PIPE_WIDTH < 0) {
      s.pipes.splice(i, 1);
      continue;
    }
    if (!s.pipes[i].scored && s.pipes[i].x + PIPE_WIDTH < s.bird.x) {
      s.pipes[i].scored = true;
      s.score++;
    }
  }

  const { x, y } = s.bird;
  const r = BIRD_RADIUS;
  if (y + r > H - GROUND_H || y - r < 0) {
    die(s);
    return;
  }
  for (const p of s.pipes) {
    const bottomY = p.topH + PIPE_GAP;
    if (x + r > p.x && x - r < p.x + PIPE_WIDTH) {
      if (y - r < p.topH || y + r > bottomY) {
        die(s);
        return;
      }
    }
  }
}

function die(s) {
  s.gameState = 'dead';
  if (s.score > s.highScore) s.highScore = s.score;
  setTimeout(() => {
    s.gameState = 'restart';
  }, 600);
}

function draw(ctx, s, mode) {
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

  drawBird(ctx, s.bird);

  ctx.fillStyle = 'white';
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 4;
  ctx.font = 'bold 48px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.strokeText(s.score, W / 2, 65);
  ctx.fillText(s.score, W / 2, 65);

  const actionWord = mode === 'tongue' ? 'Tongue out' : 'Blink';

  if (s.gameState === 'waiting') {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'white';
    ctx.font = 'bold 42px system-ui, sans-serif';
    ctx.fillText('BlinkBird', W / 2, H / 2 - 60);
    ctx.font = '18px system-ui, sans-serif';
    ctx.globalAlpha = 0.8;
    ctx.fillText(`${actionWord} to fly!`, W / 2, H / 2 - 20);
    ctx.font = '14px system-ui, sans-serif';
    ctx.globalAlpha = 0.5;
    ctx.fillText('(or press Space)', W / 2, H / 2 + 10);
    ctx.globalAlpha = 1;
  }

  if (s.gameState === 'dead' || s.gameState === 'restart') {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'white';
    ctx.font = 'bold 42px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Game Over', W / 2, H / 2 - 40);
    ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.fillText(s.score, W / 2, H / 2 + 10);
    ctx.font = '16px system-ui, sans-serif';
    ctx.globalAlpha = 0.6;
    ctx.fillText(`Best: ${s.highScore}`, W / 2, H / 2 + 40);
    if (s.gameState === 'restart') {
      ctx.fillText(`${actionWord} or Space to restart`, W / 2, H / 2 + 70);
    }
    ctx.globalAlpha = 1;
  }
}

function drawPipe(ctx, p) {
  const bottomY = p.topH + PIPE_GAP;
  const capH = 20;
  const capOverhang = 4;

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

function drawBird(ctx, bird) {
  ctx.save();
  ctx.translate(bird.x, bird.y);
  const angle = Math.min(Math.max(bird.vy * 3, -30), 70) * (Math.PI / 180);
  ctx.rotate(angle);

  ctx.fillStyle = '#e6a817';
  const wingY = bird.flapFrame > 0 ? -8 : 4;
  ctx.beginPath();
  ctx.ellipse(-4, wingY, 12, 7, -0.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#f5c542';
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

  ctx.fillStyle = '#e85d04';
  ctx.beginPath();
  ctx.moveTo(18, -2);
  ctx.lineTo(28, 3);
  ctx.lineTo(18, 8);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function PipVideo({ videoRef, isTriggered }) {
  const pipRef = useRef(null);

  useEffect(() => {
    const el = pipRef.current;
    const src = videoRef.current;
    if (!el || !src) return;

    function tryAttach() {
      if (src.srcObject) {
        el.srcObject = src.srcObject;
      }
    }

    tryAttach();
    src.addEventListener('loadeddata', tryAttach);
    return () => src.removeEventListener('loadeddata', tryAttach);
  }, [videoRef]);

  return (
    <div className="webcam-pip">
      <video ref={pipRef} autoPlay playsInline muted />
      <div className={`pip-blink-dot ${isTriggered ? 'active' : ''}`} />
    </div>
  );
}

export default Game;
