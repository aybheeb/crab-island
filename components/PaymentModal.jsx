'use client';
import { useState } from 'react';
import { Icon } from './Menu';
import { money } from './data';

function cookingFeeFromLines(lines) {
  return lines.reduce((sum, l) =>
    (l.item.platter || l.item.bowl) ? sum + l.custom.qty : sum, 0);
}

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

export default function PaymentModal({ order, onConfirm, onCancel }) {
  const { lines, total } = order;
  const [cookingFee, setCookingFee] = useState(() => cookingFeeFromLines(lines));
  const [step, setStep] = useState('method');
  const [tenderedRaw, setTenderedRaw] = useState('');

  // tenderedRaw is a string of digits representing cents (e.g. "5000" = $50.00)
  const tendered = parseInt(tenderedRaw || '0', 10) / 100;
  const ebtAmount = Math.max(0, total - cookingFee);
  const cashTarget = step === 'ebt-cooking-cash' ? cookingFee : total;
  const changeDue = tendered - cashTarget;

  const addDigit = (d) =>
    setTenderedRaw(p => (p.length >= 7 ? p : (p + d).replace(/^0+/, '') || '0'));
  const delDigit = () => setTenderedRaw(p => p.slice(0, -1));
  const goBack = (s) => { setStep(s); setTenderedRaw(''); };

  const ModalHead = ({ title }) => (
    <div className="modal-head">
      <div>
        <div className="mh-num">{order.orderNo}</div>
        <h3>{title}</h3>
      </div>
      <button className="modal-close" onClick={onCancel}><Icon.x /></button>
    </div>
  );

  const CashNumpadScreen = ({ targetAmount, backStep, backLabel, payMethod, tenders }) => (
    <div className="overlay">
      <div className="modal pay-modal">
        <ModalHead title={backLabel} />
        <div className="modal-body">
          <div className="pay-amount-display">
            <span className="pad-label">{step === 'ebt-cooking-cash' ? 'Cooking fee' : 'Total'}</span>
            <span className="pad-value">{money(targetAmount)}</span>
          </div>
          <div className="pay-tendered-display">
            <span className="pad-label">Tendered</span>
            <span className="pad-tendered">{money(tendered)}</span>
          </div>
          {tenderedRaw && changeDue >= 0 && (
            <div className="pay-change-display">
              <span className="pad-label">Change</span>
              <span className="pad-change">{money(changeDue)}</span>
            </div>
          )}
          <Numpad onDigit={addDigit} onBack={delDigit} />
        </div>
        <div className="modal-foot">
          <button className="btn-ghost" onClick={() => goBack(backStep)}>Back</button>
          <button
            className="btn-primary"
            disabled={!tenderedRaw || changeDue < 0}
            onClick={() => onConfirm({ kickDrawer: true, payMethod, changeDue, tenders })}
          >
            Confirm &amp; Open Drawer
          </button>
        </div>
      </div>
    </div>
  );

  if (step === 'method') return (
    <div className="overlay">
      <div className="modal pay-modal">
        <ModalHead title={order.cust.name || 'Walk-in'} />
        <div className="modal-body">
          <div className="pay-total-row">
            <span>Total</span>
            <span className="pay-total-amt">{money(total)}</span>
          </div>
          <p className="pay-prompt">How is the customer paying?</p>
          <div className="pay-methods">
            <button className="pay-method-btn" onClick={() => setStep('cash')}>
              <span className="pay-method-label">Cash</span>
            </button>
            <button className="pay-method-btn" onClick={() => setStep('credit')}>
              <span className="pay-method-label">Credit</span>
            </button>
            <button className="pay-method-btn" onClick={() => setStep('ebt')}>
              <span className="pay-method-label">EBT</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  if (step === 'cash') return (
    <CashNumpadScreen
      targetAmount={total}
      backStep="method"
      backLabel="Cash Payment"
      payMethod="Cash"
      tenders={{ cash: total, credit: 0, ebt: 0 }}
    />
  );

  if (step === 'credit') return (
    <div className="overlay">
      <div className="modal pay-modal">
        <ModalHead title="Credit Card" />
        <div className="modal-body">
          <div className="pay-terminal-note">Run card on terminal</div>
          <div className="pay-amount-display" style={{ marginTop: 16 }}>
            <span className="pad-label">Charge</span>
            <span className="pad-value">{money(total)}</span>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn-ghost" onClick={() => setStep('method')}>Back</button>
          <button
            className="btn-primary"
            onClick={() => onConfirm({ kickDrawer: false, payMethod: 'Credit', tenders: { cash: 0, credit: total, ebt: 0 } })}
          >
            Confirm &amp; Print
          </button>
        </div>
      </div>
    </div>
  );

  if (step === 'ebt') return (
    <div className="overlay">
      <div className="modal pay-modal">
        <ModalHead title="EBT Payment" />
        <div className="modal-body">
          <div className="pay-split-block">
            <div className="pay-split-row">
              <span>EBT (run on terminal)</span>
              <span className="pay-split-ebt">{money(ebtAmount)}</span>
            </div>
            <div className="pay-split-row">
              <span>Cooking fee</span>
              <div className="pay-fee-adj">
                <button className="fee-adj-btn" onClick={() => setCookingFee(f => Math.max(0, f - 1))}>−</button>
                <span className="pay-fee-val">{money(cookingFee)}</span>
                <button className="fee-adj-btn" onClick={() => setCookingFee(f => f + 1)}>+</button>
              </div>
            </div>
            <div className="pay-split-total">
              <span>Order total</span>
              <span>{money(total)}</span>
            </div>
          </div>

          {cookingFee > 0 && (
            <>
              <p className="pay-prompt">Cooking fee — Cash or Credit?</p>
              <div className="pay-methods pay-methods-2">
                <button className="pay-method-btn" onClick={() => setStep('ebt-cooking-cash')}>
                  <span className="pay-method-label">Cash</span>
                </button>
                <button className="pay-method-btn" onClick={() => setStep('ebt-cooking-credit')}>
                  <span className="pay-method-label">Credit</span>
                </button>
              </div>
            </>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn-ghost" onClick={() => setStep('method')}>Back</button>
          {cookingFee === 0 && (
            <button
              className="btn-primary"
              onClick={() => onConfirm({ kickDrawer: false, payMethod: 'EBT', tenders: { cash: 0, credit: 0, ebt: ebtAmount } })}
            >
              Confirm &amp; Print
            </button>
          )}
        </div>
      </div>
    </div>
  );

  if (step === 'ebt-cooking-credit') return (
    <div className="overlay">
      <div className="modal pay-modal">
        <ModalHead title="EBT + Credit" />
        <div className="modal-body">
          <div className="pay-terminal-note">Run both on separate terminal</div>
          <div className="pay-split-block" style={{ marginTop: 16 }}>
            <div className="pay-split-row">
              <span>EBT terminal</span>
              <span className="pay-split-ebt">{money(ebtAmount)}</span>
            </div>
            <div className="pay-split-row">
              <span>Credit terminal (cooking fee)</span>
              <span>{money(cookingFee)}</span>
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn-ghost" onClick={() => setStep('ebt')}>Back</button>
          <button
            className="btn-primary"
            onClick={() => onConfirm({ kickDrawer: false, payMethod: 'EBT + Credit', tenders: { cash: 0, credit: cookingFee, ebt: ebtAmount } })}
          >
            Confirm &amp; Print
          </button>
        </div>
      </div>
    </div>
  );

  if (step === 'ebt-cooking-cash') return (
    <div className="overlay">
      <div className="modal pay-modal">
        <ModalHead title="Cooking Fee — Cash" />
        <div className="modal-body">
          <div className="pay-split-block" style={{ marginBottom: 14 }}>
            <div className="pay-split-row">
              <span>EBT terminal</span>
              <span className="pay-split-ebt">{money(ebtAmount)}</span>
            </div>
          </div>
          <div className="pay-amount-display">
            <span className="pad-label">Cooking fee</span>
            <span className="pad-value">{money(cookingFee)}</span>
          </div>
          <div className="pay-tendered-display">
            <span className="pad-label">Tendered</span>
            <span className="pad-tendered">{money(tendered)}</span>
          </div>
          {tenderedRaw && changeDue >= 0 && (
            <div className="pay-change-display">
              <span className="pad-label">Change</span>
              <span className="pad-change">{money(changeDue)}</span>
            </div>
          )}
          <Numpad onDigit={addDigit} onBack={delDigit} />
        </div>
        <div className="modal-foot">
          <button className="btn-ghost" onClick={() => goBack('ebt')}>Back</button>
          <button
            className="btn-primary"
            disabled={!tenderedRaw || changeDue < 0}
            onClick={() => onConfirm({ kickDrawer: true, payMethod: 'EBT + Cash', changeDue, tenders: { cash: cookingFee, credit: 0, ebt: ebtAmount } })}
          >
            Confirm &amp; Open Drawer
          </button>
        </div>
      </div>
    </div>
  );

  return null;
}
