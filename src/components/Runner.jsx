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

const P1_COLOR = '#4dc9f6';
const P2_COLOR = '#c084fc';

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

function draw(ctx, s, mp, role) {
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#1a1a2e');
  grad.addColorStop(1, '#16213e');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  const roadLeft = W / 2 - 110, roadRight = W / 2 + 110;
  ctx.fillStyle = '#2a2a4a';
  ctx.fillRect(roadLeft, 0, roadRight - roadLeft, H);

  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(roadLeft, 0); ctx.lineTo(roadLeft, H);
  ctx.moveTo(roadRight, 0); ctx.lineTo(roadRight, H);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.setLineDash([20, 15]);
  ctx.lineDashOffset = s.animOffset % 35;
  ctx.beginPath();
  ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  for (let i = 0; i < 8; i++) {
    const markY = ((i * 90 + s.animOffset) % (H + 40)) - 20;
    ctx.fillRect(roadLeft + 5, markY, 8, 30);
    ctx.fillRect(roadRight - 13, markY, 8, 30);
  }

  for (const ob of s.obstacles) drawObstacle(ctx, LANE_X[ob.lane], ob.y);

  if (s.p1.alive) drawPlayer(ctx, s.p1.x, PLAYER_Y_P1, s.animOffset, P1_COLOR);
  else drawGhostPlayer(ctx, s.p1.x, PLAYER_Y_P1, s.animOffset, P1_COLOR);

  if (mp && s.p2) {
    if (s.p2.alive) drawPlayer(ctx, s.p2.x, PLAYER_Y_P2, s.animOffset, P2_COLOR);
    else drawGhostPlayer(ctx, s.p2.x, PLAYER_Y_P2, s.animOffset, P2_COLOR);
  }

  if (mp) {
    ctx.font = 'bold 36px system-ui, sans-serif';
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 3;
    ctx.textAlign = 'left';
    ctx.fillStyle = P1_COLOR;
    ctx.strokeText(s.p1.score, 20, 60);
    ctx.fillText(s.p1.score, 20, 60);
    ctx.textAlign = 'right';
    ctx.fillStyle = P2_COLOR;
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
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 3;
    ctx.font = 'bold 48px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.strokeText(s.p1.score, W / 2, 65);
    ctx.fillText(s.p1.score, W / 2, 65);
  }

  if (s.gameState === 'waiting') {
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'white';
    ctx.font = 'bold 36px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Lane Runner', W / 2, H / 2 - 50);
    ctx.font = '18px system-ui, sans-serif';
    ctx.globalAlpha = 0.8;
    ctx.fillText(mp ? 'Move your head to dodge!' : 'Move your head left or right!', W / 2, H / 2 - 10);
    ctx.font = '14px system-ui, sans-serif';
    ctx.globalAlpha = 0.5;
    ctx.fillText(mp ? 'Each player on their own device' : '(or press Left / Right)', W / 2, H / 2 + 20);
    ctx.globalAlpha = 1;
  }

  if (s.gameState === 'dead' || s.gameState === 'restart') {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'white';
    ctx.font = 'bold 42px system-ui, sans-serif';
    ctx.textAlign = 'center';
    if (mp) {
      const p1s = s.p1.score, p2s = s.p2?.score || 0;
      const youWon = (role === 'host' && p1s > p2s) || (role === 'guest' && p2s > p1s);
      const youLost = (role === 'host' && p2s > p1s) || (role === 'guest' && p1s > p2s);
      if (youWon) { ctx.fillStyle = '#4cd964'; ctx.fillText('You Win!', W / 2, H / 2 - 40); }
      else if (youLost) { ctx.fillStyle = '#e74c3c'; ctx.fillText('You Lose!', W / 2, H / 2 - 40); }
      else { ctx.fillText('Tie!', W / 2, H / 2 - 40); }
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
    if (s.gameState === 'restart') ctx.fillText('Move to restart', W / 2, H / 2 + 70);
    ctx.globalAlpha = 1;
  }
}

function drawPlayer(ctx, x, y, animOffset, color) {
  ctx.save();
  ctx.translate(x, y);
  const bob = Math.sin(animOffset * 0.15) * 2;
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.ellipse(0, bob, 14, 18, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = color === P1_COLOR ? '#5ee' : '#d8b4fe';
  ctx.beginPath(); ctx.arc(0, -20 + bob, 10, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1a1a2e';
  ctx.beginPath(); ctx.arc(-3, -21 + bob, 2, 0, Math.PI * 2); ctx.arc(3, -21 + bob, 2, 0, Math.PI * 2); ctx.fill();
  const legAngle = Math.sin(animOffset * 0.15) * 0.5;
  ctx.strokeStyle = color; ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-3, 14 + bob); ctx.lineTo(-3 - Math.sin(legAngle) * 8, 28 + bob);
  ctx.moveTo(3, 14 + bob); ctx.lineTo(3 + Math.sin(legAngle) * 8, 28 + bob);
  ctx.stroke();
  ctx.restore();
}

function drawGhostPlayer(ctx, x, y, animOffset, color) {
  ctx.save(); ctx.globalAlpha = 0.25;
  drawPlayer(ctx, x, y, animOffset, color);
  ctx.restore();
}

function drawObstacle(ctx, x, y) {
  ctx.fillStyle = '#e74c3c';
  ctx.beginPath();
  ctx.moveTo(x, y - 22); ctx.lineTo(x + 14, y - 8); ctx.lineTo(x + 22, y - 20);
  ctx.lineTo(x + 20, y + 5); ctx.lineTo(x + 12, y + 22); ctx.lineTo(x - 5, y + 18);
  ctx.lineTo(x - 18, y + 22); ctx.lineTo(x - 22, y + 2); ctx.lineTo(x - 20, y - 16);
  ctx.lineTo(x - 8, y - 6); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ff6b6b';
  ctx.beginPath();
  ctx.moveTo(x - 5, y - 15); ctx.lineTo(x + 8, y - 5); ctx.lineTo(x, y + 5);
  ctx.lineTo(x - 10, y - 3); ctx.closePath(); ctx.fill();
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
