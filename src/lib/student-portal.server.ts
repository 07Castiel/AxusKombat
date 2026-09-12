import { deleteCookie, getCookie, getRequest, setCookie } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const COOKIE_NAME = "axus_student_session";
const SESSION_DAYS = 7;
const encoder = new TextEncoder();

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return bytesToBase64(new Uint8Array(digest));
}

export function requestIp(): string {
  const headers = getRequest().headers;
  return (
    headers.get("cf-connecting-ip")?.trim() ||
    headers.get("x-real-ip")?.trim() ||
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

export async function identifierHash(value: string): Promise<string> {
  return sha256(value);
}

export async function createStudentSession(credentialId: string): Promise<void> {
  const rawToken = bytesToBase64(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await sha256(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const { error } = await supabaseAdmin.from("aluno_sessoes").insert({
    credencial_id: credentialId,
    token_hash: tokenHash,
    expires_at: expiresAt.toISOString(),
  });
  if (error) throw new Error("Não foi possível iniciar a sessão do portal.");
  setCookie(COOKIE_NAME, rawToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export type StudentSession = {
  sessionId: string;
  credentialId: string;
  alunoId: string;
  tenantId: string;
  nome: string;
  academia: string;
  categoria: string;
};

export async function getStudentSession(): Promise<StudentSession | null> {
  const rawToken = getCookie(COOKIE_NAME);
  if (!rawToken) return null;
  const tokenHash = await sha256(rawToken);
  const { data: session } = await supabaseAdmin
    .from("aluno_sessoes")
    .select("id, credencial_id, expires_at, revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (!session || session.revoked_at || new Date(session.expires_at).getTime() <= Date.now()) {
    deleteCookie(COOKIE_NAME, { path: "/" });
    return null;
  }
  const { data: credential } = await supabaseAdmin
    .from("aluno_credenciais")
    .select("id, aluno_id, tenant_id, ativo")
    .eq("id", session.credencial_id)
    .maybeSingle();
  if (!credential?.ativo) {
    deleteCookie(COOKIE_NAME, { path: "/" });
    return null;
  }
  const [{ data: aluno }, { data: tenant }] = await Promise.all([
    supabaseAdmin.from("alunos").select("nome_completo, categoria, status").eq("id", credential.aluno_id).maybeSingle(),
    supabaseAdmin.from("tenants").select("nome, ativo").eq("id", credential.tenant_id).maybeSingle(),
  ]);
  if (!aluno || aluno.status !== "ativo" || !tenant?.ativo) {
    deleteCookie(COOKIE_NAME, { path: "/" });
    return null;
  }
  void supabaseAdmin.from("aluno_sessoes").update({ last_seen_at: new Date().toISOString() }).eq("id", session.id);
  return {
    sessionId: session.id,
    credentialId: credential.id,
    alunoId: credential.aluno_id,
    tenantId: credential.tenant_id,
    nome: aluno.nome_completo,
    academia: tenant.nome,
    categoria: aluno.categoria,
  };
}

export async function revokeCurrentStudentSession(): Promise<void> {
  const rawToken = getCookie(COOKIE_NAME);
  if (rawToken) {
    const tokenHash = await sha256(rawToken);
    await supabaseAdmin
      .from("aluno_sessoes")
      .update({ revoked_at: new Date().toISOString() })
      .eq("token_hash", tokenHash);
  }
  deleteCookie(COOKIE_NAME, { path: "/" });
}