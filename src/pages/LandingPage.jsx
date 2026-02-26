import { useNavigate } from 'react-router-dom';
import { Mic, Shield, Zap, ArrowRight, Globe, Smartphone, Monitor, Cpu } from 'lucide-react';
import { isConnected } from '../lib/gateway';
import './LandingPage.css';

const FEATURES = [
  {
    icon: <Mic size={20} />,
    title: 'Speak naturally',
    desc: 'Auto-detects silence, interrupt anytime. Continuous conversation — no buttons, no waiting.',
  },
  {
    icon: <Cpu size={20} />,
    title: 'Any AI backend',
    desc: 'Works with Ollama, LM Studio, Claude, OpenRouter, OpenAI, or any OpenAI-compatible endpoint. BYOK — credentials never leave your machine.',
  },
  {
    icon: <Zap size={20} />,
    title: 'Sub-second response',
    desc: 'Groq Whisper STT + OpenAI TTS. Feels instant, even on mobile over cellular.',
  },
];

const BACKENDS = [
  { name: 'OpenClaw', tag: 'local' },
  { name: 'Ollama', tag: 'local' },
  { name: 'LM Studio', tag: 'local' },
  { name: 'Claude', tag: 'cloud' },
  { name: 'OpenRouter', tag: 'cloud' },
  { name: 'OpenAI', tag: 'cloud' },
];

const HOW_IT_WORKS = [
  { step: '01', title: 'Run one command', desc: 'Go to Setup — a pair code auto-generates. Copy the install command and run it in PowerShell or Terminal.' },
  { step: '02', title: 'Enter the code', desc: 'Paste the pair code when the installer asks. The bridge connects automatically — no port forwarding, no VPN.' },
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
          <p className="landing-eyebrow">Works with any AI</p>
          <h1 className="landing-headline">
            Your voice.<br />Your AI.<br />Your gateway.
          </h1>
          <p className="landing-subhead">
            VoiceClaw is a universal voice interface for your AI — Ollama, Claude, OpenClaw, GPT-4, or any local model.
            Talk to your AI from any device, any browser, no app install.
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

      {/* Supported backends */}
      <section className="landing-backends">
        <p className="landing-section-label">Supported AI backends</p>
        <div className="backends-row">
          {BACKENDS.map(b => (
            <div key={b.name} className="backend-chip">
              <span className="backend-name">{b.name}</span>
              <span className={`backend-tag backend-tag--${b.tag}`}>{b.tag}</span>
            </div>
          ))}
        </div>
        <p className="compat-note">Any OpenAI-compatible endpoint works — local or cloud, with your own keys</p>
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
              <li>Pick your backend: Ollama, LM Studio, OpenRouter, OpenAI, or custom</li>
              <li>Enter the URL + API key (auto-filled for known backends) → done</li>
            </ol>
            <p className="quickstart-note">No bridge required. Ollama + LM Studio need no API key at all.</p>
          </div>
        </div>
      </section>

      {/* Gateway access info */}
      <section className="landing-warning">
        <div className="warning-card">
          <div className="warning-icon"><Shield size={18} /></div>
          <div>
            <p className="warning-title">Bridge mode — no port forwarding needed</p>
            <p className="warning-desc">
              The VoiceClaw Bridge dials <em>out</em> to voiceclaw.io — your local AI is never directly exposed to the internet.
              Works from any phone, anywhere. Direct gateway mode requires your endpoint to be publicly reachable
              (VPS, <a href="https://tailscale.com" target="_blank" rel="noopener noreferrer">Tailscale</a>, or{' '}
              <a href="https://ngrok.com" target="_blank" rel="noopener noreferrer">ngrok</a>).
            </p>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="landing-bottom">
        <p className="landing-bottom-label">Works with any AI — local or cloud, your keys</p>
        <button
          className="landing-cta landing-cta--ghost"
          onClick={() => navigate(connected ? '/app' : '/setup')}
        >
          {connected ? 'Open App' : 'Set Up in 2 Minutes'}
          <ArrowRight size={16} />
        </button>
      </section>

      <footer className="landing-footer">
        <span className="mono">voiceclaw.io</span>
        <span>·</span>
        <a href="https://github.com/Vladib80/voice-claw" target="_blank" rel="noopener noreferrer">
          Open Source on GitHub
        </a>
      </footer>
    </div>
  );
}
