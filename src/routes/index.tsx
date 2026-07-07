import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Activity, BarChart3, Bot, CheckCircle2, Search, Zap, Sparkles, ShieldCheck, Smartphone, ArrowRight } from "lucide-react";
import { listPublicPlans } from "@/lib/pricing.functions";

const plansQuery = queryOptions({
  queryKey: ["public-plans"],
  queryFn: () => listPublicPlans(),
});

export const Route = createFileRoute("/")({
  component: Landing,
  loader: ({ context }) => context.queryClient.ensureQueryData(plansQuery),
  errorComponent: ({ error }) => (
    <div className="min-h-screen grid place-items-center p-6 text-center">
      <div>
        <h1 className="text-xl font-semibold">This page didn't load</h1>
        <p className="text-sm text-muted-foreground mt-2">{error.message}</p>
      </div>
    </div>
  ),
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
    <div className="rounded-xl border border-border bg-card p-6 hover:border-primary/40 transition-colors">
      <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <h3 className="mt-4 text-sm font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}

function Landing() {
  const { data } = useSuspenseQuery(plansQuery);
  const plans = data.plans;
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="grid h-7 w-7 place-items-center rounded bg-primary text-primary-foreground"><Search className="h-4 w-4" /></div>
            <span className="text-sm font-semibold tracking-tight">SEO Audit Tool</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm">
            <a href="#features" className="text-muted-foreground hover:text-foreground">Features</a>
            <a href="#pricing" className="text-muted-foreground hover:text-foreground">Pricing</a>
            <a href="#faq" className="text-muted-foreground hover:text-foreground">FAQ</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/auth"><Button variant="ghost" size="sm">Sign in</Button></Link>
            <Link to="/auth"><Button size="sm">Get started</Button></Link>
          </div>
        </div>
      </header>
      <main>
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-border">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,theme(colors.primary/15),transparent_60%)]" />
          <div className="mx-auto max-w-6xl px-4 py-20 sm:py-28 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs text-muted-foreground">
              <Sparkles className="h-3 w-3 text-primary" /> AI-powered SEO for the AI-search era
            </div>
            <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">
              Audit any website. <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">Fix what matters.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base sm:text-lg text-muted-foreground">
              50+ technical, on-page and AI-search checks per URL, with AI recommendations, keyword tracking, whole-site crawls and PDF reports.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
              <Link to="/auth"><Button size="lg" className="gap-1">Start free audit <ArrowRight className="h-4 w-4" /></Button></Link>
              <a href="#pricing"><Button size="lg" variant="outline">See pricing</Button></a>
            </div>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-primary" /> No credit card</span>
              <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-primary" /> bKash payments</span>
              <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-primary" /> Cancel anytime</span>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="mx-auto max-w-6xl px-4 py-20">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-tight">Everything you need to rank</h2>
            <p className="mt-3 text-muted-foreground">A single workspace for technical SEO, on-page optimization, keyword tracking and AI-search visibility.</p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Feature icon={Activity} title="Technical SEO" desc="Meta, canonical, robots, sitemap, headers, mobile, SSL, DOM size — all checked automatically." />
            <Feature icon={BarChart3} title="On-page & content" desc="Headings, keyword density, internal/external links and structured data validation." />
            <Feature icon={Bot} title="AI recommendations" desc="Per-section fix suggestions generated by leading AI models tuned for SEO." />
            <Feature icon={Zap} title="Rank tracker" desc="Track keywords over time with position history charts and SERP snapshots." />
            <Feature icon={CheckCircle2} title="SEO Checklist 2026" desc="Modern, comprehensive checklist synced to your account and updated for AI search." />
            <Feature icon={Search} title="Whole-site crawls" desc="Crawl entire sites, aggregate issues by category and export to PDF for clients." />
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="border-y border-border bg-card/30">
          <div className="mx-auto max-w-6xl px-4 py-20">
            <div className="text-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground">
                <Smartphone className="h-3 w-3 text-primary" /> Pay with bKash
              </div>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight">Simple pricing in BDT</h2>
              <p className="mt-3 text-muted-foreground">Manual bKash verification — your plan activates once we confirm the transaction.</p>
            </div>
            <div className="mt-12 grid gap-6 md:grid-cols-3 max-w-5xl mx-auto">
              {plans.length === 0 && (
                <div className="md:col-span-3 text-center text-sm text-muted-foreground">No pricing plans configured yet.</div>
              )}
              {plans.map((p) => (
                <div key={p.id} className={`relative rounded-2xl border p-6 flex flex-col ${p.is_featured ? "border-primary shadow-lg shadow-primary/10 bg-card" : "border-border bg-card/60"}`}>
                  {p.is_featured && (
                    <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">Most popular</Badge>
                  )}
                  <div>
                    <h3 className="text-lg font-semibold">{p.name}</h3>
                    {p.description && <p className="mt-1 text-sm text-muted-foreground min-h-[2.5rem]">{p.description}</p>}
                  </div>
                  <div className="mt-6 flex items-baseline gap-1">
                    <span className="text-4xl font-bold tracking-tight">৳{p.price_bdt.toLocaleString("en-BD")}</span>
                    <span className="text-sm text-muted-foreground">/mo</span>
                  </div>
                  <ul className="mt-6 space-y-2.5 flex-1">
                    {p.features.map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <CheckCircle2 className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-8">
                    {p.price_bdt === 0 ? (
                      <Link to="/auth" className="block"><Button className="w-full" variant={p.is_featured ? "default" : "outline"}>{p.cta_label}</Button></Link>
                    ) : (
                      <Link to="/checkout/$slug" params={{ slug: p.slug }} className="block">
                        <Button className="w-full" variant={p.is_featured ? "default" : "outline"}>{p.cta_label}</Button>
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-8 text-center text-xs text-muted-foreground">
              Prices in Bangladeshi Taka (BDT). Payments processed manually via bKash Send Money. Contact support for enterprise / annual billing.
            </p>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="mx-auto max-w-3xl px-4 py-20">
          <h2 className="text-3xl font-semibold tracking-tight text-center">Frequently asked questions</h2>
          <div className="mt-10 space-y-4">
            {[
              { q: "How does bKash payment work?", a: "Choose a plan, we show you our bKash number and the exact amount. Send Money from your bKash app, then submit the Transaction ID (TrxID) from your confirmation SMS. We activate your plan after verification — usually within a few hours." },
              { q: "Can I try the tool before paying?", a: "Yes. The Free plan lets you run audits on one project with no card and no bKash payment required." },
              { q: "Do you offer refunds?", a: "If your bKash payment was not verified or the plan was not activated within 24 hours, contact support for a full refund." },
              { q: "Do you support other payment methods?", a: "Right now we only accept bKash to keep pricing local and simple for Bangladesh customers. Nagad and card payments are on the roadmap." },
              { q: "Is my data secure?", a: "Every project is protected by row-level security. Only you and the admins you invite can view your audits, keywords and reports." },
            ].map((item) => (
              <div key={item.q} className="rounded-xl border border-border bg-card p-5">
                <h3 className="text-sm font-semibold">{item.q}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-border">
          <div className="mx-auto max-w-4xl px-4 py-16 text-center">
            <ShieldCheck className="h-8 w-8 mx-auto text-primary" />
            <h2 className="mt-4 text-3xl font-semibold tracking-tight">Ready to audit your first site?</h2>
            <p className="mt-3 text-muted-foreground">Sign up in seconds — the Free plan is enough to run a full audit today.</p>
            <div className="mt-6"><Link to="/auth"><Button size="lg">Create your account</Button></Link></div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-8 text-xs text-muted-foreground flex flex-wrap items-center justify-between gap-2">
          <span>© {new Date().getFullYear()} SEO Audit Tool. All rights reserved.</span>
          <div className="flex items-center gap-4">
            <a href="#pricing" className="hover:text-foreground">Pricing</a>
            <a href="#faq" className="hover:text-foreground">FAQ</a>
            <Link to="/auth" className="hover:text-foreground">Sign in</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
