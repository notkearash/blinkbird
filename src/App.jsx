import { useRef, useState, useEffect, useCallback } from 'react';
import { useBlinkDetection } from './hooks/useBlinkDetection';
import Game from './components/Game';
import './App.css';

function App() {
  const videoRef = useRef(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [gameState, setGameState] = useState('loading');
  const [mode, setMode] = useState('blink'); // 'blink' | 'tongue'

  const { isReady, error, isTriggered, setOnBlink } = useBlinkDetection(videoRef, mode);

  useEffect(() => {
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: 'user' },
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        setCameraError(err.message);
      }
    }
    startCamera();
  }, []);

  const handleVideoLoaded = useCallback(() => {
    setCameraReady(true);
  }, []);

  useEffect(() => {
    if (isReady) setGameState('waiting');
  }, [isReady]);

  return (
    <div className="app">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        onLoadedData={handleVideoLoaded}
        style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}
      />

      {gameState === 'loading' && (
        <div className="loading-screen">
          <h1>BlinkBird</h1>
          <div className="spinner" />
          <p>
            {cameraError
              ? `Camera error: ${cameraError}`
              : error
                ? `Model error: ${error}`
                : !cameraReady
                  ? 'Starting camera...'
                  : 'Loading face detection...'}
          </p>
        </div>
      )}

      {gameState !== 'loading' && (
        <Game
          setOnBlink={setOnBlink}
          isTriggered={isTriggered}
          gameState={gameState}
          setGameState={setGameState}
          videoRef={videoRef}
          mode={mode}
          setMode={setMode}
        />
      )}
    </div>
  );
}

export default App;
