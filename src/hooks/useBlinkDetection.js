import { useEffect, useRef, useState, useCallback } from 'react';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

// MediaPipe face mesh landmark indices for eyes
const LEFT_EYE_V1 = [159, 145];
const LEFT_EYE_V2 = [160, 144];
const LEFT_EYE_V3 = [158, 153];
const LEFT_EYE_H = [33, 133];

const RIGHT_EYE_V1 = [386, 374];
const RIGHT_EYE_V2 = [387, 373];
const RIGHT_EYE_V3 = [385, 380];
const RIGHT_EYE_H = [362, 263];

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

export function useBlinkDetection(videoRef, mode = 'blink') {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState(null);
  const [isTriggered, setIsTriggered] = useState(false);

  const landmarkerRef = useRef(null);
  const wasTriggeredRef = useRef(false);
  const cooldownRef = useRef(false);
  const rafRef = useRef(null);
  const onTriggerRef = useRef(null);
  const earSmoothRef = useRef(0.35);
  const tongueSmoothRef = useRef(0);
  const debugRef = useRef(null);
  const modeRef = useRef(mode);

  modeRef.current = mode;

  const setOnBlink = useCallback((fn) => {
    onTriggerRef.current = fn;
  }, []);

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
          numFaces: 1,
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

      if (result.faceLandmarks && result.faceLandmarks.length > 0) {
        let triggered = false;

        if (modeRef.current === 'blink') {
          const lm = result.faceLandmarks[0];
          const leftEAR = eyeAspectRatio(lm, LEFT_EYE_V1, LEFT_EYE_V2, LEFT_EYE_V3, LEFT_EYE_H);
          const rightEAR = eyeAspectRatio(lm, RIGHT_EYE_V1, RIGHT_EYE_V2, RIGHT_EYE_V3, RIGHT_EYE_H);
          const avgEAR = (leftEAR + rightEAR) / 2;
          earSmoothRef.current = earSmoothRef.current * 0.4 + avgEAR * 0.6;
          triggered = earSmoothRef.current < EAR_THRESHOLD;
        } else {
          // Tongue mode — use blendshapes
          const bs = result.faceBlendshapes;
          if (bs && bs.length > 0) {
            const categories = bs[0].categories;
            const jawOpen = categories.find(b => b.categoryName === 'jawOpen');
            const score = jawOpen?.score ?? 0;
            tongueSmoothRef.current = tongueSmoothRef.current * 0.3 + score * 0.7;
            triggered = tongueSmoothRef.current > JAW_THRESHOLD;
            debugRef.current = {
              raw: score,
              smooth: tongueSmoothRef.current,
              triggered,
            };
          } else {
            debugRef.current = {
              raw: 0, smooth: 0, triggered: false,
              hasBs: false,
              bsValue: JSON.stringify(bs)?.slice(0, 100),
            };
          }
        }

        setIsTriggered(triggered);

        if (triggered && !wasTriggeredRef.current && !cooldownRef.current) {
          onTriggerRef.current?.();
          cooldownRef.current = true;
          setTimeout(() => { cooldownRef.current = false; }, COOLDOWN_MS);
        }
        wasTriggeredRef.current = triggered;
      }

      rafRef.current = requestAnimationFrame(detect);
    }

    rafRef.current = requestAnimationFrame(detect);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isReady, videoRef]);

  return { isReady, error, isTriggered, setOnBlink, debugRef };
}
