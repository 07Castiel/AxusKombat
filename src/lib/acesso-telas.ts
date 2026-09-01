/**
 * Quem enxerga cada tela. Fonte única para o menu e para o guarda de rota.
 *
 * A regra é: esta tabela NUNCA pode ser mais restritiva que o RLS. Guarda de
 * interface serve para explicar, não para proteger — quem protege é a policy no
 * Postgres. Se a tela barra alguém que o banco libera, o papel vira decorativo e
 * o usuário não descobre por quê.
 *
 * Cada linha abaixo espelha a policy de SELECT da tabela principal da tela:
 *   /financeiro   -> mensalidades_select  (admin, recepcao, financeiro)
 *   /despesas     -> despesas_select      (admin, financeiro)
 *   /relatorios   -> le mensalidades + despesas, entao o menor denominador
 *   /planos       -> planos_admin_all e admin-only para escrita, e a tela e de
 *                    edicao: abrir em modo quebrado seria pior que barrar
 */
import type { AppRole } from "@/hooks/use-auth";
import type { PermissionModule } from "@/lib/permissoes";

export const TODOS_OS_PAPEIS: readonly AppRole[] = [
  "admin",
  "recepcao",
  "financeiro",
  "professor_adulto",
  "professor_kids",
];

export const ACESSO_TELAS = {
  "/": TODOS_OS_PAPEIS,
  "/alunos": TODOS_OS_PAPEIS,
  "/horarios": TODOS_OS_PAPEIS,
  "/presencas": TODOS_OS_PAPEIS,
  "/graduacoes": TODOS_OS_PAPEIS,

  "/financeiro": ["admin", "recepcao", "financeiro"],
  "/despesas": ["admin", "financeiro"],
  "/relatorios": ["admin", "financeiro"],

  "/planos": ["admin"],
  "/modalidades": ["admin"],
  "/notificacoes": ["admin"],
  "/equipe": ["admin"],
  "/configuracoes": ["admin"],
  // /acessos saiu daqui: virou tela do /admin-master (C5). Os logs de visita
  // sao da plataforma inteira e nao tem tenant_id — nao ha como escopar por
  // academia sem inventar um dono para cada visita anonima.
} as const satisfies Record<string, readonly AppRole[]>;

export type TelaProtegida = keyof typeof ACESSO_TELAS;

export function papeisDaTela(tela: TelaProtegida): readonly AppRole[] {
  return ACESSO_TELAS[tela];
}

/**
 * Modulo de `profiles.permissions` que governa cada tela (A7).
 *
 * Telas sem modulo (o painel) nao sao afetadas por permissao — so por papel.
 * Permissao so restringe: quem nao passa no papel nunca chega aqui.
 */
export const MODULO_DA_TELA: Partial<Record<TelaProtegida, PermissionModule>> = {
  "/alunos": "alunos",
  "/presencas": "alunos",
  "/financeiro": "pagamentos",
  "/despesas": "pagamentos",
  "/planos": "planos",
  "/modalidades": "modalidades",
  "/horarios": "horarios",
  "/graduacoes": "graduacoes",
  "/relatorios": "relatorios",
  "/notificacoes": "configuracoes",
  "/equipe": "configuracoes",
  "/configuracoes": "configuracoes",
};
