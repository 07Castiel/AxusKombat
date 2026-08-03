/**
 * Executa o worker de disparo de notificações internamente (server-only).
 */
export async function runDispatch(): Promise<any> {
  const handler = await import("@/routes/api/public/hooks/dispatch-notifications");
  const req = new Request("https://internal/api/public/hooks/dispatch-notifications", {
    method: "POST",
    headers: { apikey: process.env.SUPABASE_PUBLISHABLE_KEY ?? "" },
  });
  const res = await (handler.Route as any).options.server.handlers.POST({ request: req });
  return await res.json();
}
