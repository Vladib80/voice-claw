import { useState, useRef, useCallback, useEffect } from 'react';
import { getGateway, getBridge, getApiKeys } from '../lib/gateway';

const STATES = {
  IDLE: 'idle',
  LISTENING: 'listening',
  PROCESSING: 'processing',
  SPEAKING: 'speaking',
  ERROR: 'error',
};

const SILENCE_THRESHOLD = 15;
const SILENCE_DURATION = 1500;
const MIN_RECORDING_MS = 500;
const MAX_RECORDING_MS = 30000;

export function useVoiceSession(voice = 'onyx') {
  const [state, setState] = useState(STATES.IDLE);
  const [statusText, setStatusText] = useState('Tap to start');
  const [transcript, setTranscript] = useState([]);
  const [error, setError] = useState(null);

  const mediaRecorderRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const silenceTimerRef = useRef(null);
  const recordingStartRef = useRef(0);
  const stateRef = useRef(STATES.IDLE);
  const historyRef = useRef([]);
  const playbackCtxRef = useRef(null); // persistent AudioContext for TTS playback
  const currentSourceRef = useRef(null);

  const updateState = useCallback((s) => {
    stateRef.current = s;
    setState(s);
  }, []);

  // Get or create a persistent AudioContext for playback (must be called from user gesture first time)
  const getPlaybackCtx = useCallback(() => {
    if (!playbackCtxRef.current || playbackCtxRef.current.state === 'closed') {
      playbackCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (playbackCtxRef.current.state === 'suspended') {
      playbackCtxRef.current.resume();
    }
    return playbackCtxRef.current;
  }, []);

  // ── Cleanup ──────────────────────────────────────────────────
  const cleanup = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    // Stop mic stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    // Close analyser audio context (not playback ctx)
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (currentSourceRef.current) {
      try { currentSourceRef.current.stop(); } catch {}
      currentSourceRef.current = null;
    }
  }, []);

  const stopAll = useCallback(() => {
    cleanup();
    updateState(STATES.IDLE);
    setStatusText('Tap to start');
  }, [cleanup, updateState]);

  // ── Play base64 mp3 via Web Audio API (no autoplay issues) ────
  const playBase64Audio = useCallback((base64) => {
    return new Promise((resolve) => {
      try {
        const ctx = getPlaybackCtx();
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

        ctx.decodeAudioData(bytes.buffer, (audioBuffer) => {
          const source = ctx.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(ctx.destination);
          currentSourceRef.current = source;
          source.onended = () => {
            currentSourceRef.current = null;
            resolve();
          };
          source.start(0);
        }, (err) => {
          console.error('decodeAudioData failed:', err);
          resolve();
        });
      } catch (err) {
        console.error('playBase64Audio error:', err);
        resolve();
      }
    });
  }, [getPlaybackCtx]);

  // ── Ensure we have a mic stream (request permission only once) ──
  const ensureStream = useCallback(async () => {
    if (streamRef.current) {
      // Check if tracks are still alive
      const tracks = streamRef.current.getAudioTracks();
      if (tracks.length > 0 && tracks[0].readyState === 'live') {
        return streamRef.current;
      }
      // Stream is dead, clean up
      streamRef.current = null;
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    streamRef.current = stream;
    return stream;
  }, []);

  // ── Process audio blob ─────────────────────────────────────────
  const processAudio = useCallback(async (blob) => {
    updateState(STATES.PROCESSING);
    setStatusText('Thinking...');

    try {
      const formData = new FormData();
      const ext = blob.type.includes('mp4') || blob.type.includes('m4a') ? 'mp4' : 'webm';
      formData.append('audio', blob, `audio.${ext}`);

      const { groqKey: _groqKey } = getApiKeys();
      const _br = getBridge();
      if (_groqKey) formData.append('groqKey', _groqKey);
      if (_br?.bridgeId) formData.append('bridgeId', _br.bridgeId);

      const transcribeRes = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });

      if (!transcribeRes.ok) {
        const err = await transcribeRes.json().catch(() => ({}));
        throw new Error(err.error || `Transcribe failed: ${transcribeRes.status}`);
      }

      const { text: userText } = await transcribeRes.json();

      if (!userText || !userText.trim()) {
        updateState(STATES.IDLE);
        startListening();
        return;
      }

      setTranscript((prev) => [...prev.slice(-8), { role: 'user', text: userText }]);

      historyRef.current = [
        ...historyRef.current,
        { role: 'user', content: userText },
      ].slice(-20);

      const gw = getGateway();
      const br = getBridge();
      const { openaiKey: _openaiKey, groqKey: _groqKey2 } = getApiKeys();
      const respondRes = await fetch('/api/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: userText,
          history: historyRef.current.slice(0, -1),
          voice,
          gatewayUrl: gw?.url || null,
          gatewayToken: gw?.token || null,
          bridgeId: br?.bridgeId || null,
          openaiKey: _openaiKey || null,
          groqKey: _groqKey2 || null,
        }),
      });

      if (!respondRes.ok) {
        const err = await respondRes.json().catch(() => ({}));
        throw new Error(err.error || `Respond failed: ${respondRes.status}`);
      }

      const { text: assistantText, audio: audioBase64 } = await respondRes.json();

      historyRef.current = [
        ...historyRef.current,
        { role: 'assistant', content: assistantText },
      ].slice(-20);

      setTranscript((prev) => [...prev.slice(-8), { role: 'assistant', text: assistantText }]);

      updateState(STATES.SPEAKING);
      setStatusText('Speaking...');

      await playBase64Audio(audioBase64);

      if (stateRef.current === STATES.SPEAKING) {
        startListening();
      }
    } catch (err) {
      console.error('Pipeline error:', err);
      setError(err.message);
      setStatusText('Error — tap to retry');
      updateState(STATES.ERROR);
    }
  }, [updateState, playBase64Audio]);

  // ── Silence detection loop ────────────────────────────────────
  const startSilenceDetection = useCallback(() => {
    if (!analyserRef.current) return;
    const analyser = analyserRef.current;
    const data = new Uint8Array(analyser.fftSize);
    let lastSoundTime = Date.now();

    const check = () => {
      if (stateRef.current !== STATES.LISTENING) return;

      analyser.getByteTimeDomainData(data);
      let maxAmplitude = 0;
      for (let i = 0; i < data.length; i++) {
        const v = Math.abs(data[i] - 128);
        if (v > maxAmplitude) maxAmplitude = v;
      }

      if (maxAmplitude > SILENCE_THRESHOLD) {
        lastSoundTime = Date.now();
      }

      const elapsed = Date.now() - recordingStartRef.current;
      const silenceDuration = Date.now() - lastSoundTime;

      if (elapsed > MIN_RECORDING_MS && silenceDuration > SILENCE_DURATION) {
        stopRecording();
        return;
      }

      if (elapsed > MAX_RECORDING_MS) {
        stopRecording();
        return;
      }

      requestAnimationFrame(check);
    };

    requestAnimationFrame(check);
  }, []);

  const stopRecording = useCallback(() => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') return;
    mediaRecorderRef.current.stop();
  }, []);

  // ── Start listening (reuses existing mic stream) ───────────────
  const startListening = useCallback(async () => {
    // Close previous analyser context (not the stream!)
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    updateState(STATES.LISTENING);
    setStatusText('Listening...');
    setError(null);
    chunksRef.current = [];

    try {
      const stream = await ensureStream();

      // Set up analyser for VAD
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      // Choose MIME type
      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        } else if (MediaRecorder.isTypeSupported('audio/webm')) {
          mimeType = 'audio/webm';
        } else {
          mimeType = '';
        }
      }

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        // DON'T stop stream tracks here — reuse the stream!
        const effectiveMime = recorder.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: effectiveMime });

        if (blob.size < 1000) {
          if (stateRef.current === STATES.LISTENING || stateRef.current === STATES.PROCESSING) {
            startListening();
          }
          return;
        }

        await processAudio(blob);
      };

      recorder.start(100);
      recordingStartRef.current = Date.now();
      startSilenceDetection();
    } catch (err) {
      console.error('Mic error:', err);
      if (err.name === 'NotAllowedError') {
        setStatusText('Microphone permission denied');
      } else {
        setStatusText('Mic error — tap to retry');
      }
      setError(err.message);
      updateState(STATES.ERROR);
    }
  }, [updateState, processAudio, startSilenceDetection, ensureStream]);

  useEffect(() => {}, [startListening]);

  // ── Orb tap handler ────────────────────────────────────────────
  const handleOrbTap = useCallback(async () => {
    // Initialize playback AudioContext on first user gesture
    getPlaybackCtx();

    const current = stateRef.current;

    if (current === STATES.IDLE || current === STATES.ERROR) {
      await startListening();
    } else if (current === STATES.LISTENING) {
      stopRecording();
    } else if (current === STATES.SPEAKING) {
      if (currentSourceRef.current) {
        try { currentSourceRef.current.stop(); } catch {}
        currentSourceRef.current = null;
      }
      await startListening();
    } else if (current === STATES.PROCESSING) {
      stopAll();
    }
  }, [startListening, stopRecording, stopAll, getPlaybackCtx]);

  const handleOrbLongPress = useCallback(() => {
    stopAll();
  }, [stopAll]);

  useEffect(() => {
    return () => {
      cleanup();
      // Close playback context on unmount
      if (playbackCtxRef.current) {
        playbackCtxRef.current.close().catch(() => {});
      }
    };
  }, [cleanup]);

  return {
    state,
    statusText,
    transcript,
    error,
    handleOrbTap,
    handleOrbLongPress,
    isIdle: state === STATES.IDLE,
    isListening: state === STATES.LISTENING,
    isProcessing: state === STATES.PROCESSING,
    isSpeaking: state === STATES.SPEAKING,
    isError: state === STATES.ERROR,
    STATES,
  };
}
