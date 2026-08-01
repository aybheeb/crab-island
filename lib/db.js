import { Pool } from 'pg';
import { withLibpqCompat } from './pgConnectionString';

// Lazy singleton — avoids crashing `next build` if POSTGRES_URL isn't set
// yet at build time (e.g. before the Supabase integration is provisioned).
let pool;

function getPool() {
  if (!pool) {
    const connectionString = process.env.POSTGRES_URL;
    if (!connectionString) {
      throw new Error('POSTGRES_URL is not set');
    }
    pool = new Pool({ connectionString: withLibpqCompat(connectionString) });
    // Without this, an error on an idle pooled connection (a network blip,
    // not even a request in flight) is an unhandled 'error' event, which
    // crashes the whole Node process rather than just failing one query.
    pool.on('error', (err) => console.error('[db] idle client error', err.message));
  }
  return pool;
}

export function query(text, params) {
  return getPool().query(text, params);
}
