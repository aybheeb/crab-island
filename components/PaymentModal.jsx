'use client';
import { useState } from 'react';
import { Icon } from './Menu';
import { money } from './data';

const METHODS = [
  { key: 'cash', label: 'Cash' },
  { key: 'credit', label: 'Credit' },
  { key: 'ebt', label: 'EBT' },
];

function cookingFeeFromLines(lines) {
  return lines.reduce((sum, l) =>
    (l.item.platter || l.item.bowl) ? sum + l.custom.qty : sum, 0);
}

// Money math stays in whole cents internally (tenderedRaw), but derived sums
// (total - tenders, cap - applied, ...) can pick up float dust — round every
// derived dollar amount before comparing or displaying it.
const round2 = (n) => Math.round(n * 100) / 100;

function Numpad({ onDigit, onBack }) {
  return (
    <div className="pay-numpad">
      {['7','8','9','4','5','6','1','2','3','00','0'].map(k => (
        <button key={k} className="pay-numpad-key" onClick={() => onDigit(k)}>{k}</button>
      ))}
      <button className="pay-numpad-key pay-numpad-back" onClick={onBack}>⌫</button>
    </div>
  );
}

// Declared at module scope (not inside PaymentModal) so it keeps a stable
// component identity across renders — defining it inline in the parent's
// render body would give React a new function reference on every keystroke,
// which makes React tear down and remount the whole modal (replaying its
// mount animation) instead of just updating the changed text.
function ModalHead({ orderNo, title, onCancel }) {
  return (
    <div className="modal-head">
      <div>
        <div className="mh-num">{orderNo}</div>
        <h3>{title}</h3>
      </div>
      <button className="modal-close" onClick={onCancel}><Icon.x /></button>
    </div>
  );
}

// Entry screen for a single method's amount. Cash allows over-tendering (and
// shows change); credit/EBT are capped to what's actually owed for that
// method, since a card/EBT terminal has no "change" concept here.
function TenderEntryScreen({
  orderNo, title, amountLabel, targetAmount, beforeAmount,
  tendered, tenderedRaw, changeDue, showChange,
  onDigit, onBack, onGoBack, onConfirm, onCancel,
  confirmDisabled,
}) {
  return (
    <div className="overlay">
      <div className="modal pay-modal">
        <ModalHead orderNo={orderNo} title={title} onCancel={onCancel} />
        <div className="modal-body">
          {beforeAmount}
          <div className="pay-amount-display">
            <span className="pad-label">{amountLabel}</span>
            <span className="pad-value">{money(targetAmount)}</span>
          </div>
          <div className="pay-tendered-display">
            <span className="pad-label">Tendered</span>
            <span className="pad-tendered">{money(tendered)}</span>
          </div>
          {showChange && tenderedRaw && changeDue >= 0 && (
            <div className="pay-change-display">
              <span className="pad-label">Change</span>
              <span className="pad-change">{money(changeDue)}</span>
            </div>
          )}
          <Numpad onDigit={onDigit} onBack={onBack} />
        </div>
        <div className="modal-foot">
          <button className="btn-ghost" onClick={onGoBack}>Back</button>
          <button className="btn-primary" disabled={confirmDisabled} onClick={onConfirm}>
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PaymentModal({ order, onConfirm, onCancel }) {
  const { lines, total } = order;
  const [cookingFee, setCookingFee] = useState(() => cookingFeeFromLines(lines));
  // Amount already applied per method, running toward `total`.
  const [tenders, setTenders] = useState({ cash: 0, credit: 0, ebt: 0 });
  const [changeDue, setChangeDue] = useState(0);
  const [entryMethod, setEntryMethod] = useState(null); // null | 'cash' | 'credit' | 'ebt'
  const [tenderedRaw, setTenderedRaw] = useState('');

  const applied = round2(tenders.cash + tenders.credit + tenders.ebt);
  const remaining = round2(total - applied);
  // EBT can't cover hot/prepared food (SNAP eligibility rule) — cap it to the
  // non-cooking-fee portion of the order, adjustable via the stepper below.
  const ebtCap = Math.max(0, round2(total - cookingFee));
  const ebtRemainingCap = Math.max(0, round2(ebtCap - tenders.ebt));

  // tenderedRaw is a string of digits representing cents (e.g. "5000" = $50.00)
  const tendered = parseInt(tenderedRaw || '0', 10) / 100;

  const addDigit = (d) =>
    setTenderedRaw(p => (p.length >= 7 ? p : (p + d).replace(/^0+/, '') || '0'));
  const delDigit = () => setTenderedRaw(p => p.slice(0, -1));

  const capFor = (method) => method === 'ebt' ? Math.min(remaining, ebtRemainingCap) : remaining;

  const openEntry = (method) => {
    setEntryMethod(method);
    if (method === 'cash') {
      // Cash isn't pre-filled — it depends on the physical bills handed over.
      setTenderedRaw('');
    } else {
      // Credit/EBT default to covering the rest, so the common (unsplit)
      // case is still just "pick a method, confirm" — no typing required.
      const cap = capFor(method);
      setTenderedRaw(cap > 0 ? String(Math.round(cap * 100)) : '');
    }
  };

  const closeEntry = () => { setEntryMethod(null); setTenderedRaw(''); };

  const removeTender = (method) => {
    setTenders((t) => ({ ...t, [method]: 0 }));
    if (method === 'cash') setChangeDue(0);
  };

  const finalize = (finalTenders, finalChangeDue) => {
    const parts = [];
    if (finalTenders.cash > 0) parts.push('Cash');
    if (finalTenders.credit > 0) parts.push('Credit');
    if (finalTenders.ebt > 0) parts.push('EBT');
    onConfirm({
      kickDrawer: finalTenders.cash > 0,
      payMethod: parts.join(' + ') || 'Cash',
      changeDue: finalTenders.cash > 0 ? finalChangeDue : null,
      tenders: finalTenders,
    });
  };

  const confirmEntry = () => {
    const newTenders = { ...tenders };
    let newChangeDue = changeDue;

    if (entryMethod === 'cash') {
      const applyAmt = round2(Math.min(tendered, remaining));
      newChangeDue = round2(Math.max(0, tendered - remaining));
      newTenders.cash = round2(newTenders.cash + applyAmt);
    } else {
      const applyAmt = round2(Math.min(tendered, capFor(entryMethod)));
      newTenders[entryMethod] = round2(newTenders[entryMethod] + applyAmt);
    }

    const newRemaining = round2(total - (newTenders.cash + newTenders.credit + newTenders.ebt));
    if (newRemaining <= 0) {
      // Fully covered by this entry — finalize immediately rather than
      // bouncing back to the split screen for a redundant confirm tap.
      finalize(newTenders, newChangeDue);
      return;
    }

    setTenders(newTenders);
    setChangeDue(newChangeDue);
    closeEntry();
  };

  if (entryMethod) {
    const methodMeta = METHODS.find((m) => m.key === entryMethod);
    const isCash = entryMethod === 'cash';
    const cap = capFor(entryMethod);
    const change = isCash ? round2(Math.max(0, tendered - remaining)) : 0;
    const canConfirm = isCash ? tendered > 0 : (tendered > 0 && tendered <= cap + 0.001);

    return (
      <TenderEntryScreen
        orderNo={order.orderNo}
        title={`${methodMeta.label} Payment`}
        amountLabel={isCash ? 'Remaining' : `Max for ${methodMeta.label}`}
        targetAmount={isCash ? remaining : cap}
        beforeAmount={entryMethod === 'ebt' && cookingFee > 0 && (
          <div className="pay-split-block" style={{ marginBottom: 14 }}>
            <div className="pay-split-row">
              <span>Cooking fee (not EBT-eligible)</span>
              <span>{money(cookingFee)}</span>
            </div>
          </div>
        )}
        tendered={tendered}
        tenderedRaw={tenderedRaw}
        changeDue={change}
        showChange={isCash}
        onDigit={addDigit}
        onBack={delDigit}
        onGoBack={closeEntry}
        onConfirm={confirmEntry}
        onCancel={onCancel}
        confirmDisabled={!canConfirm}
      />
    );
  }

  return (
    <div className="overlay">
      <div className="modal pay-modal">
        <ModalHead orderNo={order.orderNo} title={order.cust.name || 'Walk-in'} onCancel={onCancel} />
        <div className="modal-body">
          <div className="pay-total-row">
            <span>Total</span>
            <span className="pay-total-amt">{money(total)}</span>
          </div>
          <div className="pay-remaining-row">
            <span>Remaining</span>
            <span className="pay-remaining-amt">{money(remaining)}</span>
          </div>

          <p className="pay-prompt">
            {applied === 0 ? 'How is the customer paying?' : 'Add another payment method for the rest'}
          </p>

          <div className="pay-split-methods">
            {METHODS.map(({ key, label }) => {
              const amt = tenders[key];
              const disabled = key === 'ebt' && ebtRemainingCap <= 0;
              return (
                <div className="pay-split-method-row" key={key}>
                  <button className="pay-method-btn" disabled={disabled} onClick={() => openEntry(key)}>
                    <span className="pay-method-label">{label}</span>
                    {amt > 0 && <span className="pay-method-amt">{money(amt)}</span>}
                  </button>
                  {amt > 0 && (
                    <button
                      className="icon-btn danger"
                      onClick={() => removeTender(key)}
                      aria-label={`Remove ${label} payment`}
                    >
                      <Icon.x />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {cookingFee > 0 && (
            <div className="pay-split-block" style={{ marginTop: 14 }}>
              <div className="pay-split-row">
                <span>Cooking fee (not EBT-eligible)</span>
                <div className="pay-fee-adj">
                  <button
                    className="fee-adj-btn"
                    disabled={tenders.ebt > 0}
                    onClick={() => setCookingFee((f) => Math.max(0, f - 1))}
                  >
                    −
                  </button>
                  <span className="pay-fee-val">{money(cookingFee)}</span>
                  <button
                    className="fee-adj-btn"
                    disabled={tenders.ebt > 0}
                    onClick={() => setCookingFee((f) => f + 1)}
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn-ghost" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
