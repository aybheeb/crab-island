import { useState, useEffect } from 'react';
import { Icon } from './Menu';
import { customChips, money, isCustomLine } from './data';

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
          {!isCustomLine(line) && (
            <button className="icon-btn" onClick={() => onEdit(line)}><Icon.edit /> Edit</button>
          )}
          <button className="icon-btn danger" onClick={() => onRemove(line.uid)}><Icon.trash /> Remove</button>
        </div>
      </div>
    </div>
  );
}

export function OrderSummary({ cust, setCust, lines, total, onQty, onRemove, onEditLine, onAddCustomItem, onPlaceAndPay, onPlaceAsPending, mobileOpen, onCloseMobile, nameError, onClearNameError, editingOrderNo, onSaveEdit, onCancelEdit }) {
  return (
    <aside className={"order-col" + (mobileOpen ? " open" : "")}>
      <div className="order-head">
        <h2>
          <Icon.bag /> {editingOrderNo ? `Editing ${editingOrderNo}` : "Current Order"}
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

      <button className="icon-btn add-custom-btn" onClick={onAddCustomItem}>
        <Icon.plus /> Custom Item
      </button>

      <div className="order-foot">
        <div className="subtle-row">
          <span>{lines.reduce((n, l) => n + l.custom.qty, 0)} item{lines.reduce((n, l) => n + l.custom.qty, 0) === 1 ? "" : "s"}</span>
          <span>Subtotal {money(total)}</span>
        </div>
        <div className="total-row">
          <span className="tl">Total</span>
          <span className="tv">{money(total)}</span>
        </div>
        {editingOrderNo ? (
          <>
            <button className="btn-primary" disabled={lines.length === 0} onClick={onSaveEdit}>
              <Icon.check /> Save Changes
            </button>
            <button
              className="btn-ghost"
              onClick={onCancelEdit}
              style={{ width: "100%", marginTop: 8 }}
            >
              <Icon.x /> Cancel Edit
            </button>
          </>
        ) : (
          <>
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
          </>
        )}
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
            ) : order.status === 'voided' ? (
              <div className="ticket-pay-info ticket-pending">
                <div className="ticket-pay-method">VOIDED{order.voidedByName ? ` by ${order.voidedByName}` : ''}</div>
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
          {/* Viewing an old ticket from Placed Orders passes no onNewOrder —
              starting a new order doesn't make sense mid-browse, so it's
              just Print Receipt + Close there, with Print Receipt promoted
              to the primary action instead of staying a secondary ghost
              button next to a New Order that no longer exists. */}
          <button className={onNewOrder ? "btn-ghost" : "btn-primary"} onClick={onPrintReceipt}>
            <Icon.print /> Print Receipt
          </button>
          {onNewOrder && (
            <button className="btn-primary" onClick={onNewOrder}><Icon.plus /> New Order</button>
          )}
        </div>
      </div>
    </div>
  );
}

const PO_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'paid', label: 'Paid' },
  { key: 'voided', label: 'Voided' },
];

export function PlacedOrders({ orders, onClose, onView, onCollectPayment, onRetrySave, onVoidOrder, onEditOrder, editingOrderNo }) {
  const [filter, setFilter] = useState('all');
  // orderNo of the card whose "more actions" (Edit/Void) menu is open —
  // only one at a time. Any click that isn't the toggle button itself
  // (which stops propagation) closes it, including a click on a menu item.
  const [openMenu, setOpenMenu] = useState(null);
  const pendingCount = orders.filter((o) => o.status === 'pending').length;
  const visible = filter === 'all' ? orders : orders.filter((o) => o.status === filter);

  useEffect(() => {
    if (!openMenu) return;
    const closeMenu = () => setOpenMenu(null);
    document.addEventListener('click', closeMenu);
    return () => document.removeEventListener('click', closeMenu);
  }, [openMenu]);

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-wide modal-stable">
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
            <div className="po-grid">
              {[...visible].reverse().map((o) => (
                <div className="po-card" key={o.orderNo}>
                  <div className="po-card-top">
                    <div className="po-card-badges">
                      <span className={"status-badge status-" + o.status}>
                        {o.status === 'paid' ? 'Paid' : o.status === 'voided' ? 'Voided' : 'Pending'}
                      </span>
                      {o.saveFailed && <span className="status-badge status-error">Not Saved</span>}
                      {o.orderNo === editingOrderNo && <span className="status-badge status-pending">Editing…</span>}
                    </div>
                    <span className="po-card-total">{money(o.total)}</span>
                  </div>
                  <h4>{o.cust.name || "Walk-In"}</h4>
                  <p className="po-card-meta">{o.orderNo} · {o.lines.reduce((n, l) => n + l.custom.qty, 0)} items · {new Date(o.ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</p>
                  {o.status === 'voided' && o.voidedByName && (
                    <p className="po-void-note">Voided by {o.voidedByName}{o.voidReason ? ` — ${o.voidReason}` : ''}</p>
                  )}
                  {o.orderNo === editingOrderNo ? (
                    <div className="po-card-actions">
                      <button className="icon-btn" onClick={() => onView(o)}><Icon.receipt /> Ticket</button>
                    </div>
                  ) : (
                    <div className="po-card-actions">
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
                      {/*
                        Edit/Void live behind the "more" menu since they're
                        the less-frequent actions — Ticket and Collect
                        Payment are what a cashier reaches for on nearly
                        every card. Void requires a manager PIN (step-up)
                        every time, verified server-side in
                        app/api/orders/void — this item being reachable by a
                        cashier isn't a security boundary, entering a
                        manager's PIN in the modal it opens is.
                      */}
                      {(o.status === 'pending' || o.status === 'paid') && (
                        <div className="po-more-wrap">
                          <button
                            className="icon-btn po-more-btn"
                            onClick={(e) => { e.stopPropagation(); setOpenMenu((cur) => (cur === o.orderNo ? null : o.orderNo)); }}
                            aria-label="More actions"
                          >
                            <Icon.dots />
                          </button>
                          {openMenu === o.orderNo && (
                            <div className="po-more-menu">
                              {o.status === 'pending' && !o.saveFailed && (
                                <button onClick={() => onEditOrder(o)}><Icon.edit /> Edit</button>
                              )}
                              <button className="danger" onClick={() => onVoidOrder(o)}><Icon.x /> Void</button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
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
            report.orderCount === 0 && report.pendingCount === 0 && report.voidedCount === 0 ? (
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
                {report.voidedCount > 0 && (
                  <div className="subtle-row" style={{ marginTop: report.pendingCount > 0 ? 2 : 10 }}>
                    <span>Voided ({report.voidedCount})</span>
                    <span>{money(report.voidedTotal)}</span>
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
