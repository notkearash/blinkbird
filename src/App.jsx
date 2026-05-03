import { useRef, useState, useEffect, useCallback } from 'react';
import { useFaceDetection } from './hooks/useBlinkDetection';
import { useHandTracking } from './hooks/useHandTracking';
import { useMultiplayer } from './hooks/useMultiplayer';
import { useAuth } from './hooks/useAuth';
import Game from './components/Game';
import Runner from './components/Runner';
import Pong from './components/Pong';
import Boxing from './components/Boxing';
import Landing from './components/Landing';
import Play from './components/Play';
import './App.css';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SOLO_RE = /^\/(flappy|runner|pong|boxing)\/?$/;

// Safety net: if React ever boots at an /api/ path (e.g., user hit Back after an
// OAuth hop), rewrite to / so we don't stuff an /api/ URL into return_to and
// create a nested-login loop.
if (typeof location !== 'undefined' && location.pathname.startsWith('/api/')) {
  history.replaceState(null, '', '/');
}

function parseRoute() {
  const room = location.pathname.match(/^\/r\/([^/]+)\/?$/);
  if (room && UUID_RE.test(room[1])) {
    const params = new URLSearchParams(location.search);
    const game = params.get('game');
    return {
      page: 'room',
      roomId: room[1],
      game: game === 'flappy' || game === 'runner' ? game : null,
    };
  }
  if (/^\/play\/?$/.test(location.pathname)) {
    return { page: 'play', roomId: null, game: null };
  }
  const solo = location.pathname.match(SOLO_RE);
  if (solo) {
    return { page: 'solo', roomId: null, game: solo[1] };
  }
  return { page: 'landing', roomId: null, game: null };
}

function navigateTo(path) {
  history.pushState(null, '', path);
  dispatchEvent(new PopStateEvent('popstate'));
}

function App() {
  const videoRef = useRef(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [route, setRoute] = useState(parseRoute);
  const [activeGame, setActiveGame] = useState(() => {
    const r = parseRoute();
    return r.page === 'solo' ? r.game : null;
  });
  const [gameState, setGameState] = useState('waiting');
  const [mode, setMode] = useState('blink');
  const [multiplayer, setMultiplayer] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  const auth = useAuth();
  const mp = useMultiplayer();

  const inRoom = route.page === 'room';
  // Camera + MediaPipe only spin up when the user has actually committed
  // to play (picked a game, or landed inside a room URL). The marketing
  // pages stay zero-permission.
  const isPong = activeGame === 'pong';
  const isBoxing = activeGame === 'boxing';
  const needsHand = isPong || isBoxing;
  const needsFace = (!isPong && (activeGame !== null || inRoom)) || isBoxing;
  const needsCamera = needsFace || needsHand;

  const {
    isReady, error,
    p1Triggered,
    setOnBlink,
    setOnHeadSwipe,
    getHeadX,
  } = useFaceDetection(videoRef, mode, false, needsFace);

  const hand = useHandTracking(videoRef, needsHand);

  useEffect(() => {
    const onPop = () => setRoute(parseRoute());
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, []);

  // Sync active game with the URL: /pong → solo pong, /play or / → drop game.
  // Multiplayer rooms keep their own activeGame flow via the lobby.
  useEffect(() => {
    if (route.page === 'solo' && route.game) {
      setMultiplayer(false);
      setActiveGame(route.game);
      setGameState('waiting');
    } else if (route.page === 'play' || route.page === 'landing') {
      setActiveGame(null);
      setMultiplayer(false);
    }
  }, [route.page, route.game]);

  useEffect(() => {
    if (!auth.user) return;
    const params = new URLSearchParams(location.search);
    const game = params.get('create');
    if (game !== 'flappy' && game !== 'runner') return;
    if (location.pathname !== '/play') navigateTo(`/play?create=${game}`);
    createRoom(game);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.user]);

  useEffect(() => {
    if (!needsCamera) return;
    if (videoRef.current?.srcObject) return; // already started
    let cancelled = false;
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: 'user' },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch (err) {
        if (!cancelled) setCameraError(err.message);
      }
    }
    startCamera();
    return () => { cancelled = true; };
  }, [needsCamera]);

  const handleVideoLoaded = useCallback(() => setCameraReady(true), []);

  const trackerReady = (!needsHand || hand.isReady) && (!needsFace || isReady);
  const trackerError = (needsHand && hand.error) || (needsFace && error);
  const showLoading = needsCamera && !trackerReady;
  const inLobby = inRoom && !activeGame;
  const onLanding = route.page === 'landing' && !activeGame;
  const onPlayPage = route.page === 'play' && !activeGame;
  const isMarketing = onLanding || onPlayPage;

  useEffect(() => {
    document.body.classList.toggle('body--landing', isMarketing);
    return () => document.body.classList.remove('body--landing');
  }, [isMarketing]);

  function startSolo(game) {
    setMultiplayer(false);
    setActiveGame(game);
    setGameState('waiting');
    navigateTo(`/${game}`);
  }

  async function createRoom(game) {
    if (auth.loading) return;
    if (!auth.user) {
      auth.signIn(`/play?create=${game}`);
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch('/api/room/create', {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`create failed (${res.status})`);
      const { roomId } = await res.json();
      navigateTo(`/r/${roomId}?game=${game}`);
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  }

  function startMultiplayerGame() {
    setMultiplayer(true);
    setActiveGame(route.game);
    setGameState('waiting');
  }

  const backToMenu = useCallback(() => {
    setActiveGame(null);
    setMultiplayer(false);
    mp.disconnect();
    setGameState('waiting');
    navigateTo('/play');
  }, [mp]);

  const goToPlay = useCallback(() => navigateTo('/play'), []);
  const goToLanding = useCallback(() => navigateTo('/'), []);

  return (
    <div className={`app${isMarketing ? ' app--landing' : ''}`}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        onLoadedData={handleVideoLoaded}
        style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}
      />

      {onLanding && (
        <Landing auth={auth} onPlay={goToPlay} />
      )}

      {onPlayPage && (
        <Play
          auth={auth}
          creating={creating}
          createError={createError}
          onSolo={startSolo}
          onCreateRoom={createRoom}
          onBack={goToLanding}
        />
      )}

      {showLoading && (
        <div className="loading-screen">
          <h1>blinkbird</h1>
          <div className="spinner" />
          <p>
            {cameraError
              ? `Camera blocked: ${cameraError}`
              : trackerError
                ? `Model error: ${trackerError}`
                : !cameraReady
                  ? 'Asking your browser for the camera…'
                  : needsHand && !hand.isReady
                    ? 'Loading the hand model… (lives on your machine)'
                    : 'Loading the face model… (lives on your machine)'}
          </p>
        </div>
      )}

      {!showLoading && inLobby && (
        <Lobby
          auth={auth}
          mp={mp}
          roomId={route.roomId}
          game={route.game}
          onStart={startMultiplayerGame}
          onBack={backToMenu}
        />
      )}

      {!showLoading && activeGame === 'flappy' && (
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

      {!showLoading && activeGame === 'runner' && (
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

      {!showLoading && activeGame === 'pong' && (
        <Pong
          getHandPos={hand.getHandPos}
          handReady={hand.isReady}
          gameState={gameState}
          setGameState={setGameState}
          videoRef={videoRef}
          onBack={backToMenu}
        />
      )}

      {!showLoading && activeGame === 'boxing' && (
        <Boxing
          getHands={hand.getHands}
          getHeadX={getHeadX}
          handReady={hand.isReady}
          faceReady={isReady}
          gameState={gameState}
          setGameState={setGameState}
          videoRef={videoRef}
          onBack={backToMenu}
        />
      )}
    </div>
  );
}

function AuthBadge({ auth }) {
  if (auth.loading) return <div className="auth-badge auth-loading">...</div>;
  if (!auth.user) {
    return (
      <button className="auth-badge auth-signin" onClick={() => auth.signIn()}>
        <GitHubIcon /> Sign in with GitHub
      </button>
    );
  }
  return (
    <div className="auth-badge">
      <img src={auth.user.avatar} alt="" className="auth-avatar" />
      <span>{auth.user.login}</span>
      <button className="auth-signout" onClick={auth.signOut}>sign out</button>
    </div>
  );
}

function GitHubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function Lobby({ auth, mp, roomId, game, onStart, onBack }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!auth.user) return;
    if (!game) return;
    mp.connect(roomId);
  }, [auth.user, roomId, game, mp.connect]);

  useEffect(() => {
    if (mp.connected && mp.peerReady) {
      const t = setTimeout(onStart, 500);
      return () => clearTimeout(t);
    }
  }, [mp.connected, mp.peerReady, onStart]);

  const url = `${location.origin}/r/${roomId}${game ? `?game=${game}` : ''}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  const gameName = game === 'flappy' ? 'Flappy Bird' : game === 'runner' ? 'Lane Runner' : 'Unknown';

  if (!game) {
    return (
      <div className="lobby">
        <h2>Missing game</h2>
        <p className="lobby-info">This room link is missing <code>?game=</code>. Ask for a fresh link.</p>
        <button className="lobby-back" onClick={onBack}>Back</button>
      </div>
    );
  }

  if (auth.loading) {
    return (
      <div className="lobby">
        <div className="spinner" />
      </div>
    );
  }

  if (!auth.user) {
    return (
      <div className="lobby">
        <h2>{gameName} — Multiplayer</h2>
        <p className="lobby-info">Sign in with GitHub to join this room.</p>
        <button className="auth-badge auth-signin" onClick={() => auth.signIn()}>
          <GitHubIcon /> Sign in with GitHub
        </button>
        <button className="lobby-back" onClick={onBack}>Back</button>
      </div>
    );
  }

  return (
    <div className="lobby">
      <h2>{gameName} — Multiplayer</h2>

      <div className="lobby-peers">
        <PeerCard user={mp.you ?? auth.user} role={mp.role} self />
        <span className="lobby-vs">vs</span>
        <PeerCard user={mp.peer} role={mp.role === 'host' ? 'guest' : 'host'} />
      </div>

      {!mp.connected && (
        <div className="lobby-status">
          <div className="spinner" />
          <span>Connecting...</span>
          {mp.error && <p className="lobby-error">{mp.error}</p>}
        </div>
      )}

      {mp.connected && !mp.peerReady && (
        <div className="lobby-status">
          <p className="lobby-info">Share this link with your opponent:</p>
          <div className="lobby-input-row">
            <input readOnly value={url} onFocus={(e) => e.target.select()} />
            <button onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
          </div>
          <div className="lobby-waiting">
            <div className="spinner" />
            <span>Waiting for the other player...</span>
          </div>
        </div>
      )}

      {mp.peerReady && (
        <div className="lobby-status">
          <span className="lobby-ready">Connected! Starting game...</span>
        </div>
      )}

      {mp.error && <p className="lobby-error">{mp.error}</p>}

      <p className="lobby-priv">
        <span className="lobby-priv-label">privacy</span>
        moves are forwarded peer-to-peer through a Cloudflare Durable Object. nothing is logged or stored.
      </p>

      <button className="lobby-back" onClick={onBack}>Back</button>
    </div>
  );
}

function PeerCard({ user, role, self }) {
  if (!user) {
    return (
      <div className="peer-card peer-empty">
        <div className="peer-avatar-placeholder" />
        <span className="peer-login">Waiting...</span>
      </div>
    );
  }
  return (
    <div className={`peer-card${self ? ' peer-self' : ''}`}>
      {user.avatar
        ? <img src={user.avatar} alt="" className="peer-avatar" />
        : <div className="peer-avatar-placeholder" />}
      <span className="peer-login">{user.login}{self ? ' (you)' : ''}</span>
      {role && <span className="peer-role">{role === 'host' ? 'P1' : 'P2'}</span>}
    </div>
  );
}

export default App;
