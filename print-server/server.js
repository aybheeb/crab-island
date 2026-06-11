import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import express from 'express';
import { printTicket } from '../server/services/printService.js';

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

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[print-server] Listening on http://0.0.0.0:${PORT}`);
  console.log(`[print-server] Auth: ${API_KEY ? 'API key required' : 'OPEN (set PRINT_API_KEY to secure)'}`);
  console.log('[print-server] Endpoints: GET /health  POST /print');
});
