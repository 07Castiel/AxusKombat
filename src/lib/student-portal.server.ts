import { deleteCookie, getCookie, getRequest, setCookie } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const COOKIE_NAME = "axus_student_session";
const SESSION_DAYS = 7;
const PBKDF2_ITERATIONS = 210_000;
const encoder = new TextEncoder();

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function base64ToBytes(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64url"));
}

async function derivePassword(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePassword(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${bytesToBase64(salt)}$${bytesToBase64(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iterationsRaw, saltRaw, expectedRaw] = stored.split("$");
  const iterations = Number(iterationsRaw);
  if (scheme !== "pbkdf2" || !Number.isSafeInteger(iterations) || !saltRaw || !expectedRaw) {
    return false;
  }
  try {
    const actual = await derivePassword(password, base64ToBytes(saltRaw), iterations);
    const expected = base64ToBytes(expectedRaw);
    if (actual.length !== expected.length) return false;
    let difference = 0;
    for (let i = 0; i < actual.length; i += 1) difference |= actual[i] ^ expected[i];
    return difference === 0;
  } catch {
    return false;
  }
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return bytesToBase64(new Uint8Array(digest));
}

export function normalizeEnrollment(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
}

export function generateEnrollment(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return `AXK-${Array.from(bytes, (byte) => chars[byte % chars.length]).join("")}`;
}

export function generateTemporaryPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (byte) => chars[byte % chars.length]).join("");
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
  mustChangePassword: boolean;
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
    .select("id, aluno_id, tenant_id, ativo, troca_senha_obrigatoria")
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
    mustChangePassword: credential.troca_senha_obrigatoria,
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