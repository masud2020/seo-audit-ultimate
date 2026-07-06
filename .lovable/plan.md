# Phase 5 — Six new tools

Six tools, each on its own route with sidebar entries. All server-side work goes through `createServerFn` (auth-gated); no new external accounts required except optional keys already handled in `/settings`.

## 1. Broken Link Checker — `/broken-links`
- Reuses the existing crawler pipeline to collect all internal + external links from up to N pages.
- Server fn `checkBrokenLinks(project_id | url, limit)`: HEAD/GET each link with a 10s timeout, bucket into `2xx`, `3xx`, `4xx`, `5xx`, `timeout`, `dns-error`.
- Persist run in new `link_checks` table (run + `link_check_items`) so results survive reload; CSV export.
- UI: run button, progress, filter by status, source-page column, "Recheck" action per row.

## 2. Backlink Monitoring — `/backlink-monitor`
- New `monitored_backlinks` table: `{ id, user_id, source_url, target_url, first_seen_at, last_seen_at, last_status, lost_at }`.
- Two data sources: (a) manual add from user, (b) auto-import from Semrush backlinks (uses existing connector/fallback key).
- Weekly `pg_cron` hits `/api/public/hooks/backlink-check` which re-fetches Semrush for each target domain, diffs against stored rows, flips `lost_at` when a link disappears, and inserts new ones.
- UI: list with status badges (Live / Lost / New this week), lost-links counter, manual "Check now" button, CSV export.

## 3. AI Content Detection — `/ai-detection`
- Heuristic scorer that runs entirely on the Lovable AI Gateway using `google/gemini-2.5-flash` — no third-party detector key needed.
- Sends the text with a strict JSON schema prompt: returns `ai_probability` (0-1), `confidence`, `signals` (repetition, burstiness, perplexity-style commentary, hedging), and a short explanation.
- UI: textarea (up to 10k chars) + URL option (Firecrawl scrape → markdown). Result card with big % score, verdict badge (Human / Mixed / Likely AI), signal list.

## 4. AI Citation Checker — `/ai-citations`
- Given a target domain and a list of prompts (defaults derived from Semrush top keywords for the domain), asks 3 Lovable AI models (`gemini-2.5-flash`, `gpt-5-mini`, `gemini-2.5-pro`) each prompt with web-answer style system message.
- Server fn parses model responses for domain mentions and outbound URLs; records per-model hit/miss + snippet.
- Persist results in `ai_citation_runs` + `ai_citation_results` so runs can be revisited.
- UI: prompt input (comma or newline separated), model breakdown, citation coverage % per prompt, table of snippets showing where the domain appeared.

## 5. AI Citation Potential — `/ai-potential`
- Given a URL: Firecrawl scrapes markdown + metadata, then Lovable AI scores the page against citation-worthiness criteria (unique data, quotable stats, clear structure, entity clarity, citable claims, freshness). Returns 0-100 score + prioritized rewrite recommendations.
- No new table — one-off analysis rendered inline; user can re-run.
- UI: URL input, radial score, criteria breakdown with pass/fail, "Copy recommendations" and PDF export via existing `pdf.server.ts`.

## 6. SEO Blog Feed — `/seo-news`
- Aggregates RSS from Search Engine Journal, Moz, Ahrefs, Semrush, Majestic, Search Engine Land, Search Engine Roundtable.
- Server fn `fetchSeoNews()` fetches each feed with 8s timeout, parses XML in-worker (small XML parser — no native deps), merges and sorts by date. 15-minute in-memory cache per worker.
- Sources list is server-owned but editable through a `blog_sources` table (name, url, enabled). Seed with defaults; admin-only edit UI at `/seo-news/sources`.
- UI: card feed with source badge, published date, title, snippet, external link. Filter by source, search box, "Refresh" button.

## Migrations (single migration)
- `link_checks` + `link_check_items`
- `monitored_backlinks`
- `ai_citation_runs` + `ai_citation_results`
- `blog_sources` (seeded)
- All with `user_id`-scoped RLS + GRANTs.

## Files
Created:
- `src/lib/broken-links.functions.ts`
- `src/lib/backlink-monitor.functions.ts`
- `src/lib/ai-detection.functions.ts`
- `src/lib/ai-citations.functions.ts`
- `src/lib/ai-potential.functions.ts`
- `src/lib/seo-news.functions.ts` + `src/lib/seo-news.server.ts` (XML parsing)
- `src/routes/_authenticated/broken-links.tsx`
- `src/routes/_authenticated/backlink-monitor.tsx`
- `src/routes/_authenticated/ai-detection.tsx`
- `src/routes/_authenticated/ai-citations.tsx`
- `src/routes/_authenticated/ai-potential.tsx`
- `src/routes/_authenticated/seo-news.tsx`
- `src/routes/api/public/hooks/backlink-check.ts` (pg_cron webhook)
- One combined SQL migration

Edited:
- `src/components/app-sidebar.tsx` — new group "AI Search & Monitoring" with the six entries.

## Open questions before I build

1. **AI detection provider** — I plan to use the Lovable AI Gateway (no extra key). If you want a dedicated detector (Originality.ai, GPTZero, Copyleaks) I'll swap it in and request a secret.
2. **Backlink monitoring scope** — auto-import from Semrush on first save (top 100 backlinks), or manual-only? I'll default to "manual + one-click Semrush import" unless you say otherwise.
3. **Blog sources** — happy with SEJ / Moz / Ahrefs / Semrush / Majestic / Search Engine Land / Search Engine Roundtable, or want a different mix?
