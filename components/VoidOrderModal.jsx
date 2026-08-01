'use client';

import { useState } from 'react';
import { Icon } from './Menu';
import { money } from './data';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'back'];

// A manager voiding from their own logged-in session skips the PIN step
// entirely — their session already proves who they are (server-side check
// in app/api/orders/void). A cashier needs a manager to step up with a PIN
// instead, since the cashier's own session was never a manager's.
export default function VoidOrderModal({ order, staffRole, onClose, onVoided }) {
  const isManager = staffRole === 'manager';
  const [step, setStep] = useState('confirm');
  const [reason, setReason] = useState('');
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

  const doVoid = async (stepUpToken) => {
    setBusy(true);
    setError(null);
    try {
      const voidRes = await fetch('/api/orders/void', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderNo: order.orderNo, reason, stepUpToken: stepUpToken ?? null }),
      });
      const voidData = await voidRes.json();
      if (!voidData.success) {
        setError(voidData.error ?? 'Void failed');
        setPin('');
        setBusy(false);
        return;
      }
      onVoided(voidData.order);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const submitWithPin = async () => {
    if (!pin || busy) return;
    setBusy(true);
    setError(null);
    try {
      const authRes = await fetch('/api/staff/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const authData = await authRes.json();
      if (!authData.success) {
        setError(authData.error ?? 'Authorization failed');
        setPin('');
        setBusy(false);
        return;
      }
      await doVoid(authData.token);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal" style={{ maxWidth: 420 }}>
        <div className="modal-head">
          <div>
            <div className="mh-num">{order.orderNo}</div>
            <h3>Void Order</h3>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close"><Icon.x /></button>
        </div>
        <div className="modal-body">
          {step === 'confirm' ? (
            <>
              <p style={{ marginTop: 0 }}>
                {order.cust.name || 'Walk-in'} · {money(order.total)} · currently <strong>{order.status}</strong>
              </p>
              <div className="opt-group">
                <label className="opt-label">Reason (optional)</label>
                <textarea
                  className="notes-input"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. customer no-show, order entered in error"
                />
              </div>
              {error && <div className="login-error">{error}</div>}
              <div className="field-error-msg">
                This cannot be undone.{!isManager && ' A manager PIN is required to continue.'}
              </div>
            </>
          ) : (
            <>
              <p style={{ marginTop: 0 }}>Enter a manager PIN to confirm voiding {order.orderNo}.</p>
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
            </>
          )}
        </div>
        <div className="modal-foot">
          {step === 'confirm' ? (
            <>
              <button className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
              <button
                className="btn-primary btn-danger"
                disabled={busy}
                onClick={isManager ? () => doVoid(null) : () => setStep('pin')}
              >
                {isManager ? (busy ? 'Voiding…' : 'Confirm Void') : 'Continue'}
              </button>
            </>
          ) : (
            <>
              <button className="btn-ghost" onClick={() => setStep('confirm')} disabled={busy}>Back</button>
              <button className="btn-primary btn-danger" onClick={submitWithPin} disabled={!pin || busy}>
                {busy ? 'Voiding…' : 'Confirm Void'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
