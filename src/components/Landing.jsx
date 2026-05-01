import './Landing.css';

const TICKER = [
  'no hands required',
  'no database',
  'no email asked',
  'no telemetry',
  'open source',
  'face on, ego off',
  'mediapipe inside',
  'blink ➝ flap',
  'tilt ➝ dodge',
  'mit licensed',
];

export default function Landing({ auth, onPlay }) {
  return (
    <main className="lp">
      <Grain />
      <TopBar auth={auth} onPlay={onPlay} />
      <Hero onPlay={onPlay} />
      <Ticker items={TICKER} />
      <HowItWorks />
      <Manifesto />
      <OpenSource />
      <Footer />
    </main>
  );
}

function Grain() {
  return <div className="lp-grain" aria-hidden="true" />;
}

function TopBar({ auth, onPlay }) {
  return (
    <header className="lp-top">
      <div className="lp-top-left">
        <span className="lp-mark" aria-hidden="true">
          <Eye size={22} />
        </span>
        <span className="lp-mark-word">blinkbird</span>
        <span className="lp-mark-tag">v0.1 / public beta</span>
      </div>
      <nav className="lp-top-nav">
        <a href="#how">how</a>
        <a href="#privacy">privacy</a>
        <a href="#why">why</a>
        <a
          href="https://github.com/notkearash/blinkbird"
          target="_blank"
          rel="noreferrer noopener"
          className="lp-top-github"
        >
          github ↗
        </a>
        <button className="lp-top-play" onClick={onPlay}>play ↗</button>
        <AuthChip auth={auth} />
      </nav>
    </header>
  );
}

function AuthChip({ auth }) {
  if (auth.loading) return <span className="lp-chip lp-chip-muted">…</span>;
  if (!auth.user) {
    return (
      <button className="lp-chip lp-chip-signin" onClick={() => auth.signIn()}>
        sign in
      </button>
    );
  }
  return (
    <span className="lp-chip lp-chip-user" title={auth.user.login}>
      <img src={auth.user.avatar} alt="" />
      <span>{auth.user.login}</span>
      <button className="lp-chip-out" onClick={auth.signOut}>×</button>
    </span>
  );
}

function Hero({ onPlay }) {
  return (
    <section className="lp-hero">
      <div className="lp-hero-meta">
        <span className="lp-stamp">est. mmxxv · made with eyelids</span>
      </div>

      <h1 className="lp-hero-title">
        <span className="lp-line">
          <span className="lp-word lp-word-fill">play</span>{' '}
          <span className="lp-word lp-word-italic">arcade games</span>
        </span>
        <span className="lp-line">
          <span className="lp-word">with your</span>{' '}
          <span className="lp-eyepair" aria-hidden="true">
            <Eye blink size={88} delay="0.2s" />
            <Eye blink size={88} delay="0.45s" />
          </span>
        </span>
        <span className="lp-line">
          <span className="lp-word lp-word-fill lp-word-pink">face.</span>
          <span className="lp-period" aria-hidden="true">●</span>
        </span>
      </h1>

      <div className="lp-hero-row">
        <p className="lp-hero-lede">
          BlinkBird turns your <em>webcam</em> into the controller. <strong>Blink</strong> to flap.
          <strong> Tilt your head</strong> to dodge. No download, no login —
          just a tab, a face, and questionable life choices.
        </p>
        <button className="lp-cta" onClick={onPlay}>
          <span>pick your game</span>
          <span className="lp-cta-arrow">↗</span>
        </button>
      </div>

      <div className="lp-hero-strip">
        <Strip label="latency" value="≈40ms" />
        <Strip label="installs" value="zero" />
        <Strip label="dignity" value="optional" />
        <Strip label="license" value="MIT" />
      </div>
    </section>
  );
}

function Strip({ label, value }) {
  return (
    <div className="lp-strip">
      <span className="lp-strip-label">{label}</span>
      <span className="lp-strip-value">{value}</span>
    </div>
  );
}

function Ticker({ items }) {
  const doubled = [...items, ...items, ...items, ...items];
  return (
    <div className="lp-ticker" aria-hidden="true">
      <div className="lp-ticker-track">
        {doubled.map((t, i) => (
          <span key={i} className="lp-ticker-item">
            <span className="lp-ticker-dot">✦</span>
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

function HowItWorks() {
  return (
    <section id="how" className="lp-how">
      <SectionHead
        index="01"
        kicker="the wiring"
        title={<>three steps. <em>zero plug-ins.</em></>}
      />
      <ol className="lp-steps">
        <Step
          n="i"
          title="allow the camera"
          body="A one-time browser prompt. The video stream lives on your machine — nothing leaves the tab unless you start a 2P room."
        />
        <Step
          n="ii"
          title="we find your face"
          body="MediaPipe FaceLandmarker runs on-device at ~30fps. We watch your eyelids and your nose, that's it."
        />
        <Step
          n="iii"
          title="blink. tilt. die. retry."
          body="A blink fires a flap. A head tilt swipes a lane. Your high score is the only metric that matters."
        />
      </ol>
    </section>
  );
}

function Step({ n, title, body }) {
  return (
    <li className="lp-step">
      <span className="lp-step-n">{n}</span>
      <div>
        <h4 className="lp-step-title">{title}</h4>
        <p className="lp-step-body">{body}</p>
      </div>
    </li>
  );
}

function Manifesto() {
  return (
    <section id="why" className="lp-why">
      <span className="lp-why-mark" aria-hidden="true">“</span>
      <p className="lp-why-text">
        I wanted a thing that felt <em>impossibly silly</em> the first time you played it,
        and obvious the second. Your face has been a controller this whole time. We just
        finally bothered to ask.
      </p>
      <p className="lp-why-sig">
        — kia, somewhere between a side project and a personality disorder
      </p>
    </section>
  );
}

function OpenSource() {
  return (
    <section className="lp-oss">
      <SectionHead
        index="03"
        kicker="free, open, weird"
        title={<>fork it. break it. <em>send a PR.</em></>}
      />

      <div className="lp-oss-grid">
        <div className="lp-oss-card">
          <h4>MIT licensed</h4>
          <p>
            Take the whole thing. Ship a clone called BlinkSnake. Put it in your portfolio.
            I genuinely do not mind.
          </p>
        </div>
        <div className="lp-oss-card">
          <h4>Tiny stack</h4>
          <p>
            React + Vite for the front, Cloudflare Workers + a Durable Object for the
            relay, MediaPipe for the eyes. That's the whole org chart.
          </p>
        </div>
        <div className="lp-oss-card">
          <h4>Weird games welcome</h4>
          <p>
            Got a face-controlled idea? Open an issue. The PR template is short and the
            taste bar is "make me laugh."
          </p>
        </div>
        <a
          href="https://github.com/notkearash/blinkbird"
          target="_blank"
          rel="noreferrer noopener"
          className="lp-oss-cta"
        >
          <span>view on github</span>
          <span className="lp-oss-cta-icon">★</span>
        </a>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="lp-foot">
      <div className="lp-foot-line">
        <span>blinkbird ©</span>
        <span className="lp-foot-dot">·</span>
        <span>built by <a href="https://github.com/notkearash" target="_blank" rel="noreferrer noopener">kia</a></span>
        <span className="lp-foot-dot">·</span>
        <span>not affiliated with any actual bird</span>
      </div>
      <BlinkingDot />
    </footer>
  );
}

function BlinkingDot() {
  return (
    <span className="lp-foot-pulse">
      <span className="lp-foot-pulse-dot" />
      <span>live</span>
    </span>
  );
}

function SectionHead({ index, kicker, title }) {
  return (
    <header className="lp-sec-head">
      <span className="lp-sec-index">{index}</span>
      <span className="lp-sec-kicker">{kicker}</span>
      <h2 className="lp-sec-title">{title}</h2>
    </header>
  );
}

/* ---------- decorative SVG bits ---------- */

function Eye({ size = 64, blink = false, delay = '0s' }) {
  return (
    <svg
      className={blink ? 'lp-eye lp-eye-blink' : 'lp-eye'}
      style={{ '--eye-delay': delay, width: size, height: size * 0.6 }}
      viewBox="0 0 100 60"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <clipPath id={`eye-clip-${size}-${delay}`}>
          <path d="M2 30 Q 50 -8 98 30 Q 50 68 2 30 Z" />
        </clipPath>
      </defs>
      <path
        className="lp-eye-shell"
        d="M2 30 Q 50 -8 98 30 Q 50 68 2 30 Z"
        stroke="currentColor"
        strokeWidth="3"
        fill="var(--eye-bg, transparent)"
      />
      <g clipPath={`url(#eye-clip-${size}-${delay})`}>
        <circle className="lp-eye-iris" cx="50" cy="30" r="16" fill="currentColor" />
        <circle cx="50" cy="30" r="6" fill="var(--eye-bg, #f4ead5)" />
        <circle cx="55" cy="25" r="3" fill="currentColor" />
      </g>
      <path
        className="lp-eye-lid"
        d="M2 30 Q 50 -8 98 30 Q 50 -8 2 30 Z"
        fill="var(--eye-bg, #f4ead5)"
        stroke="currentColor"
        strokeWidth="3"
      />
    </svg>
  );
}

