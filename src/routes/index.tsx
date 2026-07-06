import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Activity, BarChart3, Bot, CheckCircle2, Search, Zap } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Landing,
  head: () => ({
    meta: [
      { title: "SEO Audit Tool — AI-powered website SEO audits" },
      { name: "description", content: "Run 50+ technical, on-page & AI-search checks per URL. Track keyword ranks, crawl whole sites, monitor competitors and get AI recommendations." },
      { property: "og:title", content: "SEO Audit Tool — AI-powered website SEO audits" },
      { property: "og:description", content: "Run 50+ technical, on-page & AI-search checks per URL. Track keyword ranks, crawl whole sites, monitor competitors and get AI recommendations." },
      { property: "og:url", content: "https://seo-audittool.lovable.app/" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://seo-audittool.lovable.app/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "SEO Audit Tool",
          url: "https://seo-audittool.lovable.app/",
          potentialAction: {
            "@type": "SearchAction",
            target: "https://seo-audittool.lovable.app/?q={search_term_string}",
            "query-input": "required name=search_term_string",
          },
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "SEO Audit Tool",
          url: "https://seo-audittool.lovable.app/",
          logo: "https://seo-audittool.lovable.app/favicon.ico",
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "SEO Audit Tool",
          applicationCategory: "BusinessApplication",
          operatingSystem: "Web",
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          description: "AI-powered SEO audits, keyword rank tracking, site crawling and competitor analysis.",
        }),
      },
    ],
  }),
});

function Feature({ icon: Icon, title, desc }: { icon: React.ComponentType<{ className?: string }>; title: string; desc: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <Icon className="h-5 w-5 text-primary" />
      <h3 className="mt-3 text-sm font-semibold">{title}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
    </div>
  );
}

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="grid h-7 w-7 place-items-center rounded bg-primary text-primary-foreground"><Search className="h-4 w-4" /></div>
            <span className="text-sm font-semibold tracking-tight">SEO Audit Tool</span>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/auth"><Button variant="ghost" size="sm">Sign in</Button></Link>
            <Link to="/auth"><Button size="sm">Get started</Button></Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-16">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" /> AI-powered technical SEO audits
          </div>
          <h1 className="mt-5 text-4xl font-bold tracking-tight sm:text-5xl">Audit any website. Fix what matters.</h1>
          <p className="mt-4 text-base text-muted-foreground">
            50+ technical, on-page and AI-search checks per URL — with actionable AI recommendations, historical tracking, and PDF export.
          </p>
          <div className="mt-6 flex gap-2">
            <Link to="/auth"><Button size="lg">Start free audit</Button></Link>
            <Link to="/dashboard"><Button size="lg" variant="outline">Open dashboard</Button></Link>
          </div>
        </div>
        <h2 className="mt-16 text-2xl font-semibold tracking-tight">Core SEO audit features</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Feature icon={Activity} title="Technical SEO" desc="Meta, canonical, robots, sitemap, headers, mobile, SSL, DOM size." />
          <Feature icon={BarChart3} title="On-page & content" desc="Headings, keyword density, internal/external links, structured data." />
          <Feature icon={Bot} title="AI recommendations" desc="Per-section fix suggestions generated by leading AI models." />
          <Feature icon={Zap} title="Rank tracker" desc="Track keywords over time with position history charts." />
          <Feature icon={CheckCircle2} title="SEO Checklist 2026" desc="Comprehensive checklist synced to your account." />
          <Feature icon={Search} title="Whole-site & tools" desc="Word counter, algorithm calendar, ping sites, and more." />
        </div>
      </main>
    </div>
  );
}
