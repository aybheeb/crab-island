// Adds one staff row. Run locally (not by pasting a real PIN through an AI
// assistant) with:
//   node --env-file=.env.local scripts/seed-staff.mjs --name "Jane" --role manager [--pin 483920]
// If --pin is omitted, a random 6-digit PIN is generated and printed once —
// note it down, it isn't stored anywhere in plaintext.
import bcrypt from 'bcryptjs';
import { randomInt } from 'node:crypto';
import { Client } from 'pg';
import { withLibpqCompat } from '../lib/pgConnectionString.js';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, '');
    if (key) out[key] = argv[i + 1];
  }
  return out;
}

const { name, role, pin: pinArg } = parseArgs(process.argv.slice(2));

if (!name || !role) {
  console.error('Usage: node scripts/seed-staff.mjs --name "Jane" --role manager|cashier [--pin 123456]');
  process.exit(1);
}
if (role !== 'manager' && role !== 'cashier') {
  console.error('--role must be "manager" or "cashier"');
  process.exit(1);
}

const pin = pinArg || String(randomInt(0, 1_000_000)).padStart(6, '0');
const pinHash = await bcrypt.hash(pin, 10);

const connectionString = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
if (!connectionString) {
  console.error('POSTGRES_URL_NON_POOLING (or POSTGRES_URL) is not set — run `vercel env pull .env.local` first.');
  process.exit(1);
}

const client = new Client({ connectionString: withLibpqCompat(connectionString) });
await client.connect();
try {
  const { rows } = await client.query(
    'insert into staff (name, pin_hash, role) values ($1, $2, $3) returning id',
    [name, pinHash, role]
  );
  console.log(`Created ${role} "${name}" (id ${rows[0].id})`);
  if (!pinArg) console.log(`PIN: ${pin}  — note this down now, it will not be shown again.`);
} finally {
  await client.end();
}
