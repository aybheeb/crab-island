import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Must be imported before printService.js — ES module imports fully execute
// before the importing file's own code runs, so printService.js's top-level
// PRINTER_NAMES consts need process.env populated *before* that import happens,
// not after (dotenv.config() living in server.js's own body ran too late).
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env.local') });
