import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { useServerFn } from "@tanstack/react-start";
import { completeOnboarding } from "@/lib/billing.functions";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { flagDeBusca } from "@/lib/utils";
import { useEffect } from "react";

// O Stripe devolve ?plano=pro&trial=1 — o router faz JSON.parse e entrega
// `trial` como número. O schema anterior exigia string e derrubava a tela de
// boas-vindas no retorno do checkout. Ver flagDeBusca em @/lib/utils.
const searchSchema = z.object({
  plano: z
    .unknown()
    .optional()
    .transform((v) => (typeof v === "string" ? v : undefined)),
  trial: z.unknown().optional().transform(flagDeBusca),
});

export const Route = createFileRoute("/_app/bem-vindo")({
  validateSearch: searchSchema,
  component: BemVindoPage,
});

function BemVindoPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/_app/bem-vindo" });
  const { refresh } = useAuth();
  const [loading, setLoading] = useState(false);
  const complete = useServerFn(completeOnboarding);

  const isTrial = search.trial;
  const planoNome = (search.plano || "pro").toUpperCase();

  // Calcula data final do trial (hoje + 14 dias)
  const trialEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const trialEndStr = trialEnd.toLocaleDateString("pt-BR");

  // Auto-refresh do auth ao montar (status já mudou via webhook)
  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);

  const handleAccess = async () => {
    setLoading(true);
    try {
      await complete();
      navigate({ to: "/" });
    } catch {
      navigate({ to: "/" });
    }
  };

  return (
    <div className="min-h-[70vh] grid place-items-center px-4">
      <div
        className="max-w-md w-full text-center p-8 rounded"
        style={{
          background: "#111111",
          border: "1px solid rgba(139,0,0,0.3)",
        }}
      >
        <CheckCircle2 className="mx-auto" style={{ color: "#8B0000", height: 64, width: 64 }} />
        <h1
          className="mt-6 text-3xl tracking-wider"
          style={{ fontFamily: "Cinzel, serif", color: "#fff" }}
        >
          BEM-VINDO!
        </h1>
        <p className="mt-3 text-white/80" style={{ fontFamily: "Rajdhani, system-ui, sans-serif" }}>
          {isTrial ? (
            <>
              Seu teste gratuito do plano <strong>{planoNome}</strong> está ativo.
              <br />
              Aproveite o sistema completo até <strong>{trialEndStr}</strong>.
            </>
          ) : (
            <>
              Sua assinatura do plano <strong>{planoNome}</strong> foi confirmada.
              <br />
              Tudo pronto para começar a gerenciar sua academia.
            </>
          )}
        </p>

        <Button
          onClick={handleAccess}
          disabled={loading}
          className="mt-6 w-full h-12"
          style={{ background: "#8B0000", color: "#fff" }}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Acessar o sistema"}
        </Button>
      </div>
    </div>
  );
}
