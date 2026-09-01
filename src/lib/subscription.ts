/**
 * Verificação de assinatura no servidor (C6).
 *
 * Até aqui o paywall existia só no navegador: `tenants.status` era lido no
 * useEffect de _app.tsx e no onSubmit de login.tsx, e nada mais. Ignorar o
 * redirect — ou simplesmente chamar as server functions direto — dava acesso
 * completo com assinatura `pending` ou `trial_expired`.
 *
 * IMPORTANTE: este middleware sozinho NÃO fecha o C6. Boa parte das telas
 * escreve direto no Supabase pelo navegador (alunos, planos, modalidades,
 * horarios, graduacoes), sem passar por server function. A trava que vale para
 * os dois caminhos é a de RLS — a função assinatura_ativa() aplicada nas
 * policies de escrita. Aqui é defesa em profundidade e, principalmente, o lugar
 * onde a mensagem de erro sai legível para o usuário.
 *
 * Regra: bloqueia ESCRITA, libera LEITURA. Quem deixou de pagar continua
 * enxergando e exportando os próprios dados — reter dado de cliente como
 * alavanca de cobrança é prática ruim e problema de LGPD.
 */
import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Situações em que a academia pode operar normalmente. */
const STATUS_LIBERADOS = new Set(["active", "trialing"]);

export const MSG_PENDENTE =
  "Sua assinatura ainda não foi concluída. Finalize o pagamento para voltar a usar o sistema.";
export const MSG_EXPIRADA =
  "Seu período de teste terminou. Escolha um plano para continuar usando o sistema.";
export const MSG_SUSPENSA =
  "Esta academia está suspensa. Fale com o suporte para reativar o acesso.";

export type TenantSituacao = {
  tenantId: string;
  status: string;
  ativo: boolean;
  liberado: boolean;
};

/** Lê a situação da academia do usuário. Não lança. */
export async function lerSituacaoTenant(ctx: {
  supabase: any;
  userId: string;
}): Promise<TenantSituacao | null> {
  const { data: perfil } = await ctx.supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", ctx.userId)
    .maybeSingle();
  const tenantId = perfil?.tenant_id as string | undefined;
  if (!tenantId) return null;

  const { data: tenant } = await ctx.supabase
    .from("tenants")
    .select("id, status, ativo")
    .eq("id", tenantId)
    .maybeSingle();
  if (!tenant) return null;

  const status = (tenant.status as string) ?? "active";
  const ativo = tenant.ativo !== false;
  return { tenantId, status, ativo, liberado: ativo && STATUS_LIBERADOS.has(status) };
}

/** Traduz a situação em mensagem para o usuário. */
export function mensagemBloqueio(s: TenantSituacao): string {
  if (!s.ativo) return MSG_SUSPENSA;
  if (s.status === "pending") return MSG_PENDENTE;
  return MSG_EXPIRADA;
}

/**
 * Exige assinatura válida. Use em toda server function que ESCREVE.
 *
 * Não aplicar em billing.functions.ts: createCheckoutSession e
 * completeOnboarding precisam funcionar justamente quando o status é
 * `pending` — é como o cliente sai desse estado.
 */
export const requireActiveSubscription = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const situacao = await lerSituacaoTenant(context as any);
    if (!situacao) throw new Error("Perfil não encontrado");
    if (!situacao.liberado) throw new Error(mensagemBloqueio(situacao));
    return next({ context: { tenantSituacao: situacao } });
  });
