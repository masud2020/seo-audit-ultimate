import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({ component: ResetPassword });

function ResetPassword() {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Password updated");
    navigate({ to: "/dashboard" });
  };
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-sm p-6">
        <h1 className="text-lg font-semibold mb-4">Set a new password</h1>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label htmlFor="p">New password</Label>
            <Input id="p" type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
          </div>
          <Button className="w-full" disabled={loading}>{loading ? "Updating…" : "Update password"}</Button>
        </form>
      </Card>
    </div>
  );
}