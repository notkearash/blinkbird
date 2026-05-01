import { useEffect, useRef, useState, useCallback } from 'react';
import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

// Landmark 9 = middle-finger MCP — sits roughly at the palm center.
const PALM_LM = 9;

export function useHandTracking(videoRef, enabled = true) {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState(null);

  const landmarkerRef = useRef(null);
  const rafRef = useRef(null);
  // Plain ref so the game loop reads without triggering React re-renders.
  const handPosRef = useRef(null);

  useEffect(() => {
    if (!enabled || landmarkerRef.current) return;
    let cancelled = false;

    async function init() {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        );
        if (cancelled) return;

        const lm = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numHands: 1,
        });
        if (cancelled) return;

        landmarkerRef.current = lm;
        setIsReady(true);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    }
    init();
    return () => { cancelled = true; };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !isReady || !videoRef.current) return;

    let lastTime = -1;

    function detect() {
      const video = videoRef.current;
      const lm = landmarkerRef.current;
      if (!video || !lm || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(detect);
        return;
      }

      const now = performance.now();
      if (now === lastTime) {
        rafRef.current = requestAnimationFrame(detect);
        return;
      }
      lastTime = now;

      const result = lm.detectForVideo(video, now);
      const hands = result.landmarks || [];
      if (hands.length > 0) {
        const palm = hands[0][PALM_LM];
        handPosRef.current = { x: palm.x, y: palm.y };
      } else {
        handPosRef.current = null;
      }

      rafRef.current = requestAnimationFrame(detect);
    }

    rafRef.current = requestAnimationFrame(detect);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [enabled, isReady, videoRef]);

  const getHandPos = useCallback(() => handPosRef.current, []);
  return { isReady, error, getHandPos };
}
