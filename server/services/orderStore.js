import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Lives on the print-server machine's disk so the day's sales survive a page
// refresh, a browser crash, or the print-server process itself restarting —
// the Next app only ever talks to this over HTTP, it holds no state of its own.
const __dirname   = dirname(fileURLToPath(import.meta.url));
const DATA_DIR    = join(__dirname, '..', '..', 'print-server', 'data');
const HISTORY_DIR = join(DATA_DIR, 'history');
const CURRENT_FILE = join(DATA_DIR, 'current-day.json');

const EMPTY_DAY = () => ({ openedAt: null, orders: [] });

function ensureDirs() {
  if (!existsSync(HISTORY_DIR)) mkdirSync(HISTORY_DIR, { recursive: true });
}

function loadCurrent() {
  if (!existsSync(CURRENT_FILE)) return EMPTY_DAY();
  try {
    return JSON.parse(readFileSync(CURRENT_FILE, 'utf8'));
  } catch {
    return EMPTY_DAY();
  }
}

function saveCurrent(data) {
  ensureDirs();
  writeFileSync(CURRENT_FILE, JSON.stringify(data, null, 2));
}

function itemCountOf(order) {
  return order.lines.reduce((n, l) => n + l.custom.qty, 0);
}

// Creates a new order in the current open day as "pending" — placed but not
// yet paid (e.g. a phone-in or walk-in-ahead order the customer will pay for
// on pickup). Order contents are frozen at creation: cashiers have no way to
// edit or void it afterward, here or anywhere else (see the TODO in
// components/Order.jsx) — the only thing that can still happen to it is the
// one-way "pending" -> "paid" transition via markOrderPaid below.
export function createOrder({ orderNo, cust, lines, total, ts }) {
  if (!orderNo || !ts) throw new Error('Order missing orderNo/ts');
  const data = loadCurrent();
  if (!data.openedAt) data.openedAt = new Date().toISOString();

  if (data.orders.some((o) => o.orderNo === orderNo)) {
    throw new Error(`Order ${orderNo} already exists`);
  }

  data.orders.push({
    orderNo, cust, lines, total, ts,
    status: 'pending',
    paidAt: null,
    payMethod: null,
    changeDue: null,
    tenders: null,
  });

  saveCurrent(data);
}

// Marks a previously-created order as paid — the only other transition an
// order can undergo. Never touches lines/cust/total.
export function markOrderPaid(orderNo, { payMethod, changeDue, tenders }) {
  const data = loadCurrent();
  const order = data.orders.find((o) => o.orderNo === orderNo);
  if (!order) throw new Error(`Order ${orderNo} not found`);

  order.status = 'paid';
  order.paidAt = Date.now();
  order.payMethod = payMethod || null;
  order.changeDue = changeDue ?? null;
  order.tenders = tenders || null;

  saveCurrent(data);
  return order;
}

// Full current-day order list (pending + paid) — used to restore the
// cashier's UI state after a page refresh.
export function getOrders() {
  return loadCurrent().orders;
}

function buildReport(data) {
  const paid = data.orders.filter((o) => o.status === 'paid');
  const pending = data.orders.filter((o) => o.status === 'pending');
  const sum = (list, fn) => list.reduce((s, o) => s + fn(o), 0);

  return {
    openedAt: data.openedAt,
    generatedAt: new Date().toISOString(),
    orderCount: paid.length,
    itemCount: sum(paid, itemCountOf),
    cash: sum(paid, (o) => o.tenders?.cash || 0),
    credit: sum(paid, (o) => o.tenders?.credit || 0),
    ebt: sum(paid, (o) => o.tenders?.ebt || 0),
    grandTotal: sum(paid, (o) => o.total || 0),
    // Informational only — never included in the financial totals above.
    pendingCount: pending.length,
    pendingTotal: sum(pending, (o) => o.total || 0),
  };
}

// Read-only — safe to call repeatedly while the day is still open (e.g. to
// preview totals before deciding to close the day).
export function getCurrentReport() {
  return buildReport(loadCurrent());
}

// Archives the current day's raw order log to print-server/data/history and
// resets the current-day file to empty. Callers should only invoke this after
// the report has already been printed successfully, so a printer failure
// never wipes a day's sales data before it's on paper.
//
// Refuses while any order is still "pending": closing the day must not be
// able to silently lose an unpaid order. Today that means the cashier has to
// collect payment first; TODO(roles/phase-2): once manager-only void ships,
// a manager should be able to void a stale pending order (e.g. a no-show) so
// the day can still be closed without indefinitely blocking on it.
export function archiveAndResetDay() {
  const data = loadCurrent();
  const pendingCount = data.orders.filter((o) => o.status === 'pending').length;
  if (pendingCount > 0) {
    throw new Error(
      `${pendingCount} order${pendingCount === 1 ? '' : 's'} still awaiting payment — collect payment before closing the day`
    );
  }

  if (data.orders.length > 0) {
    ensureDirs();
    const dateKey = (data.openedAt || new Date().toISOString()).slice(0, 10);
    const historyFile = join(HISTORY_DIR, `${dateKey}_${Date.now()}.json`);
    writeFileSync(historyFile, JSON.stringify({ ...data, closedAt: new Date().toISOString() }, null, 2));
  }
  saveCurrent(EMPTY_DAY());
}
