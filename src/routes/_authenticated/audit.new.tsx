import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { startAudit } from "@/lib/audit.functions";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Loader2, PlayCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/audit/new")({ component: NewAudit });

function NewAudit() {
  const [url, setUrl] = useState("");
  const navigate = useNavigate();
  const fn = useServerFn(startAudit);
  const m = useMutation({
    mutationFn: (u: string) => fn({ data: { url: u } }),
    onSuccess: (r) => navigate({ to: "/audit/$id", params: { id: r.id } }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Audit failed"),
  });

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New Audit</h1>
        <p className="text-sm text-muted-foreground">Enter a URL to run a full technical + on-page audit.</p>
      </div>
      <Card className="p-6">
        <form onSubmit={(e) => { e.preventDefault(); if (url) m.mutate(url); }} className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground">Website URL</label>
            <Input placeholder="https://example.com" value={url} onChange={(e) => setUrl(e.target.value)} required autoFocus />
          </div>
          <Button disabled={m.isPending || !url} className="w-full">
            {m.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Auditing… (this can take up to a minute)</> : <><PlayCircle className="h-4 w-4 mr-2" />Start Audit</>}
          </Button>
          {m.isPending && <Progress value={65} className="h-1" />}
        </form>
        <div className="mt-6 text-xs text-muted-foreground space-y-1">
          <p>Runs 50+ checks: meta tags, canonical, robots.txt, sitemap.xml, on-page, links, broken links, images, structured data, SSL/security headers, mobile, page-weight, DOM size, favicon, 404 test — plus AI-generated recommendations.</p>
        </div>
      </Card>
    </div>
  );
}