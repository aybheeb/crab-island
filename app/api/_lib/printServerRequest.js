import { randomUUID } from 'node:crypto';

// Categorizes a failed call to the print server so the frontend can show a
// specific message instead of collapsing every failure into "unauthorized".
function categorizeUpstreamStatus(status) {
  if (status === 401 || status === 403) return 'auth_error';
  if (status >= 500) return 'gateway_error';
  return 'unknown';
}

function categorizeNetworkError(err) {
  if (err.name === 'TimeoutError' || err.name === 'AbortError') return 'timeout';
  return 'gateway_error';
}

function logPrintAttempt(fields) {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), ...fields }));
}

// Forwards a print request to PRINT_SERVER_URL and returns a structured
// result the caller can turn directly into a NextResponse. Captures the
// upstream HTTP status, network-level errors, and request latency, and logs
// one JSON line per attempt (success or failure).
export async function callPrintServer(route, path, body) {
  const requestId = randomUUID();
  const startedAt = Date.now();
  const printServerUrl = process.env.PRINT_SERVER_URL;

  if (!printServerUrl) {
    const latencyMs = Date.now() - startedAt;
    const message = 'Print server not configured (PRINT_SERVER_URL missing)';
    logPrintAttempt({ route, requestId, upstreamStatus: null, category: 'gateway_error', latencyMs, message });
    return {
      status: 503,
      body: { success: false, category: 'gateway_error', error: message, requestId },
    };
  }

  const headers = { 'Content-Type': 'application/json' };
  if (process.env.PRINT_API_KEY) {
    headers['x-api-key'] = process.env.PRINT_API_KEY;
  }

  try {
    const res = await fetch(`${printServerUrl}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const latencyMs = Date.now() - startedAt;
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const category = categorizeUpstreamStatus(res.status);
      const message = data.error || `Print server returned HTTP ${res.status}`;
      logPrintAttempt({ route, requestId, upstreamStatus: res.status, category, latencyMs, message });
      return {
        status: 502,
        body: { success: false, category, status: res.status, error: message, requestId },
      };
    }

    logPrintAttempt({ route, requestId, upstreamStatus: res.status, category: 'success', latencyMs, message: 'ok' });
    return { status: 200, body: { success: true, requestId } };
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    const category = categorizeNetworkError(err);
    logPrintAttempt({ route, requestId, upstreamStatus: null, category, latencyMs, message: err.message });
    return {
      status: category === 'timeout' ? 504 : 502,
      body: { success: false, category, error: err.message, requestId },
    };
  }
}
