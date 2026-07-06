// Shared Semrush helpers. Uses the user's saved API key from api_settings.semrush_key
// against the legacy /analytics/v1/ endpoint (CSV response, ; separated).

export type SemrushRow = Record<string, string>;

async function safeFetch(url: string) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20_000);
  try { return await fetch(url, { signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}

export function parseSemrushCsv(text: string): SemrushRow[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const cols = lines[0].split(";");
  return lines.slice(1).map(line => {
    const parts = line.split(";");
    const row: SemrushRow = {};
    cols.forEach((c, i) => { row[c] = parts[i] ?? ""; });
    return row;
  });
}

export async function semrushCall(params: Record<string, string>, key: string): Promise<SemrushRow[]> {
  const qs = new URLSearchParams({ ...params, key }).toString();
  const url = `https://api.semrush.com/analytics/v1/?${qs}`;
  const r = await safeFetch(url);
  const txt = (await r.text()).trim();
  if (!r.ok) throw new Error(`Semrush error ${r.status}: ${txt.slice(0, 200)}`);
  if (/^ERROR\s+\d+/i.test(txt)) {
    if (/TOTAL LIMIT EXCEEDED/i.test(txt)) throw new Error("Semrush API quota exhausted. Upgrade your Semrush plan or wait for the quota to reset.");
    throw new Error(`Semrush: ${txt.slice(0, 200)}`);
  }
  return parseSemrushCsv(txt);
}

export function cleanDomain(input: string): string {
  return input.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
}