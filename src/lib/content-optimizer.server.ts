export interface ContentAnalysis {
  word_count: number;
  keyword_density: number;
  keyword_count: number;
  readability: { score: number; grade: string };
  suggestions: string[];
  semantic_keywords: string[];
  headings_suggestion?: string;
  meta_title_suggestion?: string;
  meta_description_suggestion?: string;
}

function countWords(s: string) { return (s.trim().match(/\S+/g) ?? []).length; }
function sentences(s: string) { return (s.match(/[^.!?]+[.!?]+/g) ?? [s]).filter(x => x.trim()); }
function syllables(word: string) {
  word = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!word) return 0;
  const m = word.match(/[aeiouy]+/g);
  let c = m ? m.length : 1;
  if (word.endsWith("e") && c > 1) c--;
  return Math.max(1, c);
}
function fleschKincaid(text: string) {
  const w = countWords(text);
  const s = sentences(text).length || 1;
  const syl = (text.match(/\S+/g) ?? []).reduce((a, w) => a + syllables(w), 0);
  const score = 206.835 - 1.015 * (w / s) - 84.6 * (syl / Math.max(1, w));
  const grade = score >= 90 ? "Very Easy" : score >= 80 ? "Easy" : score >= 70 ? "Fairly Easy" : score >= 60 ? "Standard" : score >= 50 ? "Fairly Difficult" : score >= 30 ? "Difficult" : "Very Confusing";
  return { score: Math.round(score), grade };
}

export async function runContentOptimizer(keyword: string, title: string, content: string): Promise<ContentAnalysis> {
  const wc = countWords(content);
  const kwLower = keyword.toLowerCase();
  const matches = (content.toLowerCase().match(new RegExp(`\\b${kwLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g")) ?? []).length;
  const density = wc ? +((matches / wc) * 100).toFixed(2) : 0;
  const readability = fleschKincaid(content);

  const localSuggestions: string[] = [];
  if (wc < 300) localSuggestions.push(`Content is short (${wc} words). Aim for 800+ words for competitive keywords.`);
  if (matches === 0) localSuggestions.push(`Target keyword "${keyword}" does not appear in the content.`);
  else if (density < 0.5) localSuggestions.push(`Keyword density is low (${density}%). Aim for 0.5–2.5%.`);
  else if (density > 3) localSuggestions.push(`Keyword density is high (${density}%). May look like stuffing — reduce.`);
  if (title && !title.toLowerCase().includes(kwLower)) localSuggestions.push(`Add the target keyword to the title.`);
  if (readability.score < 50) localSuggestions.push(`Readability is difficult (${readability.grade}). Shorten sentences and use simpler words.`);
  if (!/^#|\n#/m.test(content) && !/<h[1-6]/i.test(content)) localSuggestions.push(`No headings detected. Add H2/H3 headings to structure the content.`);

  // AI enhancement (best effort)
  const key = process.env.LOVABLE_API_KEY;
  if (key) {
    try {
      const prompt = `You are an SEO content editor. Analyse this content for target keyword "${keyword}". Return ONLY JSON of shape: {"suggestions":["..."],"semantic_keywords":["...","..."],"meta_title_suggestion":"...","meta_description_suggestion":"...","headings_suggestion":"..."}.\n\nTITLE: ${title || "(none)"}\nCONTENT:\n${content.slice(0, 8000)}`;
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: "You are a senior SEO content strategist. Reply with valid JSON only." },
            { role: "user", content: prompt },
          ],
        }),
      });
      if (r.ok) {
        const j = await r.json();
        const raw: string = j.choices?.[0]?.message?.content ?? "";
        const cleaned = raw.replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(cleaned);
        return {
          word_count: wc, keyword_density: density, keyword_count: matches, readability,
          suggestions: [...localSuggestions, ...(parsed.suggestions ?? [])],
          semantic_keywords: parsed.semantic_keywords ?? [],
          meta_title_suggestion: parsed.meta_title_suggestion,
          meta_description_suggestion: parsed.meta_description_suggestion,
          headings_suggestion: parsed.headings_suggestion,
        };
      }
    } catch (e) { console.error("Content AI failed", e); }
  }

  return { word_count: wc, keyword_density: density, keyword_count: matches, readability, suggestions: localSuggestions, semantic_keywords: [] };
}