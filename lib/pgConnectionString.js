// pg (as of pg-connection-string's newer major versions) treats sslmode=require
// as an alias for verify-full — full certificate-chain + hostname verification —
// instead of the traditional libpq meaning of "require" (encrypt, but don't
// verify the CA chain). Supabase's pooler connection string uses sslmode=require
// under the traditional meaning, so on networks that terminate/inspect TLS
// (corporate proxies, some antivirus/VPN software), the stricter check fails
// with SELF_SIGNED_CERT_IN_CHAIN even though the connection itself is fine.
// uselibpqcompat=true restores the traditional interpretation pg itself
// recommends in its own deprecation warning — not a blanket rejectUnauthorized
// bypass, just honoring what sslmode=require has always meant.
export function withLibpqCompat(connectionString) {
  if (!connectionString || connectionString.includes('uselibpqcompat=')) return connectionString;
  return `${connectionString}${connectionString.includes('?') ? '&' : '?'}uselibpqcompat=true`;
}
