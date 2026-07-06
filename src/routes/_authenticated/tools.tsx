import { createFileRoute, Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Feather, Type as TypeIcon, Radio, TrendingUp, Bot, FileCode } from "lucide-react";

export const Route = createFileRoute("/_authenticated/tools")({ component: Tools });

function Tool({ icon: Icon, title, desc, to, external }: { icon: React.ComponentType<{ className?: string }>; title: string; desc: string; to?: string; external?: string }) {
  const body = (
    <Card className="p-4 h-full">
      <Icon className="h-5 w-5 text-primary" />
      <h3 className="mt-2 text-sm font-semibold">{title}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
    </Card>
  );
  if (external) return <a href={external} target="_blank" rel="noreferrer">{body}</a>;
  return <Link to={to!}>{body}</Link>;
}

function Tools() {
  return (
    <div className="space-y-4">
      <div><h1 className="text-2xl font-semibold tracking-tight">Tools</h1><p className="text-sm text-muted-foreground">Standalone utilities and integrations.</p></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Tool icon={TypeIcon} title="Word Counter" desc="Content stats, readability, keyword density." to="/word-counter" />
        <Tool icon={Feather} title="Hemingway Editor" desc="External writing editor for clarity and grade level." external="https://hemingwayapp.com" />
        <Tool icon={Radio} title="Ping Sites" desc="Notify Google, Bing and IndexNow of updates." to="/ping" />
        <Tool icon={TrendingUp} title="Keyword Rank Tracker" desc="Track keyword positions over time." to="/keywords" />
        <Tool icon={Bot} title="AI Visibility" desc="How your content shows up in AI answers." to="/ai-visibility" />
        <Tool icon={FileCode} title="Robots.txt Generator" desc="Build Allow / Disallow rules and download robots.txt." to="/tools/robots-txt-generator" />
      </div>
      <Card className="p-6">
        <h3 className="text-sm font-semibold">Coming next</h3>
        <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground">
          <li>Whole-website audit (crawler)</li>
          <li>Keyword / content / backlink gap analyses</li>
          <li>Toxic backlink checker & disavow export</li>
          <li>PDF export with email delivery</li>
          <li>Live SERP rank tracking (requires a data provider)</li>
        </ul>
      </Card>
      <Button variant="outline" size="sm" asChild><a href="https://hemingwayapp.com" target="_blank" rel="noreferrer">Open Hemingway Editor →</a></Button>
    </div>
  );
}