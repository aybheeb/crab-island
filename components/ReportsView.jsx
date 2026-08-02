'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Icon } from './Menu';
import { money } from './data';

const PRESETS = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: 'Last 7 Days' },
  { key: '30d', label: 'Last 30 Days' },
  { key: 'month', label: 'This Month' },
  { key: 'all', label: 'All Time' },
  { key: 'custom', label: 'Custom' },
];

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

// Buckets raw (paidAt, total) rows into the manager's own local calendar
// days across [from, to) — filling in $0 for days with no sales, so the
// line doesn't silently skip a slow day. Capped by the caller to a sane
// number of days; a multi-year "All Time" range isn't charted this way.
function bucketByLocalDay(rows, from, to) {
  const sums = new Map();
  for (const r of rows) {
    const key = new Date(r.paidAt).toLocaleDateString('en-CA');
    sums.set(key, (sums.get(key) || 0) + r.total);
  }
  const days = [];
  const cursor = startOfDay(from);
  while (cursor < to) {
    const key = cursor.toLocaleDateString('en-CA');
    days.push({
      label: cursor.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      total: sums.get(key) || 0,
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

const MAX_TREND_DAYS = 120;

// The requested window (e.g. "All Time") can be unbounded even when the
// actual data only spans a few days — most relevant early on, since order
// history only started 2026-08-02. Rather than refuse to chart just
// because the *window* is long, fall back to charting the data's own
// span; only give up if that's still too long to render sensibly.
function buildTrendDays(daily, range) {
  if (daily.length === 0) return [];

  let from = range.from;
  const requestedSpan = Math.round((range.to - range.from) / 86400000);
  if (requestedSpan > MAX_TREND_DAYS) {
    const earliest = daily.reduce((min, d) => (d.paidAt < min ? d.paidAt : min), daily[0].paidAt);
    from = startOfDay(new Date(earliest));
    if (Math.round((range.to - from) / 86400000) > MAX_TREND_DAYS) return [];
  }

  const days = bucketByLocalDay(daily, from, range.to);
  return days.length >= 2 ? days : []; // a single point isn't worth a line chart
}

function CategoryBars({ categories }) {
  const max = Math.max(...categories.map((c) => c.revenue), 1);
  return (
    <div className="cat-bars">
      {categories.map((c) => (
        <div key={c.category || 'uncategorized'}>
          <div className="cat-bar-label">
            <span>{c.category || 'Uncategorized'} ({c.qty})</span>
            <span>{money(c.revenue)}</span>
          </div>
          <div className="cat-bar-track">
            <div className="cat-bar-fill" style={{ width: `${(c.revenue / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function TrendChart({ days }) {
  const w = 600, h = 140, padX = 8, padY = 14;
  const max = Math.max(...days.map((d) => d.total), 1);
  const stepX = days.length > 1 ? (w - padX * 2) / (days.length - 1) : 0;
  const points = days.map((d, i) => ({
    x: padX + i * stepX,
    y: h - padY - (d.total / max) * (h - padY * 2),
    ...d,
  }));
  const linePoints = points.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <div className="trend-chart-wrap">
      <svg viewBox={`0 0 ${w} ${h}`} className="trend-chart" preserveAspectRatio="none">
        <line x1={padX} y1={h - padY} x2={w - padX} y2={h - padY} stroke="var(--line)" strokeWidth="1" />
        <polyline points={linePoints} fill="none" stroke="var(--ocean-deep)" strokeWidth="2.5" />
        {points.map((p, i) => (
          <circle cx={p.x} cy={p.y} r="3.5" fill="var(--red)" key={i}>
            <title>{p.label}: {money(p.total)}</title>
          </circle>
        ))}
      </svg>
      <div className="trend-chart-labels">
        <span>{days[0]?.label}</span>
        <span>{days[days.length - 1]?.label}</span>
      </div>
    </div>
  );
}

// Resolves a preset key (or explicit custom from/to date strings, in this
// browser's local timezone) into concrete instants for the API's from/to
// query params. `to` is always exclusive, so it's set one day past the
// last included day rather than to its midnight.
function resolveRange(preset, customFrom, customTo) {
  const now = new Date();
  const todayStart = startOfDay(now);

  switch (preset) {
    case 'today':
      return { from: todayStart, to: now };
    case '7d': {
      const from = new Date(todayStart);
      from.setDate(from.getDate() - 6);
      return { from, to: now };
    }
    case '30d': {
      const from = new Date(todayStart);
      from.setDate(from.getDate() - 29);
      return { from, to: now };
    }
    case 'month': {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from, to: now };
    }
    case 'all':
      return { from: new Date(0), to: now };
    case 'custom': {
      if (!customFrom || !customTo) return null;
      const from = startOfDay(new Date(customFrom));
      const to = startOfDay(new Date(customTo));
      to.setDate(to.getDate() + 1);
      return { from, to };
    }
    default:
      return { from: todayStart, to: now };
  }
}

// Manager-only sales/item reporting, permanent (not reset by Close Day).
// Reachable at /manager/reports (role-gated server-side).
export default function ReportsView({ staff }) {
  const router = useRouter();

  const [preset, setPreset] = useState('today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [itemSearch, setItemSearch] = useState('');

  const [sales, setSales] = useState(null);
  const [items, setItems] = useState(null);
  const [categories, setCategories] = useState(null);
  const [trendDays, setTrendDays] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  const flashToast = (msg, isError = false) => {
    setToast({ msg, id: Date.now(), isError });
    setTimeout(() => setToast(null), isError ? 3500 : 1500);
  };

  const handleLogout = () => {
    fetch('/api/staff/logout', { method: 'POST' })
      .then(() => router.refresh())
      .catch((err) => flashToast(`Logout error: ${err.message}`, true));
  };

  const load = useCallback(() => {
    const range = resolveRange(preset, customFrom, customTo);
    if (!range) return;

    setLoading(true);
    setError(null);
    const qs = `from=${encodeURIComponent(range.from.toISOString())}&to=${encodeURIComponent(range.to.toISOString())}`;

    Promise.all([
      fetch(`/api/reports/sales?${qs}`).then((r) => r.json()),
      fetch(`/api/reports/items?${qs}`).then((r) => r.json()),
      fetch(`/api/reports/trend?${qs}`).then((r) => r.json()),
    ])
      .then(([salesRes, itemsRes, trendRes]) => {
        if (salesRes.success) setSales(salesRes.report);
        else setError(salesRes.error ?? 'Failed to load sales report');
        if (itemsRes.success) { setItems(itemsRes.items); setCategories(itemsRes.categories); }
        else setError(itemsRes.error ?? 'Failed to load item report');
        if (trendRes.success) setTrendDays(buildTrendDays(trendRes.daily, range));
        else setError(trendRes.error ?? 'Failed to load trend');
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [preset, customFrom, customTo]);

  useEffect(() => {
    if (preset === 'custom' && (!customFrom || !customTo)) return;
    load();
  }, [preset, customFrom, customTo, load]);

  const filteredItems = items?.filter((it) =>
    it.name.toLowerCase().includes(itemSearch.trim().toLowerCase())
  ) ?? [];

  return (
    <div className="mgr-screen">
      <header className="mgr-hdr">
        <div className="mgr-hdr-inner">
          <Link href="/manager" className="hdr-btn" style={{ marginRight: 12 }}><Icon.x /> Back</Link>
          <h1 className="mgr-title">Reports</h1>
          <div className="hdr-spacer" />
          <div className="hdr-staff">
            <span className="hdr-staff-name">{staff.name}</span>
            <button className="hdr-btn" onClick={handleLogout}>Log Out</button>
          </div>
        </div>
      </header>

      <div className="mgr-menu-body">
        <div className="opt-group">
          <label className="opt-label">Period</label>
          <div className="po-filters" style={{ padding: 0, flexWrap: 'wrap' }}>
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                className={'po-filter-btn' + (preset === p.key ? ' active' : '')}
                onClick={() => setPreset(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>
          {preset === 'custom' && (
            <div className="size-row" style={{ marginTop: 12 }}>
              <input
                className="text-input"
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
              <input
                className="text-input"
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
              />
            </div>
          )}
        </div>

        {loading && <div className="po-empty">Loading…</div>}
        {error && <div className="field-error-msg" style={{ margin: '0 0 16px' }}>{error}</div>}

        {!loading && sales && (
          sales.orderCount === 0 ? (
            <div className="po-empty">No paid orders in this period.</div>
          ) : (
            <>
              <div className="mgr-menu-category">
                <div className="mgr-menu-category-head"><h3>Sales Summary</h3></div>
                <div className="staff-card">
                  <div className="subtle-row"><span>Orders (paid)</span><span>{sales.orderCount}</span></div>
                  <div className="subtle-row"><span>Items sold</span><span>{sales.itemCount}</span></div>
                  <hr className="ticket-divider" />
                  <div className="subtle-row"><span>Cash</span><span>{money(sales.cash)}</span></div>
                  <div className="subtle-row"><span>Credit</span><span>{money(sales.credit)}</span></div>
                  <div className="subtle-row"><span>EBT</span><span>{money(sales.ebt)}</span></div>
                  <hr className="ticket-divider" />
                  <div className="total-row">
                    <span className="tl">Grand Total</span>
                    <span className="tv">{money(sales.grandTotal)}</span>
                  </div>
                </div>
              </div>

              {trendDays?.length > 0 && (
                <div className="mgr-menu-category">
                  <div className="mgr-menu-category-head"><h3>Daily Trend</h3></div>
                  <div className="staff-card">
                    <TrendChart days={trendDays} />
                  </div>
                </div>
              )}

              {categories?.length > 0 && (
                <div className="mgr-menu-category">
                  <div className="mgr-menu-category-head"><h3>By Category</h3></div>
                  <div className="staff-card">
                    <CategoryBars categories={categories} />
                  </div>
                </div>
              )}

              {items?.length > 0 && (
                <div className="mgr-menu-category">
                  <div className="mgr-menu-category-head">
                    <h3>Best Sellers</h3>
                    <div className="search-wrap">
                      <Icon.search />
                      <input
                        className="search-input"
                        placeholder="Search items…"
                        value={itemSearch}
                        onChange={(e) => setItemSearch(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="staff-card">
                    {filteredItems.length === 0 ? (
                      <div className="po-empty">No items match "{itemSearch}".</div>
                    ) : (
                      filteredItems.map((it, i) => (
                        <div className="subtle-row" key={`${it.name}-${it.category}-${i}`}>
                          <span>{it.name} <span style={{ color: 'var(--slate-light)' }}>× {it.qty}</span></span>
                          <span>{money(it.revenue)}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </>
          )
        )}
      </div>

      {toast && (
        <div className={`add-toast${toast.isError ? ' toast-error' : ''}`} key={toast.id}>
          {toast.isError ? <Icon.x /> : <Icon.check />} {toast.msg}
        </div>
      )}
    </div>
  );
}
