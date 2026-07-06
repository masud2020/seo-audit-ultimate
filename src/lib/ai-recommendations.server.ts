import type { AuditReport } from "./audit-engine.server";

export async function generateRecommendations(report: AuditReport): Promise<{ section: string; title: string; recommendations: string[] }[]> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return fallback(report);

  const issueSections = report.sections
    .map(s => ({ id: s.id, title: s.title, score: s.score, issues: s.checks.filter(c => c.status === "fail" || c.status === "warn").map(c => ({ label: c.label, status: c.status, detail: c.detail, value: c.value })) }))
    .filter(s => s.issues.length);

  if (!issueSections.length) return [];

  const prompt = `You are an SEO expert. For the following audit issues on ${report.final_url}, return concise, actionable recommendations. Reply ONLY with JSON of shape: {"items":[{"section":"<section_id>","recommendations":["...","..."]}]}. No prose.\n\nISSUES:\n${JSON.stringify(issueSections)}`;

  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a senior SEO auditor. Reply with valid JSON only." },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!r.ok) throw new Error(`AI ${r.status}: ${await r.text()}`);
    const j = await r.json();
    const content: string = j.choices?.[0]?.message?.content ?? "";
    const cleaned = content.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    const items = parsed.items || parsed.recommendations || [];
    return items.map((it: { section: string; recommendations: string[] }) => ({
      section: it.section,
      title: report.sections.find(s => s.id === it.section)?.title ?? it.section,
      recommendations: it.recommendations ?? [],
    }));
  } catch (e) {
    console.error("AI recs error", e);
    return fallback(report);
  }
}

function fallback(report: AuditReport) {
  return report.sections
    .filter(s => s.checks.some(c => c.status === "fail" || c.status === "warn"))
    .map(s => ({
      section: s.id,
      title: s.title,
      recommendations: s.checks
        .filter(c => c.status === "fail" || c.status === "warn")
        .map(c => `Fix "${c.label}"${c.detail ? ` — ${c.detail}` : ""}.`),
    }));
}