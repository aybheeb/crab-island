import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import {
  MENU, CATEGORIES, SEASONINGS, BUTTER, COOKING, FISH_TYPES,
  VEGGIES, BOWL_VEGGIES, BOWL_SAUCES,
  defaultCustom, unitPriceFor, money,
} from './data';

export const Icon = {
  search: (p) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" {...p}><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>,
  plus:   (p) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" {...p}><path d="M12 5v14M5 12h14"/></svg>,
  trash:  (p) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>,
  edit:   (p) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>,
  receipt:(p) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M5 3v18l2-1.5L9 21l2-1.5L13 21l2-1.5L17 21l2-1.5V3l-2 1.5L15 3l-2 1.5L11 3 9 4.5 7 3Z"/><path d="M8 8h8M8 12h6"/></svg>,
  print:  (p) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8" rx="1"/></svg>,
  check:  (p) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M20 6 9 17l-5-5"/></svg>,
  back:   (p) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M19 12H5M12 19l-7-7 7-7"/></svg>,
  x:      (p) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" {...p}><path d="M18 6 6 18M6 6l12 12"/></svg>,
  bag:    (p) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18M16 10a4 4 0 0 1-8 0"/></svg>,
};

export const CATEGORY_META = {
  "Seafood Platters":    { color: "var(--ocean-deep)", bg: "var(--foam)",      label: "🦐 Seafood Platters"    },
  "Combination Platters":{ color: "var(--red)",        bg: "var(--red-soft)",  label: "🦀 Combination Platters" },
  "Rice Bowls":          { color: "var(--gold-deep)",  bg: "var(--gold-soft)", label: "🍚 Rice Bowls"           },
  "Sides":               { color: "var(--ok)",         bg: "var(--ok-soft)",   label: "🍟 Sides"                },
};

function MenuCard({ item, onPick }) {
  const priceBlock = item.marketPrice ? (
    <span className="card-price market">Market Price</span>
  ) : item.sizes ? (
    <div className="card-price-row">
      {item.sizes.map((s) => (
        <span className="card-price" key={s.label}>
          <span className="sz">{s.label}</span>{money(s.price)}
        </span>
      ))}
    </div>
  ) : (
    <span className="card-price">{money(item.price)}</span>
  );

  return (
    <button className="card" onClick={() => onPick(item)} aria-label={`Add ${item.name}`}>
      <div className="card-top">
        {item.num && <span className="card-num">{item.num}</span>}
        <div><h3 className="card-name">{item.name}</h3></div>
      </div>
      <p className="card-desc">{item.desc}</p>
      <div className="card-foot">
        {priceBlock}
        <span className="card-add" aria-hidden="true"><Icon.plus /></span>
      </div>
    </button>
  );
}

export const MenuPanel = forwardRef(function MenuPanel({ onPick, activeCategory, onCategoryChange }, ref) {
  const [q, setQ] = useState("");
  const colRef = useRef(null);
  const sectionRefs = useRef({});

  const term = q.trim().toLowerCase();

  const filtered = MENU.filter((m) =>
    !term ||
    m.name.toLowerCase().includes(term) ||
    m.desc.toLowerCase().includes(term) ||
    (m.num && m.num.toLowerCase().includes(term)) ||
    (m.num && m.num.replace("#", "").includes(term)) ||
    m.category.toLowerCase().includes(term)
  );

  const grouped = CATEGORIES.map((cat) => ({
    cat,
    items: filtered.filter((m) => m.category === cat),
  })).filter((g) => g.items.length > 0);

  useImperativeHandle(ref, () => ({
    scrollToCategory(cat) {
      const col = colRef.current;
      const el = sectionRefs.current[cat];
      if (!col || !el) return;
      col.scrollTo({ top: col.scrollTop + el.getBoundingClientRect().top - col.getBoundingClientRect().top - 8, behavior: 'smooth' });
      onCategoryChange?.(cat);
    },
  }));

  useEffect(() => {
    const col = colRef.current;
    if (!col) return;
    const onScroll = () => {
      const colRect = col.getBoundingClientRect();
      let active = null;
      for (const cat of CATEGORIES) {
        const el = sectionRefs.current[cat];
        if (!el) continue;
        if (el.getBoundingClientRect().top - colRect.top <= 12) active = cat;
      }
      if (active) onCategoryChange?.(active);
    };
    col.addEventListener('scroll', onScroll, { passive: true });
    return () => col.removeEventListener('scroll', onScroll);
  }, [onCategoryChange]);

  return (
    <div className="menu-col scroll" ref={colRef}>
      <div className="menu-head">
        <h2 className="menu-title"><span className="dot">◆</span> Menu</h2>
        <div className="search-wrap">
          <Icon.search />
          <input
            className="search-input"
            placeholder="Search items or number…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      {grouped.length === 0 ? (
        <div className="empty-menu">No items match &quot;{q}&quot;.</div>
      ) : (
        grouped.map(({ cat, items }) => {
          const meta = CATEGORY_META[cat];
          return (
            <div
              key={cat}
              className="menu-section"
              ref={(el) => { sectionRefs.current[cat] = el; }}
              data-cat={cat}
            >
              <p className="section-label" style={{ color: meta.color }}>{meta.label}</p>
              <div className="menu-grid">
                {items.map((m) => <MenuCard key={m.id} item={m} onPick={onPick} />)}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
});

export function CustomModal({ item, initial, editingLineId, onClose, onSave }) {
  const [c, setC] = useState(initial || defaultCustom(item));
  const set = (patch) => setC((prev) => ({ ...prev, ...patch }));
  const unit  = unitPriceFor(item, c);
  const total = unit * c.qty;
  const activeSizes = c.noCombo && item.noCombo ? item.noCombo.sizes : item.sizes;

  const toggleNoCombo = () => {
    const next = !c.noCombo;
    const sizesForNext = next && item.noCombo ? item.noCombo.sizes : item.sizes;
    const size = sizesForNext
      ? (sizesForNext.find((s) => s.label === c.size)?.label || sizesForNext[0].label)
      : c.size;
    set({ noCombo: next, size, fries: false });
  };

  const Seg = ({ options, value, onChange, variant }) => (
    <div className={"seg" + (variant ? " " + variant : "")}>
      {options.map((o) => (
        <button key={o} className={value === o ? "on" : ""} onClick={() => onChange(o)} type="button">
          {value === o && <Icon.check className="ck" />}{o}
        </button>
      ))}
    </div>
  );

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-head">
          <div>
            {item.num && <span className="mh-num">{item.num}</span>}
            <h3>{item.name}</h3>
            <p>{item.desc}</p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close"><Icon.x /></button>
        </div>

        <div className="modal-body scroll">
          {activeSizes && (
            <div className="opt-group">
              <p className="opt-label">Size</p>
              <Seg options={activeSizes.map((s) => s.label)} value={c.size} onChange={(v) => set({ size: v })} />
            </div>
          )}

          <div className="opt-group">
            <p className="opt-label">Seasoning <span className="req">mix &amp; match</span></p>
            <div className="seg">
              {SEASONINGS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={c.seasoning[s] ? "on" : ""}
                  onClick={() => {
                    const next = s === "No Seasoning"
                      // "No Seasoning" is exclusive — picking it clears every other seasoning.
                      ? Object.fromEntries(SEASONINGS.map((o) => [o, o === s]))
                      // Picking any real seasoning turns "No Seasoning" back off.
                      : { ...c.seasoning, "No Seasoning": false, [s]: !c.seasoning[s] };
                    set({ seasoning: next });
                  }}
                >
                  {c.seasoning[s] && <Icon.check className="ck" />}{s}
                </button>
              ))}
            </div>
          </div>

          {c.butter !== null && (
            <div className="opt-group">
              <p className="opt-label">Butter</p>
              <Seg options={BUTTER} value={c.butter} onChange={(v) => set({ butter: v })} />
            </div>
          )}

          {item.cooking && (
            <div className="opt-group">
              <p className="opt-label">Cooking Style</p>
              <Seg options={COOKING} value={c.cooking} onChange={(v) => set({ cooking: v })} />
            </div>
          )}

          {item.fishChoice && (
            <div className="opt-group">
              <p className="opt-label">Fish Type</p>
              <div className="seg">
                {FISH_TYPES.map((f) => (
                  <button
                    key={f.label}
                    type="button"
                    className={c.fishType === f.label ? "on" : ""}
                    onClick={() => set({ fishType: f.label })}
                  >
                    {c.fishType === f.label && <Icon.check className="ck" />}
                    {f.label}
                    {f.upcharge > 0 && <span className="fish-up">+${f.upcharge}</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {item.bowl && (
            <>
              <div className="opt-group">
                <p className="opt-label">Veggie</p>
                <Seg options={BOWL_VEGGIES} value={c.bowlVeg} onChange={(v) => set({ bowlVeg: v })} />
              </div>
              <div className="opt-group">
                <p className="opt-label">Sauce</p>
                <Seg options={BOWL_SAUCES} value={c.sauce} onChange={(v) => set({ sauce: v })} />
              </div>
            </>
          )}

          {item.noCombo && item.platter && !item.bowl && (
            <div className="opt-group">
              <button type="button" className={"fries-toggle" + (c.noCombo ? " on" : "")} onClick={toggleNoCombo}>
                {c.noCombo ? "✓ No Sides — à la carte price" : "🚫 No Sides (skip veggies/fries)"}
              </button>
            </div>
          )}

          {item.platter && !item.bowl && !c.noCombo && (
            <div className="opt-group">
              <p className="opt-label">Sides <span className="req">comes with 3</span></p>
              <div
                className={"seg veg" + (c.fries ? " disabled" : "")}
                style={c.fries ? { opacity: .4, pointerEvents: "none" } : {}}
              >
                {VEGGIES.map((v) => (
                  <button key={v} type="button" className={c.veg[v] ? "on" : ""}
                    onClick={() => set({ veg: { ...c.veg, [v]: !c.veg[v] } })}>
                    {c.veg[v] && <Icon.check className="ck" />}{v}
                  </button>
                ))}
              </div>
              <button type="button" className={"fries-toggle" + (c.fries ? " on" : "")} onClick={() => set({ fries: !c.fries })}>
                {c.fries ? "✓ Swapped all sides for Fries" : "🍟 Swap all sides for Fries"}
              </button>
            </div>
          )}

          <div className="opt-group">
            <p className="opt-label">Quantity</p>
            <div className="qty-big">
              <button type="button" className="qb-btn" onClick={() => set({ qty: Math.max(1, c.qty - 1) })}>−</button>
              <span className="qb-val">{c.qty}</span>
              <button type="button" className="qb-btn" onClick={() => set({ qty: c.qty + 1 })}>+</button>
            </div>
          </div>

          <div className="opt-group">
            <p className="opt-label">Special Instructions</p>
            <textarea
              className="notes-input"
              placeholder="e.g. extra lemon, light Cajun, crab cut open…"
              value={c.notes}
              onChange={(e) => set({ notes: e.target.value })}
            />
          </div>
        </div>

        <div className="modal-foot">
          <div className="mf-price">
            <span className="ml">Line total</span>
            {item.marketPrice && !c.noCombo ? <span style={{ fontSize: "1rem", color: "var(--gold-deep)" }}>Market Price</span> : money(total)}
          </div>
          <button className="btn-primary" onClick={() => onSave(item, c)}>
            <Icon.check /> {editingLineId ? "Update Item" : "Add to Order"}
          </button>
        </div>
      </div>
    </div>
  );
}
