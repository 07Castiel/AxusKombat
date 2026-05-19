import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { masterLogin } from "@/lib/master.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/PasswordInput";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import logo from "@/assets/axus-kombat-logo.png";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({
    meta: [
      { title: "Entrar | Axus Kombat" },
      { name: "description", content: "Acesse o painel de gestão da sua academia no Axus Kombat." },
      { property: "og:title", content: "Entrar | Axus Kombat" },
      { property: "og:description", content: "Acesse o painel de gestão da sua academia de artes marciais." },
    ],
  }),
});

function LoginPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const tryMasterLogin = useServerFn(masterLogin);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && user) navigate({ to: "/" });
  }, [authLoading, user, navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { token } = await tryMasterLogin({ data: { email, password } });
      sessionStorage.setItem("master_token", token);
      setLoading(false);
      toast.success("Acesso de Admin Mestre autorizado");
      navigate({ to: "/admin-master/dashboard" });
      return;
    } catch {
      /* not master */
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Bem-vindo de volta, guerreiro");
    navigate({ to: "/" });
  };

  return (
    <div className="dark min-h-screen relative grid place-items-center bg-background px-4 py-10 overflow-hidden">
      <div className="absolute inset-0 noise-bg pointer-events-none" />
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(181,0,0,0.18), transparent 60%)", filter: "blur(40px)" }}
      />

      <div className="relative w-full max-w-md flex flex-col items-center">
        <img src={logo} alt="Axus Kombat" className="w-72 md:w-80 object-contain drop-shadow-[0_0_40px_rgba(181,0,0,0.4)]" />
        <p className="mt-2 font-display text-[11px] uppercase tracking-[0.5em] text-metal">Sistema de Gestão</p>

        <div className="flex items-center gap-3 my-6 w-full max-w-xs">
          <span className="h-1 w-1 rounded-full bg-primary" />
          <div className="flex-1 h-px" style={{ background: "rgba(181,0,0,0.25)" }} />
          <span className="h-1 w-1 rounded-full bg-primary" />
        </div>

        <div
          className="w-full p-10 relative"
          style={{
            background: "#0e0e0e",
            border: "1px solid rgba(181,0,0,0.15)",
            borderTop: "2px solid #B50000",
            borderRadius: "6px",
            boxShadow: "0 0 60px rgba(0,0,0,0.8), 0 0 30px rgba(181,0,0,0.06)",
          }}
        >
          <h1 className="font-display text-xl text-metal-light uppercase tracking-widest text-center mb-1">Entrar</h1>
          <p className="text-xs text-metal text-center mb-6 uppercase tracking-widest">Acesso ao painel</p>

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email" className="uppercase-label text-[11px]">E-mail</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-2 bg-input border-white/10 text-foreground" />
            </div>
            <div>
              <Label htmlFor="pwd" className="uppercase-label text-[11px]">Senha</Label>
              <PasswordInput id="pwd" required value={password} onChange={(e) => setPassword(e.target.value)} className="mt-2 bg-input border-white/10 text-foreground" />
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="w-full font-display uppercase tracking-[0.2em] text-sm h-11 bg-primary hover:bg-[#D40000] text-primary-foreground shadow-glow transition-all"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Entrar"}
            </Button>
          </form>

          <p className="text-xs text-center mt-6 text-metal uppercase tracking-widest">
            Primeira vez?{" "}
            <Link to="/signup" className="text-primary hover:text-[#D40000] font-semibold transition-colors">Cadastre sua academia</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
