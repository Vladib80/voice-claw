import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, ArrowRight, AlertCircle, Loader, Terminal, Link2, Copy, Check } from 'lucide-react';
import { setGateway, setBridge, setApiKeys } from '../lib/gateway';
import './SetupPage.css';

const STEPS = ['Connect', 'Test', 'Ready'];

// Platform-specific install commands
const makeInstallCmd = (pairCode, platform) => {
  if (platform === 'win') return `irm voiceclaw.io/install.ps1 | iex`;
  return `curl -fsSL voiceclaw.io/install.sh | bash -s ${pairCode}`;
};

const GATEWAY_PRESETS = [
  { id: 'openclaw',   label: 'OpenClaw',   url: 'http://127.0.0.1:18789',    tokenRequired: true,  tokenLabel: 'Gateway Token',         tokenPlaceholder: 'your-gateway-token', tokenHint: 'Find it in ~/.openclaw/openclaw.json → gateway.auth.token', hint: 'Your OpenClaw AI agent (enable chatCompletions endpoint first)', local: true },
  { id: 'ollama',     label: 'Ollama',     url: 'http://127.0.0.1:11434',    tokenRequired: false, tokenLabel: null,                    tokenPlaceholder: null,            tokenHint: null,                                                       hint: 'Run: ollama serve — no token needed', local: true },
  { id: 'lmstudio',  label: 'LM Studio',  url: 'http://127.0.0.1:1234',     tokenRequired: false, tokenLabel: null,                    tokenPlaceholder: null,            tokenHint: null,                                                       hint: 'Start LM Studio → Local Server tab — no token needed', local: true },
  { id: 'openrouter', label: 'OpenRouter', url: 'https://openrouter.ai/api', tokenRequired: true,  tokenLabel: 'OpenRouter API Key',    tokenPlaceholder: 'sk-or-v1-...',  tokenHint: 'Get one at openrouter.ai/keys — routes to 100+ models', hint: 'Access 100+ models (Claude, GPT-4, Llama) with one key' },
  { id: 'openai',    label: 'OpenAI',     url: 'https://api.openai.com',    tokenRequired: true,  tokenLabel: 'OpenAI API Key',        tokenPlaceholder: 'sk-proj-...',   tokenHint: 'Get one at platform.openai.com/api-keys', hint: 'GPT-4o, o1, and other OpenAI models' },
  { id: 'anthropic', label: 'Claude',     url: null,                        tokenRequired: true,  tokenLabel: 'Anthropic API Key',     tokenPlaceholder: 'sk-ant-...',    tokenHint: 'Get one at console.anthropic.com', hint: null, bridgeOnly: true },
  { id: 'custom',    label: 'Custom',     url: '',                          tokenRequired: false, tokenLabel: 'Auth Token (optional)', tokenPlaceholder: 'optional',      tokenHint: 'Any OpenAI-compatible API endpoint', hint: 'Enter any OpenAI-compatible gateway URL' },
];

export default function SetupPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [url, setUrl] = useState(GATEWAY_PRESETS[0]?.url || 'http://127.0.0.1:18789');
  const [token, setToken] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // null | 'ok' | 'error'
  const [testError, setTestError] = useState('');

  const [setupMode, setSetupMode] = useState('bridge'); // bridge | gateway
  const [pairing, setPairing] = useState({ loading: false, pairId: '', pairCode: '', status: '', connected: false, expiresAt: null, bridgeId: '' });
  const [openaiKey, setOpenaiKey] = useState('');
  const [groqKey, setGroqKey] = useState('');
  const [copiedKey, setCopiedKey] = useState('');
  const [gatewayPreset, setGatewayPreset] = useState('openclaw');
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
        if (openaiKey || groqKey) setApiKeys(openaiKey, groqKey);
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

  const handlePresetSelect = (presetId) => {
    setGatewayPreset(presetId);
    const preset = GATEWAY_PRESETS.find(p => p.id === presetId);
    if (preset?.url !== null && preset?.url !== undefined) setUrl(preset.url);
    if (!preset?.tokenRequired) setToken('');
  };

  const copy = async (value, key = 'generic') => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(''), 1200);
    } catch {}
  };

  const activePreset = GATEWAY_PRESETS.find(p => p.id === gatewayPreset) ?? GATEWAY_PRESETS[0];
  const tokenOk = !activePreset.tokenRequired || token.trim().length > 0;
  const canProceed = url.trim().length > 0 && tokenOk && openaiKey.trim().length > 0 && groqKey.trim().length > 0;

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
            <h2 className="setup-title">
              {setupMode === 'bridge' ? 'Bridge Setup' : `Connect ${activePreset.label}`}
            </h2>
            <p className="setup-desc">
              {setupMode === 'bridge'
                ? 'Install the bridge on your PC — the installer will ask you to pick your AI (Ollama, Claude, LM Studio, etc.) and add voice API keys. No port forwarding needed.'
                : 'Connect any OpenAI-compatible AI. Pick your backend below.'}
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
                    <p className="bridge-substep-label">Run on your PC</p>
                    {pairing.pairCode && (
                      <>
                        <p className="bridge-substep-hint">Open a terminal and paste:</p>
                        <p className="platform-label">Mac / Linux</p>
                        <div className="copy-row">
                          <pre className="setup-code">{makeInstallCmd(pairing.pairCode, 'mac')}</pre>
                          <button className="icon-btn" onClick={() => copy(makeInstallCmd(pairing.pairCode, 'mac'), 'install-mac')}>
                            {copiedKey === 'install-mac' ? <Check size={13} /> : <Copy size={13} />}
                          </button>
                        </div>
                        <p className="platform-label" style={{ marginTop: 10 }}>Windows (PowerShell)</p>
                        <div className="copy-row">
                          <pre className="setup-code">{makeInstallCmd(pairing.pairCode, 'win')}</pre>
                          <button className="icon-btn" onClick={() => copy(makeInstallCmd(pairing.pairCode, 'win'), 'install-win')}>
                            {copiedKey === 'install-win' ? <Check size={13} /> : <Copy size={13} />}
                          </button>
                        </div>
                        <p className="bridge-substep-hint" style={{ marginTop: 8, fontSize: '0.7rem' }}>
                          Windows: the installer will ask for the pair code above.
                          Requires <a href="https://nodejs.org" target="_blank" rel="noopener noreferrer" style={{ color: '#a78bfa' }}>Node.js 18+</a>. Auto-detects your local AI.
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
                {/* Preset picker */}
                <div className="form-group" style={{ marginBottom: 20 }}>
                  <label className="form-label">AI Backend</label>
                  <div className="preset-picker">
                    {GATEWAY_PRESETS.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        className={`preset-btn ${gatewayPreset === p.id ? 'preset-btn--active' : ''}`}
                        onClick={() => handlePresetSelect(p.id)}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                  {activePreset.hint && <span className="form-hint" style={{ marginTop: 6 }}>{activePreset.hint}</span>}
                </div>

                {activePreset.bridgeOnly ? (
                  /* Claude requires Bridge mode */
                  <div className="preset-bridge-notice">
                    <AlertCircle size={16} style={{ flexShrink: 0, color: '#a78bfa', marginTop: 2 }} />
                    <div>
                      <p className="preset-bridge-notice-title">Claude requires Bridge mode</p>
                      <p className="preset-bridge-notice-body">
                        Claude's API isn't OpenAI-compatible. The VoiceClaw Bridge converts the format automatically — just enter your Anthropic API key when the installer prompts for it.
                      </p>
                      <button className="setup-btn" style={{ marginTop: 12 }} onClick={() => setSetupMode('bridge')}>
                        Switch to Bridge mode <ArrowRight size={14} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="form-group">
                      <label className="form-label" htmlFor="gw-url">Gateway URL</label>
                      <input
                        id="gw-url"
                        className="form-input"
                        type="url"
                        placeholder={activePreset.url || 'https://...'}
                        value={url}
                        onChange={e => setUrl(e.target.value)}
                        autoComplete="off"
                        spellCheck={false}
                      />
                    </div>

                    {activePreset.tokenRequired && (
                      <div className="form-group">
                        <label className="form-label" htmlFor="gw-token">{activePreset.tokenLabel || 'Auth Token'}</label>
                        <input
                          id="gw-token"
                          className="form-input form-input--mono"
                          type="password"
                          placeholder={activePreset.tokenPlaceholder || '••••••••'}
                          value={token}
                          onChange={e => setToken(e.target.value)}
                          autoComplete="off"
                          spellCheck={false}
                        />
                        {activePreset.tokenHint && <span className="form-hint">{activePreset.tokenHint}</span>}
                      </div>
                    )}

                    <p className="form-section-label">Voice Keys (separate from your AI)</p>

                    <div className="form-group">
                      <label className="form-label" htmlFor="openai-key">OpenAI TTS Key (text-to-speech)</label>
                      <input
                        id="openai-key"
                        className="form-input form-input--mono"
                        type="password"
                        placeholder="sk-proj-..."
                        value={openaiKey}
                        onChange={e => setOpenaiKey(e.target.value)}
                        autoComplete="off"
                        spellCheck={false}
                      />
                      <span className="form-hint">Powers the voice output. {gatewayPreset === 'openai' ? 'Can be the same key as above.' : ''} Get one at <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">platform.openai.com</a></span>
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="groq-key">Groq STT Key (speech-to-text)</label>
                      <input
                        id="groq-key"
                        className="form-input form-input--mono"
                        type="password"
                        placeholder="gsk_..."
                        value={groqKey}
                        onChange={e => setGroqKey(e.target.value)}
                        autoComplete="off"
                        spellCheck={false}
                      />
                      <span className="form-hint">Powers voice input (Groq Whisper). Get one at <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer">console.groq.com</a></span>
                    </div>

                    {activePreset.local && (
                      <div className="preset-local-warning">
                        <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
                        <div>
                          <p className="preset-local-warning-title">Local backends need Bridge mode on voiceclaw.io</p>
                          <p className="preset-local-warning-body">
                            Direct Gateway only works if this VoiceClaw instance runs on the same machine as {activePreset.label} (self-hosted).
                            Using voiceclaw.io? The server can't reach your <span className="mono">localhost</span>.{' '}
                            <button className="link-btn" onClick={() => setSetupMode('bridge')}>Switch to Bridge mode</button> instead — it handles everything.
                          </p>
                        </div>
                      </div>
                    )}

                    <button
                      className="setup-btn"
                      onClick={() => setStep(1)}
                      disabled={!canProceed}
                    >
                      Test Connection <ArrowRight size={15} />
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* Step 1 — Test */}
        {step === 1 && (
          <div className="setup-step" key="step1">
            <h2 className="setup-title">Testing connection</h2>
            <p className="setup-desc">
              Verifying your {activePreset.label} gateway is reachable and your credentials are valid.
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
                ? 'VoiceClaw Bridge is paired and connected to your machine.'
                : `VoiceClaw is linked to your ${activePreset.label} gateway.`}
              <br />Tap the orb and start talking.
            </p>
            <button className="setup-btn" onClick={() => navigate('/app')}>
              Open VoiceClaw <ArrowRight size={15} />
            </button>
          </div>
        )}
      </div>

      <p className="setup-footer-note">
        Bridge mode keeps all API keys on your machine. Direct gateway sends credentials via encrypted HTTPS.
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
