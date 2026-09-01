'use client';

import { useState } from 'react';
import { Icon } from './Menu';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'back'];

// Gates the manual "Open Drawer" header button behind any active staff PIN
// (cashier or manager — see /api/staff/verify-pin) so someone with no
// account at all, e.g. kitchen staff, can't just walk up and open it. The
// automatic drawer-kick after a cash payment is a separate, unrelated call
// (app/api/open-drawer directly) and intentionally doesn't go through this —
// that's already gated by an actual completed sale, not a bare button.
export default function OpenDrawerModal({ onClose, onVerified }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

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
      const res = await fetch('/api/staff/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error ?? 'Incorrect PIN');
        setPin('');
        setBusy(false);
        return;
      }
      onVerified(data.staffName);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal" style={{ maxWidth: 380 }}>
        <div className="modal-head">
          <h3>Open Drawer</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close"><Icon.x /></button>
        </div>
        <div className="modal-body">
          <p style={{ marginTop: 0 }}>Enter your PIN to open the cash drawer.</p>
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
        </div>
        <div className="modal-foot">
          <button className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={!pin || busy}>
            {busy ? 'Checking…' : 'Open Drawer'}
          </button>
        </div>
      </div>
    </div>
  );
}
