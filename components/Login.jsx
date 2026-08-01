'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'back'];

// Full-screen PIN pad — the only thing rendered when there's no valid
// session (app/page.jsx decides that server-side). On success it doesn't
// hold any client-side session state itself; it just asks the server
// component to re-render so it picks up the fresh session cookie.
export default function Login() {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const press = (k) => {
    if (busy) return;
    setError(null);
    if (k === 'back') setPin((p) => p.slice(0, -1));
    else if (k === 'C') setPin('');
    else setPin((p) => (p.length < 8 ? p + k : p));
  };

  const submit = async () => {
    if (!pin || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/staff/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const d = await res.json();
      if (!d.success) {
        setError(d.error ?? 'Login failed');
        setPin('');
        setBusy(false);
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <h1 className="login-title">Crab Island</h1>
        <p className="login-sub">Enter your PIN to clock in</p>

        <div className="login-dots">
          {pin.length === 0 ? (
            <span className="login-dots-placeholder">Enter PIN</span>
          ) : (
            Array.from({ length: pin.length }).map((_, i) => <span key={i} className="login-dot" />)
          )}
        </div>

        {error && <div className="login-error">{error}</div>}

        <div className="pay-numpad login-numpad">
          {KEYS.map((k) =>
            k === 'back' ? (
              <button key={k} className="pay-numpad-key pay-numpad-back" onClick={() => press(k)} disabled={busy}>⌫</button>
            ) : k === 'C' ? (
              <button key={k} className="pay-numpad-key pay-numpad-back" onClick={() => press(k)} disabled={busy}>C</button>
            ) : (
              <button key={k} className="pay-numpad-key" onClick={() => press(k)} disabled={busy}>{k}</button>
            )
          )}
        </div>

        <button className="btn-primary login-submit" onClick={submit} disabled={!pin || busy}>
          {busy ? 'Checking…' : 'Log In'}
        </button>
      </div>
    </div>
  );
}
