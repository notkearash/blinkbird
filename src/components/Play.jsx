import './Play.css';

export default function Play({ auth, creating, createError, onSolo, onCreateRoom, onBack }) {
  return (
    <main className="pp">
      <Grain />
      <TopBar auth={auth} onBack={onBack} />

      <section className="pp-hero">
        <span className="pp-stamp">step 02 · the menu</span>
        <h1 className="pp-title">
          <span className="pp-title-fill">pick</span>{' '}
          <span className="pp-title-italic">a game.</span>
        </h1>
        <p className="pp-sub">
          Solo runs nothing but a webcam. <em>2-player</em> needs a GitHub login so we can pair you to your room — that's
          a <strong>signed cookie</strong> on your machine, no DB. <a href="/#privacy">receipts ↓</a>
        </p>
      </section>

      <section className="pp-grid">
        <GameCard
          accent="pink"
          title="Flappy Bird"
          subtitle="blink to flap"
          rule="one blink = one flap. miss the pipes, die, retry."
          art={<FlappyArt />}
          onSolo={() => onSolo('flappy')}
          onMp={() => onCreateRoom('flappy')}
          creating={creating}
        />
        <GameCard
          accent="blue"
          title="Lane Runner"
          subtitle="tilt your head"
          rule="left or right swipes via face. dodge the obstacles. don't crash."
          art={<RunnerArt />}
          onSolo={() => onSolo('runner')}
          onMp={() => onCreateRoom('runner')}
          creating={creating}
        />
      </section>

      {createError && <p className="pp-error">! {createError}</p>}

      <PrivacyStrip />
    </main>
  );
}

function Grain() {
  return <div className="pp-grain" aria-hidden="true" />;
}

function TopBar({ auth, onBack }) {
  return (
    <header className="pp-top">
      <button className="pp-back" onClick={onBack}>
        <span aria-hidden="true">←</span>
        <span>back to landing</span>
      </button>
      <div className="pp-top-mid">
        <span className="pp-top-mark" aria-hidden="true">●</span>
        <span className="pp-top-word">blinkbird</span>
        <span className="pp-top-tag">/ pick a game</span>
      </div>
      <AuthChip auth={auth} />
    </header>
  );
}

function AuthChip({ auth }) {
  if (auth.loading) return <span className="pp-chip pp-chip-muted">…</span>;
  if (!auth.user) {
    return (
      <button className="pp-chip pp-chip-signin" onClick={() => auth.signIn('/play')}>
        sign in for 2p
      </button>
    );
  }
  return (
    <span className="pp-chip pp-chip-user" title={auth.user.login}>
      <img src={auth.user.avatar} alt="" />
      <span>{auth.user.login}</span>
      <button className="pp-chip-out" onClick={auth.signOut}>×</button>
    </span>
  );
}

function GameCard({ accent, title, subtitle, rule, art, onSolo, onMp, creating }) {
  return (
    <article className={`pp-card pp-card-${accent}`}>
      <div className="pp-card-art">{art}</div>
      <div className="pp-card-body">
        <header className="pp-card-head">
          <h3 className="pp-card-title">{title}</h3>
          <span className="pp-card-sub">{subtitle}</span>
        </header>
        <p className="pp-card-rule">{rule}</p>
        <div className="pp-card-actions">
          <button className="pp-btn pp-btn-primary" onClick={onSolo}>
            <span>play solo</span>
            <span className="pp-btn-arrow">→</span>
          </button>
          <button className="pp-btn pp-btn-ghost" disabled={creating} onClick={onMp}>
            {creating ? 'opening room…' : '2p · create room'}
          </button>
        </div>
      </div>
    </article>
  );
}

function PrivacyStrip() {
  return (
    <aside className="pp-privacy">
      <span className="pp-privacy-label">privacy receipt</span>
      <p>
        <strong>solo</strong> sends nothing to our server. face detection runs on your machine via MediaPipe.
        <span className="pp-privacy-sep">·</span>
        <strong>2p</strong> opens a WebSocket to a Cloudflare Durable Object that forwards your moves to your opponent.
        no message bodies are stored.
      </p>
    </aside>
  );
}

function FlappyArt() {
  return (
    <svg viewBox="0 0 220 160" className="pp-art" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="pp-halftone-pink" patternUnits="userSpaceOnUse" width="6" height="6">
          <circle cx="3" cy="3" r="1.2" fill="currentColor" />
        </pattern>
      </defs>
      <rect x="0" y="0" width="220" height="160" fill="url(#pp-halftone-pink)" opacity="0.35" />
      <rect x="40" y="0" width="36" height="46" fill="currentColor" />
      <rect x="36" y="42" width="44" height="10" fill="currentColor" />
      <rect x="40" y="110" width="36" height="50" fill="currentColor" />
      <rect x="36" y="100" width="44" height="10" fill="currentColor" />
      <rect x="150" y="0" width="36" height="80" fill="currentColor" />
      <rect x="146" y="76" width="44" height="10" fill="currentColor" />
      <rect x="150" y="142" width="36" height="18" fill="currentColor" />
      <rect x="146" y="132" width="44" height="10" fill="currentColor" />
      <g transform="translate(108 78) rotate(-12)">
        <circle cx="0" cy="0" r="14" fill="#ffe14a" stroke="#181410" strokeWidth="3" />
        <circle cx="4" cy="-3" r="3" fill="#181410" />
        <path d="M12 1 L22 3 L12 6 Z" fill="#ff3d8a" stroke="#181410" strokeWidth="2" strokeLinejoin="round" />
        <path d="M-10 1 Q -4 12 4 6" stroke="#181410" strokeWidth="3" fill="none" strokeLinecap="round" />
      </g>
    </svg>
  );
}

function RunnerArt() {
  return (
    <svg viewBox="0 0 220 160" className="pp-art" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="pp-halftone-blue" patternUnits="userSpaceOnUse" width="6" height="6">
          <circle cx="3" cy="3" r="1.2" fill="currentColor" />
        </pattern>
      </defs>
      <rect x="0" y="0" width="220" height="160" fill="url(#pp-halftone-blue)" opacity="0.3" />
      <path d="M30 158 L92 12 M110 158 L110 12 M190 158 L128 12" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M30 158 L92 12" stroke="currentColor" strokeWidth="3" strokeDasharray="6 8" />
      <path d="M190 158 L128 12" stroke="currentColor" strokeWidth="3" strokeDasharray="6 8" />
      <rect x="92" y="44" width="20" height="14" fill="#ff3d8a" stroke="#181410" strokeWidth="2" />
      <rect x="56" y="80" width="28" height="16" fill="#ffe14a" stroke="#181410" strokeWidth="2" />
      <rect x="138" y="70" width="24" height="14" fill="#ffe14a" stroke="#181410" strokeWidth="2" />
      <g transform="translate(108 122)">
        <circle cx="0" cy="-12" r="10" fill="#181410" />
        <rect x="-9" y="-2" width="18" height="22" rx="3" fill="#181410" />
        <rect x="-12" y="2" width="6" height="14" rx="2" fill="#181410" transform="rotate(-15 -9 9)" />
        <rect x="6" y="2" width="6" height="14" rx="2" fill="#181410" transform="rotate(15 9 9)" />
      </g>
    </svg>
  );
}
