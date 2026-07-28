import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Brand } from "./pdf.server";

function hexToRgb(hex: string | null | undefined, fallback: [number, number, number]): [number, number, number] {
  if (!hex) return fallback;
  const m = hex.trim().replace(/^#/, "");
  const full = m.length === 3 ? m.split("").map(c => c + c).join("") : m;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return fallback;
  return [parseInt(full.slice(0,2),16)/255, parseInt(full.slice(2,4),16)/255, parseInt(full.slice(4,6),16)/255];
}
function brandName(b?: Brand | null): string { return (b?.app_name || "SEO Audit Tool").trim(); }

function sanitize(s: string): string {
  return (s || "").replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/\u2014|\u2013/g, "-").replace(/[^\x20-\x7E\n]/g, "");
}
function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = sanitize(text).split(/\s+/);
  const lines: string[] = []; let cur = "";
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(test, size) > maxWidth && cur) { lines.push(cur); cur = w; } else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}
function ascentOf(f: PDFFont, size: number): number { return f.heightAtSize(size, { descender: false }); }
function lineAdvanceOf(f: PDFFont, size: number): number { return f.heightAtSize(size) + 1; }

const TOOL_LABEL: Record<string, string> = {
  broken_links: "Broken Link Checker",
  backlink_monitor: "Backlink Monitor",
  ai_detection: "AI Content Detection",
  ai_citations: "AI Citation Checker",
  ai_potential: "AI Citation Potential",
  seo_news: "SEO Blog Feed",
};

export interface ToolRunRow {
  id: string; tool: string; status: string; label: string | null;
  input: Record<string, unknown>; result: Record<string, unknown>;
  error: string | null; created_at: string; finished_at: string | null; duration_ms: number | null;
}

export async function buildToolRunPdf(run: ToolRunRow, brand?: Brand | null): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595, H = 842, M = 48;
  const FOOTER_Y = 28;
  let page: PDFPage = doc.addPage([W, H]);
  let y = H - M;
  const newPage = () => { page = doc.addPage([W, H]); y = H - M; };
  const ensure = (n: number) => { if (y - n < M + FOOTER_Y) newPage(); };
  const text = (t: string, opts: { size?: number; bold?: boolean; color?: [number, number, number] } = {}) => {
    const size = opts.size ?? 10;
    const f = opts.bold ? bold : font;
    const c = opts.color ?? [0.1, 0.1, 0.1];
    const asc = ascentOf(f, size);
    const lh = lineAdvanceOf(f, size);
    for (const line of wrap(t, f, size, W - M * 2)) {
      ensure(lh);
      page.drawText(line, { x: M, y: y - asc, size, font: f, color: rgb(c[0], c[1], c[2]) });
      y -= lh;
    }
  };
  const spacer = (n = 6) => { y -= n; };
  const rule = () => { ensure(6); page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) }); y -= 8; };

  // Branded cover band
  const bp = hexToRgb(brand?.primary_color, [0.10, 0.14, 0.25]);
  const ba = hexToRgb(brand?.accent_color, [0.30, 0.55, 0.95]);
  const bandH = 90;
  page.drawRectangle({ x: 0, y: H - bandH, width: W, height: bandH, color: rgb(bp[0], bp[1], bp[2]) });
  page.drawRectangle({ x: 0, y: H - bandH - 3, width: W, height: 3, color: rgb(ba[0], ba[1], ba[2]) });
  page.drawText(brandName(brand).toUpperCase(), { x: M, y: H - 34, size: 10, font: bold, color: rgb(0.85, 0.90, 1) });
  page.drawText(`${TOOL_LABEL[run.tool] ?? run.tool} Report`, { x: M, y: H - 66, size: 22, font: bold, color: rgb(1, 1, 1) });
  const dateTag = new Date(run.created_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  const dtW = font.widthOfTextAtSize(dateTag, 10);
  page.drawText(dateTag, { x: W - M - dtW, y: H - 34, size: 10, font, color: rgb(0.75, 0.82, 0.95) });
  y = H - bandH - 24;

  if (run.label) { text(run.label, { size: 12, bold: true }); spacer(2); }
  const statusColor: [number, number, number] = run.status === "success" ? [0.2, 0.6, 0.3] : run.status === "error" ? [0.8, 0.2, 0.2] : [0.85, 0.6, 0.1];
  // At-a-glance meta panel
  {
    const panelH = 70;
    const py = y - panelH;
    page.drawRectangle({ x: M, y: py, width: W - M * 2, height: panelH, color: rgb(0.98, 0.98, 1), borderColor: rgb(0.88, 0.88, 0.92), borderWidth: 0.5 });
    const rows: [string, string, [number, number, number]?][] = [
      ["Status",   run.status.toUpperCase(), statusColor],
      ["Started",  new Date(run.created_at).toLocaleString()],
      ["Duration", run.duration_ms ? `${run.duration_ms} ms` : "—"],
    ];
    const colW = (W - M * 2) / rows.length;
    rows.forEach(([k, v, col], i) => {
      const cx = M + i * colW + 14;
      page.drawText(k.toUpperCase(), { x: cx, y: py + panelH - 20, size: 8, font: bold, color: rgb(0.45, 0.45, 0.55) });
      page.drawText(sanitize(v).slice(0, 42), { x: cx, y: py + 22, size: 13, font: bold, color: col ? rgb(col[0], col[1], col[2]) : rgb(0.15, 0.15, 0.2) });
    });
    y = py - 14;
  }
  rule();

  if (run.error) {
    text("Error", { size: 13, bold: true, color: [0.8, 0.2, 0.2] });
    text(run.error, { size: 10 });
    spacer(6); rule();
  }

  // Tool-specific summary
  const r = run.result || {};
  const rec = (r as Record<string, unknown>);
  if (run.tool === "broken_links") {
    text("Summary", { size: 13, bold: true });
    text(`Total links checked: ${rec.total ?? "—"}`, { size: 10 });
    text(`Broken: ${rec.broken ?? "—"}`, { size: 10 });
    text(`Pages crawled: ${rec.pages ?? "—"}`, { size: 10 });
  } else if (run.tool === "backlink_monitor") {
    text("Summary", { size: 13, bold: true });
    text(`Checked: ${rec.checked ?? "—"}  ·  Live: ${rec.live ?? "—"}  ·  Lost: ${rec.lost ?? "—"}`, { size: 10 });
    if (rec.imported != null) text(`Imported: ${rec.imported}`, { size: 10 });
  } else if (run.tool === "ai_detection") {
    text("Verdict", { size: 13, bold: true });
    text(`AI Probability: ${Math.round(Number(rec.ai_probability ?? 0) * 100)}%`, { size: 12, bold: true });
    text(`Verdict: ${String(rec.verdict ?? "—")}   Confidence: ${String(rec.confidence ?? "—")}`, { size: 10 });
    spacer(4);
    if (rec.summary) text(String(rec.summary), { size: 10, color: [0.3, 0.3, 0.3] });
    const signals = (rec.signals ?? []) as Array<{ name: string; score: number; note: string }>;
    if (signals.length) { spacer(4); text("Signals", { size: 12, bold: true }); for (const s of signals) { text(`- ${s.name} (${Math.round((s.score ?? 0) * 100)}%)`, { size: 10, bold: true }); if (s.note) text(`  ${s.note}`, { size: 9, color: [0.35, 0.35, 0.35] }); } }
  } else if (run.tool === "ai_citations") {
    text("Summary", { size: 13, bold: true });
    text(`Target domain: ${(run.input as Record<string, unknown>)?.target_domain ?? "—"}`, { size: 10 });
    text(`Hits: ${rec.hits ?? "—"} / ${rec.total ?? "—"}`, { size: 10, bold: true });
    const results = (rec.results ?? []) as Array<{ prompt: string; model: string; cited: boolean; snippet: string | null }>;
    if (results.length) {
      spacer(4); text("Prompts & Model Responses", { size: 12, bold: true });
      for (const item of results.slice(0, 40)) {
        const tag = item.cited ? "[CITED]" : "[--]";
        text(`${tag} (${item.model})  ${item.prompt}`, { size: 10, bold: true, color: item.cited ? [0.2, 0.6, 0.3] : [0.5, 0.5, 0.5] });
        if (item.snippet) text(item.snippet, { size: 9, color: [0.35, 0.35, 0.35] });
        spacer(2);
      }
    }
  } else if (run.tool === "ai_potential") {
    text("Score", { size: 13, bold: true });
    text(`Overall: ${rec.overall_score ?? "—"} / 100  ·  Verdict: ${String(rec.verdict ?? "—")}`, { size: 12, bold: true });
    text(`URL: ${String(rec.url ?? "")}`, { size: 10, color: [0.35, 0.35, 0.35] });
    const criteria = (rec.criteria ?? []) as Array<{ label: string; score: number; note: string }>;
    if (criteria.length) { spacer(4); text("Criteria", { size: 12, bold: true }); for (const c of criteria) { text(`- ${c.label}: ${c.score}/100`, { size: 10, bold: true }); if (c.note) text(`  ${c.note}`, { size: 9, color: [0.35, 0.35, 0.35] }); } }
    const recs = (rec.recommendations ?? []) as string[];
    if (recs.length) { spacer(6); text("Recommendations", { size: 12, bold: true }); for (const r2 of recs) text(`- ${r2}`, { size: 10 }); }
  } else if (run.tool === "seo_news") {
    text("Summary", { size: 13, bold: true });
    text(`Items fetched: ${rec.count ?? "—"}${rec.cached ? "  (from cache)" : ""}`, { size: 10 });
  } else {
    text("Result", { size: 13, bold: true });
    text(JSON.stringify(r, null, 2).slice(0, 4000), { size: 9 });
  }

  // Footer with page numbers
  const finalPages = doc.getPages();
  const genAt = new Date();
  const footerLeft = `Generated ${genAt.toLocaleDateString()} by ${brandName(brand)}${brand?.footer_text ? " · " + brand.footer_text : ""}`;
  for (let i = 0; i < finalPages.length; i++) {
    const p = finalPages[i];
    p.drawLine({ start: { x: M, y: FOOTER_Y + 12 }, end: { x: W - M, y: FOOTER_Y + 12 }, thickness: 0.3, color: rgb(0.85, 0.85, 0.88) });
    p.drawText(footerLeft, { x: M, y: FOOTER_Y, size: 8, font, color: rgb(0.55, 0.55, 0.6) });
    const ps = `Page ${i + 1} of ${finalPages.length}`;
    const pw = font.widthOfTextAtSize(ps, 8);
    p.drawText(ps, { x: W - M - pw, y: FOOTER_Y, size: 8, font, color: rgb(0.55, 0.55, 0.6) });
  }
  return await doc.save();
}
