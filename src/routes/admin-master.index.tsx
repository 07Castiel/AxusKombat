import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { masterLogin } from "@/lib/master.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { PasswordInput } from "@/components/PasswordInput";
import { toast } from "sonner";
import { Shield, Loader2 } from "lucide-react";

export const Route = createFileRoute("/admin-master/")({
  head: () => ({ meta: [{ title: "Admin Master · Entrar" }, { name: "robots", content: "noindex, nofollow" }] }), component: MasterLoginPage });

function MasterLoginPage() {
  const navigate = useNavigate();
  const login = useServerFn(masterLogin);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem("master_token")) {
      navigate({ to: "/admin-master/dashboard" });
    }
  }, [navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { token } = await login({ data: { email, password } });
      sessionStorage.setItem("master_token", token);
      toast.success("Acesso autorizado");
      navigate({ to: "/admin-master/dashboard" });
    } catch (err: any) {
      toast.error(err?.message ?? "Falha no login");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dark min-h-screen grid place-items-center bg-background px-4">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,oklch(0.62_0.22_25/0.12),transparent_60%)]" />
      <Card className="relative w-full max-w-md p-8 gradient-card border-border shadow-card">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-11 w-11 rounded-lg gradient-primary grid place-items-center shadow-glow">
            <Shield className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Admin Mestre</h1>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Painel do SaaS</p>
          </div>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label htmlFor="me">E-mail</Label>
            <Input id="me" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1.5" />
          </div>
          <div>
            <Label htmlFor="mp">Senha</Label>
            <PasswordInput id="mp" required value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1.5" />
          </div>
          <Button type="submit" className="w-full gradient-primary text-primary-foreground shadow-glow" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Entrar"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
