'use client';

import { useState, useRef, useEffect } from 'react';
import { CATEGORIES, defaultCustom, unitPriceFor, money } from './data';
import { Icon, MenuPanel, CustomModal, CATEGORY_META } from './Menu';
import { OrderSummary, TicketModal, PlacedOrders, DailyReportModal } from './Order';
import PaymentModal from './PaymentModal';
import { useTweaks, TweaksPanel, TweakSection, TweakRadio, TweakSlider, TweakToggle } from './TweaksPanel';

const TWEAK_DEFAULTS = {
  actionColor: "gold",
  headerTheme: "red",
  cardWidth: 260,
  soundOnAdd: true,
};

const ACTION_COLORS = {
  gold:  { a: "var(--gold)",  b: "var(--gold-deep)",  fg: "var(--navy)" },
  red:   { a: "var(--red)",   b: "var(--red-deep)",   fg: "#fff" },
  ocean: { a: "var(--ocean)", b: "var(--ocean-deep)", fg: "#fff" },
};
const HEADER_THEMES = {
  red:    "linear-gradient(180deg, var(--red) 0%, var(--red-deep) 100%)",
  ocean:  "linear-gradient(180deg, var(--ocean) 0%, var(--ocean-deep) 100%)",
  sunset: "linear-gradient(110deg, var(--red) 0%, var(--gold-deep) 70%, var(--gold) 100%)",
};

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = "sine";
    o.frequency.setValueAtTime(880, ctx.currentTime);
    o.frequency.setValueAtTime(1320, ctx.currentTime + 0.08);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);
    o.start(); o.stop(ctx.currentTime + 0.24);
  } catch (e) {}
}

let UID = 1;

export default function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  const [cust, setCust] = useState({ name: "", phone: "" });
  const [lines, setLines] = useState([]);
  const [orders, setOrders] = useState([]);
  const [seq, setSeq] = useState(1);

  const [modalItem, setModalItem] = useState(null);
  const [ticket, setTicket] = useState(null);
  const [paymentOrder, setPaymentOrder] = useState(null);
  const [showPlaced, setShowPlaced] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [report, setReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState(null);
  const [closingDay, setClosingDay] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [nameError, setNameError] = useState(false);
  const [activeCategory, setActiveCategory] = useState(CATEGORIES[0]);

  const menuPanelRef = useRef(null);

  // Restore the current day's orders (pending + paid) after a page refresh —
  // both statuses are persisted server-side now, not just paid totals.
  useEffect(() => {
    fetch('/api/orders')
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) return;
        // ticketPrinted is a client-side-only convenience flag (not persisted)
        // used to avoid reprinting a kitchen ticket when payment is collected
        // later. We can't know for a restored pending order whether it was
        // already printed, so default to false — reprinting is the safe
        // failure mode, missing the kitchen entirely is not.
        const restored = d.orders.map((o) => ({ ...o, ticketPrinted: o.status === 'paid' }));
        setOrders(restored);
        const maxNo = restored.reduce((m, o) => Math.max(m, parseInt(String(o.orderNo).replace('#', ''), 10) || 0), 0);
        setSeq(maxNo + 1);
      })
      .catch((err) => flashToast(`Could not restore orders: ${err.message}`, true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const total = lines.reduce((s, l) => s + l.unit * l.custom.qty, 0);
  const itemCount = lines.reduce((n, l) => n + l.custom.qty, 0);
  const pendingCount = orders.filter((o) => o.status === 'pending').length;

  const ac = ACTION_COLORS[t.actionColor] || ACTION_COLORS.gold;
  const rootStyle = {
    "--action-a": ac.a, "--action-b": ac.b, "--action-fg": ac.fg,
    "--header-bg": HEADER_THEMES[t.headerTheme] || HEADER_THEMES.red,
    "--card-min": (t.cardWidth || 260) + "px",
  };

  const flashToast = (msg, isError = false) => {
    setToast({ msg, id: Date.now(), isError });
    setTimeout(() => setToast(null), isError ? 3500 : 1500);
  };

  const openNew = (item) => setModalItem({ item, custom: defaultCustom(item), lineUid: null });
  const openEdit = (line) => setModalItem({ item: line.item, custom: line.custom, lineUid: line.uid });

  const saveLine = (item, custom) => {
    const unit = unitPriceFor(item, custom);
    if (modalItem.lineUid) {
      setLines((ls) => ls.map((l) => l.uid === modalItem.lineUid ? { ...l, custom, unit } : l));
    } else {
      setLines((ls) => [...ls, { uid: UID++, item, custom, unit }]);
      if (t.soundOnAdd) beep();
      flashToast(`${item.name} added`);
    }
    setModalItem(null);
  };

  const changeQty = (uid, d) =>
    setLines((ls) => ls.map((l) => l.uid === uid ? { ...l, custom: { ...l.custom, qty: Math.max(1, l.custom.qty + d) } } : l));
  const removeLine = (uid) => setLines((ls) => ls.filter((l) => l.uid !== uid));

  // Orders are create-only once placed: no edit/void path exists for cashiers.
  // TODO(roles/phase-2): if a correction/void flow is added, gate it
  // MANAGER-ONLY — cashiers must never be able to mutate or void a placed
  // order, even then. See the matching TODO in orderStore.archiveAndResetDay
  // for the specific case (stale pending orders) that flow is meant to solve.
  //
  // Every order starts "pending" and is persisted immediately, whether the
  // cashier is about to collect payment right now or the customer is paying
  // later on pickup (phone/walk-in-ahead orders) — see handlePaymentConfirm
  // for the one-way pending -> paid transition.
  const createPendingOrder = () => {
    if (lines.length === 0) return null;
    if (!cust.name.trim()) {
      setNameError(true);
      flashToast('Customer name is required', true);
      return null;
    }
    setNameError(false);
    const orderNo = '#' + String(seq).padStart(3, '0');
    const order = {
      orderNo, cust, lines, total, ts: Date.now(),
      status: 'pending', paidAt: null, payMethod: null, changeDue: null, tenders: null,
      ticketPrinted: false,
    };
    setOrders((os) => [...os, order]);
    setSeq((s) => s + 1);

    fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderNo: order.orderNo, cust: order.cust, lines: order.lines, total: order.total, ts: order.ts }),
    })
      .then((r) => r.json())
      .then((d) => { if (!d.success) flashToast(`Order not saved: ${d.error ?? 'Unknown error'}`, true); })
      .catch((err) => flashToast(`Order save error: ${err.message}`, true));

    return order;
  };

  const printKitchenTicket = (order) => {
    fetch('/api/print-ticket', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(order),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setOrders((os) => os.map((o) => o.orderNo === order.orderNo ? { ...o, ticketPrinted: true } : o));
          flashToast('Ticket printed');
        } else {
          flashToast(`Print failed: ${d.error ?? 'Unknown error'}`, true);
        }
      })
      .catch((err) => flashToast(`Print error: ${err.message}`, true));
  };

  const placeAndPay = () => {
    const order = createPendingOrder();
    if (!order) return;
    setMobileOpen(false);
    setPaymentOrder(order);
  };

  const placeAsPending = () => {
    const order = createPendingOrder();
    if (!order) return;
    setMobileOpen(false);
    printKitchenTicket(order);
    startNewOrder();
    flashToast(`${order.orderNo} saved — pending payment`);
  };

  const collectPayment = (order) => {
    setShowPlaced(false);
    setPaymentOrder(order);
  };

  const handlePaymentConfirm = ({ kickDrawer, payMethod, changeDue, tenders }) => {
    const skipKitchenTicket = paymentOrder.ticketPrinted;
    const order = { ...paymentOrder, status: 'paid', paidAt: Date.now(), payMethod, changeDue, tenders };
    setPaymentOrder(null);
    setTicket(order);
    setOrders((os) => os.map((o) => o.orderNo === order.orderNo ? order : o));

    fetch('/api/record-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderNo: order.orderNo, payMethod, changeDue, tenders }),
    })
      .then((r) => r.json())
      .then((d) => { if (!d.success) flashToast(`Daily report not updated: ${d.error ?? 'Unknown error'}`, true); })
      .catch((err) => flashToast(`Daily report error: ${err.message}`, true));

    if (kickDrawer) {
      fetch('/api/open-drawer', { method: 'POST' })
        .then((r) => r.json())
        .then((d) => { if (!d.success) flashToast('Drawer did not open', true); })
        .catch(() => flashToast('Drawer error', true))
        .finally(() => { if (!skipKitchenTicket) printKitchenTicket(order); });
    } else if (!skipKitchenTicket) {
      printKitchenTicket(order);
    }
  };

  const printCustomerReceipt = () => {
    if (!ticket) return;
    fetch('/api/print-customer-receipt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ticket),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) flashToast('Receipt printed');
        else flashToast(`Print failed: ${d.error ?? 'Unknown error'}`, true);
      })
      .catch((err) => flashToast(`Print error: ${err.message}`, true));
  };

  const fetchReport = () => {
    setReportLoading(true);
    setReportError(null);
    fetch('/api/daily-report')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setReport(d.report);
        else setReportError(d.error ?? 'Failed to load report');
      })
      .catch((err) => setReportError(err.message))
      .finally(() => setReportLoading(false));
  };

  const openReport = () => { setShowReport(true); fetchReport(); };

  const closeDay = () => {
    setClosingDay(true);
    fetch('/api/close-day', { method: 'POST' })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setOrders([]);
          setShowReport(false);
          flashToast('Day closed — report printed');
        } else {
          setReportError(d.error ?? 'Failed to close day');
        }
      })
      .catch((err) => setReportError(err.message))
      .finally(() => setClosingDay(false));
  };

  const openDrawer = () => {
    fetch('/api/open-drawer', { method: 'POST' })
      .then((r) => r.json())
      .then((d) => { if (!d.success) flashToast('Drawer did not open', true); })
      .catch(() => flashToast('Drawer error', true));
  };

  const startNewOrder = () => {
    setLines([]); setCust({ name: "", phone: "" }); setTicket(null);
    setNameError(false);
  };

  return (
    <div className="app" style={rootStyle}>
      <header className="hdr" style={{ background: rootStyle["--header-bg"] }}>
        <div className="hdr-inner">
          <div className="hdr-logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/crab-island-logo.png" alt="Crab Island Seafood Market" />
          </div>
          <span className="hdr-slogan">You buy it, we steam it or fry it.</span>
          <div className="hdr-spacer" />
          <div className="hdr-actions">
            <button className="hdr-btn" onClick={openDrawer}>
              Open Drawer
            </button>
            <button className="hdr-btn" onClick={() => setShowPlaced(true)}>
              <Icon.receipt /> Orders {pendingCount > 0 && <span className="pill-count">{pendingCount}</span>}
            </button>
            <button className="hdr-btn" onClick={openReport}>
              <Icon.print /> Daily Report
            </button>
          </div>
        </div>

        <div className="hdr-cat-nav">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              className={"cat-nav-btn" + (activeCategory === cat ? " active" : "")}
              onClick={() => menuPanelRef.current?.scrollToCategory(cat)}
            >
              {CATEGORY_META[cat].label}
            </button>
          ))}
        </div>

        <svg className="hdr-wave" viewBox="0 0 1440 40" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0,22 C120,40 240,40 360,30 C480,20 600,2 720,6 C840,10 960,34 1080,36 C1200,38 1320,20 1440,14 L1440,40 L0,40 Z" fill="var(--paper)" />
          <path d="M0,22 C120,40 240,40 360,30 C480,20 600,2 720,6 C840,10 960,34 1080,36 C1200,38 1320,20 1440,14" fill="none" stroke="var(--ocean)" strokeWidth="3" opacity="0.5" />
        </svg>
      </header>

      <div className="body">
        <MenuPanel
          ref={menuPanelRef}
          onPick={openNew}
          activeCategory={activeCategory}
          onCategoryChange={setActiveCategory}
        />
        <OrderSummary
          cust={cust} setCust={setCust} lines={lines} total={total}
          onQty={changeQty} onRemove={removeLine} onEditLine={openEdit}
          onPlaceAndPay={placeAndPay} onPlaceAsPending={placeAsPending}
          mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)}
          nameError={nameError} onClearNameError={() => setNameError(false)}
        />
      </div>

      <div className="mobile-bar">
        <div className="mb-sum">
          <div className="mb-n">{itemCount} item{itemCount === 1 ? "" : "s"}</div>
          <div className="mb-t">{money(total)}</div>
        </div>
        <button className="btn-primary" onClick={() => setMobileOpen(true)}>
          <Icon.bag /> View Order
        </button>
      </div>

      {modalItem && (
        <CustomModal
          item={modalItem.item}
          initial={modalItem.custom}
          editingLineId={modalItem.lineUid}
          onClose={() => setModalItem(null)}
          onSave={saveLine}
        />
      )}
      {paymentOrder && (
        <PaymentModal
          order={paymentOrder}
          onConfirm={handlePaymentConfirm}
          onCancel={() => setPaymentOrder(null)}
        />
      )}
      {ticket && (
        <TicketModal
          order={ticket}
          onClose={() => setTicket(null)}
          onNewOrder={startNewOrder}
          onPrintReceipt={printCustomerReceipt}
        />
      )}
      {showPlaced && (
        <PlacedOrders
          orders={orders}
          onClose={() => setShowPlaced(false)}
          onView={(o) => { setShowPlaced(false); setTicket(o); }}
          onCollectPayment={collectPayment}
        />
      )}
      {showReport && (
        <DailyReportModal
          report={report}
          loading={reportLoading}
          error={reportError}
          closing={closingDay}
          onClose={() => setShowReport(false)}
          onCloseDay={closeDay}
        />
      )}

      {toast && (
        <div className={`add-toast${toast.isError ? ' toast-error' : ''}`} key={toast.id}>
          {toast.isError ? <Icon.x /> : <Icon.check />} {toast.msg}
        </div>
      )}

      <TweaksPanel>
        <TweakSection label="Look & Feel" />
        <TweakRadio label="Action color" value={t.actionColor} options={["gold", "red", "ocean"]} onChange={(v) => setTweak("actionColor", v)} />
        <TweakRadio label="Header" value={t.headerTheme} options={["red", "ocean", "sunset"]} onChange={(v) => setTweak("headerTheme", v)} />
        <TweakSlider label="Menu card width" value={t.cardWidth} min={210} max={340} step={10} unit="px" onChange={(v) => setTweak("cardWidth", v)} />
        <TweakSection label="Behavior" />
        <TweakToggle label="Sound on add" value={t.soundOnAdd} onChange={(v) => setTweak("soundOnAdd", v)} />
      </TweaksPanel>
    </div>
  );
}
