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

      // Build per-detection entries first, then assign sides in a second pass.
      // Two-hand assignment uses image position (more reliable than the model's
      // handedness when both detections happen to share a label); single-hand
      // assignment falls back to the (swap-corrected) handedness label.
      const detected = [];
      for (let i = 0; i < hands.length; i++) {
        const lms = hands[i];
        const palm = lms[PALM_LM];
        // Bounding-box span as a closeness-to-camera proxy. The hand grows in
        // the frame as it moves toward the camera, which is what we use to
        // detect a forward thrust (a punch) downstream. MediaPipe's `z` is
        // relative to the wrist and so cannot be used for absolute depth.
        let minX = 1, maxX = 0, minY = 1, maxY = 0;
        for (let k = 0; k < lms.length; k++) {
          const p = lms[k];
          if (p.x < minX) minX = p.x;
          if (p.x > maxX) maxX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.y > maxY) maxY = p.y;
        }
        const size = Math.max(maxX - minX, maxY - minY);
        const entry = { x: palm.x, y: palm.y, z: palm.z ?? 0, size };
        const label = handedness[i]?.[0]?.categoryName ?? null;
        detected.push({ entry, label, x: palm.x });
      }

      let leftHand = null;
      let rightHand = null;

      if (detected.length >= 2) {
        // Sort by image x. In an unmirrored frame, the user's right hand
        // appears on the camera-left (lower x) — period. This holds even when
        // the model gives both detections the same handedness label.
        detected.sort((a, b) => a.x - b.x);
        rightHand = detected[0].entry;
        leftHand = detected[1].entry;
      } else if (detected.length === 1) {
        const d = detected[0];
        // MediaPipe Tasks HandLandmarker assumes the input frame is mirrored
        // (selfie-style). Browser webcams deliver an unmirrored stream, so the
        // model's labels are flipped relative to the user — swap them.
        if (d.label === 'Right') leftHand = d.entry;
        else if (d.label === 'Left') rightHand = d.entry;
        else if (d.x < 0.5) rightHand = d.entry;
        else leftHand = d.entry;
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
