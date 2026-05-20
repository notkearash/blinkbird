import './Play.css';

export default function Play({ auth, creating, createError, onSolo, onCreateRoom }) {
  return (
    <main className="pp">
      <Grain />
      <TopBar auth={auth} />

      <section className="pp-board" aria-label="pick a game">
        <header className="pp-board-head">
          <span className="pp-stamp" aria-hidden="true">tonight's program</span>
          <span className="pp-board-rule" aria-hidden="true" />
          <span className="pp-board-count">04 · entries</span>
        </header>

        <PrivacyStrip />

        <ol className="pp-list">
          <GameRow
            index="01"
            accent="pink"
            title="flappy bird"
            subtitle="blink to flap"
            rule="one blink = one flap. miss the pipes, die, retry."
            art={<FlappyArt />}
            onSolo={() => onSolo('flappy')}
            onMp={() => onCreateRoom('flappy')}
            creating={creating}
          />
          <GameRow
            index="02"
            accent="blue"
            title="lane runner"
            subtitle="tilt your head"
            rule="left or right swipes via face. dodge the obstacles."
            art={<RunnerArt />}
            onSolo={() => onSolo('runner')}
            onMp={() => onCreateRoom('runner')}
            creating={creating}
          />
          <GameRow
            index="03"
            accent="green"
            title="hand pong"
            subtitle="palm = paddle"
            rule="first-person squash. open hand to the cam. keep the ball alive."
            art={<PongArt />}
            onSolo={() => onSolo('pong')}
            creating={creating}
          />
          <GameRow
            index="04"
            accent="yellow"
            title="submarine"
            subtitle="captain + engineer"
            rule="captain pilots, engineer keeps the hull alive. each player on their own device. talk on voice."
            art={<SubArt />}
            onSolo={() => onSolo('submarine')}
            onMp={() => onCreateRoom('submarine')}
            creating={creating}
          />
        </ol>
      </section>

      {createError && <p className="pp-error">! {createError}</p>}
    </main>
  );
}

function Grain() {
  return <div className="pp-grain" aria-hidden="true" />;
}

function TopBar({ auth }) {
  return (
    <header className="pp-top">
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
      <button className="pp-chip pp-chip-signin" onClick={() => auth.signIn('/')}>
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

function GameRow({ index, accent, title, subtitle, rule, art, onSolo, onMp, creating }) {
  return (
    <li className={`pp-row pp-row-${accent}`}>
      <button className="pp-row-main" onClick={onSolo} aria-label={`play ${title}`}>
        <span className="pp-row-index" aria-hidden="true">{index}</span>
        <div className="pp-row-art" aria-hidden="true">
          <div className="pp-row-art-inner">{art}</div>
        </div>
        <div className="pp-row-text">
          <h3 className="pp-row-title">
            {title}
            <span className="pp-row-sub">{subtitle}</span>
          </h3>
          <p className="pp-row-rule">{rule}</p>
          <span className="pp-row-meta">
            <span className="pp-row-dot" />
            {onMp ? 'solo · webcam only' : 'solo · single player'}
          </span>
        </div>
      </button>
      {onMp ? (
        <button className="pp-row-mp" disabled={creating} onClick={onMp}>
          <span className="pp-row-mp-dot" aria-hidden="true" />
          {creating ? 'opening room…' : '2-player room'}
        </button>
      ) : (
        <span className="pp-row-mp-spacer" aria-hidden="true" />
      )}
      <button
        className="pp-row-cta"
        onClick={onSolo}
        tabIndex={-1}
        aria-hidden="true"
      >
        <span className="pp-row-cta-label">play</span>
        <span className="pp-row-cta-arrow">→</span>
      </button>
    </li>
  );
}

function PrivacyStrip() {
  return (
    <aside className="pp-privacy">
      <span className="pp-privacy-stamp" aria-hidden="true">
        <span className="pp-privacy-stamp-line1">privacy</span>
        <span className="pp-privacy-stamp-line2">receipt ↘</span>
      </span>
      <div className="pp-privacy-body">
        <p>
          <strong>solo</strong> sends <em>nothing</em> to a server — face &amp; hand
          detection run on your machine via MediaPipe.{' '}
          <strong>2-player</strong> opens a websocket to a Cloudflare Durable Object
          that forwards your moves — <em>no message bodies are stored</em>.
        </p>
        <a
          className="pp-privacy-link"
          href="https://github.com/notkearash/blinkbird"
          target="_blank"
          rel="noreferrer noopener"
        >
          read the source ↗
        </a>
      </div>
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

function PongArt() {
  return (
    <svg viewBox="0 0 220 160" className="pp-art" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="pp-halftone-pong" patternUnits="userSpaceOnUse" width="6" height="6">
          <circle cx="3" cy="3" r="1.2" fill="currentColor" />
        </pattern>
      </defs>
      <rect x="0" y="0" width="220" height="160" fill="url(#pp-halftone-pong)" opacity="0.32" />
      {/* corridor lines into the vanishing point */}
      <path
        d="M0 0 L96 70 M220 0 L124 70 M0 160 L96 90 M220 160 L124 90 M96 70 L124 70 L124 90 L96 90 Z"
        stroke="currentColor"
        strokeWidth="3"
        fill="none"
        strokeLinejoin="round"
      />
      {/* back wall halftone fill */}
      <rect x="96" y="70" width="28" height="20" fill="#1f3df0" opacity="0.22" />
      {/* paddle in front */}
      <rect x="68" y="98" width="84" height="38" rx="6" fill="#ff3a86" stroke="#181410" strokeWidth="3" />
      <rect x="104" y="106" width="12" height="22" fill="#f4ead5" stroke="#181410" strokeWidth="2" />
      {/* ball mid-flight */}
      <circle cx="138" cy="64" r="9" fill="#ffe14a" stroke="#181410" strokeWidth="2.5" />
      {/* hand silhouette top-left */}
      <g transform="translate(20 24)" stroke="#181410" strokeWidth="2.5" fill="#f4ead5" strokeLinejoin="round">
        <path d="M0 18 L0 4 Q0 0 4 0 Q8 0 8 4 L8 14 L11 14 L11 2 Q11 -2 15 -2 Q19 -2 19 2 L19 14 L22 14 L22 4 Q22 0 26 0 Q30 0 30 4 L30 14 L33 14 L33 8 Q33 4 37 4 Q41 4 41 8 L41 24 Q41 36 28 36 L10 36 Q0 36 0 26 Z" />
      </g>
    </svg>
  );
}

function SubArt() {
  return (
    <svg viewBox="0 0 220 160" className="pp-art" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="pp-halftone-sub" patternUnits="userSpaceOnUse" width="6" height="6">
          <circle cx="3" cy="3" r="1.2" fill="currentColor" />
        </pattern>
      </defs>
      {/* water halftone */}
      <rect x="0" y="0" width="220" height="160" fill="url(#pp-halftone-sub)" opacity="0.3" />
      {/* seabed rock */}
      <path d="M0 160 L0 132 Q14 118 30 128 Q44 116 60 130 Q76 122 92 134 L92 160 Z" fill="#181410" />
      <path d="M168 160 L168 138 Q186 124 204 134 Q214 130 220 138 L220 160 Z" fill="#181410" />
      {/* free rock mid-air */}
      <g transform="translate(186 50)">
        <path d="M0 -14 L12 -8 L16 4 L8 14 L-6 12 L-14 2 L-10 -10 Z" fill="#181410" stroke="#181410" strokeWidth="2" strokeLinejoin="round" />
        <circle cx="-3" cy="-3" r="3" fill="#ff3a86" />
      </g>
      {/* sub */}
      <g transform="translate(96 86)">
        {/* prop wash */}
        <path d="M-50 -6 L-66 -8 M-50 0 L-70 0 M-50 6 L-66 8" stroke="#1f3df0" strokeWidth="2.5" strokeLinecap="round" fill="none" />
        {/* body */}
        <ellipse cx="0" cy="0" rx="44" ry="20" fill="#ff3a86" stroke="#181410" strokeWidth="2.5" />
        {/* conning tower */}
        <rect x="-10" y="-30" width="20" height="12" rx="2" fill="#ff3a86" stroke="#181410" strokeWidth="2.5" />
        {/* antenna */}
        <path d="M0 -30 L0 -38" stroke="#181410" strokeWidth="2" />
        <circle cx="0" cy="-40" r="2.5" fill="#ffd83a" stroke="#181410" strokeWidth="1.5" />
        {/* porthole */}
        <circle cx="16" cy="0" r="6" fill="#1f3df0" stroke="#181410" strokeWidth="2" />
        <circle cx="14" cy="-2" r="2" fill="#f4ead5" />
        {/* nose tick */}
        <path d="M44 0 L52 0" stroke="#181410" strokeWidth="2" />
      </g>
      {/* bubbles */}
      <circle cx="40" cy="40" r="4" fill="#1f3df0" stroke="#181410" strokeWidth="1.5" />
      <circle cx="56" cy="24" r="2.5" fill="#1f3df0" stroke="#181410" strokeWidth="1.5" />
      <circle cx="30" cy="22" r="2" fill="#1f3df0" stroke="#181410" strokeWidth="1.5" />
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
