## Goal

Make every audit and tool report comprehensive:
- Deeper checks per report
- AI-generated fix recommendations per section
- Executive summary with category scores + priority-ranked issue list
- Export as PDF, CSV, and shareable link

## Reports in scope

1. **Single-URL SEO audit** — `/audit/:id` (`audit-engine.server.ts`)
2. **Whole-site audit** — `/site-audit/:id` (`crawler.server.ts`)
3. **Tool reports** — backlink checker, website speed, responsive, HTML validator, schema validator (`site-tools.server.ts`)

## 1. Deeper checks

**Single-URL audit** — add sections:
- Core Web Vitals proxies: TTFB, transferred bytes, DOM size, render-blocking resources, image count/size
- Accessibility basics: lang attr, image alt coverage %, color-contrast heuristic on inline styles, form labels
- Security headers: HSTS, CSP, X-Frame-Options, Referrer-Policy, Permissions-Policy
- Open Graph completeness: og:image dimensions/format check, twitter:card, twitter:image
- International SEO: hreflang tags, canonical vs. self, language declaration
- Structured data: parse ALL JSON-LD blocks, list types found, validate required fields for Article/Product/Organization/BreadcrumbList/FAQ/HowTo
- Content quality: word count, keyword density top-10, reading level (Flesch), duplicate H1, empty headings

**Whole-site audit** — add:
- Orphan page detection (pages with 0 internal inbound links)
- Duplicate title/description across pages
- Broken internal links summary
- Redirect chain depth per URL
- Depth-from-root metric
- Sitemap vs. crawled diff (in sitemap but not crawled / crawled but not in sitemap)
- Robots.txt disallow coverage

**Tool reports** — add:
- Backlink checker: authority score, follow/nofollow ratio, top anchor texts, referring TLDs, lost/new deltas when Semrush is connected
- Website speed: TTFB, total bytes, request count estimate, gzip/br compression check, cache-control headers, image weight breakdown
- Responsive check: capture screenshots at 375/768/1024/1440 via headless render (or use viewport-based CSS heuristics if headless not available on Workers — fall back to DOM/viewport-meta analysis)
- HTML validator: nvvhtml-style rule set — orphan tags, deprecated elements, duplicate IDs, missing required attrs, malformed nesting
- Schema validator: pass/fail per JSON-LD block against schema.org required fields, Google rich-result eligibility (Article, Product, Recipe, FAQ, Event, LocalBusiness, VideoObject)

## 2. AI recommendations per section

- New server fn `generateSectionRecommendations(sectionSlug, findings)` in `src/lib/ai-recs.functions.ts`
- Calls Lovable AI Gateway (google/gemini-2.5-flash) with structured output: `{ summary, top_fixes: [{title, steps[], impact, effort}] }`
- Cached per (report_id, section_slug) in a new `report_recommendations` table
- Rendered in each report section under a collapsible "AI recommendations" panel
- User clicks "Generate recommendations" per section (not automatic) to keep AI cost predictable

## 3. Executive summary + scores

Every report gains a top-of-page summary card:
- **Overall score** 0–100
- **Category scores**: Technical, On-page, Content, Performance, Accessibility, Security, Schema
- **Priority issues**: top 10 sorted by (severity × impact)
- **Health delta** vs previous run of the same URL (when history exists)

Scoring lives in `src/lib/scoring.ts` — pure fn taking the report shape and returning `{ overall, categories, priorityIssues[] }`. Rendered by a new `<ExecutiveSummary>` component reused across all three report types.

## 4. Export

- **CSV**: client-side flatten via `papaparse` — one row per check/issue with columns `section, check, status, severity, message, recommendation`
- **PDF**: server-generated on demand. New route `/api/reports/:id/pdf` builds an HTML shell (executive summary + all sections + AI recs) and returns it — client uses browser print or `print-js` to save as PDF. (No Puppeteer — not supported on Workers.)
- **Shareable link**: new `report_shares` table with `id, report_id, report_type, expires_at, created_by`. Public route `/shared/report/:token` renders a read-only view (no user data, no destructive actions). RLS: rows insertable by owner; `/shared/:token` fetch goes through a server fn using `supabaseAdmin` after verifying the token exists and hasn't expired.

## Data model changes

New tables (with GRANTs + RLS):
- `report_recommendations` — `id, report_id, report_type, section_slug, summary, fixes jsonb, created_at`
- `report_shares` — `id, token (unique), report_id, report_type, expires_at, created_by, created_at`

Existing report tables (`site_audits`, `site_crawls`, `tool_runs`) already store full JSON payloads — extended checks slot into the existing `report`/`data` jsonb column with additive keys, no schema migration needed for the checks themselves.

## Files to add/edit

Add:
- `src/lib/scoring.ts` — scoring engine
- `src/lib/ai-recs.functions.ts` + `.server.ts` — AI recommendations
- `src/lib/report-export.ts` — CSV builder
- `src/lib/report-share.functions.ts` — share tokens
- `src/routes/api/reports.$id.pdf.ts` — printable HTML endpoint
- `src/routes/shared/report.$token.tsx` — public share view
- `src/components/reports/ExecutiveSummary.tsx`
- `src/components/reports/AiRecommendations.tsx`
- `src/components/reports/ExportMenu.tsx`
- migration: `report_recommendations`, `report_shares` + RLS + GRANTs

Edit:
- `src/lib/audit-engine.server.ts` — add security/accessibility/i18n/CWV/schema sections
- `src/lib/crawler.server.ts` — add orphans, duplicates, depth, sitemap diff
- `src/lib/site-tools.server.ts` — deepen every tool
- `src/routes/_authenticated/audit.$id.tsx`, `site-audit.$id.tsx`, and the 5 tool routes — mount ExecutiveSummary + AiRecommendations + ExportMenu

## Rollout order (single implementation pass)

1. Migration (tables + RLS + GRANTs)
2. `scoring.ts` + `ExecutiveSummary` + `ExportMenu` (CSV) — wire into all 7 report pages
3. Deeper checks in audit-engine, crawler, and each tool
4. AI recs fn + component, wire per section
5. PDF endpoint + share tokens + public shared route

## Out of scope

- Real Lighthouse / headless-Chrome CWV (Workers can't run Chromium)
- Historical trend charts beyond the previous-run delta
- Semrush-dependent extras when the user hasn't connected Semrush (graceful fallback with a "connect Semrush" hint)
