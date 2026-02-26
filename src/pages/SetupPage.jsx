import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, ArrowRight, AlertCircle, Loader, WifiOff, ChevronDown, ChevronUp, Terminal, Link2, Copy, RefreshCw, Check } from 'lucide-react';
import { setGateway, setBridge } from '../lib/gateway';
import './SetupPage.css';

const STEPS = ['Connect', 'Test', 'Ready'];

const OPENCLAW_CONFIG_SNIPPET = `{
  "gateway": {
    "auth": {
      "mode": "token",
      "token": "your-secret-token"
    },
    "http": {
      "endpoints": {
        "chatCompletions": { "enabled": true }
      }
    }
  }
}`;

const RESTART_CMD = 'openclaw gateway restart';
const DEFAULT_GATEWAY_URL = 'http://localhost:18789';
const INSTALL_CMD_MAC = 'curl -fsSL https://www.voiceclaw.io/install.sh | bash';
const INSTALL_CMD_WIN = 'irm https://www.voiceclaw.io/install.ps1 | iex';

export default function SetupPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [url, setUrl] = useState(DEFAULT_GATEWAY_URL);
  const [showSetupGuide, setShowSetupGuide] = useState(false);
  const [token, setToken] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // null | 'ok' | 'error'
  const [testError, setTestError] = useState('');

  const [setupMode, setSetupMode] = useState('bridge'); // bridge | gateway
  const [pairing, setPairing] = useState({ loading: false, pairId: '', pairCode: '', status: '', connected: false, expiresAt: null, bridgeId: '' });
  const [copiedKey, setCopiedKey] = useState('');
  const [timeLeft, setTimeLeft] = useState(null);
  const pollRef = useRef(null);
  const countdownRef = useRef(null);

  // Auto-generate pair code when bridge mode is selected
  useEffect(() => {
    if (setupMode === 'bridge' && !pairing.pairId && !pairing.loading) {
      startPairing();
    }
  }, [setupMode]); // eslint-disable-line

  // Countdown timer for pair code expiry
  useEffect(() => {
    if (!pairing.expiresAt) return;
    clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      const secs = Math.max(0, Math.floor((pairing.expiresAt - Date.now()) / 1000));
      setTimeLeft(secs);
      if (secs === 0) {
        clearInterval(countdownRef.current);
        setPairing(p => ({ ...p, pairCode: '', pairId: '', status: 'expired' }));
        startPairing(); // auto-refresh expired code
      }
    }, 1000);
    return () => clearInterval(countdownRef.current);
  }, [pairing.expiresAt]); // eslint-disable-line

  // Auto-poll for bridge status every 2s once pair code exists
  useEffect(() => {
    if (!pairing.pairId || pairing.connected) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/bridge/pair/status/${pairing.pairId}`);
        const data = await res.json();
        if (!res.ok) return;
        setPairing(p => ({ ...p, status: data.status, connected: !!data.connected, bridgeId: data.bridgeId || p.bridgeId }));
        // Save bridgeId as soon as paired — don't wait for WS connected
        if (data.bridgeId) setBridge(data.bridgeId);
        if (data.connected && data.bridgeId) {
          clearInterval(pollRef.current);
          setTimeout(() => setStep(2), 600);
        }
      } catch {}
    }, 2000);
    return () => clearInterval(pollRef.current);
  }, [pairing.pairId, pairing.connected]); // eslint-disable-line

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    setTestError('');
    try {
      const res = await fetch('/api/gateway-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.replace(/\/$/, ''), token }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setTestResult('ok');
        setGateway(url, token);
        setTimeout(() => setStep(2), 800);
      } else {
        setTestResult('error');
        setTestError(data.error || 'Connection failed');
      }
    } catch (e) {
      setTestResult('error');
      setTestError('Could not reach VoiceClaw server');
    } finally {
      setTesting(false);
    }
  };

  const startPairing = async () => {
    setPairing(p => ({ ...p, loading: true, status: '' }));
    try {
      const res = await fetch('/api/bridge/pair/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create pair code');
      setPairing({
        loading: false,
        pairId: data.pairId,
        pairCode: data.pairCode,
        status: 'pending',
        expiresAt: data.expiresAt,
        bridgeId: '',
      });
    } catch (e) {
      setPairing({ loading: false, pairId: '', pairCode: '', status: 'error', expiresAt: null, bridgeId: '' });
    }
  };

  const checkPairingStatus = async () => {
    if (!pairing.pairId) return;
    try {
      const res = await fetch(`/api/bridge/pair/status/${pairing.pairId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Status failed');
      setPairing(p => ({ ...p, status: data.status, bridgeId: data.bridgeId || '' }));
      if (data.status === 'paired') {
        if (data.bridgeId) setBridge(data.bridgeId);
        setTimeout(() => setStep(2), 400);
      }
    } catch {}
  };

  const copy = async (value, key = 'generic') => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(''), 1200);
    } catch {}
  };

  const canProceed = url.trim().length > 0 && token.trim().length > 0;

  return (
    <div className="setup">
      {/* Header */}
      <div className="setup-header">
        <span className="setup-logo">VoiceClaw</span>
        <p className="setup-subtitle">Setup</p>
      </div>

      {/* Progress */}
      <div className="setup-progress">
        {STEPS.map((s, i) => (
          <div key={s} className={`step-item ${i <= step ? 'step-item--active' : ''} ${i < step ? 'step-item--done' : ''}`}>
            <div className="step-dot">
              {i < step ? <CheckCircle size={14} /> : <span>{i + 1}</span>}
            </div>
            <span className="step-label">{s}</span>
            {i < STEPS.length - 1 && <div className="step-line" />}
          </div>
        ))}
      </div>

      {/* Card */}
      <div className="setup-card">

        {/* Step 0 — Enter credentials */}
        {step === 0 && (
          <div className="setup-step" key="step0">
            <h2 className="setup-title">Connect OpenClaw</h2>
            <p className="setup-desc">
              Recommended: pair local VoiceClaw Bridge (safer, full OpenClaw access).
              Advanced: direct gateway token mode.
            </p>

            <div className="mode-switch">
              <button className={`mode-btn ${setupMode === 'bridge' ? 'mode-btn--active' : ''}`} onClick={() => setSetupMode('bridge')}>
                <Link2 size={13} /> Bridge (recommended)
              </button>
              <button className={`mode-btn ${setupMode === 'gateway' ? 'mode-btn--active' : ''}`} onClick={() => setSetupMode('gateway')}>
                <Terminal size={13} /> Direct Gateway
              </button>
            </div>

            {setupMode === 'bridge' && (
              <div className="bridge-box">

                {/* Sub-step 1: Pair code */}
                <div className={`bridge-substep ${pairing.pairCode ? 'bridge-substep--done' : 'bridge-substep--active'}`}>
                  <div className="bridge-substep-icon">
                    {pairing.pairCode ? <CheckCircle size={16} /> : pairing.loading ? <Loader size={16} className="spin" /> : <span>1</span>}
                  </div>
                  <div className="bridge-substep-body">
                    <p className="bridge-substep-label">{pairing.pairCode ? 'Pair code ready' : 'Generating pair code...'}</p>
                    {pairing.pairCode && (
                      <>
                        <div className="pair-code-row">
                          <span className="pair-code mono">{pairing.pairCode}</span>
                          <button className="icon-btn" onClick={() => copy(pairing.pairCode, 'pair-code')}>
                            {copiedKey === 'pair-code' ? <Check size={13} /> : <Copy size={13} />}
                          </button>
                        </div>
                        {timeLeft !== null && (
                          <p className={`pair-code-expiry ${timeLeft < 60 ? 'pair-code-expiry--urgent' : ''}`}>
                            {timeLeft > 0
                              ? `⏱ Code expires in ${Math.floor(timeLeft / 60)}:${String(timeLeft % 60).padStart(2, '0')}`
                              : '🔄 Code expired — generating new one...'}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Sub-step 2: Run installer */}
                <div className={`bridge-substep ${!pairing.pairCode ? 'bridge-substep--waiting' : pairing.status === 'paired' ? 'bridge-substep--done' : 'bridge-substep--active'}`}>
                  <div className="bridge-substep-icon">
                    {pairing.status === 'paired' || pairing.connected ? <CheckCircle size={16} /> : <span>2</span>}
                  </div>
                  <div className="bridge-substep-body">
                    <p className="bridge-substep-label">Run installer on your PC</p>
                    {pairing.pairCode && (
                      <>
                        <p className="bridge-substep-hint">Open PowerShell on Windows or Terminal on Mac and run:</p>
                        <div className="copy-row">
                          <pre className="setup-code">{INSTALL_CMD_WIN}</pre>
                          <button className="icon-btn" onClick={() => copy(INSTALL_CMD_WIN, 'install-win')}>
                            {copiedKey === 'install-win' ? <Check size={13} /> : <Copy size={13} />}
                          </button>
                        </div>
                        <div className="copy-row" style={{ marginTop: 6 }}>
                          <pre className="setup-code">{INSTALL_CMD_MAC}</pre>
                          <button className="icon-btn" onClick={() => copy(INSTALL_CMD_MAC, 'install-mac')}>
                            {copiedKey === 'install-mac' ? <Check size={13} /> : <Copy size={13} />}
                          </button>
                        </div>
                        <p className="bridge-substep-hint" style={{ marginTop: 8 }}>
                          Enter the pair code <strong>{pairing.pairCode}</strong> when prompted.
                        </p>
                      </>
                    )}
                  </div>
                </div>

                {/* Sub-step 3: Bridge connecting */}
                <div className={`bridge-substep ${!pairing.status ? 'bridge-substep--waiting' : pairing.connected ? 'bridge-substep--done' : 'bridge-substep--active'}`}>
                  <div className="bridge-substep-icon">
                    {pairing.connected ? <CheckCircle size={16} /> : pairing.status === 'paired' ? <Loader size={16} className="spin" /> : <span>3</span>}
                  </div>
                  <div className="bridge-substep-body">
                    <p className="bridge-substep-label">
                      {pairing.connected ? 'Bridge connected! ✨' : pairing.status === 'paired' ? 'Starting bridge...' : 'Waiting for bridge connection'}
                    </p>
                    {pairing.status === 'paired' && !pairing.connected && (
                      <p className="bridge-substep-hint">Bridge installed, connecting automatically...</p>
                    )}
                  </div>
                </div>

              </div>
            )}

            {setupMode === 'gateway' && (
              <>
            {/* OpenClaw setup guide */}
            <div className="setup-guide">
              <button
                className="setup-guide-toggle"
                onClick={() => setShowSetupGuide(!showSetupGuide)}
              >
                <Terminal size={13} />
                <span>First time? Enable the API endpoint in OpenClaw</span>
                {showSetupGuide ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
              {showSetupGuide && (
                <div className="setup-guide-body">
                  <p className="setup-guide-step">1. Add this to <span className="mono">~/.openclaw/openclaw.json</span>:</p>
                  <div className="copy-row">
                    <pre className="setup-code">{OPENCLAW_CONFIG_SNIPPET}</pre>
                    <button className="icon-btn" onClick={() => copy(OPENCLAW_CONFIG_SNIPPET, 'config-snippet')}>
                      {copiedKey === 'config-snippet' ? <Check size={13} /> : <Copy size={13} />}
                    </button>
                  </div>
                  <p className="setup-guide-step">2. Restart your gateway:</p>
                  <div className="copy-row">
                    <pre className="setup-code">{RESTART_CMD}</pre>
                    <button className="icon-btn" onClick={() => copy(RESTART_CMD, 'restart-cmd')}>
                      {copiedKey === 'restart-cmd' ? <Check size={13} /> : <Copy size={13} />}
                    </button>
                  </div>
                  <p className="setup-guide-step">3. Your gateway URL is:</p>
                  <div className="copy-row">
                    <pre className="setup-code">{DEFAULT_GATEWAY_URL}</pre>
                    <button className="icon-btn" onClick={() => copy(DEFAULT_GATEWAY_URL, 'gateway-url')}>
                      {copiedKey === 'gateway-url' ? <Check size={13} /> : <Copy size={13} />}
                    </button>
                  </div>
                  <p className="setup-guide-step">4. Your token is whatever you set above as <span className="mono">"token"</span>.</p>
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="gw-url">Gateway URL</label>
              <input
                id="gw-url"
                className="form-input"
                type="url"
                placeholder="http://localhost:18789"
                value={url}
                onChange={e => setUrl(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
              <span className="form-hint">Your OpenClaw gateway address (local or remote)</span>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="gw-token">Auth Token</label>
              <input
                id="gw-token"
                className="form-input form-input--mono"
                type="password"
                placeholder="oc_••••••••••••••••"
                value={token}
                onChange={e => setToken(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
              <span className="form-hint">The token from <span className="mono">gateway.auth.token</span> in your openclaw.json</span>
            </div>

            <div className="tailscale-tip">
              <div className="tailscale-tip-header">
                <WifiOff size={13} />
                <span>Want to use VoiceClaw on mobile away from home?</span>
              </div>
              <p className="tailscale-tip-body">
                Install <a href="https://tailscale.com/download" target="_blank" rel="noopener noreferrer">Tailscale</a> on
                both your PC (running OpenClaw) and your phone. Then use your
                Tailscale IP instead of localhost — e.g.{' '}
                <span className="mono">http://100.x.x.x:18789</span>.
                Free, takes 5 minutes, works anywhere.
              </p>
            </div>

            <button
              className="setup-btn"
              onClick={() => setStep(1)}
              disabled={!canProceed}
            >
              Test Connection <ArrowRight size={15} />
            </button>
            </>
            )}
          </div>
        )}

        {/* Step 1 — Test */}
        {step === 1 && (
          <div className="setup-step" key="step1">
            <h2 className="setup-title">Testing connection</h2>
            <p className="setup-desc">
              Verifying your OpenClaw gateway is reachable and your token is valid.
            </p>

            <div className="test-box">
              <div className="test-url">
                <span className="mono">{url.replace(/\/$/, '')}</span>
              </div>

              {!testing && testResult === null && (
                <button className="setup-btn" onClick={testConnection}>
                  Run Test <Zap size={15} />
                </button>
              )}

              {testing && (
                <div className="test-status test-status--loading">
                  <Loader size={18} className="spin" />
                  <span>Connecting...</span>
                </div>
              )}

              {testResult === 'ok' && (
                <div className="test-status test-status--ok">
                  <CheckCircle size={18} />
                  <span>Connected successfully</span>
                </div>
              )}

              {testResult === 'error' && (
                <div className="test-box-error">
                  <div className="test-status test-status--error">
                    <AlertCircle size={18} />
                    <span>{testError}</span>
                  </div>
                  <button className="setup-btn setup-btn--ghost" onClick={() => setStep(0)}>
                    Update credentials
                  </button>
                  <button className="setup-btn" onClick={testConnection} disabled={testing}>
                    Retry
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 2 — Done */}
        {step === 2 && (
          <div className="setup-step setup-step--center" key="step2">
            <div className="success-orb">
              <CheckCircle size={40} color="#8b5cf6" />
            </div>
            <h2 className="setup-title">You're connected</h2>
            <p className="setup-desc">
              {setupMode === 'bridge'
                ? 'VoiceClaw Bridge is paired with your OpenClaw machine.'
                : 'VoiceClaw is linked to your OpenClaw gateway.'}
              <br />Tap the orb and start talking.
            </p>
            <button className="setup-btn" onClick={() => navigate('/app')}>
              Open VoiceClaw <ArrowRight size={15} />
            </button>
          </div>
        )}
      </div>

      <p className="setup-footer-note">
        Bridge mode keeps OpenClaw token local. Direct gateway mode stores credentials only in your browser.
      </p>
    </div>
  );
}

// Inline Zap since we need it here
function Zap({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}
