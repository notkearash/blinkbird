import { useRef, useEffect, useCallback } from 'react';

const W = 400;
const H = 600;

/* ---- riso-zine theme ---- */
const INK    = '#181410';
const PAPER  = '#f4ead5';
const PINK   = '#ff3a86';
const BLUE   = '#1f3df0';
const YELLOW = '#ffd83a';
const GREEN  = '#1aa672';
const DISPLAY_FONT = '"Bricolage Grotesque", system-ui, sans-serif';
const SERIF_FONT   = '"Newsreader", "Times New Roman", serif';
const MONO_FONT    = '"JetBrains Mono", ui-monospace, monospace';

/* ---- arena layout (2D first-person) ---- */
const OPP_CX = W / 2;
const OPP_CY = 240;
const OPP_HEAD_R = 46;
const OPP_BODY_W = 150;
const OPP_BODY_H = 130;

// Player gloves rest near the bottom, swing to wherever the hand points.
const GLOVE_R = 36;
const GLOVE_REST_Y = 520;
const GLOVE_RAISED_Y = 200;

// Glove tracking — convert normalized hand coords to canvas space, lerped.
const GLOVE_LERP = 0.45;
const HAND_AMP_X = 1.2;     // amplifies horizontal motion across the canvas

// Punch trigger — speed-based. We track per-hand canvas-space velocity and
// fire a punch when it spikes (and we're not already in cooldown / animating).
const PUNCH_SPEED_THRESHOLD = 38; // pixels/frame at 60Hz
const PUNCH_COOLDOWN_MS = 320;
const PUNCH_ANIM_MS = 260;        // total out-and-back duration

// Dodge — continuous head delta from the face hook. Larger than swipe
// threshold (Runner uses 0.035) since we want a held lean, not a flick.
const DODGE_THRESHOLD = 0.045;

// HP & damage.
const MAX_HP = 100;
const PLAYER_HEAD_DMG = 14;
const PLAYER_BODY_DMG = 8;
const OPP_DMG = 12;

// AI cadence (ms). Idle gap shrinks as the round drags on.
const AI_IDLE_BASE = 1300;
const AI_IDLE_FLOOR = 500;
const AI_RAMP_PER_SEC = 18;
const AI_WINDUP_MS = 320;
const AI_STRIKE_MS = 220;
const AI_RECOVER_MS = 320;

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

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
  const cw = 300, ch = 220, cx = (W - cw) / 2, cy = (H - ch) / 2 - 10;
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

function makeGlove(restX) {
  return {
    x: restX,
    y: GLOVE_REST_Y,
    targetX: restX,
    targetY: GLOVE_REST_Y,
    lastTargetX: restX,
    lastTargetY: GLOVE_REST_Y,
    punchT: 0,            // 0..1 progress while extending
    punchStart: 0,        // timestamp of current punch
    punchHit: false,      // whether the current punch has registered a hit
    cooldownUntil: 0,
  };
}

function initState() {
  return {
    gameState: 'waiting',
    pHp: MAX_HP,
    oHp: MAX_HP,
    gloves: {
      left: makeGlove(W * 0.28),
      right: makeGlove(W * 0.72),
    },
    opponent: {
      state: 'idle',
      stateUntil: 0,
      strikeSide: null,    // 'left' | 'right' | 'center'
      strikeImpactAt: 0,   // timestamp when this strike checks for hit
      strikeChecked: false,
      headX: 0,
      hitFlash: 0,
      bobT: 0,
    },
    headDelta: 0,
    handsSeenFrames: 0,
    restartFrames: 0,
    roundStart: 0,
    deadAt: 0,
  };
}

function Boxing({ getHands, getHeadX, gameState, setGameState, videoRef, onBack, handReady, faceReady }) {
  const canvasRef = useRef(null);
  const stateRef = useRef(null);
  // eslint-disable-next-line react-hooks/refs
  if (!stateRef.current) stateRef.current = initState();

  const restart = useCallback(() => {
    stateRef.current = initState();
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
          s.roundStart = performance.now();
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
      const now = performance.now();
      const hands = getHands?.() ?? { left: null, right: null };
      const headX = getHeadX?.() ?? 0;
      s.headDelta = headX;

      const anyHand = !!(hands.left || hands.right);

      updateGloveTarget(s.gloves.left,  hands.left,  W * 0.28);
      updateGloveTarget(s.gloves.right, hands.right, W * 0.72);

      if (anyHand) s.handsSeenFrames++;
      else s.handsSeenFrames = 0;

      if (s.gameState === 'waiting' && s.handsSeenFrames > 30) {
        s.gameState = 'playing';
        s.roundStart = now;
        setGameState('playing');
      }

      if (s.gameState === 'restart') {
        if (anyHand) s.restartFrames++;
        else s.restartFrames = 0;
        if (s.restartFrames > 25) {
          stateRef.current = initState();
          stateRef.current.gameState = 'playing';
          stateRef.current.roundStart = now;
          setGameState('playing');
          // continue with fresh ref
        }
      }

      if (s.gameState === 'playing') {
        runPlayerPunches(s, now);
        runOpponent(s, now);
        checkLoss(s, now, setGameState);
      }

      draw(ctx, s, anyHand, handReady, faceReady, now);
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [getHands, getHeadX, setGameState, handReady, faceReady]);

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

/* ----- update helpers ----- */

function updateGloveTarget(g, hand, restX) {
  if (hand) {
    // Mirror x so user's right hand drives the right glove.
    const nx = 1 - hand.x;
    const ny = hand.y;
    // Spread horizontal motion past the resting columns by amplifying
    // around the canvas center.
    const screenX = clamp(W / 2 + (nx - 0.5) * W * HAND_AMP_X, GLOVE_R, W - GLOVE_R);
    const screenY = GLOVE_REST_Y + (GLOVE_RAISED_Y - GLOVE_REST_Y) * clamp(1 - ny, 0, 1);
    g.lastTargetX = g.targetX;
    g.lastTargetY = g.targetY;
    g.targetX = screenX;
    g.targetY = screenY;
  } else {
    // Drift back to rest when the hand isn't visible.
    g.lastTargetX = g.targetX;
    g.lastTargetY = g.targetY;
    g.targetX += (restX - g.targetX) * 0.04;
    g.targetY += (GLOVE_REST_Y - g.targetY) * 0.04;
  }
  g.x += (g.targetX - g.x) * GLOVE_LERP;
  g.y += (g.targetY - g.y) * GLOVE_LERP;
}

function runPlayerPunches(s, now) {
  for (const side of ['left', 'right']) {
    const g = s.gloves[side];
    // Active punch animation in progress?
    if (g.punchT > 0) {
      const t = (now - g.punchStart) / PUNCH_ANIM_MS;
      if (t >= 1) {
        g.punchT = 0;
        g.punchHit = false;
      } else {
        g.punchT = t;
        // Around the apex, register a hit if the glove overlaps the opponent.
        if (!g.punchHit && t > 0.35 && t < 0.65) {
          tryPlayerHit(s, g, side);
        }
      }
      continue;
    }

    if (now < g.cooldownUntil) continue;

    const dx = g.targetX - g.lastTargetX;
    const dy = g.targetY - g.lastTargetY;
    const speed = Math.sqrt(dx * dx + dy * dy);
    // Require some upward / forward motion to cut down false positives from
    // resting drift.
    const movingForward = dy < -1.5 || speed > PUNCH_SPEED_THRESHOLD;
    if (speed > PUNCH_SPEED_THRESHOLD && movingForward) {
      g.punchT = 0.001;
      g.punchStart = now;
      g.punchHit = false;
      g.cooldownUntil = now + PUNCH_COOLDOWN_MS;
    }
  }
}

function tryPlayerHit(s, g, side) {
  // Project the glove forward toward the opponent at punch apex so the
  // collision check uses the extended position rather than the resting one.
  const projX = g.x + (OPP_CX - g.x) * 0.55;
  const projY = g.y + (OPP_CY - g.y) * 0.55;

  const headDx = projX - OPP_CX - s.opponent.headX * 30;
  const headDy = projY - (OPP_CY - 70);
  const headHit = Math.sqrt(headDx * headDx + headDy * headDy) < OPP_HEAD_R + GLOVE_R * 0.4;

  const bodyLeft = OPP_CX - OPP_BODY_W / 2;
  const bodyTop = OPP_CY - OPP_BODY_H / 2;
  const bodyHit =
    projX > bodyLeft && projX < bodyLeft + OPP_BODY_W &&
    projY > bodyTop  && projY < bodyTop + OPP_BODY_H;

  // Opponent is "blocking" during recover/idle bob — body hits still register
  // but for simplicity we treat the windup/strike windows as fully exposed.
  if (headHit) {
    s.oHp = Math.max(0, s.oHp - PLAYER_HEAD_DMG);
    s.opponent.hitFlash = 14;
    g.punchHit = true;
  } else if (bodyHit) {
    s.oHp = Math.max(0, s.oHp - PLAYER_BODY_DMG);
    s.opponent.hitFlash = 8;
    g.punchHit = true;
  }
  // Avoid unused-param warning while keeping the side argument for future
  // L/R-specific damage tuning.
  void side;
}

function pickStrikeSide() {
  const r = Math.random();
  if (r < 0.4) return 'left';
  if (r < 0.8) return 'right';
  return 'center';
}

function runOpponent(s, now) {
  const o = s.opponent;
  o.bobT = (o.bobT + 0.04) % (Math.PI * 2);

  if (o.state === 'idle' && now >= o.stateUntil) {
    o.state = 'windup';
    o.stateUntil = now + AI_WINDUP_MS;
    o.strikeSide = pickStrikeSide();
    o.strikeChecked = false;
  } else if (o.state === 'windup' && now >= o.stateUntil) {
    o.state = 'strike';
    o.stateUntil = now + AI_STRIKE_MS;
    o.strikeImpactAt = now + AI_STRIKE_MS * 0.35;
    o.strikeChecked = false;
  } else if (o.state === 'strike') {
    if (!o.strikeChecked && now >= o.strikeImpactAt) {
      o.strikeChecked = true;
      // Resolve the hit. Player dodges if leaning to the side opposite
      // the incoming punch. headDelta > 0 == leaning user's left in mirror.
      const dodgeLeft  = s.headDelta >  DODGE_THRESHOLD;
      const dodgeRight = s.headDelta < -DODGE_THRESHOLD;
      let dodged = false;
      if (o.strikeSide === 'left'  && dodgeRight) dodged = true;
      if (o.strikeSide === 'right' && dodgeLeft)  dodged = true;
      // Center punches need any meaningful lean to dodge.
      if (o.strikeSide === 'center' && Math.abs(s.headDelta) > DODGE_THRESHOLD * 1.3) dodged = true;

      if (!dodged) {
        s.pHp = Math.max(0, s.pHp - OPP_DMG);
      }
    }
    if (now >= o.stateUntil) {
      o.state = 'recover';
      o.stateUntil = now + AI_RECOVER_MS;
    }
  } else if (o.state === 'recover' && now >= o.stateUntil) {
    o.state = 'idle';
    const elapsedSec = (now - s.roundStart) / 1000;
    const idleMs = Math.max(AI_IDLE_FLOOR, AI_IDLE_BASE - elapsedSec * AI_RAMP_PER_SEC);
    o.stateUntil = now + idleMs * (0.7 + Math.random() * 0.6);
  }

  if (o.hitFlash > 0) o.hitFlash--;
}

function checkLoss(s, now, setGameState) {
  if (s.pHp <= 0 || s.oHp <= 0) {
    s.gameState = 'dead';
    s.deadAt = now;
    setGameState('dead');
    setTimeout(() => {
      if (s.gameState === 'dead') {
        s.gameState = 'restart';
        s.restartFrames = 0;
      }
    }, 900);
  }
}

/* ----- drawing ----- */

function draw(ctx, s, anyHand, handReady, faceReady, now) {
  // Background — paper with a faint blue halftone wash and a vignette ring.
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  dotGrid(ctx, 0, 0, W, H, 'rgba(31, 61, 240, 0.07)', 6, 1.1);

  drawArena(ctx);
  drawOpponent(ctx, s.opponent, now);
  drawHpBars(ctx, s.pHp, s.oHp);
  drawGlove(ctx, s.gloves.left,  'left');
  drawGlove(ctx, s.gloves.right, 'right');
  drawTrackingHud(ctx, anyHand, s.headDelta);

  if (s.gameState === 'waiting') drawWaiting(ctx, handReady, faceReady);
  else if (s.gameState === 'dead' || s.gameState === 'restart') drawGameOver(ctx, s);
}

function drawArena(ctx) {
  // Floor halftone band
  const floorY = 470;
  ctx.fillStyle = '#1a1610';
  ctx.fillRect(0, floorY, W, H - floorY);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, floorY, W, H - floorY);
  ctx.clip();
  dotGrid(ctx, 0, floorY, W, H - floorY, 'rgba(244, 234, 213, 0.16)', 6, 1.2);
  ctx.restore();

  // Floor edge highlight
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, floorY);
  ctx.lineTo(W, floorY);
  ctx.stroke();

  // Ring rope (single decorative line above floor).
  ctx.strokeStyle = PINK;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, floorY - 4);
  ctx.lineTo(W, floorY - 4);
  ctx.stroke();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(0, floorY - 4);
  ctx.lineTo(W, floorY - 4);
  ctx.stroke();
}

function drawOpponent(ctx, o, now) {
  const bob = Math.sin(o.bobT) * 4;
  let leanX = o.headX * 30;
  let armOutLeft = 0;
  let armOutRight = 0;
  let armOutCenter = 0;
  const flashing = o.hitFlash > 0;

  if (o.state === 'windup') {
    // Pull glove back & telegraph the side
    const t = clamp(1 - (o.stateUntil - now) / AI_WINDUP_MS, 0, 1);
    if (o.strikeSide === 'left') armOutLeft = -t * 22;
    if (o.strikeSide === 'right') armOutRight = -t * 22;
    if (o.strikeSide === 'center') armOutCenter = -t * 18;
  } else if (o.state === 'strike') {
    const t = clamp(1 - (o.stateUntil - now) / AI_STRIKE_MS, 0, 1);
    const peak = Math.sin(t * Math.PI);
    if (o.strikeSide === 'left') armOutLeft = peak * 130;
    if (o.strikeSide === 'right') armOutRight = peak * 130;
    if (o.strikeSide === 'center') armOutCenter = peak * 130;
  }

  // Body
  const bodyX = OPP_CX - OPP_BODY_W / 2;
  const bodyY = OPP_CY - OPP_BODY_H / 2 + bob;
  ctx.save();
  ctx.fillStyle = INK;
  roundRect(ctx, bodyX + 4, bodyY + 6, OPP_BODY_W, OPP_BODY_H, 18);
  ctx.fill();
  ctx.fillStyle = flashing ? YELLOW : BLUE;
  roundRect(ctx, bodyX, bodyY, OPP_BODY_W, OPP_BODY_H, 18);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = INK;
  ctx.stroke();
  // halftone in the body
  ctx.save();
  roundRect(ctx, bodyX, bodyY, OPP_BODY_W, OPP_BODY_H, 18);
  ctx.clip();
  dotGrid(ctx, bodyX, bodyY, OPP_BODY_W, OPP_BODY_H, 'rgba(244, 234, 213, 0.32)', 6, 1.3);
  ctx.restore();
  // belt
  ctx.fillStyle = YELLOW;
  ctx.fillRect(bodyX, bodyY + OPP_BODY_H - 14, OPP_BODY_W, 8);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = INK;
  ctx.strokeRect(bodyX, bodyY + OPP_BODY_H - 14, OPP_BODY_W, 8);
  ctx.restore();

  // Telegraph stripes on the wind-up side
  if (o.state === 'windup') {
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = YELLOW;
    if (o.strikeSide === 'left') ctx.fillRect(bodyX - 8, bodyY + 16, 6, OPP_BODY_H - 32);
    if (o.strikeSide === 'right') ctx.fillRect(bodyX + OPP_BODY_W + 2, bodyY + 16, 6, OPP_BODY_H - 32);
    if (o.strikeSide === 'center') ctx.fillRect(OPP_CX - 3, bodyY - 10, 6, 10);
    ctx.restore();
  }

  // Head
  const headY = OPP_CY - 70 + bob * 0.6;
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(OPP_CX + leanX + 3, headY + 4, OPP_HEAD_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = flashing ? YELLOW : '#e8d4a4';
  ctx.beginPath();
  ctx.arc(OPP_CX + leanX, headY, OPP_HEAD_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = INK;
  ctx.stroke();
  // Eyes — angry slits
  ctx.fillStyle = INK;
  ctx.fillRect(OPP_CX + leanX - 18, headY - 6, 10, 3);
  ctx.fillRect(OPP_CX + leanX +  8, headY - 6, 10, 3);
  // Mouthguard line
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(OPP_CX + leanX - 12, headY + 14);
  ctx.lineTo(OPP_CX + leanX + 12, headY + 14);
  ctx.stroke();

  // Opponent gloves — chest height when idle, swing forward on strike
  const oGloveR = 22;
  const baseGloveY = bodyY + 30;
  const leftGloveX  = bodyX + 18;
  const rightGloveX = bodyX + OPP_BODY_W - 18;
  const centerGloveX = OPP_CX;

  drawOppGlove(ctx, leftGloveX,  baseGloveY + armOutLeft  * 0.2, oGloveR, armOutLeft  > 12 ? PINK : INK);
  drawOppGlove(ctx, rightGloveX, baseGloveY + armOutRight * 0.2, oGloveR, armOutRight > 12 ? PINK : INK);
  if (armOutCenter > 12) {
    drawOppGlove(ctx, centerGloveX, baseGloveY - 10 + armOutCenter * 0.2, oGloveR + 2, PINK);
  }
}

function drawOppGlove(ctx, cx, cy, r, color) {
  ctx.save();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(cx + 2, cy + 3, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = INK;
  ctx.stroke();
  // strap
  ctx.fillStyle = PAPER;
  ctx.fillRect(cx - r * 0.55, cy + r * 0.55, r * 1.1, 4);
  ctx.lineWidth = 1;
  ctx.strokeRect(cx - r * 0.55, cy + r * 0.55, r * 1.1, 4);
  ctx.restore();
}

function drawGlove(ctx, g, side) {
  // Punch animation: scale up & shift toward opponent at apex.
  const t = g.punchT;
  const extend = t > 0 ? Math.sin(t * Math.PI) : 0; // 0..1..0
  const scale = 1 + extend * 0.35;

  const dx = OPP_CX - g.x;
  const dy = OPP_CY - g.y;
  const len = Math.max(1, Math.sqrt(dx * dx + dy * dy));
  const cx = g.x + (dx / len) * extend * 60;
  const cy = g.y + (dy / len) * extend * 60;

  const r = GLOVE_R * scale;
  const color = side === 'left' ? PINK : BLUE;

  // Drop shadow
  ctx.fillStyle = 'rgba(24, 20, 16, 0.45)';
  ctx.beginPath();
  ctx.ellipse(cx + 4, cy + 8, r * 0.95, r * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Glove body
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = INK;
  ctx.stroke();

  // halftone shading
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  dotGrid(ctx, cx - r, cy - r, r * 2, r * 2, 'rgba(244, 234, 213, 0.45)', 5, 1.2);
  ctx.restore();

  // thumb knob
  const tx = cx + (side === 'left' ? r * 0.7 : -r * 0.7);
  const ty = cy + r * 0.05;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(tx, ty, r * 0.32, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = INK;
  ctx.stroke();

  // strap stripe
  ctx.save();
  ctx.fillStyle = PAPER;
  ctx.translate(cx, cy + r * 0.55);
  roundRect(ctx, -r * 0.7, -3, r * 1.4, 6, 2);
  ctx.fill();
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.restore();
}

function drawHpBars(ctx, pHp, oHp) {
  drawHpBar(ctx, 14, 14, 168, 'you', pHp, PINK, false);
  drawHpBar(ctx, W - 14 - 168, 14, 168, 'cpu', oHp, BLUE, true);
}

function drawHpBar(ctx, x, y, w, label, hp, color, rightAligned) {
  const h = 18;
  // shadow + plate
  ctx.fillStyle = INK;
  roundRect(ctx, x + 3, y + 3, w, h, 5);
  ctx.fill();
  ctx.fillStyle = PAPER;
  roundRect(ctx, x, y, w, h, 5);
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = INK;
  ctx.stroke();

  // fill
  const pct = clamp(hp / MAX_HP, 0, 1);
  ctx.save();
  roundRect(ctx, x, y, w, h, 5);
  ctx.clip();
  ctx.fillStyle = color;
  if (rightAligned) {
    ctx.fillRect(x + w - w * pct, y, w * pct, h);
  } else {
    ctx.fillRect(x, y, w * pct, h);
  }
  ctx.restore();

  ctx.lineWidth = 1.5;
  ctx.strokeStyle = INK;
  roundRect(ctx, x, y, w, h, 5);
  ctx.stroke();

  ctx.fillStyle = INK;
  ctx.font = `700 11px ${MONO_FONT}`;
  ctx.textAlign = rightAligned ? 'right' : 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(label, rightAligned ? x + w : x, y + h + 4);
  ctx.textAlign = rightAligned ? 'left' : 'right';
  ctx.fillText(`${hp}`, rightAligned ? x : x + w, y + h + 4);
}

function drawTrackingHud(ctx, anyHand, headDelta) {
  ctx.save();
  ctx.font = `500 10px ${MONO_FONT}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = anyHand ? PINK : 'rgba(244,234,213,0.55)';
  ctx.beginPath();
  ctx.arc(W - 22, H - 22, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = anyHand ? PAPER : 'rgba(244,234,213,0.55)';
  ctx.fillText(anyHand ? 'hands · ok' : 'no hands', W - 32, H - 18);

  // Head lean indicator
  ctx.fillStyle = Math.abs(headDelta) > 0.045 ? GREEN : 'rgba(244,234,213,0.55)';
  ctx.fillText(
    headDelta > 0.045 ? 'slip · left'
    : headDelta < -0.045 ? 'slip · right'
    : 'head · steady',
    W - 32, H - 32
  );
  ctx.restore();
}

function drawWaiting(ctx, handReady, faceReady) {
  drawCardOverlay(ctx);
  ctx.textAlign = 'center';
  ctx.fillStyle = INK;
  ctx.font = `800 42px ${DISPLAY_FONT}`;
  ctx.fillText('boxing', W / 2, H / 2 - 60);

  ctx.save();
  ctx.translate(W / 2, H / 2 - 24);
  ctx.rotate(-0.04);
  const stamp = (handReady && faceReady)
    ? 'raise both hands'
    : !handReady
      ? 'loading hand model…'
      : 'loading face model…';
  ctx.font = `700 16px ${DISPLAY_FONT}`;
  const sw = ctx.measureText(stamp).width + 24;
  roundRect(ctx, -sw / 2, -16, sw, 26, 4);
  ctx.fillStyle = PINK;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fillStyle = PAPER;
  ctx.fillText(stamp, 0, 4);
  ctx.restore();

  ctx.font = `italic 500 14px ${SERIF_FONT}`;
  ctx.fillStyle = INK;
  ctx.globalAlpha = 0.7;
  ctx.fillText('thrust forward to punch', W / 2, H / 2 + 20);
  ctx.fillText('lean your head to slip', W / 2, H / 2 + 40);
  ctx.fillText('(or press space)', W / 2, H / 2 + 62);
  ctx.globalAlpha = 1;
}

function drawGameOver(ctx, s) {
  drawCardOverlay(ctx);
  ctx.textAlign = 'center';
  const won = s.oHp <= 0 && s.pHp > 0;
  ctx.font = `800 48px ${DISPLAY_FONT}`;
  ctx.fillStyle = INK;
  ctx.fillText(won ? 'k.o.' : 'down', W / 2, H / 2 - 36);

  ctx.font = `800 22px ${DISPLAY_FONT}`;
  ctx.fillStyle = won ? GREEN : PINK;
  ctx.fillText(won ? 'you won' : 'cpu won', W / 2, H / 2);

  ctx.font = `500 13px ${MONO_FONT}`;
  ctx.fillStyle = INK;
  ctx.globalAlpha = 0.7;
  ctx.fillText(`you ${s.pHp}  ·  cpu ${s.oHp}`, W / 2, H / 2 + 32);
  if (s.gameState === 'restart') {
    ctx.font = `italic 500 14px ${SERIF_FONT}`;
    ctx.fillText('raise both hands to fight again', W / 2, H / 2 + 60);
  }
  ctx.globalAlpha = 1;
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

export default Boxing;
