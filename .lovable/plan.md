
# Make the audit the most comprehensive SEO report

You picked "all of the above (phased)" with depth 5 and the four external signals. Here's how I'll roll it out so you get value on day 1 and it snowballs from there.

## What each phase ships

### Phase 1 — Deepen the single-page Audit engine (biggest impact per hour)

New checks added to every URL audit, grouped so the PDF stays scannable:

- **On-page fundamentals** – title/description length + uniqueness, canonical loops, hreflang, favicon, viewport, charset, language declaration, duplicate H1, heading order gaps, keyword density vs. target keyword, thin-content flag, reading level.
- **Schema & rich results** – detect all JSON-LD/Microdata/RDFa, validate types, flag missing recommended fields, warn on schema without on-page content match.
- **Social & sharing** – full OG + Twitter card check, image dimensions, preview render.
- **Security & trust** – HTTPS chain, HSTS, CSP, X-Frame-Options, Referrer-Policy, Permissions-Policy, mixed content, cookie flags.
- **Crawl signals** – robots.txt fetch + parse, sitemap discovery, `X-Robots-Tag`, redirect chain length, 4xx/5xx internal links, orphan-image detection.
- **Mobile & UX** – viewport meta, tap-target size, font-size floor, horizontal-overflow.
- **Media** – images without alt, oversized images, missing modern formats (webp/avif), lazy-load coverage.
- **Speed (real numbers)** – Core Web Vitals from Google's CrUX API (field data if the URL has traffic) + one Lighthouse-style synthetic run via **PageSpeed Insights**. LCP / INP / CLS / TTFB shown side-by-side.

External signals wired in when connected:

- **Semrush** (per URL): organic keywords the URL already ranks for, position + volume, top-10 SERP competitors for its target term, backlink count.
- **Google Search Console** (per URL): real impressions/clicks/CTR/position for last 28 days + URL Inspection (indexing state, mobile-usable, rich-results, last crawl).
- **AI visibility**: reuse your existing citation checker; runs 5 canned prompts against Perplexity/Gemini/OpenAI and reports whether the URL/domain is cited.

All of this goes into the existing report shape so the report page, share links, CSV, and PDF pick it up automatically.

### Phase 2 — Roll Phase 1 into the Whole-Site Audit

- New checks run on every crawled page (with a budget: heavy ones like PSI + AI throttled to a sample so a 500-page crawl doesn't take an hour).
- Site-level aggregates: worst-CWV pages, thinnest pages, biggest schema gaps, redirect-chain map, orphan pages, duplicate title/description clusters.
- Domain-level Semrush pull (top pages, keyword count, authority score) and GSC site-wide performance included in the site summary + PDF.
- PDF grows a "Site-wide external signals" section between the scorecard and page-by-page.

### Phase 3 — New "Mega Audit" (one-click, everything)

- New route `/mega-audit` — enter a URL, pick a competitor (optional), pick a target keyword (optional).
- Runs, in parallel: single-page audit, site crawl (limit configurable), broken-link check, backlink pull, Semrush domain snapshot + top pages + SERP analysis for the target keyword, GSC pull, AI citation check, PSI/CWV on the top 10 pages.
- Unified dashboard: one health score, weighted rollup, side-by-side vs. competitor, prioritized action plan.
- Single "Mega Audit PDF" that stitches every section together with the TOC + page links you already have.

## What you need to set up

- **Semrush** – not yet linked. When Phase 1 lands I'll trigger the connect modal; once connected the checks light up automatically. Free/trial Semrush plans have low API quotas, so I'll add graceful "quota exhausted" fallbacks.
- **Google Search Console** – already connected via `GOOGLE_SEARCH_CONSOLE_API_KEY`. No action needed. The audited URL/domain must be a verified property in your GSC — if not, I'll show a "verify site" CTA using the meta-tag flow you already have.
- **PageSpeed Insights** – Google offers a free API key with a generous quota. I'll request it via `add_secret` when Phase 1 ships. Without a key the audit falls back to the anonymous 25-req/day tier (enough for demos, not production).
- **AI visibility** – uses your existing `LOVABLE_API_KEY`, nothing new.

## Technical shape (for the record)

- Extra check modules live next to `audit-engine.server.ts` (`audit-checks/*.server.ts`) so each check is one small function returning `{ id, status, detail, value }` — same shape you already use. No breaking changes to callers.
- External signals fetched in parallel with `Promise.allSettled` and cached per-URL for 15 min in a new `audit_signal_cache` table so re-runs are cheap.
- CWV/PSI, Semrush URL data, GSC data, AI check all become optional sections that render only if data is available — no empty panels for users who aren't connected.
- PDF: extend `buildAuditPdf` (Phase 1) and `buildSiteAuditPdf` (Phase 2) with new sections; TOC + link annotations already handle new pages.
- Mega Audit (Phase 3): new table `mega_audits`, background orchestrator, live progress panel reusing the pattern from AI recommendations.

## Delivery order

1. **Phase 1 now** – ship all new checks + PSI/CWV + GSC + AI visibility in the single-URL audit, plus Semrush hooks that turn on the moment you connect. Updates the report page, CSV, and PDF.
2. **Phase 2 next** – propagate to Whole-Site Audit + PDF, add site-level aggregates and domain-wide Semrush/GSC pulls.
3. **Phase 3 last** – Mega Audit route, orchestrator, unified dashboard, one-shot mega PDF.

Approve and I'll start Phase 1. If you want me to shrink or reorder any phase (e.g. skip AI visibility, or put Whole-Site before more single-page checks), tell me now.
