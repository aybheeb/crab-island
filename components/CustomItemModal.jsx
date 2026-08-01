'use client';

import { useState } from 'react';
import { Icon } from './Menu';
import { money } from './data';

function Numpad({ onDigit, onBack }) {
  return (
    <div className="pay-numpad">
      {['7', '8', '9', '4', '5', '6', '1', '2', '3', '00', '0'].map((k) => (
        <button key={k} type="button" className="pay-numpad-key" onClick={() => onDigit(k)}>{k}</button>
      ))}
      <button type="button" className="pay-numpad-key pay-numpad-back" onClick={onBack}>⌫</button>
    </div>
  );
}

// A cashier capability like any other line item — no manager authorization
// required (unlike void, or eventually editing the permanent menu).
export default function CustomItemModal({ onClose, onAdd }) {
  const [name, setName] = useState('');
  const [qty, setQty] = useState(1);
  const [priceRaw, setPriceRaw] = useState('');

  const price = parseInt(priceRaw || '0', 10) / 100;
  const addDigit = (d) => setPriceRaw((p) => (p.length >= 7 ? p : (p + d).replace(/^0+/, '') || '0'));
  const delDigit = () => setPriceRaw((p) => p.slice(0, -1));

  const canAdd = name.trim().length > 0 && price > 0;

  const submit = () => {
    if (!canAdd) return;
    onAdd(name.trim(), price, qty);
  };

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 420 }}>
        <div className="modal-head">
          <div>
            <h3>Custom Item</h3>
            <p>Manually priced line, added to the current order</p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close"><Icon.x /></button>
        </div>
        <div className="modal-body">
          <div className="opt-group">
            <label className="opt-label">Item Name</label>
            <input
              className="text-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Special order, price adjustment"
              autoFocus
            />
          </div>

          <div className="opt-group">
            <label className="opt-label">Quantity</label>
            <div className="qty-stepper">
              <button onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Decrease">−</button>
              <span className="qv">{qty}</span>
              <button onClick={() => setQty((q) => q + 1)} aria-label="Increase">+</button>
            </div>
          </div>

          <div className="opt-group">
            <label className="opt-label">Price (each)</label>
            <div className="pay-tendered-display">
              <span className="pad-label">Amount</span>
              <span className="pad-tendered">{money(price)}</span>
            </div>
            <Numpad onDigit={addDigit} onBack={delDigit} />
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={!canAdd} onClick={submit}>
            <Icon.plus /> Add to Order
          </button>
        </div>
      </div>
    </div>
  );
}
