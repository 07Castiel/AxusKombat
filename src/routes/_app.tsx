import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { AppLayout } from "@/components/AppLayout";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_app")({
  component: AppRouteComponent,
});

function AppRouteComponent() {
  const { user, loading, profile } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [statusChecked, setStatusChecked] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [loading, user, navigate]);

  // Guarda de status da assinatura
  useEffect(() => {
    if (!user || !profile?.tenant_id) return;
    let cancelled = false;
    (async () => {
      const { data: tenant } = await supabase
        .from("tenants")
        .select("status, onboarding_completed")
        .eq("id", profile.tenant_id)
        .maybeSingle();
      if (cancelled) return;
      const status = (tenant as { status?: string; onboarding_completed?: boolean } | null)?.status;
      const onboardingDone = (tenant as { onboarding_completed?: boolean } | null)?.onboarding_completed;

      // Não redirecionar enquanto o usuário estiver na própria página de boas-vindas
      if (pathname === "/bem-vindo") {
        if (onboardingDone) navigate({ to: "/" });
        setStatusChecked(true);
        return;
      }

      if (status === "pending") {
        window.location.href = "/precos?retomar=true";
        return;
      }
      if (status === "trial_expired") {
        window.location.href = "/precos?expirado=true";
        return;
      }
      // Acabou de pagar mas ainda não viu /bem-vindo? Manda pra lá.
      if ((status === "active" || status === "trialing") && onboardingDone === false) {
        navigate({ to: "/bem-vindo" });
        setStatusChecked(true);
        return;
      }
      setStatusChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, profile?.tenant_id, pathname, navigate]);

  if (loading || !user || !profile || !statusChecked) {
    return (
      <div className="min-h-screen grid place-items-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return <AppLayout><Outlet /></AppLayout>;
}
