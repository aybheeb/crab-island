import { useState } from 'react';
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

export function OrderSummary({ cust, setCust, lines, total, onQty, onRemove, onEditLine, onPlaceAndPay, onPlaceAsPending, mobileOpen, onCloseMobile, nameError, onClearNameError }) {
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
        <button className="btn-primary" disabled={lines.length === 0} onClick={onPlaceAndPay}>
          <Icon.receipt /> Place & Collect Payment
        </button>
        <button
          className="btn-ghost"
          disabled={lines.length === 0}
          onClick={onPlaceAsPending}
          style={{ width: "100%", marginTop: 8 }}
        >
          <Icon.clock /> Save as Pending — Pay Later
        </button>
      </div>
    </aside>
  );
}

export function TicketModal({ order, onClose, onNewOrder, onPrintReceipt }) {
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
            {order.payMethod ? (
              <div className="ticket-pay-info">
                <div className="ticket-pay-method">{order.payMethod}</div>
                {order.tenders && (
                  <ul className="ticket-tenders">
                    {order.tenders.cash > 0 && <li><span>Cash</span><span>{money(order.tenders.cash)}</span></li>}
                    {order.tenders.credit > 0 && <li><span>Credit</span><span>{money(order.tenders.credit)}</span></li>}
                    {order.tenders.ebt > 0 && <li><span>EBT</span><span>{money(order.tenders.ebt)}</span></li>}
                  </ul>
                )}
                {order.changeDue != null && (
                  <div className="ticket-change">
                    <span>Change Due</span>
                    <span className="ticket-change-amt">{money(order.changeDue)}</span>
                  </div>
                )}
              </div>
            ) : order.status === 'pending' && (
              <div className="ticket-pay-info ticket-pending">
                <div className="ticket-pay-method">PENDING — pay on pickup</div>
              </div>
            )}
            <p className="ticket-thanks">Thank you — enjoy! 🦐</p>
          </div>
        </div>
        <div className="ticket-foot">
          <button className="btn-ghost" onClick={onClose}><Icon.x /> Close</button>
          <button className="btn-ghost" onClick={onPrintReceipt}><Icon.print /> Print Receipt</button>
          <button className="btn-primary" onClick={onNewOrder}><Icon.plus /> New Order</button>
        </div>
      </div>
    </div>
  );
}

const PO_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'paid', label: 'Paid' },
];

export function PlacedOrders({ orders, onClose, onView, onCollectPayment, onRetrySave }) {
  const [filter, setFilter] = useState('all');
  const pendingCount = orders.filter((o) => o.status === 'pending').length;
  const visible = filter === 'all' ? orders : orders.filter((o) => o.status === filter);

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-head">
          <div>
            <h3>Placed Orders</h3>
            <p>
              {orders.length} order{orders.length === 1 ? "" : "s"} this session
              {pendingCount > 0 ? ` · ${pendingCount} awaiting payment` : ""}
            </p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close"><Icon.x /></button>
        </div>
        <div className="po-filters">
          {PO_FILTERS.map((f) => (
            <button
              key={f.key}
              className={"po-filter-btn" + (filter === f.key ? " active" : "")}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="modal-body scroll">
          {visible.length === 0 ? (
            <div className="po-empty">{orders.length === 0 ? "No orders placed yet." : "No orders in this view."}</div>
          ) : (
            <div className="po-list">
              {[...visible].reverse().map((o) => (
                <div className="po-card" key={o.orderNo}>
                  <div className="po-info">
                    <h4>{o.cust.name || "Walk-In"}</h4>
                    <p>{o.orderNo} · {o.lines.reduce((n, l) => n + l.custom.qty, 0)} items · {new Date(o.ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</p>
                    <span className={"status-badge " + (o.status === 'paid' ? "status-paid" : "status-pending")}>
                      {o.status === 'paid' ? 'Paid' : 'Pending'}
                    </span>
                    {o.saveFailed && <span className="status-badge status-error">Not Saved</span>}
                  </div>
                  <div className="po-right">
                    <span className="po-total">{money(o.total)}</span>
                    {/*
                      TODO(roles/phase-2): Placed orders are otherwise view-only here — the
                      only action a pending order can take is Collect Payment (a one-way
                      pending -> paid transition; it never touches order contents). Cashiers
                      must never be able to edit or void a placed order, under any
                      circumstance (client requirement). Once roles ship, a manager-only void
                      of a stale pending order (e.g. a no-show) is the planned way to unblock
                      closing the day without this restriction ever extending to cashiers.
                    */}
                    <div className="po-actions">
                      <button className="icon-btn" onClick={() => onView(o)}><Icon.receipt /> Ticket</button>
                      {o.saveFailed && (
                        <button
                          className="icon-btn"
                          onClick={() => onRetrySave(o)}
                          style={{ borderColor: "var(--red)", color: "var(--red)" }}
                        >
                          <Icon.check /> Retry Save
                        </button>
                      )}
                      {o.status === 'pending' && (
                        <button
                          className="icon-btn"
                          onClick={() => onCollectPayment(o)}
                          style={{ borderColor: "var(--gold)", color: "var(--gold-deep)" }}
                        >
                          <Icon.check /> Collect Payment
                        </button>
                      )}
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

export function DailyReportModal({ report, loading, error, closing, onClose, onCloseDay }) {
  const [confirming, setConfirming] = useState(false);

  const stamp = (iso) => iso ? new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  }) : "—";

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-head">
          <div>
            <h3>Daily Report</h3>
            <p>{report ? `Since ${stamp(report.openedAt)}` : "Today's sales"}</p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close"><Icon.x /></button>
        </div>
        <div className="modal-body scroll">
          {loading && <div className="po-empty">Loading…</div>}
          {error && <div className="field-error-msg" style={{ marginBottom: 12 }}>{error}</div>}
          {report && !loading && (
            report.orderCount === 0 && report.pendingCount === 0 ? (
              <div className="po-empty">No orders recorded yet today.</div>
            ) : (
              <>
                <div className="subtle-row"><span>Orders (paid)</span><span>{report.orderCount}</span></div>
                <div className="subtle-row"><span>Items sold</span><span>{report.itemCount}</span></div>
                <hr className="ticket-divider" />
                <div className="subtle-row"><span>Cash</span><span>{money(report.cash)}</span></div>
                <div className="subtle-row"><span>Credit</span><span>{money(report.credit)}</span></div>
                <div className="subtle-row"><span>EBT</span><span>{money(report.ebt)}</span></div>
                <hr className="ticket-divider" />
                <div className="total-row">
                  <span className="tl">Grand Total</span>
                  <span className="tv">{money(report.grandTotal)}</span>
                </div>
                {report.pendingCount > 0 && (
                  <div className="subtle-row" style={{ marginTop: 10 }}>
                    <span>Pending payment ({report.pendingCount})</span>
                    <span>{money(report.pendingTotal)}</span>
                  </div>
                )}
                {report.pendingCount > 0 ? (
                  <div className="field-error-msg" style={{ marginTop: 10 }}>
                    {report.pendingCount} order{report.pendingCount === 1 ? "" : "s"} still awaiting payment —
                    collect payment before closing the day.
                  </div>
                ) : confirming && (
                  <div className="field-error-msg" style={{ marginTop: 4 }}>
                    This prints the report and resets tomorrow's totals to zero. Confirm?
                  </div>
                )}
              </>
            )
          )}
        </div>
        <div className="modal-foot">
          <button className="btn-ghost" onClick={confirming ? () => setConfirming(false) : onClose}>
            {confirming ? "Back" : "Close"}
          </button>
          {report && (report.orderCount > 0 || report.pendingCount > 0) && (
            <button
              className="btn-primary"
              disabled={closing || report.pendingCount > 0}
              onClick={confirming ? onCloseDay : () => setConfirming(true)}
            >
              <Icon.print /> {closing ? "Closing…" : confirming ? "Confirm Close Day" : "Print & Close Day"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
