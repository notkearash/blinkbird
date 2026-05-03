import { useEffect, useRef, useState, useCallback } from 'react';
import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

// Landmark 9 = middle-finger MCP — sits roughly at the palm center.
const PALM_LM = 9;

// Cap inference at ~30 Hz. The paddle is smoothed downstream, so 60 Hz
// detection is wasted CPU/GPU on weak machines.
const MIN_INFERENCE_INTERVAL_MS = 33;

// Downscale frames before inference. hand_landmarker is trained on small
// inputs anyway; feeding it 640×480 just burns cycles on the GPU upload.
const INFERENCE_W = 256;
const INFERENCE_H = 192;

export function useHandTracking(videoRef, enabled = true) {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState(null);

  const landmarkerRef = useRef(null);
  // Plain refs so the game loop reads without triggering React re-renders.
  // handsRef holds both hands keyed by handedness; handPosRef keeps the
  // single-hand shape that older games (Pong) read.
  const handsRef = useRef({ left: null, right: null });
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
          numHands: 2,
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
    let lastInferenceMs = -Infinity;

    const canvas = document.createElement('canvas');
    canvas.width = INFERENCE_W;
    canvas.height = INFERENCE_H;
    const ctx = canvas.getContext('2d', { willReadFrequently: false });

    function process(timestampMs) {
      const lm = landmarkerRef.current;
      if (!lm || video.readyState < 2) return;
      if (timestampMs - lastInferenceMs < MIN_INFERENCE_INTERVAL_MS) return;
      lastInferenceMs = timestampMs;
      // MediaPipe requires strictly-increasing timestamps.
      if (timestampMs <= lastTs) timestampMs = lastTs + 1;
      lastTs = timestampMs;

      ctx.drawImage(video, 0, 0, INFERENCE_W, INFERENCE_H);
      const result = lm.detectForVideo(canvas, timestampMs);
      const hands = result.landmarks || [];
      const handedness = result.handedness || [];

      let leftHand = null;
      let rightHand = null;

      for (let i = 0; i < hands.length; i++) {
        const palm = hands[i][PALM_LM];
        const entry = { x: palm.x, y: palm.y, z: palm.z ?? 0 };
        // Mediapipe's "handedness" labels reflect the *user's* hand. The video
        // is mirrored when displayed, so the user's right hand appears on the
        // right side of our canvas — which is what the boxing component wants
        // for "right glove".
        const label = handedness[i]?.[0]?.categoryName;
        if (label === 'Right' && !rightHand) rightHand = entry;
        else if (label === 'Left' && !leftHand) leftHand = entry;
        else if (!rightHand && !leftHand) {
          // Fallback when handedness is absent: assume single hand → right.
          rightHand = entry;
        } else if (!leftHand) {
          leftHand = entry;
        } else if (!rightHand) {
          rightHand = entry;
        }
      }

      handsRef.current = { left: leftHand, right: rightHand };
      // Backwards compat for Pong: pick whichever hand is visible.
      handPosRef.current = rightHand || leftHand || null;
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
  const getHands = useCallback(() => handsRef.current, []);
  return { isReady, error, getHandPos, getHands };
}
