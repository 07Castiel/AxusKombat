/**
 * Ponte tipada para tabelas que a migration cria mas que ainda não estão no
 * `types.ts`.
 *
 * `types.ts` é gerado pelo Lovable a partir do schema publicado. Editá-lo à mão
 * seria desfeito na próxima regeneração — e, pior, se a regeneração acontecesse
 * antes de a migration rodar, o build quebraria.
 *
 * Aqui as tabelas ganham tipos de verdade (não é `as any` disfarçado), e o
 * arquivo sobrevive a qualquer regeneração. Quando `types.ts` já trouxer as duas
 * tabelas, este módulo pode ser apagado e os chamadores voltam a usar
 * `supabaseAdmin.from(...)` direto.
 *
 * Criadas em: supabase/HARDENING_4_APLICAR.sql
 */
import type { SupabaseClient } from "@supabase/supabase-js";

type Tabela<Row, Insert> = {
  Row: Row;
  Insert: Insert;
  Update: Partial<Insert>;
  Relationships: [];
};

/** Tentativas de login no painel mestre — base do teto por IP (A6). */
type MasterLoginAttempt = {
  id: string;
  ip: string;
  sucesso: boolean;
  criado_em: string;
};

/** Eventos já processados do Stripe — de-dupe e guarda de ordem (M8). */
type StripeWebhookEvent = {
  event_id: string;
  event_type: string;
  event_created: string;
  customer_id: string | null;
  processed_at: string;
};

export type PendingDatabase = {
  public: {
    Tables: {
      master_login_attempts: Tabela<
        MasterLoginAttempt,
        { ip: string; sucesso: boolean; id?: string; criado_em?: string }
      >;
      stripe_webhook_events: Tabela<
        StripeWebhookEvent,
        {
          event_id: string;
          event_type: string;
          event_created: string;
          customer_id?: string | null;
          processed_at?: string;
        }
      >;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

/** Reinterpreta o client para enxergar as tabelas ainda não tipadas. */
export function comTabelasPendentes(client: unknown): SupabaseClient<PendingDatabase> {
  return client as unknown as SupabaseClient<PendingDatabase>;
}
