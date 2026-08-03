'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { defaultCustom, unitPriceFor, buildCustomLine, money } from './data';
import { Icon, MenuPanel, CustomModal, getCategoryMeta } from './Menu';
import { OrderSummary, TicketModal, PlacedOrders } from './Order';
import VoidOrderModal from './VoidOrderModal';
import CustomItemModal from './CustomItemModal';
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

// Merges a fresh GET /api/orders response into local state — used both for
// the initial mount restore and every poll after, so an order placed from
// another device (e.g. a phone) shows up here without a manual reload.
// A blind replace would lose two things the server doesn't track:
//   - ticketPrinted/saveFailed are client-only convenience flags; resetting
//     ticketPrinted on every poll would make the payment flow think a
//     kitchen ticket was never printed and print a duplicate.
//   - an order this device just placed optimistically (setOrders ran before
//     its POST resolved) might not be in the server's response yet — drop
//     it and it would flicker out of the list until the POST catches up.
function mergeOrders(prevOrders, serverOrders) {
  const remaining = new Map(serverOrders.map((o) => [o.orderNo, o]));
  const merged = prevOrders.map((prev) => {
    const fromServer = remaining.get(prev.orderNo);
    if (!fromServer) return prev; // not visible server-side yet — keep the optimistic copy
    remaining.delete(prev.orderNo);
    return { ...fromServer, ticketPrinted: prev.ticketPrinted, saveFailed: prev.saveFailed };
  });
  for (const fresh of remaining.values()) {
    merged.push({ ...fresh, ticketPrinted: fresh.status === 'paid', saveFailed: false });
  }
  return merged;
}

const ORDER_POLL_MS = 10000;

// POSTs to a print-server-backed order endpoint, retrying once after a short
// delay on failure — covers the "first request after the tunnel/connection has
// been idle a while" failure mode, which normally succeeds immediately on retry
// (a genuinely down print-server won't be fixed by this, but will still fail
// cleanly after the one retry). "already exists" from a retried create means
// the original attempt actually landed and only its response got lost, so
// that's treated as success rather than a real failure.
function postWithRetry(url, body, attempt = 0) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
    .then((r) => r.json())
    .then((d) => {
      if (d.success || d.error?.includes('already exists')) return { success: true };
      if (attempt < 1) return retryAfterDelay();
      return { success: false, error: d.error ?? 'Unknown error' };
    })
    .catch((err) => (attempt < 1 ? retryAfterDelay() : { success: false, error: err.message }));

  function retryAfterDelay() {
    return new Promise((resolve) => setTimeout(resolve, 1500)).then(() => postWithRetry(url, body, attempt + 1));
  }
}

// Turns a failed print response's `category` into a message that tells the
// cashier whether it's a printer-server auth problem, the print server being
// unreachable, a timeout, or something unclassified — instead of surfacing
// the upstream's raw "Unauthorized" string for every kind of failure.
function printErrorMessage(d) {
  switch (d.category) {
    case 'auth_error':
      return `Print failed: print server rejected the request (${d.error ?? 'auth error'})`;
    case 'gateway_error':
      return `Print failed: could not reach the print server (${d.error ?? 'unreachable'})`;
    case 'timeout':
      return 'Print failed: print server timed out';
    default:
      return `Print failed: ${d.error ?? 'Unknown error'}`;
  }
}

export default function App({ staff, menu: initialMenu, categories: initialCategories }) {
  const router = useRouter();
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  const [menu, setMenu] = useState(initialMenu);
  const [categories, setCategories] = useState(initialCategories);

  const [cust, setCust] = useState({ name: "", phone: "" });
  const [lines, setLines] = useState([]);
  const [orders, setOrders] = useState([]);
  const [seq, setSeq] = useState(1);
  // Set while the live cart (cust/lines above) represents an in-progress
  // edit of an already-placed pending order, rather than a brand-new one —
  // see startEditOrder/saveOrderEdit/cancelEditOrder.
  const [editingOrderNo, setEditingOrderNo] = useState(null);

  const [modalItem, setModalItem] = useState(null);
  const [ticket, setTicket] = useState(null);
  // True when `ticket` is a historical order pulled up via Placed Orders'
  // Ticket button, rather than the one just placed/paid — governs whether
  // TicketModal offers "New Order" (see the ticketFromHistory ? ... below).
  const [ticketFromHistory, setTicketFromHistory] = useState(false);
  const [paymentOrder, setPaymentOrder] = useState(null);
  // True when paymentOrder was just built from the live cart (placeAndPay) —
  // false when it's a different, previously-placed pending order pulled up
  // via collectPayment. Only the former should clear the cart on confirm;
  // the latter could be interrupting an unrelated order still being built.
  const [paymentFromCart, setPaymentFromCart] = useState(false);
  const [showPlaced, setShowPlaced] = useState(false);
  const [voidTarget, setVoidTarget] = useState(null);
  const [showCustomItem, setShowCustomItem] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [nameError, setNameError] = useState(false);
  const [activeCategory, setActiveCategory] = useState(categories[0]);

  const menuPanelRef = useRef(null);

  // Restore the current day's orders (pending + paid) on mount, then keep
  // polling — an order placed from another device (e.g. a phone) must show
  // up here on its own, not only after a manual reload. Also re-syncs
  // immediately whenever the tab regains focus, same pattern as the menu
  // refresh below. seq is bumped past whatever the merge reveals, so this
  // device never reuses an order number another device already took.
  useEffect(() => {
    const sync = () => {
      fetch('/api/orders')
        .then((r) => r.json())
        .then((d) => {
          if (!d.success) return;
          setOrders((prev) => {
            const merged = mergeOrders(prev, d.orders);
            const maxNo = merged.reduce((m, o) => Math.max(m, parseInt(String(o.orderNo).replace('#', ''), 10) || 0), 0);
            setSeq((s) => Math.max(s, maxNo + 1));
            return merged;
          });
        })
        .catch((err) => flashToast(`Could not sync orders: ${err.message}`, true));
    };
    sync();
    const id = setInterval(sync, ORDER_POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') sync(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // menu/categories start as a one-time server-rendered prop (app/page.jsx)
  // that this tab has no way to learn is stale after a manager edits the
  // catalog elsewhere — possibly a cached render of this very route if
  // navigated back to via a Link rather than a hard refresh. Re-fetching once
  // on mount (covers navigating back to "/") and again whenever the tab
  // regains focus (covers switching away to edit, then back) catches both
  // without polling constantly for a resource that rarely changes.
  useEffect(() => {
    const refreshMenu = () => {
      fetch('/api/menu')
        .then((r) => r.json())
        .then((d) => {
          if (!d.success) return;
          setMenu(d.menu);
          setCategories(d.categories);
          setActiveCategory((prev) => (d.categories.includes(prev) ? prev : d.categories[0]));
        })
        .catch(() => {});
    };
    refreshMenu();
    const onVisible = () => { if (document.visibilityState === 'visible') refreshMenu(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
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

  // Closes the shift (for a cashier) server-side and clears the session
  // cookie, then asks the page (a server component) to re-render — it'll see
  // no valid session and render the PIN pad in place of the app.
  const handleLogout = () => {
    fetch('/api/staff/logout', { method: 'POST' })
      .then(() => router.refresh())
      .catch((err) => flashToast(`Logout error: ${err.message}`, true));
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

  const addCustomItem = (name, price, qty) => {
    setLines((ls) => [...ls, buildCustomLine(UID++, name, price, qty)]);
    setShowCustomItem(false);
    flashToast(`${name} added`);
  };

  // A cashier can still correct a pending order (see startEditOrder/
  // saveOrderEdit below) — a settled paid order cannot, and voiding one
  // requires a manager step-up either way (see VoidOrderModal).
  //
  // buildOrder() only constructs the order object (and reserves its orderNo)
  // — it does not persist anything. "Pay later" orders are persisted right
  // after building (see placeAsPending) since they need to survive a page
  // refresh and the kitchen needs to see them immediately. A "pay now" order
  // is only persisted once payment actually succeeds (see
  // handlePaymentConfirm) — cancelling out of payment before that point
  // never printed a ticket or told anyone anything, so it should leave no
  // trace, not a dangling pending order nobody asked for.
  const buildOrder = () => {
    if (lines.length === 0) return null;
    if (!cust.name.trim()) {
      setNameError(true);
      flashToast('Customer name is required', true);
      return null;
    }
    setNameError(false);
    const orderNo = '#' + String(seq).padStart(3, '0');
    setSeq((s) => s + 1);
    return {
      orderNo, cust, lines, total, ts: Date.now(),
      status: 'pending', paidAt: null, payMethod: null, changeDue: null, tenders: null,
      ticketPrinted: false, saveFailed: false,
    };
  };

  const persistOrder = (order) => {
    setOrders((os) => [...os, order]);
    postWithRetry('/api/orders', { orderNo: order.orderNo, cust: order.cust, lines: order.lines, total: order.total, ts: order.ts })
      .then((d) => {
        if (d.success) return;
        setOrders((os) => os.map((o) => o.orderNo === order.orderNo ? { ...o, saveFailed: true } : o));
        flashToast(`${order.orderNo} NOT saved: ${d.error} — tap Retry Save in Placed Orders`, true);
      });
  };

  // Manual fallback for when the automatic retry in persistOrder/handlePaymentConfirm
  // also failed (e.g. a longer outage, not just a brief cold-connection blip).
  const retrySaveOrder = (order) => {
    postWithRetry('/api/orders', { orderNo: order.orderNo, cust: order.cust, lines: order.lines, total: order.total, ts: order.ts })
      .then((d) => {
        if (!d.success) {
          flashToast(`${order.orderNo} still not saved: ${d.error}`, true);
          return;
        }
        setOrders((os) => os.map((o) => o.orderNo === order.orderNo ? { ...o, saveFailed: false } : o));
        flashToast(`${order.orderNo} saved`);
        // A paid order that failed to save was also never recorded in the daily
        // totals (that call only happens after a successful create) — catch it up.
        if (order.status === 'paid') {
          postWithRetry('/api/record-order', {
            orderNo: order.orderNo, payMethod: order.payMethod, changeDue: order.changeDue,
            tenders: order.tenders, total: order.total,
          }).then((rd) => { if (!rd.success) flashToast(`Daily report not updated: ${rd.error}`, true); });
        }
      });
  };

  // Loads a pending order back into the live cart for correction. Only
  // pending orders can reach here (see PlacedOrders' Edit button) — paid/
  // voided orders have no edit path. Warns before discarding an in-progress
  // unsaved cart rather than silently clobbering it.
  const startEditOrder = (order) => {
    if (lines.length > 0 && !window.confirm('Discard the current unsaved order to edit this one?')) {
      return;
    }
    setCust(order.cust);
    setLines(order.lines);
    setEditingOrderNo(order.orderNo);
    setNameError(false);
    setShowPlaced(false);
    setMobileOpen(true);
  };

  const cancelEditOrder = () => {
    setEditingOrderNo(null);
    setLines([]);
    setCust({ name: "", phone: "" });
    setNameError(false);
  };

  // Saves the in-progress edit and immediately reprints the kitchen ticket
  // (marked UPDATED) so the kitchen is never left working from the stale
  // original — see printKitchenOnly's updated flag.
  const saveOrderEdit = () => {
    if (lines.length === 0) return;
    if (!cust.name.trim()) {
      setNameError(true);
      flashToast('Customer name is required', true);
      return;
    }
    setNameError(false);
    const orderNo = editingOrderNo;

    fetch('/api/orders/edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderNo, cust, lines, total }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) {
          flashToast(`Could not save changes: ${d.error}`, true);
          return;
        }
        setOrders((os) => os.map((o) => (o.orderNo === orderNo ? { ...o, cust, lines, total } : o)));
        setEditingOrderNo(null);
        setLines([]);
        setCust({ name: "", phone: "" });
        printKitchenOnly(d.order, { updated: true });
      })
      .catch((err) => flashToast(`Could not save changes: ${err.message}`, true));
  };

  // Prints kitchen ticket + cashier receipt together — used when payment is
  // collected at order time, so both come out immediately.
  const printCombined = (order) => {
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
          flashToast(printErrorMessage(d), true);
        }
      })
      .catch((err) => flashToast(`Print error: ${err.message}`, true));
  };

  // Kitchen ticket only — used when an order is placed as pending (pay
  // later), so the kitchen can start without waiting on payment. Also reused
  // (with updated: true) after saveOrderEdit, so a reprint of a corrected
  // order is unmistakably marked as replacing the original, not a duplicate.
  const printKitchenOnly = (order, { updated = false } = {}) => {
    fetch('/api/print-kitchen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...order, updated }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setOrders((os) => os.map((o) => o.orderNo === order.orderNo ? { ...o, ticketPrinted: true } : o));
          flashToast(updated ? 'Updated kitchen ticket printed' : 'Kitchen ticket printed');
        } else {
          flashToast(printErrorMessage(d), true);
        }
      })
      .catch((err) => flashToast(`Print error: ${err.message}`, true));
  };

  // Cashier receipt only — used when payment is collected on an order whose
  // kitchen ticket already printed at pending-placement time.
  const printReceiptOnly = (order) => {
    fetch('/api/print-receipt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(order),
    })
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) flashToast(printErrorMessage(d), true);
      })
      .catch((err) => flashToast(`Print error: ${err.message}`, true));
  };

  const placeAndPay = () => {
    const order = buildOrder();
    if (!order) return;
    setMobileOpen(false);
    setPaymentFromCart(true);
    setPaymentOrder(order);
  };

  const placeAsPending = () => {
    const order = buildOrder();
    if (!order) return;
    persistOrder(order);
    setMobileOpen(false);
    printKitchenOnly(order);
    startNewOrder();
    flashToast(`${order.orderNo} saved — pending payment`);
  };

  const collectPayment = (order) => {
    setShowPlaced(false);
    setPaymentFromCart(false);
    setPaymentOrder(order);
  };

  const handlePaymentConfirm = ({ kickDrawer, payMethod, changeDue, tenders, total: settledTotal }) => {
    const skipKitchenTicket = paymentOrder.ticketPrinted;
    // settledTotal is what was actually charged — equal to the order total
    // unless a cooking-fee surcharge got added on top (see PaymentModal).
    const order = { ...paymentOrder, status: 'paid', paidAt: Date.now(), payMethod, changeDue, tenders, total: settledTotal };
    setPaymentOrder(null);
    setTicket(order);
    setTicketFromHistory(false);

    const recordPayment = () => {
      postWithRetry('/api/record-order', { orderNo: order.orderNo, payMethod, changeDue, tenders, total: settledTotal })
        .then((d) => { if (!d.success) flashToast(`Daily report not updated: ${d.error} — sales total may be off for ${order.orderNo}`, true); });
    };

    if (paymentFromCart) {
      // This order was never persisted — placeAndPay defers that until
      // payment actually succeeds (see buildOrder). Create it now, and only
      // mark it paid once that create call actually lands, so the server
      // never sees a "mark paid" for an order it doesn't know about yet.
      // Clear the cart now, not just on "New Order" — otherwise a cashier
      // who just paid can hit "Close" on the ticket and land on a
      // still-populated, fully-editable cart holding the same items they
      // just charged for.
      setOrders((os) => [...os, order]);
      setLines([]);
      setCust({ name: "", phone: "" });
      setNameError(false);

      postWithRetry('/api/orders', { orderNo: order.orderNo, cust: order.cust, lines: order.lines, total: paymentOrder.total, ts: order.ts })
        .then((d) => {
          if (!d.success) {
            setOrders((os) => os.map((o) => o.orderNo === order.orderNo ? { ...o, saveFailed: true } : o));
            flashToast(`${order.orderNo} NOT saved: ${d.error} — tap Retry Save in Placed Orders`, true);
            return;
          }
          recordPayment();
        });
    } else {
      // Collecting payment on a previously-placed pending order — already
      // exists server-side, just transition it to paid.
      setOrders((os) => os.map((o) => o.orderNo === order.orderNo ? order : o));
      recordPayment();
    }

    // If the kitchen ticket already printed at pending-placement time, only the
    // receipt is still owed now; otherwise (paid at order time) print both.
    const printAfterPayment = () => {
      if (skipKitchenTicket) printReceiptOnly(order);
      else printCombined(order);
    };

    if (kickDrawer) {
      fetch('/api/open-drawer', { method: 'POST' })
        .then((r) => r.json())
        .then((d) => { if (!d.success) flashToast('Drawer did not open', true); })
        .catch(() => flashToast('Drawer error', true))
        .finally(printAfterPayment);
    } else {
      printAfterPayment();
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
        else flashToast(printErrorMessage(d), true);
      })
      .catch((err) => flashToast(`Print error: ${err.message}`, true));
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
          <button
            className="hdr-menu-btn"
            onClick={() => setNavOpen((o) => !o)}
            aria-label="Menu"
            aria-expanded={navOpen}
          >
            <Icon.menu />
          </button>
          <div className={"hdr-actions" + (navOpen ? " open" : "")} onClick={() => setNavOpen(false)}>
            {staff && (
              <div className="hdr-staff">
                <span className="hdr-staff-name">{staff.name}</span>
                <button className="hdr-btn" onClick={handleLogout}>
                  {staff.role === 'cashier' ? 'Clock Out' : 'Log Out'}
                </button>
              </div>
            )}
            <button className="hdr-btn" onClick={openDrawer}>
              Open Drawer
            </button>
            <button className="hdr-btn" onClick={() => setShowPlaced(true)}>
              <Icon.receipt /> Orders {pendingCount > 0 && <span className="pill-count">{pendingCount}</span>}
            </button>
            {staff?.role === 'manager' && (
              <Link href="/manager" className="hdr-btn">
                <Icon.print /> Manager Dashboard
              </Link>
            )}
          </div>
        </div>

        <div className="hdr-cat-nav">
          {categories.map((cat) => (
            <button
              key={cat}
              className={"cat-nav-btn" + (activeCategory === cat ? " active" : "")}
              onClick={() => menuPanelRef.current?.scrollToCategory(cat)}
            >
              {getCategoryMeta(cat).label}
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
          menu={menu}
          categories={categories}
          onPick={openNew}
          activeCategory={activeCategory}
          onCategoryChange={setActiveCategory}
        />
        <OrderSummary
          cust={cust} setCust={setCust} lines={lines} total={total}
          onQty={changeQty} onRemove={removeLine} onEditLine={openEdit}
          onAddCustomItem={() => setShowCustomItem(true)}
          onPlaceAndPay={placeAndPay} onPlaceAsPending={placeAsPending}
          mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)}
          nameError={nameError} onClearNameError={() => setNameError(false)}
          editingOrderNo={editingOrderNo} onSaveEdit={saveOrderEdit} onCancelEdit={cancelEditOrder}
        />
      </div>
      {showCustomItem && (
        <CustomItemModal onClose={() => setShowCustomItem(false)} onAdd={addCustomItem} />
      )}

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
      {showPlaced && (
        <PlacedOrders
          orders={orders}
          onClose={() => setShowPlaced(false)}
          onView={(o) => { setTicket(o); setTicketFromHistory(true); }}
          onCollectPayment={collectPayment}
          onRetrySave={retrySaveOrder}
          onVoidOrder={(o) => setVoidTarget(o)}
          onEditOrder={startEditOrder}
          editingOrderNo={editingOrderNo}
        />
      )}
      {ticket && (
        // Rendered after (so it paints on top of) PlacedOrders — viewing a
        // ticket from the placed-orders list no longer closes that list
        // behind it, so closing the ticket lands back on it instead of
        // requiring "Orders" to be reopened from scratch.
        <TicketModal
          order={ticket}
          onClose={() => setTicket(null)}
          onNewOrder={ticketFromHistory ? undefined : startNewOrder}
          onPrintReceipt={printCustomerReceipt}
        />
      )}
      {voidTarget && (
        <VoidOrderModal
          order={voidTarget}
          staffRole={staff?.role}
          onClose={() => setVoidTarget(null)}
          onVoided={(voidedOrder) => {
            setOrders((os) => os.map((o) => o.orderNo === voidedOrder.orderNo ? voidedOrder : o));
            setVoidTarget(null);
            flashToast(`${voidedOrder.orderNo} voided`);
          }}
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
