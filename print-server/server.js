import './loadEnv.js';
import express from 'express';
import { printTicket, openCashDrawer, printCustomerReceipt, printDailyReport } from '../server/services/printService.js';
import { createOrder, markOrderPaid, getOrders, getCurrentReport, archiveAndResetDay } from '../server/services/orderStore.js';
import { money } from '../components/data.js';

const app  = express();
const PORT = process.env.PRINT_SERVER_PORT || 3001;
const API_KEY = process.env.PRINT_API_KEY || '';

app.use(express.json({ limit: '1mb' }));

// ── Public routes (no auth) ──────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true, port: PORT }));

// ── Auth middleware (applies to all routes below) ────────────────────────────
app.use((req, res, next) => {
  if (!API_KEY) return next(); // no key configured → open (dev only)
  if (req.headers['x-api-key'] === API_KEY) return next();
  console.warn(`[print-server] Rejected request — bad API key from ${req.ip}`);
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
    res.json({ success: true });
  } catch (err) {
    console.error(`[print-server] Print failed for ORDER ${order.orderNo}:`, err.message);
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
    res.json({ success: true });
  } catch (err) {
    console.error(`[print-server] Customer receipt failed for ORDER ${order.orderNo}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/open-drawer', async (_req, res) => {
  try {
    await openCashDrawer();
    res.json({ success: true });
  } catch (err) {
    console.error('[print-server] Drawer kick failed:', err.message);
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
  } catch (err) {
    console.error('[print-server] Daily report print failed — day NOT closed:', err.message);
    return res.status(500).json({ error: `Print failed, day not closed: ${err.message}` });
  }

  archiveAndResetDay();
  console.log(`[print-server] Day closed — ${report.orderCount} order(s), ${money(report.grandTotal)} total`);
  res.json({ success: true, report });
});

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[print-server] Listening on http://0.0.0.0:${PORT}`);
  console.log(`[print-server] Auth: ${API_KEY ? 'API key required' : 'OPEN (set PRINT_API_KEY to secure)'}`);
  console.log('[print-server] Endpoints: GET /health  POST /print');
});
