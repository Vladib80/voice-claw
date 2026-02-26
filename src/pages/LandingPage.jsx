import { useNavigate } from 'react-router-dom';
import { Mic, Shield, Zap, ArrowRight, Globe, Smartphone, Monitor, Wifi } from 'lucide-react';
import { isConnected } from '../lib/gateway';
import './LandingPage.css';

const FEATURES = [
  {
    icon: <Mic size={20} />,
    title: 'Speak naturally',
    desc: 'Auto-detects silence, interrupt anytime. Continuous conversation - no buttons, no waiting.',
  },
  {
    icon: <Shield size={20} />,
    title: 'Your keys, your data',
    desc: 'Routes through YOUR OpenClaw gateway. Nothing stored on our servers. Zero lock-in.',
  },
  {
    icon: <Zap size={20} />,
    title: 'Sub-second response',
    desc: 'Groq Whisper STT + streaming TTS. Feels instant, even on mobile.',
  },
];

const HOW_IT_WORKS = [
  { step: '01', title: 'Run one command', desc: 'Go to Setup - a pair code auto-generates. Copy the install command and run it in PowerShell or Terminal.' },
  { step: '02', title: 'Enter the code', desc: 'Paste the pair code when the installer asks. That\'s it - bridge connects automatically.' },
  { step: '03', title: 'Tap and talk', desc: 'Page advances on its own. Tap the orb and speak. Your AI responds in voice, instantly.' },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const connected = isConnected();

  return (
    <div className="landing">
      {/* Nav */}
      <nav className="landing-nav">
        <span className="landing-logo">VoiceClaw</span>
        <button
          className="landing-nav-cta"
          onClick={() => navigate(connected ? '/app' : '/setup')}
        >
          {connected ? 'Open App' : 'Get Started'}
        </button>
      </nav>

      {/* Hero */}
      <section className="landing-hero">
        <div className="landing-phone" aria-hidden="true">
          <div className="landing-phone-notch" />
          <div className="landing-phone-screen">
            <p className="landing-phone-status">Listening…</p>

            <div className="landing-phone-orb-wrap">
              <div className="preview-ring preview-ring--1" />
              <div className="preview-ring preview-ring--2" />
              <div className="preview-core">V</div>
            </div>

            <div className="landing-phone-bubbles">
              <div className="phone-bubble phone-bubble--user">Can you help me plan UAE outreach?</div>
              <div className="phone-bubble phone-bubble--ai">Yes. Let's lock the offer, then send 100/day with one follow-up sequence.</div>
            </div>
          </div>
        </div>

        <div className="landing-hero-text">
          <p className="landing-eyebrow">For OpenClaw users</p>
          <h1 className="landing-headline">
            Your voice.<br />Your AI.<br />Your gateway.
          </h1>
          <p className="landing-subhead">
            VoiceClaw is a voice interface for your OpenClaw agent.
            Talk to your AI on any device, in any browser - no app install needed.
          </p>
          <button
            className="landing-cta"
            onClick={() => navigate(connected ? '/app' : '/setup')}
          >
            {connected ? 'Open App' : 'Connect Your Gateway'}
            <ArrowRight size={16} />
          </button>
        </div>
      </section>

      {/* Features */}
      <section className="landing-features">
        {FEATURES.map((f, i) => (
          <div key={i} className="feature-card" style={{ animationDelay: `${0.1 + i * 0.12}s` }}>
            <div className="feature-icon">{f.icon}</div>
            <h3 className="feature-title">{f.title}</h3>
            <p className="feature-desc">{f.desc}</p>
          </div>
        ))}
      </section>

      {/* How it works */}
      <section className="landing-how">
        <p className="landing-section-label">How it works</p>
        <div className="how-steps">
          {HOW_IT_WORKS.map((s, i) => (
            <div key={i} className="how-step">
              <span className="how-step-num">{s.step}</span>
              <h3 className="how-step-title">{s.title}</h3>
              <p className="how-step-desc">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Works on */}
      <section className="landing-compat">
        <p className="landing-section-label">Works on</p>
        <div className="compat-row">
          <div className="compat-item"><Globe size={16} /><span>Chrome</span></div>
          <div className="compat-item"><Globe size={16} /><span>Safari</span></div>
          <div className="compat-item"><Globe size={16} /><span>Firefox</span></div>
          <div className="compat-item"><Monitor size={16} /><span>Desktop</span></div>
          <div className="compat-item"><Smartphone size={16} /><span>Mobile</span></div>
        </div>
        <p className="compat-note">
          Microphone permission required · No app install · Works as PWA (Add to Home Screen)
        </p>
      </section>

      {/* Quick start */}
      <section className="landing-quickstart">
        <p className="landing-section-label">Setup takes 2 minutes</p>

        <div className="quickstart-grid">
          <div className="quickstart-card">
            <h3 className="quickstart-title">✅ Bridge setup (automatic)</h3>
            <ol className="quickstart-list">
              <li>Click <strong>Get Started</strong> — pair code generates automatically</li>
              <li>Copy the install command and run it:<br />
                <strong>Windows:</strong> <span className="mono">irm https://www.voiceclaw.io/install.ps1 | iex</span><br />
                <strong>Mac/Linux:</strong> <span className="mono">curl -fsSL https://www.voiceclaw.io/install.sh | bash</span>
              </li>
              <li>Enter the pair code when the installer asks (2 prompts only)</li>
              <li>Page detects connection automatically → tap the orb and talk 🎙️</li>
            </ol>
            <p className="quickstart-note">⚠️ Windows: use PowerShell, not Command Prompt or Git Bash.</p>
          </div>

          <div className="quickstart-card">
            <h3 className="quickstart-title">⚙️ Direct gateway (advanced)</h3>
            <ol className="quickstart-list">
              <li>Switch to <span className="mono">Direct Gateway</span> mode in setup</li>
              <li>Enter your OpenClaw gateway URL and auth token</li>
              <li>Test connection → done</li>
            </ol>
            <p className="quickstart-note">Only if you know what you're doing. No bridge required.</p>
          </div>
        </div>
      </section>

      {/* Gateway access warning */}
      <section className="landing-warning">
        <div className="warning-card">
          <div className="warning-icon"><Wifi size={18} /></div>
          <div>
            <p className="warning-title">Gateway must be publicly accessible</p>
            <p className="warning-desc">
              VoiceClaw works anywhere - but your OpenClaw gateway must be reachable from the internet, not just your local network.
              If you run it on <span className="mono">localhost</span>, it only works on the same WiFi.
              For mobile use anywhere, run your gateway on a VPS, or expose it with{' '}
              <a href="https://tailscale.com" target="_blank" rel="noopener noreferrer">Tailscale</a>
              {' '}or <a href="https://ngrok.com" target="_blank" rel="noopener noreferrer">ngrok</a>.
            </p>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="landing-bottom">
        <p className="landing-bottom-label">Requires OpenClaw gateway</p>
        <button
          className="landing-cta landing-cta--ghost"
          onClick={() => navigate(connected ? '/app' : '/setup')}
        >
          {connected ? 'Open App' : 'Set Up in 30 Seconds'}
          <ArrowRight size={16} />
        </button>
      </section>

      <footer className="landing-footer">
        <span className="mono">voiceclaw.io</span>
        <span>·</span>
        <a href="https://openclaw.ai" target="_blank" rel="noopener noreferrer">
          Powered by OpenClaw
        </a>
      </footer>
    </div>
  );
}
