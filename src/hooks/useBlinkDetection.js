import { useEffect, useRef, useState, useCallback } from 'react';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

const LEFT_EYE_V1 = [159, 145];
const LEFT_EYE_V2 = [160, 144];
const LEFT_EYE_V3 = [158, 153];
const LEFT_EYE_H = [33, 133];

const RIGHT_EYE_V1 = [386, 374];
const RIGHT_EYE_V2 = [387, 373];
const RIGHT_EYE_V3 = [385, 380];
const RIGHT_EYE_H = [362, 263];

const NOSE_TIP = 1;

function dist(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function eyeAspectRatio(landmarks, v1, v2, v3, h) {
  const vertical1 = dist(landmarks[v1[0]], landmarks[v1[1]]);
  const vertical2 = dist(landmarks[v2[0]], landmarks[v2[1]]);
  const vertical3 = dist(landmarks[v3[0]], landmarks[v3[1]]);
  const horizontal = dist(landmarks[h[0]], landmarks[h[1]]);
  return (vertical1 + vertical2 + vertical3) / (3.0 * horizontal);
}

const EAR_THRESHOLD = 0.24;
const JAW_THRESHOLD = 0.6;
const COOLDOWN_MS = 250;
const HEAD_SWIPE_THRESHOLD = 0.035;
const HEAD_SWIPE_COOLDOWN = 400;

function createPlayerState() {
  return {
    earSmooth: 0.35,
    tongueSmooth: 0,
    wasTriggered: false,
    cooldown: false,
    headXSmooth: 0.5,
    headXBaseline: null,
    headBaselineFrames: 0,
    headSwipeCooldown: false,
  };
}

function processPlayer(ps, lm, blendshapes, mode, onTrigger, onHeadSwipe) {
  // Blink / tongue
  let triggered = false;

  if (mode === 'blink') {
    const leftEAR = eyeAspectRatio(lm, LEFT_EYE_V1, LEFT_EYE_V2, LEFT_EYE_V3, LEFT_EYE_H);
    const rightEAR = eyeAspectRatio(lm, RIGHT_EYE_V1, RIGHT_EYE_V2, RIGHT_EYE_V3, RIGHT_EYE_H);
    const avgEAR = (leftEAR + rightEAR) / 2;
    ps.earSmooth = ps.earSmooth * 0.4 + avgEAR * 0.6;
    triggered = ps.earSmooth < EAR_THRESHOLD;
  } else if (mode === 'tongue') {
    if (blendshapes) {
      const jawOpen = blendshapes.find(b => b.categoryName === 'jawOpen');
      const score = jawOpen?.score ?? 0;
      ps.tongueSmooth = ps.tongueSmooth * 0.3 + score * 0.7;
      triggered = ps.tongueSmooth > JAW_THRESHOLD;
    }
  }

  if (triggered && !ps.wasTriggered && !ps.cooldown) {
    onTrigger?.();
    ps.cooldown = true;
    setTimeout(() => { ps.cooldown = false; }, COOLDOWN_MS);
  }
  ps.wasTriggered = triggered;

  // Head X tracking
  const noseX = lm[NOSE_TIP].x;
  ps.headXSmooth = ps.headXSmooth * 0.5 + noseX * 0.5;

  if (ps.headBaselineFrames < 30) {
    ps.headBaselineFrames++;
    ps.headXBaseline = ps.headXSmooth;
  } else if (ps.headXBaseline !== null) {
    ps.headXBaseline = ps.headXBaseline * 0.995 + ps.headXSmooth * 0.005;
    const delta = ps.headXSmooth - ps.headXBaseline;

    if (Math.abs(delta) > HEAD_SWIPE_THRESHOLD && !ps.headSwipeCooldown) {
      const direction = delta > 0 ? 'left' : 'right';
      onHeadSwipe?.(direction);
      ps.headSwipeCooldown = true;
      ps.headXBaseline = ps.headXSmooth;
      setTimeout(() => { ps.headSwipeCooldown = false; }, HEAD_SWIPE_COOLDOWN);
    }
  }

  return triggered;
}

export function useFaceDetection(videoRef, mode = 'blink', multiplayer = false) {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState(null);
  const [p1Triggered, setP1Triggered] = useState(false);
  const [p2Triggered, setP2Triggered] = useState(false);
  const [faceCount, setFaceCount] = useState(0);

  const landmarkerRef = useRef(null);
  const rafRef = useRef(null);
  const modeRef = useRef(mode);
  const multiplayerRef = useRef(multiplayer);

  const p1State = useRef(createPlayerState());
  const p2State = useRef(createPlayerState());

  const onP1TriggerRef = useRef(null);
  const onP2TriggerRef = useRef(null);
  const onP1HeadSwipeRef = useRef(null);
  const onP2HeadSwipeRef = useRef(null);

  modeRef.current = mode;
  multiplayerRef.current = multiplayer;

  const setOnBlink = useCallback((fn) => { onP1TriggerRef.current = fn; }, []);
  const setOnP2Blink = useCallback((fn) => { onP2TriggerRef.current = fn; }, []);
  const setOnHeadSwipe = useCallback((fn) => { onP1HeadSwipeRef.current = fn; }, []);
  const setOnP2HeadSwipe = useCallback((fn) => { onP2HeadSwipeRef.current = fn; }, []);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        );
        if (cancelled) return;

        const landmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numFaces: 2,
          outputFacialTransformationMatrixes: false,
          outputFaceBlendshapes: true,
        });
        if (cancelled) return;

        landmarkerRef.current = landmarker;
        setIsReady(true);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    }

    init();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!isReady || !videoRef.current) return;

    let lastTime = -1;

    function detect() {
      const video = videoRef.current;
      const landmarker = landmarkerRef.current;
      if (!video || !landmarker || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(detect);
        return;
      }

      const now = performance.now();
      if (now === lastTime) {
        rafRef.current = requestAnimationFrame(detect);
        return;
      }
      lastTime = now;

      const result = landmarker.detectForVideo(video, now);
      const faces = result.faceLandmarks || [];
      setFaceCount(faces.length);

      if (faces.length === 0) {
        rafRef.current = requestAnimationFrame(detect);
        return;
      }

      // Sort faces by nose X so left face = P1, right face = P2
      // Video is mirrored: higher X in video = user's left side
      const indexed = faces.map((lm, i) => ({ lm, i, noseX: lm[NOSE_TIP].x }));
      indexed.sort((a, b) => b.noseX - a.noseX); // descending = user's left first

      const mode = modeRef.current;
      const mp = multiplayerRef.current;

      // P1 = leftmost face (or only face)
      const f1 = indexed[0];
      const bs1 = result.faceBlendshapes?.[f1.i]?.categories;
      const t1 = processPlayer(
        p1State.current, f1.lm, bs1, mode,
        () => onP1TriggerRef.current?.(),
        (dir) => onP1HeadSwipeRef.current?.(dir)
      );
      setP1Triggered(t1);

      // P2 = rightmost face (only in multiplayer with 2+ faces)
      if (mp && indexed.length >= 2) {
        const f2 = indexed[1];
        const bs2 = result.faceBlendshapes?.[f2.i]?.categories;
        const t2 = processPlayer(
          p2State.current, f2.lm, bs2, mode,
          () => onP2TriggerRef.current?.(),
          (dir) => onP2HeadSwipeRef.current?.(dir)
        );
        setP2Triggered(t2);
      }

      rafRef.current = requestAnimationFrame(detect);
    }

    rafRef.current = requestAnimationFrame(detect);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isReady, videoRef]);

  return {
    isReady, error, faceCount,
    p1Triggered, p2Triggered,
    setOnBlink, setOnP2Blink,
    setOnHeadSwipe, setOnP2HeadSwipe,
  };
}
