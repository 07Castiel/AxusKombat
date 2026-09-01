/**
 * Executa o worker de disparo de notificações internamente (server-only).
 *
 * `tenantId` restringe a varredura a uma academia. Chamadas vindas do painel
 * SEMPRE devem passá-lo: sem ele, o clique de um cliente processaria a fila de
 * todos os outros. O cron é quem chama sem escopo, de propósito.
 */
import { internalCronSecret } from "@/lib/cron-auth";

export async function runDispatch(tenantId?: string): Promise<any> {
  const handler = await import("@/routes/api/public/hooks/dispatch-notifications");
  const url = new URL("https://internal/api/public/hooks/dispatch-notifications");
  if (tenantId) url.searchParams.set("tenant_id", tenantId);
  const req = new Request(url, {
    method: "POST",
    headers: { "x-cron-secret": internalCronSecret() },
  });
  const res = await (handler.Route as any).options.server.handlers.POST({ request: req });
  return await res.json();
}
