// One-off schema setup — run with:
//   node scripts/migrate.mjs
// Uses the non-pooling connection since this is a single short-lived script,
// not a serverless function under load.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Client } from 'pg';
import { withLibpqCompat } from '../lib/pgConnectionString.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const connectionString = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
if (!connectionString) {
  console.error('POSTGRES_URL_NON_POOLING (or POSTGRES_URL) is not set — run `vercel env pull .env.local` first.');
  process.exit(1);
}

const sql = readFileSync(join(__dirname, '..', 'lib', 'schema.sql'), 'utf8');

const client = new Client({ connectionString: withLibpqCompat(connectionString) });
await client.connect();
try {
  await client.query(sql);
  console.log('Schema applied: staff, shifts, login_attempts');
} finally {
  await client.end();
}
