// Centralized error translation: Supabase / Postgres / Auth → mensagens em PT-BR amigáveis.

type AnyError = {
  message?: string;
  code?: string;
  status?: number;
  name?: string;
  details?: string;
  hint?: string;
} | Error | unknown;

const AUTH_MAP: Record<string, string> = {
  "invalid login credentials": "E-mail ou senha incorretos.",
  "invalid email or password": "E-mail ou senha incorretos.",
  "email not confirmed": "Você precisa confirmar seu e-mail antes de entrar. Verifique sua caixa de entrada.",
  "user already registered": "Já existe uma conta com este e-mail. Faça login ou recupere sua senha.",
  "user not found": "Usuário não encontrado.",
  "email rate limit exceeded": "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
  "password should be at least 6 characters": "A senha deve ter pelo menos 6 caracteres.",
  "password should be at least 8 characters": "A senha deve ter pelo menos 8 caracteres.",
  "new password should be different from the old password": "A nova senha precisa ser diferente da atual.",
  "auth session missing!": "Sessão expirada. Faça login novamente.",
  "jwt expired": "Sessão expirada. Faça login novamente.",
  "signup requires a valid password": "Informe uma senha válida.",
  "unable to validate email address: invalid format": "Formato de e-mail inválido.",
  "for security purposes, you can only request this after": "Aguarde alguns segundos antes de tentar novamente.",
  "captcha verification process failed": "Falha na verificação. Tente novamente.",
  "anonymous sign-ins are disabled": "Login anônimo desabilitado.",
};

const PG_CODE_MAP: Record<string, string> = {
  "23505": "Já existe um registro com esses dados.",
  "23503": "Não é possível concluir: existem registros relacionados.",
  "23502": "Preencha todos os campos obrigatórios.",
  "23514": "Os dados informados não atendem às regras do sistema.",
  "22001": "Um dos campos excede o tamanho permitido.",
  "22007": "Data ou hora em formato inválido.",
  "22P02": "Formato de dado inválido em um dos campos.",
  "42501": "Você não tem permissão para realizar esta ação.",
  "42P01": "Recurso não encontrado.",
  "P0001": "Operação bloqueada por uma regra do sistema.",
  "PGRST116": "Registro não encontrado.",
  "PGRST301": "Sessão expirada. Faça login novamente.",
};

const FALLBACK = "Algo deu errado. Tente novamente em instantes.";

export function translateError(err: AnyError, fallback = FALLBACK): string {
  if (!err) return fallback;
  const e = err as any;
  const raw = (e?.message ?? e?.error_description ?? e?.error ?? "").toString();
  const code = (e?.code ?? "").toString();
  const lower = raw.toLowerCase().trim();

  if (code && PG_CODE_MAP[code]) return PG_CODE_MAP[code];

  for (const key of Object.keys(AUTH_MAP)) {
    if (lower.includes(key)) return AUTH_MAP[key];
  }

  // Network / fetch
  if (lower.includes("failed to fetch") || lower.includes("networkerror")) {
    return "Sem conexão com o servidor. Verifique sua internet e tente novamente.";
  }
  if (lower.includes("timeout")) return "A operação demorou muito. Tente novamente.";

  // Row-level security
  if (lower.includes("row-level security") || lower.includes("permission denied")) {
    return "Você não tem permissão para realizar esta ação.";
  }

  // Unique violation phrasing
  if (lower.includes("duplicate key")) return "Já existe um registro com esses dados.";
  if (lower.includes("violates foreign key")) return "Não é possível concluir: existem registros relacionados.";
  if (lower.includes("violates not-null")) return "Preencha todos os campos obrigatórios.";

  // Zod issues fallback
  if (e?.issues?.[0]?.message) return e.issues[0].message;

  return raw && raw.length < 160 ? raw : fallback;
}

export function firstZodMessage(err: unknown, fallback = "Verifique os campos do formulário."): string {
  const e = err as any;
  return e?.issues?.[0]?.message ?? e?.errors?.[0]?.message ?? fallback;
}
