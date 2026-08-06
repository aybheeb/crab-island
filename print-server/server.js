import './loadEnv.js';
import express from 'express';
import { printTicket, printKitchenOnly, printMerchantReceipt, openCashDrawer, printCustomerReceipt, printDailyReport } from '../server/services/printService.js';
import { createOrder, markOrderPaid, getOrders, getCurrentReport, archiveAndResetDay, voidOrder, editOrder } from '../server/services/orderStore.js';
import { money } from '../components/data.js';
import { logger } from './logger.js';

const app  = express();
const PORT = process.env.PRINT_SERVER_PORT || 3001;
const API_KEY = process.env.PRINT_API_KEY || '';

app.use(express.json({ limit: '1mb' }));

// ── Public routes (no auth) ──────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true, port: PORT }));

// ── Auth middleware (applies to all routes below) ────────────────────────────
app.use((req, res, next) => {
  if (!API_KEY) {
    logger.info({ method: req.method, path: req.path, ip: req.ip, apiKeyCheck: 'skipped' }, 'request admitted (no API key configured)');
    return next(); // no key configured → open (dev only)
  }
  if (req.headers['x-api-key'] === API_KEY) {
    logger.info({ method: req.method, path: req.path, ip: req.ip, apiKeyCheck: 'passed' }, 'request authenticated');
    return next();
  }
  console.warn(`[print-server] Rejected request — bad API key from ${req.ip}`);
  logger.warn({ method: req.method, path: req.path, ip: req.ip, apiKeyCheck: 'failed' }, 'request rejected — bad API key');
  res.status(401).json({ error: 'Unauthorized' });
});

// ── Protected routes ─────────────────────────────────────────────────────────

app.post('/print', async (req, res) => {
  const order = req.body;

  if (!order?.lines?.length) {
    return res.status(400).json({ error: 'Order has no items' });
  }

  console.log(`[print-server] Print job received — ORDER ${order.orderNo} (${order.lines.length} item(s))`);

  try {
    await printTicket(order);
    console.log(`[print-server] ORDER ${order.orderNo} printed OK`);
    logger.info({ orderNo: order.orderNo, target: 'cashier+kitchen', result: 'success' }, 'print ticket succeeded');
    res.json({ success: true });
  } catch (err) {
    console.error(`[print-server] Print failed for ORDER ${order.orderNo}:`, err.message);
    logger.error({ orderNo: order.orderNo, target: 'cashier+kitchen', result: 'failure', error: err.message }, 'print ticket failed');
    res.status(500).json({ error: err.message });
  }
});

app.post('/print-kitchen', async (req, res) => {
  const order = req.body;

  if (!order?.lines?.length) {
    return res.status(400).json({ error: 'Order has no items' });
  }

  console.log(`[print-server] Kitchen ticket requested — ORDER ${order.orderNo} (${order.lines.length} item(s))${order.updated ? ' [UPDATED]' : ''}`);

  try {
    await printKitchenOnly(order, { updated: !!order.updated });
    logger.info({ orderNo: order.orderNo, target: 'kitchen', updated: !!order.updated, result: 'success' }, 'kitchen ticket succeeded');
    res.json({ success: true });
  } catch (err) {
    console.error(`[print-server] Kitchen ticket failed for ORDER ${order.orderNo}:`, err.message);
    logger.error({ orderNo: order.orderNo, target: 'kitchen', result: 'failure', error: err.message }, 'kitchen ticket failed');
    res.status(500).json({ error: err.message });
  }
});

app.post('/print-receipt', async (req, res) => {
  const order = req.body;

  if (!order?.lines?.length) {
    return res.status(400).json({ error: 'Order has no items' });
  }

  console.log(`[print-server] Merchant receipt requested — ORDER ${order.orderNo}`);

  try {
    await printMerchantReceipt(order);
    logger.info({ orderNo: order.orderNo, target: 'cashier', result: 'success' }, 'merchant receipt succeeded');
    res.json({ success: true });
  } catch (err) {
    console.error(`[print-server] Merchant receipt failed for ORDER ${order.orderNo}:`, err.message);
    logger.error({ orderNo: order.orderNo, target: 'cashier', result: 'failure', error: err.message }, 'merchant receipt failed');
    res.status(500).json({ error: err.message });
  }
});

app.post('/print-customer-receipt', async (req, res) => {
  const order = req.body;

  if (!order?.lines?.length) {
    return res.status(400).json({ error: 'Order has no items' });
  }

  console.log(`[print-server] Customer receipt requested — ORDER ${order.orderNo}`);

  try {
    await printCustomerReceipt(order);
    logger.info({ orderNo: order.orderNo, target: 'cashier', result: 'success' }, 'customer receipt succeeded');
    res.json({ success: true });
  } catch (err) {
    console.error(`[print-server] Customer receipt failed for ORDER ${order.orderNo}:`, err.message);
    logger.error({ orderNo: order.orderNo, target: 'cashier', result: 'failure', error: err.message }, 'customer receipt failed');
    res.status(500).json({ error: err.message });
  }
});

app.post('/open-drawer', async (_req, res) => {
  try {
    await openCashDrawer();
    logger.info({ target: 'cashier', result: 'success' }, 'cash drawer kick succeeded');
    res.json({ success: true });
  } catch (err) {
    console.error('[print-server] Drawer kick failed:', err.message);
    logger.error({ target: 'cashier', result: 'failure', error: err.message }, 'cash drawer kick failed');
    res.status(500).json({ error: err.message });
  }
});

// Creates a new order in the current day's running log as "pending" — placed
// but not yet paid. Called as soon as the cashier places an order, whether
// they're collecting payment immediately or the customer is paying later.
app.post('/orders', (req, res) => {
  const order = req.body;

  if (!order?.orderNo || !order?.ts) {
    return res.status(400).json({ error: 'Order missing orderNo/ts' });
  }

  try {
    createOrder(order);
    res.json({ success: true });
  } catch (err) {
    console.error('[print-server] Create order failed:', err.message);
    res.status(err.message.includes('already exists') ? 409 : 500).json({ error: err.message });
  }
});

// Marks an existing order as paid — independent of ticket printing, and the
// only other transition an order can undergo (order contents are immutable).
app.post('/orders/pay', (req, res) => {
  const { orderNo, payMethod, changeDue, tenders, total } = req.body;

  if (!orderNo) {
    return res.status(400).json({ error: 'orderNo is required' });
  }

  try {
    const order = markOrderPaid(orderNo, { payMethod, changeDue, tenders, total });
    res.json({ success: true, order });
  } catch (err) {
    console.error('[print-server] Mark order paid failed:', err.message);
    res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message });
  }
});

// Corrects a still-pending order's items/customer info. A cashier
// capability (no manager step-up), enforced by refusing anything not
// still 'pending' — a paid/voided order must go through void instead.
app.post('/orders/edit', (req, res) => {
  const { orderNo, cust, lines, total, editedBy, editedByName } = req.body;

  if (!orderNo) {
    return res.status(400).json({ error: 'orderNo is required' });
  }

  try {
    const order = editOrder(orderNo, { cust, lines, total, editedBy, editedByName });
    logger.info({ orderNo, editedBy, result: 'success' }, 'order edited');
    res.json({ success: true, order });
  } catch (err) {
    console.error('[print-server] Edit order failed:', err.message);
    logger.error({ orderNo, editedBy, result: 'failure', error: err.message }, 'edit order failed');
    const status = err.message.includes('not found') ? 404 : err.message.includes('only a pending order') ? 409 : 500;
    res.status(status).json({ error: err.message });
  }
});

// Voids a paid or pending order. Manager authorization already happened in
// the Next.js API layer (step-up PIN verified there) — voidedBy/voidedByName
// arrive here as already-established facts, not something this route checks.
app.post('/orders/void', (req, res) => {
  const { orderNo, voidedBy, voidedByName, reason } = req.body;

  if (!orderNo) {
    return res.status(400).json({ error: 'orderNo is required' });
  }

  try {
    const order = voidOrder(orderNo, { voidedBy, voidedByName, reason });
    logger.info({ orderNo, voidedBy, result: 'success' }, 'order voided');
    res.json({ success: true, order });
  } catch (err) {
    console.error('[print-server] Void order failed:', err.message);
    logger.error({ orderNo, voidedBy, result: 'failure', error: err.message }, 'void order failed');
    const status = err.message.includes('not found') ? 404 : err.message.includes('already voided') ? 409 : 500;
    res.status(status).json({ error: err.message });
  }
});

// Full current-day order list (pending + paid) — used to restore the
// cashier's UI state after a page refresh.
app.get('/orders', (_req, res) => {
  res.json({ success: true, orders: getOrders() });
});

// Read-only preview of the current (still-open) day's totals.
app.get('/report', (req, res) => {
  console.log(`[print-server] Report requested from ${req.ip}`);
  res.json({ success: true, report: getCurrentReport() });
});

// Prints the Z-report and, only once that succeeds, archives the day's raw
// order log and resets the running totals for the next day. If printing
// fails the day stays open so the report can be retried without losing data.
app.post('/close-day', async (_req, res) => {
  const report = getCurrentReport();
  if (report.orderCount === 0 && report.pendingCount === 0) {
    return res.status(400).json({ error: 'No orders recorded for the current day' });
  }
  // Check for pending orders before printing anything — no point printing a
  // Z-report just to reject the close and have to reprint it later.
  if (report.pendingCount > 0) {
    return res.status(409).json({
      error: `${report.pendingCount} order${report.pendingCount === 1 ? '' : 's'} still awaiting payment — collect payment before closing the day`,
    });
  }

  try {
    await printDailyReport(report);
    logger.info({ target: 'cashier', result: 'success' }, 'daily report print succeeded');
  } catch (err) {
    console.error('[print-server] Daily report print failed — day NOT closed:', err.message);
    logger.error({ target: 'cashier', result: 'failure', error: err.message }, 'daily report print failed — day not closed');
    return res.status(500).json({ error: `Print failed, day not closed: ${err.message}` });
  }

  // archiveAndResetDay() re-checks pendingCount itself and throws if it's
  // now nonzero — printDailyReport above is a real async printer call, long
  // enough for another device to create a new pending order in the gap
  // between the check at the top of this route and this point. Without this
  // try/catch that throw was unhandled (Express 4 doesn't auto-catch inside
  // an async handler the way Express 5 does), which could crash the whole
  // print-server process — and even short of a crash, it left the Z-report
  // already printed while the day silently stayed open, so the *next*
  // close-day print would double-count everything since as a fresh "period
  // start" (this is what produced two Z-reports sharing one period start,
  // the second a cumulative superset of the first).
  try {
    archiveAndResetDay();
  } catch (err) {
    console.error('[print-server] Report printed but day NOT reset:', err.message);
    logger.error({ target: 'cashier', result: 'failure', error: err.message }, 'report printed but archive/reset failed');
    return res.status(409).json({
      error: `Report printed, but the day could not be closed: ${err.message}. Handle that order, then press Close Day again to finish.`,
      printed: true,
    });
  }

  console.log(`[print-server] Day closed — ${report.orderCount} order(s), ${money(report.grandTotal)} total`);
  res.json({ success: true, report });
});

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[print-server] Listening on http://0.0.0.0:${PORT}`);
  console.log(`[print-server] Auth: ${API_KEY ? 'API key required' : 'OPEN (set PRINT_API_KEY to secure)'}`);
  console.log('[print-server] Endpoints: GET /health  POST /print');
});
