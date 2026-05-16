import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Swords, Loader2 } from "lucide-react";

export const Route = createFileRoute("/signup")({ component: SignupPage });

function SignupPage() {
  const navigate = useNavigate();
  const [nome, setNome] = useState("");
  const [tenantNome, setTenantNome] = useState("CT Aquiles Fight Team");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email, password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { nome_completo: nome, tenant_nome: tenantNome },
      },
    });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Cadastro realizado! Verifique seu e-mail (ou entre direto se a confirmação estiver desativada).");
    navigate({ to: "/login" });
  };

  return (
    <div className="dark min-h-screen grid place-items-center bg-background px-4 py-12">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,oklch(0.62_0.22_25/0.15),transparent_50%)]" />
      <Card className="relative w-full max-w-md p-8 gradient-card border-border shadow-card">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-11 w-11 rounded-lg gradient-primary grid place-items-center shadow-glow">
            <Swords className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Criar Academia</h1>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Fight Team</p>
          </div>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label htmlFor="tn">Nome da Academia</Label>
            <Input id="tn" required value={tenantNome} onChange={(e) => setTenantNome(e.target.value)} className="mt-1.5" />
          </div>
          <div>
            <Label htmlFor="n">Seu Nome</Label>
            <Input id="n" required value={nome} onChange={(e) => setNome(e.target.value)} className="mt-1.5" />
          </div>
          <div>
            <Label htmlFor="e">E-mail</Label>
            <Input id="e" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1.5" />
          </div>
          <div>
            <Label htmlFor="p">Senha</Label>
            <Input id="p" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1.5" />
          </div>
          <Button type="submit" className="w-full gradient-primary text-primary-foreground shadow-glow" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar conta"}
          </Button>
        </form>
        <p className="text-sm text-center mt-6 text-muted-foreground">
          Já tem conta? <Link to="/login" className="text-primary hover:underline">Entrar</Link>
        </p>
      </Card>
    </div>
  );
}
