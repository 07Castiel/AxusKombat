import { createFileRoute, Outlet, useNavigate, useRouterState, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Loader2, Lock, Sparkles, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_app")({
  component: AppRouteComponent,
});

type Situacao = {
  status: string;
  trial_ends_at: string | null;
  ativo: boolean;
  onboarding_completed: boolean;
};

const STATUS_LIBERADOS = ["active", "past_due", "trialing"];

function diasRestantes(fim: string | null): number | null {
  if (!fim) return null;
  const ms = new Date(fim).getTime() - Date.now();
  return Math.ceil(ms / 86_400_000);
}

function liberado(s: Situacao): boolean {
  if (s.ativo === false) return false;
  if (!STATUS_LIBERADOS.includes(s.status)) return false;
  if (s.status === "trialing") {
    const d = diasRestantes(s.trial_ends_at);
    return d === null || d > 0;
  }
  return true;
}

function AppRouteComponent() {
  const { user, loading, profile, profileCarregado, signOut } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [situacao, setSituacao] = useState<Situacao | null>(null);
  const [checado, setChecado] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [loading, user, navigate]);

  const carregar = useCallback(async () => {
    if (!profile?.tenant_id) return;
    const { data } = await supabase
      .from("tenants")
      .select("status, trial_ends_at, ativo, onboarding_completed")
      .eq("id", profile.tenant_id)
      .maybeSingle();
    const t = data as Partial<Situacao> | null;
    setSituacao({
      status: t?.status ?? "active",
      trial_ends_at: t?.trial_ends_at ?? null,
      ativo: t?.ativo !== false,
      onboarding_completed: t?.onboarding_completed !== false,
    });
    setChecado(true);
  }, [profile?.tenant_id]);

  useEffect(() => {
    if (!user || !profile?.tenant_id) return;
    carregar();
  }, [user, profile?.tenant_id, carregar]);

  // Onboarding: leva à tela de boas-vindas uma única vez. Nada de pagamento.
  useEffect(() => {
    if (!situacao) return;
    if (pathname === "/bem-vindo") {
      if (situacao.onboarding_completed) navigate({ to: "/" });
      return;
    }
    if (liberado(situacao) && !situacao.onboarding_completed) {
      navigate({ to: "/bem-vindo" });
    }
  }, [situacao, pathname, navigate]);

  if (loading || !user || (!profile && !profileCarregado)) {
    return (
      <div className="min-h-screen grid place-items-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Sessão válida sem perfil: o gatilho de cadastro falhou ou a leitura foi
  // negada. Antes esse caso caía no mesmo `return` do spinner e o app girava
  // para sempre — outra tela presa, só que sem nem uma mensagem.
  if (!profile) {
    return (
      <div className="min-h-screen grid place-items-center bg-background px-4">
        <div className="max-w-md w-full text-center p-8 rounded-lg border border-border bg-card">
          <AlertTriangle className="mx-auto h-12 w-12 text-primary" />
          <h1 className="font-display text-2xl tracking-wider mt-5 text-foreground">
            NÃO ENCONTRAMOS SEU CADASTRO
          </h1>
          <p className="mt-3 text-muted-foreground">
            Sua conta existe, mas o perfil da academia não foi carregado. Entre novamente ou fale
            com o suporte se continuar assim.
          </p>
          <Button className="mt-6 w-full h-11" onClick={() => signOut()}>
            Sair da conta
          </Button>
        </div>
      </div>
    );
  }

  if (!checado || !situacao) {
    return (
      <div className="min-h-screen grid place-items-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Bloqueio: acontece DENTRO do app, sem redirect duro. O usuário navega,
  // enxerga a mensagem e consegue sair — o loop antigo vinha de mandar para
  // /precos com window.location.href.
  if (!liberado(situacao)) {
    return (
      <AppLayout>
        <div className="min-h-[70vh] grid place-items-center px-4">
          <div className="max-w-md w-full text-center p-8 rounded-lg border border-border bg-card">
            <Lock className="mx-auto h-12 w-12 text-primary" />
            <h1 className="font-display text-2xl tracking-wider mt-5 text-foreground">
              {situacao.ativo === false ? "ACADEMIA SUSPENSA" : "SEU TESTE TERMINOU"}
            </h1>
            <p className="mt-3 text-muted-foreground">
              {situacao.ativo === false
                ? "Fale com o suporte para reativar o acesso da sua academia."
                : "Escolha um plano para voltar a usar o sistema. Seus dados continuam salvos."}
            </p>
            {situacao.ativo !== false && (
              <Button asChild className="mt-6 w-full h-11">
                <Link to="/precos">Assinar agora</Link>
              </Button>
            )}
            <Button
              variant="ghost"
              className="mt-2 w-full text-muted-foreground"
              onClick={() => signOut()}
            >
              Sair da conta
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  const dias = situacao.status === "trialing" ? diasRestantes(situacao.trial_ends_at) : null;

  return (
    <AppLayout>
      {dias !== null && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/10 px-4 py-2.5">
          <p className="text-sm text-foreground flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Teste gratuito — {dias === 1 ? "último dia" : `${dias} dias restantes`}.
          </p>
          <Button asChild size="sm" className="h-8">
            <Link to="/precos">Assinar agora</Link>
          </Button>
        </div>
      )}
      <Outlet />
    </AppLayout>
  );
}
