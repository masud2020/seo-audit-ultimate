// Server-only URL guard to prevent SSRF against private/loopback/link-local
// hosts and cloud-metadata endpoints. Hostname-based (no DNS lookup available
// in the Worker runtime) — blocks the obvious targets: IP literals in private
// ranges, cloud metadata IPs, localhost, .local/.internal, and non-http(s).

function ipToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const v = Number(p);
    if (!Number.isInteger(v) || v < 0 || v > 255 || !/^\d+$/.test(p)) return null;
    n = (n << 8) + v;
  }
  return n >>> 0;
}

function inRange(ip: number, cidr: string): boolean {
  const [addr, bitsStr] = cidr.split("/");
  const base = ipToInt(addr);
  const bits = Number(bitsStr);
  if (base == null || !Number.isInteger(bits)) return false;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ip & mask) === (base & mask);
}

const BLOCKED_V4 = [
  "0.0.0.0/8",
  "10.0.0.0/8",
  "127.0.0.0/8",
  "169.254.0.0/16",  // link-local + AWS/GCP/Azure metadata (169.254.169.254)
  "172.16.0.0/12",
  "192.0.0.0/24",
  "192.168.0.0/16",
  "198.18.0.0/15",
  "224.0.0.0/4",
  "240.0.0.0/4",
  "100.64.0.0/10",   // CGNAT
];

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "ip6-localhost",
  "ip6-loopback",
  "metadata.google.internal",
  "metadata.goog",
]);

export function assertPublicHttpUrl(rawUrl: string): URL {
  let u: URL;
  try { u = new URL(rawUrl); } catch { throw new Error("Invalid URL"); }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error(`Blocked URL scheme: ${u.protocol}`);
  }
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) throw new Error("URL missing hostname");
  if (BLOCKED_HOSTNAMES.has(host)) throw new Error(`Blocked hostname: ${host}`);
  if (host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".localhost")) {
    throw new Error(`Blocked internal hostname: ${host}`);
  }
  // IPv6: block loopback, link-local, unique-local, and any embedded IPv4 in a private range.
  if (host.includes(":")) {
    const h = host;
    if (h === "::1" || h === "::" ) throw new Error("Blocked IPv6 loopback");
    if (/^fe[89ab][0-9a-f]:/i.test(h)) throw new Error("Blocked IPv6 link-local");
    if (/^f[cd][0-9a-f]{2}:/i.test(h)) throw new Error("Blocked IPv6 unique-local");
    // IPv4-mapped IPv6, either dotted (::ffff:169.254.169.254) or
    // normalized hex form (::ffff:a9fe:a9fe) as produced by `new URL`.
    const mappedDotted = /::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(h);
    const mappedHex = /::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(h);
    let mappedV4: number | null = null;
    if (mappedDotted) {
      mappedV4 = ipToInt(mappedDotted[1]);
    } else if (mappedHex) {
      const hi = parseInt(mappedHex[1], 16);
      const lo = parseInt(mappedHex[2], 16);
      if (Number.isFinite(hi) && Number.isFinite(lo)) {
        mappedV4 = (((hi & 0xffff) << 16) | (lo & 0xffff)) >>> 0;
      }
    }
    if (mappedV4 != null && BLOCKED_V4.some((c) => inRange(mappedV4!, c))) {
      throw new Error(`Blocked private IPv4-mapped address: ${h}`);
    }
    return u;
  }
  // IPv4 literal
  const v = ipToInt(host);
  if (v != null) {
    if (BLOCKED_V4.some((c) => inRange(v, c))) {
      throw new Error(`Blocked private/reserved IP: ${host}`);
    }
  }
  return u;
}

/** Fetch a user-supplied URL after asserting it is public, and re-check on each redirect hop. */
export async function safeFetch(rawUrl: string, init?: RequestInit & { maxRedirects?: number }): Promise<Response> {
  const maxRedirects = init?.maxRedirects ?? 5;
  let url = assertPublicHttpUrl(rawUrl).toString();
  for (let i = 0; i <= maxRedirects; i++) {
    const res = await fetch(url, { ...init, redirect: "manual" });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return res;
      url = assertPublicHttpUrl(new URL(loc, url).toString()).toString();
      continue;
    }
    return res;
  }
  throw new Error("Too many redirects");
}