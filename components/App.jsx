'use client';

import { useState, useRef } from 'react';
import { CATEGORIES, defaultCustom, unitPriceFor, money } from './data';
import { Icon, MenuPanel, CustomModal, CATEGORY_META } from './Menu';
import { OrderSummary, TicketModal, PlacedOrders } from './Order';
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
  const [editingOrderNo, setEditingOrderNo] = useState(null);

  const [modalItem, setModalItem] = useState(null);
  const [ticket, setTicket] = useState(null);
  const [showPlaced, setShowPlaced] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [nameError, setNameError] = useState(false);
  const [activeCategory, setActiveCategory] = useState(CATEGORIES[0]);

  const menuPanelRef = useRef(null);

  const total = lines.reduce((s, l) => s + l.unit * l.custom.qty, 0);
  const itemCount = lines.reduce((n, l) => n + l.custom.qty, 0);

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

  const placeOrder = () => {
    if (lines.length === 0) return;
    if (!cust.name.trim()) {
      setNameError(true);
      flashToast('Customer name is required', true);
      return;
    }
    setNameError(false);
    let order;
    if (editingOrderNo) {
      order = { orderNo: editingOrderNo, cust, lines, total, ts: Date.now() };
      setOrders((os) => os.map((o) => o.orderNo === editingOrderNo ? order : o));
      setTicket(order);
      setEditingOrderNo(null);
    } else {
      const orderNo = "#" + String(seq).padStart(3, "0");
      order = { orderNo, cust, lines, total, ts: Date.now() };
      setOrders((os) => [...os, order]);
      setSeq((s) => s + 1);
      setTicket(order);
    }
    setMobileOpen(false);

    // Non-blocking — order is already saved; print failure does not roll it back
    fetch('/api/print-ticket', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(order),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          flashToast('Ticket printed');
        } else {
          flashToast(`Print failed: ${data.error ?? 'Unknown error'}`, true);
        }
      })
      .catch((err) => {
        flashToast(`Print error: ${err.message}`, true);
      });
  };

  const startNewOrder = () => {
    setLines([]); setCust({ name: "", phone: "" }); setEditingOrderNo(null); setTicket(null);
    setNameError(false);
  };

  const recallOrder = (o) => {
    setLines(o.lines.map((l) => ({ ...l, uid: UID++ })));
    setCust({ ...o.cust });
    setEditingOrderNo(o.orderNo);
    setNameError(false);
    setShowPlaced(false);
    setMobileOpen(true);
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
            <button className="hdr-btn" onClick={() => setShowPlaced(true)}>
              <Icon.receipt /> Orders {orders.length > 0 && <span className="pill-count">{orders.length}</span>}
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
          editingOrderNo={editingOrderNo}
          onQty={changeQty} onRemove={removeLine} onEditLine={openEdit}
          onPlace={placeOrder} onCancelEdit={() => { setEditingOrderNo(null); startNewOrder(); }}
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
      {ticket && <TicketModal order={ticket} onClose={() => setTicket(null)} onNewOrder={startNewOrder} />}
      {showPlaced && (
        <PlacedOrders
          orders={orders}
          onClose={() => setShowPlaced(false)}
          onRecall={recallOrder}
          onView={(o) => { setShowPlaced(false); setTicket(o); }}
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
