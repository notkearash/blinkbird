import { useRef, useState, useEffect, useCallback } from 'react';
import { useFaceDetection } from './hooks/useBlinkDetection';
import { useMultiplayer } from './hooks/useMultiplayer';
import Game from './components/Game';
import Runner from './components/Runner';
import './App.css';

function App() {
  const videoRef = useRef(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [activeGame, setActiveGame] = useState(null);
  const [gameState, setGameState] = useState('loading');
  const [mode, setMode] = useState('blink');
  const [multiplayer, setMultiplayer] = useState(false);
  const [showLobby, setShowLobby] = useState(false);
  const [pendingGame, setPendingGame] = useState(null);

  const {
    isReady, error,
    p1Triggered,
    setOnBlink,
    setOnHeadSwipe,
  } = useFaceDetection(videoRef, mode, false);

  const mp = useMultiplayer();

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

  function selectGame(game, isMP) {
    if (isMP) {
      setPendingGame(game);
      setShowLobby(true);
    } else {
      setMultiplayer(false);
      setActiveGame(game);
      setGameState('waiting');
    }
  }

  function startMultiplayerGame() {
    setMultiplayer(true);
    setActiveGame(pendingGame);
    setGameState('waiting');
    setShowLobby(false);
  }

  function backToMenu() {
    setActiveGame(null);
    setMultiplayer(false);
    setShowLobby(false);
    setPendingGame(null);
    mp.disconnect();
    setGameState('waiting');
  }

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

      {gameState !== 'loading' && !activeGame && !showLobby && (
        <div className="menu-screen">
          <h1>BlinkBird</h1>
          <p className="menu-subtitle">Pick a game</p>
          <div className="menu-cards">
            <div className="menu-card-group">
              <button className="menu-card" onClick={() => selectGame('flappy', false)}>
                <span className="menu-card-emoji">🐦</span>
                <span className="menu-card-title">Flappy Bird</span>
                <span className="menu-card-desc">Blink to fly</span>
              </button>
              <button className="menu-card-mp" onClick={() => selectGame('flappy', true)}>
                2P Local Network
              </button>
            </div>
            <div className="menu-card-group">
              <button className="menu-card" onClick={() => selectGame('runner', false)}>
                <span className="menu-card-emoji">🏃</span>
                <span className="menu-card-title">Lane Runner</span>
                <span className="menu-card-desc">Move head to dodge</span>
              </button>
              <button className="menu-card-mp" onClick={() => selectGame('runner', true)}>
                2P Local Network
              </button>
            </div>
          </div>
        </div>
      )}

      {gameState !== 'loading' && showLobby && (
        <Lobby
          mp={mp}
          onStart={startMultiplayerGame}
          onBack={backToMenu}
          gameName={pendingGame === 'flappy' ? 'Flappy Bird' : 'Lane Runner'}
        />
      )}

      {gameState !== 'loading' && activeGame === 'flappy' && (
        <Game
          setOnBlink={setOnBlink}
          p1Triggered={p1Triggered}
          gameState={gameState}
          setGameState={setGameState}
          videoRef={videoRef}
          mode={mode}
          setMode={setMode}
          onBack={backToMenu}
          multiplayer={multiplayer}
          mp={mp}
        />
      )}

      {gameState !== 'loading' && activeGame === 'runner' && (
        <Runner
          setOnHeadSwipe={setOnHeadSwipe}
          gameState={gameState}
          setGameState={setGameState}
          videoRef={videoRef}
          onBack={backToMenu}
          multiplayer={multiplayer}
          mp={mp}
        />
      )}
    </div>
  );
}

function Lobby({ mp, onStart, onBack, gameName }) {
  const [joinCode, setJoinCode] = useState('');

  useEffect(() => {
    if (mp.connected && mp.peerReady) {
      const t = setTimeout(onStart, 500);
      return () => clearTimeout(t);
    }
  }, [mp.connected, mp.peerReady, onStart]);

  const isIdle = !mp.role;

  return (
    <div className="lobby">
      <h2>{gameName} — Multiplayer</h2>

      {isIdle && (
        <>
          <p className="lobby-info">
            No server needed — connects directly peer-to-peer.
          </p>
          <div className="lobby-buttons">
            <button className="lobby-host-btn" onClick={() => mp.host()}>
              Create Room
            </button>
            <div className="lobby-or">or</div>
            <div className="lobby-input-row">
              <input
                type="text"
                placeholder="Enter room code"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && joinCode.trim() && mp.join(joinCode.trim())}
                maxLength={6}
              />
              <button onClick={() => joinCode.trim() && mp.join(joinCode.trim())}>Join</button>
            </div>
          </div>
          {mp.error && <p className="lobby-error">{mp.error}</p>}
        </>
      )}

      {mp.role === 'host' && !mp.peerReady && (
        <div className="lobby-status">
          <div className="lobby-role">You are <strong>Player 1 (Host)</strong></div>
          <div className="lobby-code">
            <span>Room code:</span>
            <span className="code">{mp.roomCode}</span>
          </div>
          <div className="lobby-waiting">
            <div className="spinner" />
            <span>Share the code — waiting for Player 2...</span>
          </div>
        </div>
      )}

      {mp.role === 'guest' && !mp.peerReady && (
        <div className="lobby-status">
          <div className="lobby-role">You are <strong>Player 2 (Guest)</strong></div>
          <div className="lobby-waiting">
            <div className="spinner" />
            <span>Connecting...</span>
          </div>
        </div>
      )}

      {mp.peerReady && (
        <div className="lobby-status">
          <span className="lobby-ready">Connected! Starting game...</span>
        </div>
      )}

      <button className="lobby-back" onClick={onBack}>Back</button>
    </div>
  );
}

export default App;
