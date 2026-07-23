import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import express from 'express';
import { printTicket, openCashDrawer, printCustomerReceipt, printDailyReport } from '../server/services/printService.js';
import { recordOrder, getCurrentReport, archiveAndResetDay } from '../server/services/orderStore.js';
import { money } from '../components/data.js';

// Load root .env.local so PRINT_API_KEY and PORT are available without shell gymnastics
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env.local') });

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

// Records a finalized, paid order into the current day's running sales log —
// called right after payment confirmation, independent of ticket printing.
app.post('/orders', (req, res) => {
  const order = req.body;

  if (!order?.orderNo || !order?.ts) {
    return res.status(400).json({ error: 'Order missing orderNo/ts' });
  }

  try {
    recordOrder(order);
    res.json({ success: true });
  } catch (err) {
    console.error('[print-server] Record order failed:', err.message);
    res.status(500).json({ error: err.message });
  }
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
  if (report.orderCount === 0) {
    return res.status(400).json({ error: 'No orders recorded for the current day' });
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
