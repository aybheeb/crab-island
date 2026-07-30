import pino from 'pino';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Rolls to a new file daily (e.g. logs/print-server.2026-07-29.1.log) so logs
// persist on disk across restarts of the NSSM service and can be tailed
// without a console attached.
const transport = pino.transport({
  target: 'pino-roll',
  options: {
    file: path.join(__dirname, 'logs', 'print-server'),
    frequency: 'daily',
    dateFormat: 'yyyy-MM-dd',
    mkdir: true,
  },
});

export const logger = pino(transport);
