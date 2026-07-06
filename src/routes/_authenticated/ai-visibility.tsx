import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Bot } from "lucide-react";

export const Route = createFileRoute("/_authenticated/ai-visibility")({ component: AIVisibility });

function AIVisibility() {
  return (
    <div className="space-y-4">
      <div><h1 className="text-2xl font-semibold tracking-tight">AI Visibility</h1><p className="text-sm text-muted-foreground">Track how your content is cited across AI answer engines (ChatGPT, Perplexity, Gemini, Claude).</p></div>
      <Alert>
        <Bot className="h-4 w-4" />
        <AlertTitle>Coming in Phase 2</AlertTitle>
        <AlertDescription>Live AI-visibility tracking requires per-provider APIs and rotating prompt fleets. Add your provider keys in <b>API Settings</b> to prepare — full dashboards ship in the next phase.</AlertDescription>
      </Alert>
      <Card className="p-6"><p className="text-sm text-muted-foreground">Meanwhile, every audit includes an AI Search Citation Potential score derived from structured data, FAQ signals, author markup, and content depth.</p></Card>
    </div>
  );
}