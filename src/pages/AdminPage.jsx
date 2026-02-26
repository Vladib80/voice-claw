import { useState } from 'react';

export default function AdminPage() {
  const [token, setToken] = useState(localStorage.getItem('voiceclaw_admin_token') || '');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      localStorage.setItem('voiceclaw_admin_token', token);
      const res = await fetch('/api/admin/metrics', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setData(json);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100dvh', background: '#0a0e1a', color: '#e2e8f0', padding: 24, fontFamily: 'Space Grotesk, sans-serif' }}>
      <h1 style={{ marginTop: 0 }}>VoiceClaw Metrics</h1>
      <p style={{ color: '#94a3b8' }}>Admin only</p>
      <div style={{ display: 'flex', gap: 8, maxWidth: 640, marginBottom: 16 }}>
        <input
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="VOICECLAW_ADMIN_TOKEN"
          style={{ flex: 1, background: '#111827', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 8, padding: '10px 12px' }}
        />
        <button onClick={load} disabled={loading} style={{ background: '#8b5cf6', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 14px', cursor: 'pointer' }}>
          {loading ? 'Loading...' : 'Load'}
        </button>
      </div>
      {error && <p style={{ color: '#f87171' }}>{error}</p>}
      {data && (
        <pre style={{ background: '#111827', border: '1px solid #334155', borderRadius: 10, padding: 16, overflow: 'auto' }}>
{JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}
