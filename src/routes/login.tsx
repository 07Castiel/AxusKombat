import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/PasswordInput";
import { toast } from "sonner";
import { translateError, firstZodMessage } from "@/lib/errors";
import { loginSchema, emailSchema } from "@/lib/validators";
import { Loader2 } from "lucide-react";
import logo from "@/assets/axus-kombat-logo.png";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({
    meta: [
      { title: "Entrar | Axus Kombat" },
      { name: "description", content: "Acesse o painel de gestão da sua academia no Axus Kombat." },
      { property: "og:title", content: "Entrar | Axus Kombat" },
      { property: "og:description", content: "Gestão completa para academias de artes marciais." },
    ],
  }),
});

function LoginPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && user) navigate({ to: "/" });
  }, [authLoading, user, navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) { toast.error(firstZodMessage(parsed.error)); return; }
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setLoading(false); toast.error(translateError(error)); return; }
    try { localStorage.setItem("axus-remember", remember ? "1" : "0"); } catch {}

    // Verifica status do tenant para decidir destino
    const uid = data.user?.id;
    if (uid) {
      const { data: profile } = await supabase
        .from("profiles").select("tenant_id").eq("id", uid).maybeSingle();
      const tid = (profile as { tenant_id?: string } | null)?.tenant_id;
      if (tid) {
        const { data: tenant } = await supabase
          .from("tenants").select("status").eq("id", tid).maybeSingle();
        const status = (tenant as { status?: string } | null)?.status;
        setLoading(false);
        if (status === "pending") { window.location.href = "/precos?retomar=true"; return; }
        if (status === "trial_expired") { window.location.href = "/precos?expirado=true"; return; }
      }
    }
    setLoading(false);
    toast.success("Bem-vindo de volta");
    navigate({ to: "/" });
  };

  const onForgot = async () => {
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) { toast.error("Informe seu e-mail no campo acima para recuperar a senha."); return; }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    });
    if (error) { toast.error(translateError(error)); return; }
    toast.success("Enviamos um e-mail com instruções para redefinir sua senha.");
  };

  return (
    <div className="dark min-h-screen flex items-center justify-center px-4 py-8" style={{ background: "#121212" }}>
      {/* sutil halo central */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 30%, rgba(181,0,0,0.06), transparent 60%)",
        }}
      />

      <div className="relative w-full max-w-[420px]">
        <div
          className="rounded-xl p-8 sm:p-10"
          style={{
            background: "#171717",
            border: "1px solid rgba(255,255,255,0.06)",
            boxShadow: "0 20px 50px -20px rgba(0,0,0,0.7), 0 1px 0 rgba(255,255,255,0.03) inset",
          }}
        >
          <div className="flex flex-col items-center text-center mb-7">
            <img
              src={logo}
              alt="Axus Kombat"
              className="h-14 w-14 object-contain mb-4 opacity-95"
            />
            <h1 className="font-display text-2xl text-foreground tracking-wide">Axus Kombat</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Gestão completa para academias de artes marciais
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs normal-case tracking-normal text-metal-light font-medium" style={{ letterSpacing: "0.01em", textTransform: "none" }}>
                E-mail
              </Label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                placeholder="voce@academia.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 rounded-lg bg-[#1f1f1f] border-white/[0.07] text-foreground placeholder:text-[#5a5a5a] focus-visible:border-primary/70 transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="pwd" className="text-xs normal-case tracking-normal text-metal-light font-medium" style={{ letterSpacing: "0.01em", textTransform: "none" }}>
                  Senha
                </Label>
                <button
                  type="button"
                  onClick={onForgot}
                  className="text-xs text-muted-foreground hover:text-metal-light transition-colors"
                >
                  Esqueceu a senha?
                </button>
              </div>
              <PasswordInput
                id="pwd"
                required
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 rounded-lg bg-[#1f1f1f] border-white/[0.07] text-foreground placeholder:text-[#5a5a5a] focus-visible:border-primary/70 transition-colors"
              />
            </div>

            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-white/20 bg-[#1f1f1f] accent-[#A30000]"
              />
              Lembrar de mim neste dispositivo
            </label>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 rounded-lg text-sm font-semibold tracking-normal transition-all"
              style={{
                background: "#A30000",
                color: "#fff",
                boxShadow: "0 1px 0 rgba(255,255,255,0.05) inset, 0 6px 20px -8px rgba(163,0,0,0.6)",
                textTransform: "none",
                letterSpacing: "0",
                fontFamily: "Rajdhani, system-ui, sans-serif",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#B50000")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#A30000")}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Entrar"}
            </Button>
          </form>

          <div className="mt-6 pt-5 border-t border-white/[0.05] text-center">
            <p className="text-sm text-muted-foreground">
              Ainda não é cliente?{" "}
              <Link to="/precos" className="text-metal-light hover:text-foreground font-medium transition-colors">
                Ver planos →
              </Link>
            </p>
          </div>
        </div>

        <p className="mt-6 text-center text-[11px] text-[#5a5a5a]">
          Axus Kombat © {new Date().getFullYear()} · Sistema de gestão
        </p>
      </div>
    </div>
  );
}
