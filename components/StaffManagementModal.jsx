'use client';

import { useEffect, useState } from 'react';
import { Icon } from './Menu';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'back'];

function PinEntry({ pin, onDigit, onClear, onBack, disabled }) {
  return (
    <>
      <div className="login-dots">
        {pin.length === 0 ? (
          <span className="login-dots-placeholder">Enter PIN</span>
        ) : (
          Array.from({ length: pin.length }).map((_, i) => <span key={i} className="login-dot" />)
        )}
      </div>
      <div className="pay-numpad login-numpad">
        {KEYS.map((k) =>
          k === 'back' ? (
            <button key={k} type="button" className="pay-numpad-key pay-numpad-back" onClick={onBack} disabled={disabled}>⌫</button>
          ) : k === 'C' ? (
            <button key={k} type="button" className="pay-numpad-key pay-numpad-back" onClick={onClear} disabled={disabled}>C</button>
          ) : (
            <button key={k} type="button" className="pay-numpad-key" onClick={() => onDigit(k)} disabled={disabled}>{k}</button>
          )
        )}
      </div>
    </>
  );
}

// Manager-only staff roster + create/deactivate/reset-PIN. Mirrors
// scripts/seed-staff.mjs but as an in-app flow instead of a script a
// developer runs by hand.
export default function StaffManagementModal({ onClose }) {
  const [staff, setStaff] = useState(null);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState(null);

  const [view, setView] = useState('list'); // 'list' | 'add' | 'reset'
  const [resetTarget, setResetTarget] = useState(null); // { id, name }
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [deleteBusyId, setDeleteBusyId] = useState(null);
  const [revealed, setRevealed] = useState({}); // { [id]: 'loading' | { pin } | { error } }

  const [name, setName] = useState('');
  const [role, setRole] = useState('cashier');
  const [pin, setPin] = useState('');
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadStaff = () => {
    setLoading(true);
    setListError(null);
    fetch('/api/staff')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setStaff(d.staff);
        else setListError(d.error ?? 'Failed to load staff');
      })
      .catch((err) => setListError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(loadStaff, []);

  const press = (setter) => (k) => {
    if (busy) return;
    setFormError(null);
    if (k === 'back') setter((p) => p.slice(0, -1));
    else if (k === 'C') setter('');
    else setter((p) => (p.length < 8 ? p + k : p));
  };
  const pressPin = press(setPin);

  const resetForm = () => {
    setName(''); setRole('cashier'); setPin(''); setFormError(null);
    setResetTarget(null);
    setView('list');
  };

  const submitCreate = () => {
    if (!name.trim() || !pin || busy) return;
    setBusy(true);
    setFormError(null);
    fetch('/api/staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), role, pin }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) { setFormError(d.error ?? 'Failed to create'); setBusy(false); return; }
        resetForm();
        loadStaff();
      })
      .catch((err) => { setFormError(err.message); setBusy(false); });
  };

  const submitResetPin = () => {
    if (!pin || !resetTarget || busy) return;
    setBusy(true);
    setFormError(null);
    fetch(`/api/staff/${resetTarget.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) { setFormError(d.error ?? 'Failed to reset PIN'); setBusy(false); return; }
        resetForm();
        loadStaff();
      })
      .catch((err) => { setFormError(err.message); setBusy(false); });
  };

  const toggleActive = (member) => {
    fetch(`/api/staff/${member.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !member.active }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) { setListError(d.error ?? 'Failed to update'); return; }
        loadStaff();
      })
      .catch((err) => setListError(err.message));
  };

  const viewPin = (member) => {
    setRevealed((r) => ({ ...r, [member.id]: 'loading' }));
    fetch(`/api/staff/${member.id}/pin`)
      .then((r) => r.json())
      .then((d) => {
        setRevealed((r) => ({
          ...r,
          [member.id]: d.success ? { pin: d.pin } : { error: d.error ?? 'Failed to load PIN' },
        }));
      })
      .catch((err) => setRevealed((r) => ({ ...r, [member.id]: { error: err.message } })));
  };

  const hidePin = (id) => setRevealed((r) => {
    const next = { ...r };
    delete next[id];
    return next;
  });

  const deleteStaff = (member) => {
    setDeleteBusyId(member.id);
    fetch(`/api/staff/${member.id}`, { method: 'DELETE' })
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) { setListError(d.error ?? 'Failed to delete'); setDeleteBusyId(null); return; }
        setDeleteConfirmId(null);
        setDeleteBusyId(null);
        loadStaff();
      })
      .catch((err) => { setListError(err.message); setDeleteBusyId(null); });
  };

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal modal-stable" style={{ maxWidth: 640 }}>
        <div className="modal-head">
          <div>
            <h3>{view === 'list' ? 'Manage Staff' : view === 'add' ? 'Add Staff' : `Reset PIN — ${resetTarget?.name}`}</h3>
            <p>{view === 'list' ? 'Cashier & manager accounts' : 'A manager can pick any 4-8 digit PIN'}</p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close"><Icon.x /></button>
        </div>

        <div className="modal-body scroll">
          {view === 'list' && (
            <>
              {loading && <div className="po-empty">Loading…</div>}
              {listError && <div className="field-error-msg" style={{ marginBottom: 12 }}>{listError}</div>}
              {!loading && staff && staff.length === 0 && <div className="po-empty">No staff accounts yet.</div>}
              {!loading && staff && staff.length > 0 && (
                <div className="po-list">
                  {staff.map((m) => (
                    <div className="staff-card" key={m.id}>
                      <div className="staff-card-top">
                        <h4>{m.name}</h4>
                        <p style={{ textTransform: 'capitalize' }}>{m.role}</p>
                        <span className={`status-badge ${m.active ? 'status-active' : 'status-inactive'}`}>
                          {m.active ? 'Active' : 'Deactivated'}
                        </span>
                        {revealed[m.id] && (
                          revealed[m.id] === 'loading' ? (
                            <p className="staff-pin-reveal">Loading…</p>
                          ) : revealed[m.id].error ? (
                            <p className="field-error-msg">{revealed[m.id].error}</p>
                          ) : (
                            <p className="staff-pin-reveal">PIN: {revealed[m.id].pin}</p>
                          )
                        )}
                      </div>
                      {deleteConfirmId === m.id ? (
                        <div className="staff-card-actions">
                          <span className="field-error-msg" style={{ margin: 0, flex: '1 0 100%' }}>Delete permanently?</span>
                          <button className="icon-btn" onClick={() => setDeleteConfirmId(null)} disabled={deleteBusyId === m.id}>
                            Cancel
                          </button>
                          <button
                            className="icon-btn"
                            onClick={() => deleteStaff(m)}
                            disabled={deleteBusyId === m.id}
                            style={{ borderColor: 'var(--red)', color: 'var(--red)' }}
                          >
                            <Icon.trash /> {deleteBusyId === m.id ? 'Deleting…' : 'Confirm Delete'}
                          </button>
                        </div>
                      ) : (
                        <div className="staff-card-actions">
                          <button
                            className="icon-btn"
                            onClick={() => (revealed[m.id] ? hidePin(m.id) : viewPin(m))}
                          >
                            <Icon.search /> {revealed[m.id] ? 'Hide PIN' : 'View PIN'}
                          </button>
                          <button className="icon-btn" onClick={() => { setResetTarget({ id: m.id, name: m.name }); setView('reset'); }}>
                            <Icon.edit /> Reset PIN
                          </button>
                          <button
                            className="icon-btn"
                            onClick={() => toggleActive(m)}
                            style={m.active ? { borderColor: 'var(--red)', color: 'var(--red)' } : { borderColor: 'var(--ok)', color: 'var(--ok)' }}
                          >
                            {m.active ? <><Icon.x /> Deactivate</> : <><Icon.check /> Reactivate</>}
                          </button>
                          <button className="icon-btn" onClick={() => setDeleteConfirmId(m.id)}>
                            <Icon.trash /> Delete
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {view === 'add' && (
            <>
              <div className="opt-group">
                <label className="opt-label">Name</label>
                <input className="text-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Staff member's name" autoFocus />
              </div>
              <div className="opt-group">
                <label className="opt-label">Role</label>
                <div className="role-toggle">
                  <button
                    type="button"
                    className={"role-toggle-btn" + (role === 'cashier' ? ' active' : '')}
                    onClick={() => setRole('cashier')}
                  >
                    Cashier
                  </button>
                  <button
                    type="button"
                    className={"role-toggle-btn" + (role === 'manager' ? ' active' : '')}
                    onClick={() => setRole('manager')}
                  >
                    Manager
                  </button>
                </div>
              </div>
              <div className="opt-group">
                <label className="opt-label">PIN</label>
                {formError && <div className="login-error">{formError}</div>}
                <PinEntry pin={pin} onDigit={pressPin} onClear={() => setPin('')} onBack={() => setPin((p) => p.slice(0, -1))} disabled={busy} />
              </div>
            </>
          )}

          {view === 'reset' && (
            <div className="opt-group">
              {formError && <div className="login-error">{formError}</div>}
              <PinEntry pin={pin} onDigit={pressPin} onClear={() => setPin('')} onBack={() => setPin((p) => p.slice(0, -1))} disabled={busy} />
            </div>
          )}
        </div>

        <div className="modal-foot">
          {view === 'list' ? (
            <>
              <button className="btn-ghost" onClick={onClose}>Close</button>
              <button className="btn-primary" onClick={() => setView('add')}><Icon.plus /> Add Staff</button>
            </>
          ) : view === 'add' ? (
            <>
              <button className="btn-ghost" onClick={resetForm} disabled={busy}>Cancel</button>
              <button className="btn-primary" onClick={submitCreate} disabled={!name.trim() || !pin || busy}>
                {busy ? 'Creating…' : 'Create Account'}
              </button>
            </>
          ) : (
            <>
              <button className="btn-ghost" onClick={resetForm} disabled={busy}>Cancel</button>
              <button className="btn-primary" onClick={submitResetPin} disabled={!pin || busy}>
                {busy ? 'Saving…' : 'Save New PIN'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
