import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Copy, Download, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/tools/robots-txt-generator")({
  component: RobotsTxtGenerator,
  head: () => ({
    meta: [
      { title: "Robots.txt Generator — SEO Audit Tool" },
      {
        name: "description",
        content:
          "Generate a valid robots.txt file with Allow, Disallow, User-agent and Sitemap directives. Copy or download instantly.",
      },
      { property: "og:title", content: "Robots.txt Generator — SEO Audit Tool" },
      {
        property: "og:description",
        content:
          "Free robots.txt generator: build crawler rules for Googlebot, Bingbot and any user-agent in seconds.",
      },
      {
        property: "og:url",
        content: "https://seo-audittool.lovable.app/tools/robots-txt-generator",
      },
    ],
    links: [
      {
        rel: "canonical",
        href: "https://seo-audittool.lovable.app/tools/robots-txt-generator",
      },
    ],
  }),
});

interface Rule {
  userAgent: string;
  allow: string;
  disallow: string;
}

function RobotsTxtGenerator() {
  const [rules, setRules] = useState<Rule[]>([
    { userAgent: "*", allow: "/", disallow: "" },
  ]);
  const [sitemap, setSitemap] = useState("https://seo-audittool.lovable.app/sitemap.xml");
  const [crawlDelay, setCrawlDelay] = useState("");

  const output = useMemo(() => {
    const lines: string[] = [];
    rules.forEach((r, i) => {
      if (i > 0) lines.push("");
      lines.push(`User-agent: ${r.userAgent || "*"}`);
      r.allow.split(/\r?\n/).map(s => s.trim()).filter(Boolean).forEach(p => lines.push(`Allow: ${p}`));
      r.disallow.split(/\r?\n/).map(s => s.trim()).filter(Boolean).forEach(p => lines.push(`Disallow: ${p}`));
      if (crawlDelay && !isNaN(Number(crawlDelay))) lines.push(`Crawl-delay: ${crawlDelay}`);
    });
    if (sitemap.trim()) { lines.push(""); lines.push(`Sitemap: ${sitemap.trim()}`); }
    return lines.join("\n") + "\n";
  }, [rules, sitemap, crawlDelay]);

  const update = (i: number, patch: Partial<Rule>) =>
    setRules(rs => rs.map((r, idx) => idx === i ? { ...r, ...patch } : r));

  const copy = async () => { await navigator.clipboard.writeText(output); toast.success("Copied robots.txt"); };
  const download = () => {
    const blob = new Blob([output], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "robots.txt"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Robots.txt Generator</h1>
        <p className="text-sm text-muted-foreground">
          Build a robots.txt file with Allow / Disallow rules per user-agent, then copy or download it.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          {rules.map((r, i) => (
            <Card key={i} className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground">User-agent</label>
                  <Input value={r.userAgent} onChange={e => update(i, { userAgent: e.target.value })} placeholder="* or Googlebot" />
                </div>
                {rules.length > 1 && (
                  <Button variant="ghost" size="icon" onClick={() => setRules(rs => rs.filter((_, idx) => idx !== i))}>
                    <Trash2 className="h-4 w-4 text-rose-400" />
                  </Button>
                )}
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Allow (one path per line)</label>
                <Textarea rows={3} value={r.allow} onChange={e => update(i, { allow: e.target.value })} placeholder="/" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Disallow (one path per line)</label>
                <Textarea rows={3} value={r.disallow} onChange={e => update(i, { disallow: e.target.value })} placeholder="/admin&#10;/private" />
              </div>
            </Card>
          ))}
          <Button variant="outline" onClick={() => setRules(rs => [...rs, { userAgent: "", allow: "", disallow: "" }])}>
            <Plus className="h-4 w-4 mr-1" />Add user-agent block
          </Button>
          <Card className="p-4 space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Sitemap URL (optional)</label>
              <Input value={sitemap} onChange={e => setSitemap(e.target.value)} placeholder="https://example.com/sitemap.xml" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Crawl-delay in seconds (optional)</label>
              <Input value={crawlDelay} onChange={e => setCrawlDelay(e.target.value)} placeholder="10" />
            </div>
          </Card>
        </div>

        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Preview</h2>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={copy}><Copy className="h-4 w-4 mr-1" />Copy</Button>
              <Button size="sm" onClick={download}><Download className="h-4 w-4 mr-1" />Download</Button>
            </div>
          </div>
          <pre className="text-xs bg-muted rounded-md p-3 overflow-auto min-h-[300px] whitespace-pre-wrap">{output}</pre>
          <p className="text-xs text-muted-foreground">
            Save this file as <code>robots.txt</code> at the root of your domain (e.g. <code>https://example.com/robots.txt</code>).
          </p>
        </Card>
      </div>
    </div>
  );
}