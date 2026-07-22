import { Icon } from './Menu';
import { customChips, money } from './data';

function formatPhone(value) {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  const len = digits.length;
  if (len === 0) return "";
  if (len < 4) return `(${digits}`;
  if (len < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function OrderLine({ line, onQty, onRemove, onEdit }) {
  const chips = customChips(line.item, line.custom);
  return (
    <div className="line">
      <div className="line-top">
        <h4 className="line-name"><span className="line-num">{line.item.num}</span> {line.item.name}</h4>
        <span className="line-price">{money(line.unit * line.custom.qty)}</span>
      </div>
      <div className="line-customs">
        {chips.map((ch, i) => <span className="chip" key={i}>{ch}</span>)}
        {line.custom.notes ? <span className="chip note">&quot;{line.custom.notes}&quot;</span> : null}
      </div>
      <div className="line-foot">
        <div className="qty-stepper">
          <button onClick={() => onQty(line.uid, -1)} aria-label="Decrease">−</button>
          <span className="qv">{line.custom.qty}</span>
          <button onClick={() => onQty(line.uid, 1)} aria-label="Increase">+</button>
        </div>
        <div className="line-actions">
          <button className="icon-btn" onClick={() => onEdit(line)}><Icon.edit /> Edit</button>
          <button className="icon-btn danger" onClick={() => onRemove(line.uid)}><Icon.trash /> Remove</button>
        </div>
      </div>
    </div>
  );
}

export function OrderSummary({ cust, setCust, lines, total, editingOrderNo, onQty, onRemove, onEditLine, onPlace, onCancelEdit, mobileOpen, onCloseMobile, nameError, onClearNameError }) {
  return (
    <aside className={"order-col" + (mobileOpen ? " open" : "")}>
      <div className="order-head">
        <h2>
          <Icon.bag /> Current Order
          <button
            className="modal-close order-close-mobile"
            style={{ marginLeft: "auto", background: "var(--foam)", color: "var(--ocean-deep)" }}
            onClick={onCloseMobile}
            aria-label="Close order"
          >
            <Icon.x />
          </button>
        </h2>
        {editingOrderNo && (
          <div className="edit-banner">
            <span>✎ Editing {cust.name ? cust.name + "'s" : "an"} order</span>
            <button onClick={onCancelEdit}>Cancel edit</button>
          </div>
        )}
        <div className="cust-fields">
          <div className="field">
            <label>Customer Name <span className="field-required">*</span></label>
            <input
              value={cust.name}
              onChange={(e) => { setCust({ ...cust, name: e.target.value }); if (nameError) onClearNameError(); }}
              placeholder="Name for the order"
              className={nameError ? 'input-error' : ''}
            />
            {nameError && <span className="field-error-msg">Name is required</span>}
          </div>
          <div className="field">
            <label>Phone Number</label>
            <input
              value={cust.phone}
              onChange={(e) => setCust({ ...cust, phone: formatPhone(e.target.value) })}
              placeholder="(000) 000-0000"
              inputMode="tel"
              maxLength={14}
            />
          </div>
        </div>
      </div>

      <div className="order-items scroll">
        {lines.length === 0 ? (
          <div className="order-empty">
            <span className="em-ico">🦀</span>
            No items yet.<br />Tap a menu item to start the order.
          </div>
        ) : (
          lines.map((l) => (
            <OrderLine key={l.uid} line={l} onQty={onQty} onRemove={onRemove} onEdit={onEditLine} />
          ))
        )}
      </div>

      <div className="order-foot">
        <div className="subtle-row">
          <span>{lines.reduce((n, l) => n + l.custom.qty, 0)} item{lines.reduce((n, l) => n + l.custom.qty, 0) === 1 ? "" : "s"}</span>
          <span>Subtotal {money(total)}</span>
        </div>
        <div className="total-row">
          <span className="tl">Total</span>
          <span className="tv">{money(total)}</span>
        </div>
        <button className="btn-primary" disabled={lines.length === 0} onClick={onPlace}>
          <Icon.receipt /> {editingOrderNo ? "Update Order" : "Place Order"}
        </button>
      </div>
    </aside>
  );
}

export function TicketModal({ order, onClose, onNewOrder }) {
  const stamp = new Date(order.ts).toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ticket">
        <div className="ticket-scroll scroll">
          <div className="ticket-paper" id="print-area">
            <div className="ticket-logo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/crab-island-logo.png" alt="Crab Island Seafood Market" />
            </div>
            <p className="ticket-slogan">You buy it, we steam it or fry it.</p>
            <hr className="ticket-divider" />
            <p className="ticket-orderno">ORDER {order.orderNo}</p>
            <p className="ticket-name">{order.cust.name || "Walk-In"}</p>
            {order.cust.phone && <p className="ticket-phone">{order.cust.phone}</p>}
            <div className="ticket-meta"><span>{stamp}</span></div>
            <hr className="ticket-divider" />
            {order.lines.map((l) => (
              <div className="ticket-item" key={l.uid}>
                <div className="ticket-item-top">
                  <span><span className="ti-q">{l.custom.qty}×</span> {l.item.num} {l.item.name}</span>
                  <span>{money(l.unit * l.custom.qty)}</span>
                </div>
                <ul className="ticket-customs">
                  {customChips(l.item, l.custom).map((ch, i) => <li key={i}>{ch}</li>)}
                  {l.custom.notes && <li className="note">Note: {l.custom.notes}</li>}
                </ul>
              </div>
            ))}
            <hr className="ticket-divider" />
            <div className="ticket-total"><span>TOTAL</span><span className="tt-v">{money(order.total)}</span></div>
            {order.payMethod && (
              <div className="ticket-pay-info">
                <div className="ticket-pay-method">{order.payMethod}</div>
                {order.changeDue != null && (
                  <div className="ticket-change">
                    <span>Change Due</span>
                    <span className="ticket-change-amt">{money(order.changeDue)}</span>
                  </div>
                )}
              </div>
            )}
            <p className="ticket-thanks">Thank you — enjoy! 🦐</p>
          </div>
        </div>
        <div className="ticket-foot">
          <button className="btn-ghost" onClick={onClose}><Icon.back /> Back</button>
          <button className="btn-primary" onClick={onNewOrder}><Icon.plus /> New Order</button>
        </div>
      </div>
    </div>
  );
}

export function PlacedOrders({ orders, onClose, onRecall, onView }) {
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-head">
          <div>
            <h3>Placed Orders</h3>
            <p>{orders.length} order{orders.length === 1 ? "" : "s"} this session</p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close"><Icon.x /></button>
        </div>
        <div className="modal-body scroll">
          {orders.length === 0 ? (
            <div className="po-empty">No orders placed yet.</div>
          ) : (
            <div className="po-list">
              {[...orders].reverse().map((o) => (
                <div className="po-card" key={o.orderNo}>
                  <div className="po-info">
                    <h4>{o.cust.name || "Walk-In"}</h4>
                    <p>{o.orderNo} · {o.lines.reduce((n, l) => n + l.custom.qty, 0)} items · {new Date(o.ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</p>
                  </div>
                  <div className="po-right">
                    <span className="po-total">{money(o.total)}</span>
                    <div className="po-actions">
                      <button className="icon-btn" onClick={() => onView(o)}><Icon.receipt /> Ticket</button>
                      <button className="icon-btn" onClick={() => onRecall(o)} style={{ borderColor: "var(--ocean)", color: "var(--ocean-deep)" }}><Icon.edit /> Edit</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
