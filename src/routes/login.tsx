import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { PasswordInput } from "@/components/PasswordInput";
import { toast } from "sonner";
import { Swords, Loader2 } from "lucide-react";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({
    meta: [
      { title: "Entrar | CT Aquiles Fight Team" },
      { name: "description", content: "Acesse o painel de gestão da sua academia de Muay Thai e Boxe no CT Aquiles Fight Team." },
      { property: "og:title", content: "Entrar | CT Aquiles Fight Team" },
      { property: "og:description", content: "Acesse o painel de gestão da sua academia de artes marciais." },
      { property: "og:url", content: "https://ctaquiles.lovable.app/login" },
    ],
    links: [{ rel: "canonical", href: "https://ctaquiles.lovable.app/login" }],
  }),
});

function LoginPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (!authLoading && user) navigate({ to: "/" }); }, [authLoading, user, navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Bem-vindo de volta!");
    navigate({ to: "/" });
  };

  return (
    <div className="dark min-h-screen grid place-items-center bg-background px-4">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,oklch(0.62_0.22_25/0.15),transparent_50%)]" />
      <Card className="relative w-full max-w-md p-8 gradient-card border-border shadow-card">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-11 w-11 rounded-lg gradient-primary grid place-items-center shadow-glow">
            <Swords className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-bold">CT Aquiles</h1>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Fight Team</p>
          </div>
        </div>
        <h2 className="text-2xl font-bold mb-1">Entrar</h2>
        <p className="text-sm text-muted-foreground mb-6">Acesse o painel de gestão</p>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1.5" />
          </div>
          <div>
            <Label htmlFor="pwd">Senha</Label>
            <PasswordInput id="pwd" required value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1.5" />
          </div>
          <Button type="submit" className="w-full gradient-primary text-primary-foreground shadow-glow" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Entrar"}
          </Button>
        </form>
        <p className="text-sm text-center mt-6 text-muted-foreground">
          Primeira vez? <Link to="/signup" className="text-primary hover:underline font-medium">Cadastre sua academia</Link>
        </p>
      </Card>
    </div>
  );
}
