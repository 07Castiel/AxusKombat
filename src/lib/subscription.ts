/**
 * Verificação de assinatura no servidor (C6).
 *
 * Até aqui o paywall existia só no navegador: `tenants.status` era lido no
 * useEffect de _app.tsx e no onSubmit de login.tsx, e nada mais. Ignorar o
 * redirect — ou simplesmente chamar as server functions direto — dava acesso
 * completo com o teste já vencido.
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
import { tenantLiberado, trialValido } from "@/lib/acesso-tenant";

// Reexportado porque a regra mora em acesso-tenant.ts (compartilhada com a
// rota de cliente), mas quem importa daqui não precisa saber disso.
export { trialValido };

export const MSG_EXPIRADA =
  "Seu período de teste terminou. Escolha um plano para continuar usando o sistema.";
export const MSG_SUSPENSA =
  "Esta academia está suspensa. Fale com o suporte para reativar o acesso.";

export type TenantSituacao = {
  tenantId: string;
  status: string;
  ativo: boolean;
  liberado: boolean;
  trialEndsAt: string | null;
};

/**
 * Lê a situação da academia do usuário.
 *
 * Lança quando não consegue determinar a situação (perfil ausente, academia
 * ausente, erro de leitura). Assinatura vencida NÃO lança aqui — devolve
 * `liberado: false`, para quem chama decidir a mensagem.
 */
export async function lerSituacaoTenant(ctx: {
  supabase: any;
  userId: string;
}): Promise<TenantSituacao> {
  const { data: perfil, error: erroPerfil } = await ctx.supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", ctx.userId)
    .maybeSingle();
  if (erroPerfil) throw new Error(`Falha ao ler o perfil: ${erroPerfil.message}`);
  const tenantId = perfil?.tenant_id as string | undefined;
  if (!tenantId) throw new Error("Perfil não encontrado");

  const { data: tenant, error: erroTenant } = await ctx.supabase
    .from("tenants")
    .select("id, status, ativo, trial_ends_at")
    .eq("id", tenantId)
    .maybeSingle();
  // Falha de leitura não é o mesmo que assinatura vencida. Sem esta distinção,
  // um erro transitório do banco bloquearia toda escrita com a mensagem
  // "seu período de teste terminou" — e o usuário não teria como descobrir.
  if (erroTenant) throw new Error(`Falha ao verificar a assinatura: ${erroTenant.message}`);
  if (!tenant) throw new Error("Academia não encontrada");

  const status = (tenant.status as string) ?? "active";
  const ativo = tenant.ativo !== false;
  const trialEndsAt = (tenant.trial_ends_at as string | null) ?? null;
  return {
    tenantId,
    status,
    ativo,
    trialEndsAt,
    liberado: tenantLiberado({ status, ativo, trialEndsAt }),
  };
}

/** Traduz a situação em mensagem para o usuário. */
export function mensagemBloqueio(s: TenantSituacao): string {
  if (!s.ativo) return MSG_SUSPENSA;
  return MSG_EXPIRADA;
}

/**
 * Exige assinatura válida. Use em toda server function que ESCREVE.
 *
 * Não aplicar em billing.functions.ts: createCheckoutSession e
 * completeOnboarding precisam funcionar justamente com o teste vencido — é
 * por elas que o cliente sai desse estado.
 */
export const requireActiveSubscription = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const situacao = await lerSituacaoTenant(context as any);
    if (!situacao.liberado) throw new Error(mensagemBloqueio(situacao));
    return next({ context: { tenantSituacao: situacao } });
  });
