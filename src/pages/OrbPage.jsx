import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings, X, LogOut, Mic, Volume2, Zap } from 'lucide-react';
import { useVoiceSession } from '../hooks/useVoiceSession';
import { getGateway, clearGateway, clearBridge } from '../lib/gateway';
import '../App.css';

const VOICES = [
  { id: 'onyx',    label: 'Onyx',    desc: 'Deep, authoritative' },
  { id: 'echo',    label: 'Echo',    desc: 'Warm, conversational' },
  { id: 'fable',   label: 'Fable',   desc: 'Expressive, storytelling' },
  { id: 'alloy',   label: 'Alloy',   desc: 'Neutral, versatile' },
  { id: 'nova',    label: 'Nova',    desc: 'Friendly, female' },
  { id: 'shimmer', label: 'Shimmer', desc: 'Clear, female' },
];

export default function OrbPage() {
  const navigate = useNavigate();
  const gateway = getGateway();

  const [selectedVoice, setSelectedVoice] = useState(
    () => localStorage.getItem('voiceclaw_voice') || 'onyx'
  );
  const [showSettings, setShowSettings] = useState(false);

  const {
    state,
    statusText,
    transcript,
    handleOrbTap,
    handleOrbLongPress,
    isListening,
    isProcessing,
    isSpeaking,
    isError,
    STATES,
  } = useVoiceSession(selectedVoice);

  const longPressTimer = useRef(null);
  const longPressTriggered = useRef(false);

  const startPress = () => {
    longPressTriggered.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      handleOrbLongPress();
    }, 700);
  };

  const endPress = () => {
    clearTimeout(longPressTimer.current);
    if (!longPressTriggered.current) handleOrbTap();
  };

  const cancelPress = () => clearTimeout(longPressTimer.current);

  const selectVoice = (id) => {
    setSelectedVoice(id);
    localStorage.setItem('voiceclaw_voice', id);
  };

  const handleDisconnect = () => {
    clearGateway();
    clearBridge();
    navigate('/setup');
  };

  const orbClass = [
    'orb',
    isListening  && 'orb--listening',
    isProcessing && 'orb--processing',
    isSpeaking   && 'orb--speaking',
    isError      && 'orb--error',
  ].filter(Boolean).join(' ');

  const hintText = () => {
    if (state === STATES.IDLE || isError) return 'Tap to speak';
    if (isListening)  return 'Tap to stop · Hold to cancel';
    if (isProcessing) return 'Hold to cancel';
    if (isSpeaking)   return 'Tap to interrupt';
    return '';
  };

  return (
    <div className="app">
      {/* Top bar */}
      <div className="settings-bar">
        <span className="gateway-label">
          {gateway?.url?.replace(/https?:\/\//, '').slice(0, 24)}
        </span>
        <button
          className="voice-btn"
          onClick={() => setShowSettings(true)}
          aria-label="Settings"
        >
          <Settings size={14} style={{ display: 'inline', marginRight: 4 }} />
          {VOICES.find(v => v.id === selectedVoice)?.label}
        </button>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div className="voice-menu-overlay" onClick={() => setShowSettings(false)}>
          <div className="voice-menu" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <p className="voice-menu-title" style={{ margin: 0 }}>Settings</p>
              <button
                onClick={() => setShowSettings(false)}
                style={{ background: 'none', border: 'none', color: '#9b9bc0', cursor: 'pointer', padding: 4 }}
              >
                <X size={16} />
              </button>
            </div>

            <p className="voice-menu-title" style={{ fontSize: '0.7rem', marginBottom: 6, textAlign: 'left' }}>Voice</p>
            {VOICES.map(v => (
              <button
                key={v.id}
                className={`voice-option ${selectedVoice === v.id ? 'voice-option--active' : ''}`}
                onClick={() => selectVoice(v.id)}
              >
                <span className="voice-option-name">{v.label}</span>
                <span className="voice-option-desc">{v.desc}</span>
              </button>
            ))}

            <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <p className="voice-menu-title" style={{ fontSize: '0.7rem', marginBottom: 6, textAlign: 'left' }}>Gateway</p>
              <p style={{ fontSize: '0.75rem', color: '#7a7a9a', marginBottom: 12, fontFamily: 'JetBrains Mono, monospace', wordBreak: 'break-all' }}>
                {gateway?.url}
              </p>
              <button
                onClick={handleDisconnect}
                style={{
                  width: '100%', padding: '10px', borderRadius: 10,
                  background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                  color: '#f87171', fontSize: '0.85rem', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                }}
              >
                <LogOut size={14} /> Disconnect Gateway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status */}
      <div className="status-area">
        <p className={`status-text ${isError ? 'status-text--error' : ''}`}>{statusText}</p>
        {isListening && (
          <div className="wave-dots">
            <span /><span /><span /><span /><span />
          </div>
        )}
      </div>

      {/* Orb */}
      <div className="orb-container">
        <div
          className={orbClass}
          onTouchStart={e => { e.preventDefault(); startPress(); }}
          onTouchEnd={e => { e.preventDefault(); endPress(); }}
          onTouchCancel={cancelPress}
          onMouseDown={startPress}
          onMouseUp={endPress}
          onMouseLeave={cancelPress}
          onContextMenu={e => e.preventDefault()}
          role="button"
          aria-label={statusText}
        >
          <div className="orb-ring orb-ring--1" />
          <div className="orb-ring orb-ring--2" />
          <div className="orb-core">
            {isSpeaking   && <Volume2 size={32} color="#fff" />}
            {isListening  && <Mic size={32} color="#fff" />}
            {isProcessing && <Zap size={28} color="#c4a0ff" />}
            {!isListening && !isProcessing && !isSpeaking && (
              <div className="idle-icon">V</div>
            )}
          </div>
        </div>
        <p className="orb-hint">{hintText()}</p>
      </div>

      {/* Transcript */}
      {transcript.length > 0 && (
        <div className="transcript-area">
          {transcript.slice(-4).map((line, i) => (
            <div
              key={i}
              className={`transcript-line ${line.role === 'user' ? 'transcript-line--user' : 'transcript-line--assistant'}`}
            >
              <span className="transcript-role">
                {line.role === 'user' ? 'You' : 'VoiceClaw'}:
              </span>{' '}
              {line.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
