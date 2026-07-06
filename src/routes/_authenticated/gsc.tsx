import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Copy, Trash2, RefreshCw, ExternalLink } from "lucide-react";
import {
  listGscVerifications,
  requestGscToken,
  verifyGscSite,
  deleteGscVerification,
} from "@/lib/gsc.functions";

export const Route = createFileRoute("/_authenticated/gsc")({
  component: GscPage,
  errorComponent: ({ error }) => <div className="p-6 text-sm text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-6">Not found</div>,
});

function GscPage() {
  const qc = useQueryClient();
  const list = useServerFn(listGscVerifications);
  const request = useServerFn(requestGscToken);
  const verify = useServerFn(verifyGscSite);
  const remove = useServerFn(deleteGscVerification);

  const { data: rows = [], isLoading } = useQuery({ queryKey: ["gsc"], queryFn: () => list() });
  const [siteUrl, setSiteUrl] = useState("");

  const reqMut = useMutation({
    mutationFn: (url: string) => request({ data: { site_url: url } }),
    onSuccess: () => { toast.success("Verification token generated"); setSiteUrl(""); qc.invalidateQueries({ queryKey: ["gsc"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const verMut = useMutation({
    mutationFn: (id: string) => verify({ data: { id } }),
    onSuccess: () => { toast.success("Site verified & added to Search Console"); qc.invalidateQueries({ queryKey: ["gsc"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => { toast.success("Removed"); qc.invalidateQueries({ queryKey: ["gsc"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Google Search Console</h1>
        <p className="text-sm text-muted-foreground">Verify your website with Google using a meta tag. Tokens are embedded automatically into your published site's HTML head.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add a site</CardTitle>
          <CardDescription>Enter the full origin (e.g. https://example.com). We'll generate a Google verification token and embed the meta tag site-wide.</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Input placeholder="https://example.com" value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} />
          <Button disabled={!siteUrl || reqMut.isPending} onClick={() => reqMut.mutate(siteUrl)}>
            {reqMut.isPending ? "Generating…" : "Generate token"}
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Your sites</h2>
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && rows.length === 0 && <p className="text-sm text-muted-foreground">No sites yet.</p>}
        {rows.map((r) => (
          <Card key={r.id}>
            <CardContent className="space-y-3 pt-6">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{r.site_url}</span>
                    {r.verified ? (
                      <Badge variant="default" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Verified</Badge>
                    ) : (
                      <Badge variant="secondary">Pending</Badge>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  {!r.verified && (
                    <Button size="sm" onClick={() => verMut.mutate(r.id)} disabled={verMut.isPending}>
                      <RefreshCw className="mr-1 h-3 w-3" /> Verify with Google
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => delMut.mutate(r.id)} disabled={delMut.isPending}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <div className="rounded border bg-muted/40 p-3 text-xs">
                <div className="mb-1 flex items-center justify-between">
                  <span className="font-mono text-muted-foreground">Meta tag (auto-embedded)</span>
                  <Button variant="ghost" size="sm" className="h-6 gap-1" onClick={() => { navigator.clipboard.writeText(`<meta name="google-site-verification" content="${r.token}" />`); toast.success("Copied"); }}>
                    <Copy className="h-3 w-3" /> Copy
                  </Button>
                </div>
                <code className="block break-all">{`<meta name="google-site-verification" content="${r.token}" />`}</code>
              </div>
              {!r.verified && (
                <p className="text-xs text-muted-foreground">
                  1. Publish your app so Google can fetch the meta tag from <code>{r.site_url}</code>. 2. Click <strong>Verify with Google</strong>.
                  &nbsp;<a className="inline-flex items-center gap-1 underline" href="https://search.google.com/search-console" target="_blank" rel="noreferrer">Open Search Console <ExternalLink className="h-3 w-3" /></a>
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}