// Unit tests for the SSRF guard used by every URL-fetching tool.
// Covers loopback, RFC1918 private, link-local, CGNAT, cloud metadata,
// multicast/reserved, IPv6 variants, and internal hostnames, plus a
// smoke test through the shared tool entry points (fetchPage, runCrawl,
// runAudit) to prove the guard is wired into every URL surface.
import { describe, it, expect } from "vitest";
import { assertPublicHttpUrl, safeFetch } from "./net-guard.server";
import { fetchPage } from "./site-tools.server";
import { runCrawl } from "./crawler.server";
import { runAudit } from "./audit-engine.server";

const BLOCKED_URLS: Array<[string, string]> = [
  // Loopback
  ["loopback IPv4", "http://127.0.0.1/"],
  ["loopback IPv4 other octet", "http://127.42.5.9/"],
  ["loopback hostname", "http://localhost/"],
  ["loopback IPv6", "http://[::1]/"],
  ["ip6-localhost", "http://ip6-localhost/"],
  // RFC1918 private
  ["private 10/8", "http://10.0.0.1/"],
  ["private 172.16/12 low", "http://172.16.0.1/"],
  ["private 172.16/12 high", "http://172.31.255.254/"],
  ["private 192.168/16", "http://192.168.1.1/"],
  // Link-local + cloud metadata (169.254/16 covers AWS/GCP/Azure metadata)
  ["link-local", "http://169.254.1.2/"],
  ["AWS/GCP/Azure metadata IP", "http://169.254.169.254/latest/meta-data/"],
  ["GCP metadata hostname", "http://metadata.google.internal/"],
  ["GCP metadata short host", "http://metadata.goog/"],
  // CGNAT
  ["CGNAT low", "http://100.64.0.1/"],
  ["CGNAT high", "http://100.127.255.254/"],
  // Reserved / multicast / this-network
  ["this-network 0/8", "http://0.0.0.0/"],
  ["IETF protocol 192.0.0/24", "http://192.0.0.1/"],
  ["benchmark 198.18/15", "http://198.18.0.1/"],
  ["multicast", "http://224.0.0.1/"],
  ["reserved 240/4", "http://240.0.0.1/"],
  // IPv6 link-local / ULA / mapped metadata
  ["IPv6 link-local", "http://[fe80::1]/"],
  ["IPv6 unique-local", "http://[fd00::1]/"],
  ["IPv6 mapped metadata IP", "http://[::ffff:169.254.169.254]/"],
  ["IPv6 mapped private IP", "http://[::ffff:10.0.0.1]/"],
  // Internal-only TLDs / suffixes
  [".local mDNS host", "http://printer.local/"],
  [".internal host", "http://db.internal/"],
  [".localhost suffix", "http://app.localhost/"],
  // Non-http(s) schemes
  ["file scheme", "file:///etc/passwd"],
  ["gopher scheme", "gopher://127.0.0.1/"],
  ["ftp scheme", "ftp://example.com/"],
];

const ALLOWED_URLS = [
  "https://example.com/",
  "https://sub.example.com/path?q=1",
  "http://93.184.216.34/", // example.com public IP literal
  "https://[2606:2800:220:1::248:1893]/", // IPv6 GUA
];

describe("assertPublicHttpUrl", () => {
  for (const [label, url] of BLOCKED_URLS) {
    it(`blocks ${label} (${url})`, () => {
      expect(() => assertPublicHttpUrl(url)).toThrow();
    });
  }

  for (const url of ALLOWED_URLS) {
    it(`allows public URL ${url}`, () => {
      expect(() => assertPublicHttpUrl(url)).not.toThrow();
    });
  }

  it("rejects invalid URLs outright", () => {
    expect(() => assertPublicHttpUrl("not-a-url")).toThrow();
    expect(() => assertPublicHttpUrl("javascript:alert(1)")).toThrow();
  });
});

describe("safeFetch", () => {
  it("throws before issuing a network request when the target is blocked", async () => {
    await expect(safeFetch("http://169.254.169.254/latest/meta-data/")).rejects.toThrow(/Blocked/);
    await expect(safeFetch("http://127.0.0.1:8080/admin")).rejects.toThrow(/Blocked/);
    await expect(safeFetch("file:///etc/passwd")).rejects.toThrow(/scheme/);
  });
});

// Smoke tests: every URL-tool entry point must funnel through the guard.
// Each of these should throw synchronously (from assertPublicHttpUrl) before
// any fetch() is attempted against a blocked target.
describe("URL tool entry points reject blocked targets", () => {
  const targets = [
    "http://127.0.0.1/",
    "http://10.0.0.1/",
    "http://169.254.169.254/",
    "http://100.64.0.1/",
    "http://192.168.0.1/",
    "http://[fe80::1]/",
  ];

  for (const t of targets) {
    it(`fetchPage rejects ${t}`, async () => {
      await expect(fetchPage(t)).rejects.toThrow(/Blocked/);
    });
    // runCrawl and runAudit swallow per-fetch errors and surface them as
    // issues/checks in their reports. Prove the guard message shows up
    // there — i.e. the tool never actually reached the blocked target.
    it(`runCrawl surfaces a Blocked issue for ${t}`, async () => {
      const out = await runCrawl(t, 5);
      expect(out.pages).toEqual([]);
      expect(out.issues.some((i) => /Blocked/.test(i.message))).toBe(true);
    });
    it(`runAudit rejects ${t}`, async () => {
      // The initial fetch in runAudit is not wrapped in a try/catch, so
      // a blocked target aborts the whole audit before any network I/O.
      await expect(runAudit(t)).rejects.toThrow(/Blocked/);
    });
  }
});