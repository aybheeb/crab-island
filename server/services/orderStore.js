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
// on pickup). While still pending, its contents can be corrected via
// editOrder below; voidOrder can cancel it (pending or paid). Once paid,
// only void remains — a settled sale is never silently rewritten.
export function createOrder({ orderNo, cust, lines, total, ts, cashierId, cashierName, shiftId }) {
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
    // Whoever was logged in when the order was placed — set server-side from
    // the staff session, not client input. Null for pre-auth orders created
    // before the login/session system existed.
    cashierId: cashierId ?? null,
    cashierName: cashierName ?? null,
    shiftId: shiftId ?? null,
    voidedAt: null,
    voidedBy: null,
    voidedByName: null,
    voidReason: null,
  });

  saveCurrent(data);
}

// Marks a previously-created order as paid — the only other transition an
// order can undergo. Never touches lines/cust. `total` may be passed as the
// settled amount actually charged (e.g. order total + an EBT cooking-fee
// surcharge) — when given, it overwrites the pre-payment total so the
// daily report's cash+credit+ebt sum keeps reconciling with grandTotal.
export function markOrderPaid(orderNo, { payMethod, changeDue, tenders, total }) {
  const data = loadCurrent();
  const order = data.orders.find((o) => o.orderNo === orderNo);
  if (!order) throw new Error(`Order ${orderNo} not found`);

  order.status = 'paid';
  order.paidAt = Date.now();
  order.payMethod = payMethod || null;
  order.changeDue = changeDue ?? null;
  order.tenders = tenders || null;
  if (total != null) order.total = total;

  saveCurrent(data);
  return order;
}

// Full current-day order list (pending + paid) — used to restore the
// cashier's UI state after a page refresh.
export function getOrders() {
  return loadCurrent().orders;
}

// Corrects a still-pending order's contents (customer info, line items,
// total) — a cashier capability, same as building the order in the first
// place. Refuses once paid or voided: a settled sale must go through void,
// never a silent rewrite. Records who last edited it, mirroring void's
// audit fields, but as a single "last edit" rather than a full history.
export function editOrder(orderNo, { cust, lines, total, editedBy, editedByName }) {
  const data = loadCurrent();
  const order = data.orders.find((o) => o.orderNo === orderNo);
  if (!order) throw new Error(`Order ${orderNo} not found`);
  if (order.status !== 'pending') {
    throw new Error(`Order ${orderNo} is ${order.status} — only a pending order can be edited`);
  }

  order.cust = cust;
  order.lines = lines;
  order.total = total;
  order.editedAt = Date.now();
  order.editedBy = editedBy || null;
  order.editedByName = editedByName || null;

  saveCurrent(data);
  return order;
}

// Voids a paid or pending order — the only other transition an order can
// undergo besides pending->paid. Manager authorization is enforced by the
// API layer, not here; this just records who did it. Never deletes the
// order or touches lines/cust/total, so it stays visible with a full audit
// trail instead of disappearing from the day's history.
export function voidOrder(orderNo, { voidedBy, voidedByName, reason } = {}) {
  const data = loadCurrent();
  const order = data.orders.find((o) => o.orderNo === orderNo);
  if (!order) throw new Error(`Order ${orderNo} not found`);
  if (order.status === 'voided') throw new Error(`Order ${orderNo} is already voided`);

  order.status = 'voided';
  order.voidedAt = Date.now();
  order.voidedBy = voidedBy || null;
  order.voidedByName = voidedByName || null;
  order.voidReason = reason || null;

  saveCurrent(data);
  return order;
}

function buildReport(data) {
  const paid = data.orders.filter((o) => o.status === 'paid');
  const pending = data.orders.filter((o) => o.status === 'pending');
  const voided = data.orders.filter((o) => o.status === 'voided');
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
    voidedCount: voided.length,
    voidedTotal: sum(voided, (o) => o.total || 0),
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
