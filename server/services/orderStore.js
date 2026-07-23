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

// Records a finalized, paid order into the current open day. Re-recording an
// order number (e.g. the cashier edits and re-confirms payment on an order
// already in the batch) replaces its prior entry instead of double-counting it.
export function recordOrder({ orderNo, ts, total, tenders, itemCount }) {
  if (!orderNo || !ts) throw new Error('Order missing orderNo/ts');
  const data = loadCurrent();
  if (!data.openedAt) data.openedAt = new Date().toISOString();

  data.orders = data.orders.filter((o) => o.orderNo !== orderNo);
  data.orders.push({
    orderNo,
    ts,
    total: total || 0,
    itemCount: itemCount || 0,
    cash: tenders?.cash || 0,
    credit: tenders?.credit || 0,
    ebt: tenders?.ebt || 0,
  });

  saveCurrent(data);
}

function buildReport(data) {
  const orders = data.orders;
  const sum = (key) => orders.reduce((s, o) => s + o[key], 0);
  return {
    openedAt: data.openedAt,
    generatedAt: new Date().toISOString(),
    orderCount: orders.length,
    itemCount: sum('itemCount'),
    cash: sum('cash'),
    credit: sum('credit'),
    ebt: sum('ebt'),
    grandTotal: sum('total'),
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
export function archiveAndResetDay() {
  const data = loadCurrent();
  if (data.orders.length > 0) {
    ensureDirs();
    const dateKey = (data.openedAt || new Date().toISOString()).slice(0, 10);
    const historyFile = join(HISTORY_DIR, `${dateKey}_${Date.now()}.json`);
    writeFileSync(historyFile, JSON.stringify({ ...data, closedAt: new Date().toISOString() }, null, 2));
  }
  saveCurrent(EMPTY_DAY());
}
