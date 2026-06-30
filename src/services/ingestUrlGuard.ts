import { promises as dns } from 'dns';
import net from 'net';

/**
 * SSRF guard for URL ingestion. The /url ingest endpoint hands a URL to the
 * docling service to fetch; without this guard an operator could (accidentally
 * or maliciously) point it at internal services, the cloud metadata endpoint,
 * or loopback — a classic SSRF. This validates the URL BEFORE it is fetched:
 *
 *   1. scheme must be http/https;
 *   2. the host (literal IP, or every address it resolves to) must NOT be
 *      private / loopback / link-local / unique-local / the metadata IP;
 *   3. if INGEST_URL_ALLOWLIST is set, the host must match it (exact or suffix).
 *
 * The hard denylist always applies; the allowlist is optional operator policy
 * layered on top. (Note: this does not fully prevent DNS-rebinding TOCTOU,
 * since docling re-resolves at fetch time — mitigating that would require
 * docling to fetch a pinned IP. Out of scope here.)
 */

function isPrivateIPv4(ip: string): boolean {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true; // malformed → treat as unsafe
  const [a, b] = p as [number, number, number, number];
  if (a === 0 || a === 10 || a === 127) return true;                 // this-host, 10/8, loopback
  if (a === 172 && b >= 16 && b <= 31) return true;                  // 172.16/12
  if (a === 192 && b === 168) return true;                           // 192.168/16
  if (a === 169 && b === 254) return true;                           // 169.254/16 (link-local + metadata)
  if (a === 100 && b >= 64 && b <= 127) return true;                 // 100.64/10 CGNAT
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const x = ip.toLowerCase();
  if (x === '::1' || x === '::') return true;                        // loopback / unspecified
  if (x.startsWith('fc') || x.startsWith('fd')) return true;         // fc00::/7 unique-local
  if (x.startsWith('fe8') || x.startsWith('fe9') || x.startsWith('fea') || x.startsWith('feb')) return true; // fe80::/10 link-local
  return false;
}

function isBlockedAddress(ip: string): boolean {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  if (net.isIPv6(ip)) {
    const mapped = ip.toLowerCase().match(/::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (mapped && mapped[1]) return isPrivateIPv4(mapped[1]);        // IPv4-mapped IPv6
    return isPrivateIPv6(ip);
  }
  return true; // not a recognizable IP → unsafe
}

function allowlist(): string[] {
  return (process.env['INGEST_URL_ALLOWLIST'] || '')
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

/** Throws with a clear reason if the URL is unsafe / disallowed for ingestion. */
export async function assertSafeIngestUrl(raw: string): Promise<void> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error('Invalid URL');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('Only http(s) URLs may be ingested');
  }
  const host = u.hostname.toLowerCase();

  // Optional operator allowlist (applies to all hosts when set).
  const allow = allowlist();
  if (allow.length > 0) {
    const ok = allow.some((pat) => host === pat || host.endsWith('.' + pat));
    if (!ok) throw new Error(`Host not in ingest allowlist: ${host}`);
  }

  // Hard denylist — literal IP, or every resolved address.
  if (net.isIP(host)) {
    if (isBlockedAddress(host)) throw new Error(`Refusing to ingest from a private/loopback address: ${host}`);
    return;
  }
  let addrs: { address: string }[];
  try {
    addrs = await dns.lookup(host, { all: true });
  } catch {
    throw new Error(`Cannot resolve host: ${host}`);
  }
  if (addrs.length === 0) throw new Error(`Host does not resolve: ${host}`);
  for (const a of addrs) {
    if (isBlockedAddress(a.address)) {
      throw new Error(`Refusing to ingest: ${host} resolves to a private/internal address`);
    }
  }
}
