import { useEffect, useRef, useState, useCallback } from 'react';
import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

// Landmark 9 = middle-finger MCP — sits roughly at the palm center.
const PALM_LM = 9;

export function useHandTracking(videoRef, enabled = true) {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState(null);

  const landmarkerRef = useRef(null);
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
    const video = videoRef.current;

    let cancelled = false;
    let rvfcHandle = null;
    let raf = null;
    let lastTs = -1;

    function process(timestampMs) {
      const lm = landmarkerRef.current;
      if (!lm || video.readyState < 2) return;
      // MediaPipe requires strictly-increasing timestamps.
      if (timestampMs <= lastTs) timestampMs = lastTs + 1;
      lastTs = timestampMs;

      const result = lm.detectForVideo(video, timestampMs);
      const hands = result.landmarks || [];
      if (hands.length > 0) {
        const palm = hands[0][PALM_LM];
        handPosRef.current = { x: palm.x, y: palm.y };
      } else {
        handPosRef.current = null;
      }
    }

    // Preferred path: per-video-frame callback. Inference runs once per real
    // camera frame, not once per screen refresh.
    function onVideoFrame(_now, metadata) {
      if (cancelled) return;
      const ts = metadata?.mediaTime != null
        ? Math.round(metadata.mediaTime * 1000)
        : performance.now();
      process(ts);
      if (!cancelled && typeof video.requestVideoFrameCallback === 'function') {
        rvfcHandle = video.requestVideoFrameCallback(onVideoFrame);
      }
    }

    // Fallback for browsers without rVFC.
    function rafLoop() {
      if (cancelled) return;
      process(performance.now());
      raf = requestAnimationFrame(rafLoop);
    }

    if (typeof video.requestVideoFrameCallback === 'function') {
      rvfcHandle = video.requestVideoFrameCallback(onVideoFrame);
    } else {
      raf = requestAnimationFrame(rafLoop);
    }

    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      if (rvfcHandle && typeof video.cancelVideoFrameCallback === 'function') {
        video.cancelVideoFrameCallback(rvfcHandle);
      }
    };
  }, [enabled, isReady, videoRef]);

  const getHandPos = useCallback(() => handPosRef.current, []);
  return { isReady, error, getHandPos };
}
