import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Search } from "lucide-react";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard" });
    });
  }, [navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast.success("Account created. Check your email to verify.");
      } else if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/dashboard" });
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast.success("Password reset email sent.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const onGoogle = async () => {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (r.error) toast.error(r.error.message ?? "Google sign-in failed");
    if (!r.error && !r.redirected) navigate({ to: "/dashboard" });
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-sm p-6">
        <div className="flex items-center gap-2 mb-6">
          <div className="grid h-8 w-8 place-items-center rounded bg-primary text-primary-foreground"><Search className="h-4 w-4" /></div>
          <div>
            <div className="text-sm font-semibold">SEO Audit Tool</div>
            <div className="text-xs text-muted-foreground">
              {mode === "login" ? "Sign in to your account" : mode === "signup" ? "Create your account" : "Reset your password"}
            </div>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </div>
          {mode !== "forgot" && (
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete={mode === "signup" ? "new-password" : "current-password"} />
              {mode === "signup" && <p className="mt-1 text-xs text-muted-foreground">At least 8 characters.</p>}
            </div>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Please wait…" : mode === "login" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset email"}
          </Button>
        </form>

        {mode !== "forgot" && (
          <>
            <div className="my-4 flex items-center gap-2 text-xs text-muted-foreground">
              <div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" />
            </div>
            <Button type="button" variant="outline" className="w-full" onClick={onGoogle}>Continue with Google</Button>
          </>
        )}

        <div className="mt-4 space-y-1 text-center text-xs text-muted-foreground">
          {mode === "login" && (
            <>
              <div><button className="hover:text-foreground" onClick={() => setMode("forgot")}>Forgot password?</button></div>
              <div>No account? <button className="text-primary hover:underline" onClick={() => setMode("signup")}>Create one</button></div>
            </>
          )}
          {mode === "signup" && (
            <div>Already have an account? <button className="text-primary hover:underline" onClick={() => setMode("login")}>Sign in</button></div>
          )}
          {mode === "forgot" && (
            <div><button className="text-primary hover:underline" onClick={() => setMode("login")}>Back to sign in</button></div>
          )}
        </div>

        <div className="mt-4 text-center text-xs text-muted-foreground">
          <Link to="/" className="hover:text-foreground">← Back to home</Link>
        </div>
      </Card>
    </div>
  );
}