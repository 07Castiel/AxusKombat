/**
 * Permissões por módulo (A7).
 *
 * A tela Equipe sempre gravou um mapa `{ alunos: {ver, editar}, ... }` em
 * `profiles.permissions`. Procurei todas as ocorrências: o campo era escrito,
 * lido de volta pelo próprio formulário para se autopreencher, e nunca mais.
 * Não aparecia em nenhuma policy, nenhuma server function, nenhuma checagem de
 * tela. Um administrador que desmarcava "editar pagamentos" para a recepção
 * acreditava ter restringido algo — e a recepção seguia alterando mensalidades.
 * Falsa sensação de controle é pior que controle nenhum. E "permissões
 * granulares por usuário" é item de venda do plano Elite.
 *
 * INVARIANTE: permissão só RESTRINGE, nunca AMPLIA.
 *
 * O RLS continua sendo o piso de segurança, e ele é baseado em papel. Estas
 * permissões são uma camada mais fina por cima: podem tirar de alguém algo que
 * o papel dava, nunca dar algo que o papel nega. Por isso é seguro aplicá-las
 * na interface e nas server functions sem mexer em uma única policy — no pior
 * caso de um bug aqui, o usuário vê menos do que poderia, nunca mais.
 *
 * MÓDULO AUSENTE = LIBERADO. `permissions` nasce `{}` e a esmagadora maioria
 * dos perfis está assim. Tratar ausência como negação trancaria todo mundo para
 * fora no primeiro deploy. Só uma marcação explícita `false` restringe.
 */

export const PERMISSION_MODULES = [
  "alunos",
  "pagamentos",
  "planos",
  "modalidades",
  "horarios",
  "graduacoes",
  "relatorios",
  "configuracoes",
] as const;

export type PermissionModule = (typeof PERMISSION_MODULES)[number];
export type ModulePerms = { ver: boolean; editar: boolean };
export type PermissionsMap = Partial<Record<PermissionModule, ModulePerms>>;

export const STAFF_ROLES = [
  "admin",
  "recepcao",
  "financeiro",
  "professor_adulto",
  "professor_kids",
] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const ROLE_LABELS: Record<StaffRole, string> = {
  admin: "Administrador",
  recepcao: "Recepção",
  financeiro: "Financeiro",
  professor_adulto: "Professor Adulto",
  professor_kids: "Professor Kids",
};

const all: ModulePerms = { ver: true, editar: true };
const ver: ModulePerms = { ver: true, editar: false };
const none: ModulePerms = { ver: false, editar: false };

export const ROLE_PRESETS: Record<StaffRole, Record<PermissionModule, ModulePerms>> = {
  admin: {
    alunos: all,
    pagamentos: all,
    planos: all,
    modalidades: all,
    horarios: all,
    graduacoes: all,
    relatorios: all,
    configuracoes: all,
  },
  recepcao: {
    alunos: all,
    pagamentos: ver,
    planos: ver,
    modalidades: ver,
    horarios: all,
    graduacoes: ver,
    relatorios: none,
    configuracoes: none,
  },
  financeiro: {
    alunos: ver,
    pagamentos: all,
    planos: all,
    modalidades: ver,
    horarios: ver,
    graduacoes: none,
    relatorios: all,
    configuracoes: none,
  },
  professor_adulto: {
    alunos: ver,
    pagamentos: none,
    planos: none,
    modalidades: ver,
    horarios: all,
    graduacoes: all,
    relatorios: none,
    configuracoes: none,
  },
  professor_kids: {
    alunos: ver,
    pagamentos: none,
    planos: none,
    modalidades: ver,
    horarios: all,
    graduacoes: all,
    relatorios: none,
    configuracoes: none,
  },
};

/** Normaliza o JSONB do banco, que chega como `unknown`. */
export function lerPermissoes(bruto: unknown): PermissionsMap {
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return {};
  const saida: PermissionsMap = {};
  for (const modulo of PERMISSION_MODULES) {
    const v = (bruto as Record<string, unknown>)[modulo];
    if (v && typeof v === "object") {
      const m = v as Record<string, unknown>;
      saida[modulo] = {
        ver: m.ver !== false,
        editar: m.editar !== false,
      };
    }
  }
  return saida;
}

/** Módulo ausente ou sem marcação explícita conta como liberado. */
export function podeVer(perms: PermissionsMap, modulo: PermissionModule): boolean {
  return perms[modulo]?.ver !== false;
}

export function podeEditar(perms: PermissionsMap, modulo: PermissionModule): boolean {
  const m = perms[modulo];
  if (!m) return true;
  return m.editar !== false && m.ver !== false;
}

export const MSG_SEM_PERMISSAO: Record<"ver" | "editar", (m: PermissionModule) => string> = {
  ver: (m) => `Seu acesso a ${m} foi desativado pelo administrador da academia.`,
  editar: (m) => `Você pode consultar ${m}, mas não alterar. Fale com o administrador.`,
};
