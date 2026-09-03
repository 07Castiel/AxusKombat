import { createFileRoute, Outlet, useNavigate, useRouterState, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Loader2, Lock, Sparkles, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SomenteLeituraProvider } from "@/hooks/use-somente-leitura";
import { diasRestantesDeTeste, tenantLiberado } from "@/lib/acesso-tenant";

// Mensagens repetidas de propósito. subscription.ts é o dono delas no servidor,
// mas importar aquele arquivo aqui traria createMiddleware e o auth-middleware
// para dentro do bundle do navegador — o mesmo tipo de import server-only que
// já derrubou /precos duas vezes neste projeto.
const MSG_TESTE_TERMINADO =
  "Você continua com acesso aos seus dados, mas não é possível criar nem alterar registros até assinar um plano.";
const MSG_SUSPENSA =
  "Você pode consultar e exportar seus dados, mas não fazer alterações. Fale com o suporte para reativar o acesso.";

export const Route = createFileRoute("/_app")({
  component: AppRouteComponent,
});

type Situacao = {
  status: string;
  trial_ends_at: string | null;
  ativo: boolean;
  onboarding_completed: boolean;
};

// A regra vem de acesso-tenant.ts, a mesma que o servidor usa. Ver o cabeçalho
// daquele arquivo para o porquê de não haver uma cópia aqui.
function liberado(s: Situacao): boolean {
  return tenantLiberado({ status: s.status, ativo: s.ativo, trialEndsAt: s.trial_ends_at });
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

  // Bloqueio de escrita, não de acesso: a academia continua navegando e
  // consultando os próprios dados. A tela cheia de antes trancava o sistema
  // inteiro atrás de um "Assinar agora" — segurava dado de cliente como
  // alavanca de cobrança, e a regra do servidor (subscription.ts) sempre disse
  // o contrário: bloqueia ESCRITA, libera LEITURA.
  const bloqueado = !liberado(situacao);
  const suspensa = situacao.ativo === false;
  const dias =
    !bloqueado && situacao.status === "trialing"
      ? diasRestantesDeTeste(situacao.trial_ends_at)
      : null;

  return (
    <SomenteLeituraProvider
      valor={{ ativo: bloqueado, motivo: suspensa ? MSG_SUSPENSA : MSG_TESTE_TERMINADO }}
    >
      <AppLayout>
        {bloqueado && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3">
            <p className="text-sm text-foreground flex items-start gap-2">
              <Lock className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
              <span>
                <strong>{suspensa ? "Academia suspensa." : "Seu teste terminou."}</strong>{" "}
                {suspensa ? MSG_SUSPENSA : MSG_TESTE_TERMINADO}
              </span>
            </p>
            {!suspensa && (
              <Button asChild size="sm" className="h-8">
                <Link to="/precos">Assinar agora</Link>
              </Button>
            )}
          </div>
        )}

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
    </SomenteLeituraProvider>
  );
}
