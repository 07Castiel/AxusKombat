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
  "/acessos": ["admin"],
} as const satisfies Record<string, readonly AppRole[]>;

export type TelaProtegida = keyof typeof ACESSO_TELAS;

export function papeisDaTela(tela: TelaProtegida): readonly AppRole[] {
  return ACESSO_TELAS[tela];
}
