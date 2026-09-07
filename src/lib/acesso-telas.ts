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
 *   /presencas    -> presencas_select      (admin, recepcao, professores)
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

/**
 * Quem enxerga presenca. Espelha presencas_select (20260701033153), que NAO
 * inclui financeiro — nem para ler, nem para escrever.
 *
 * A exclusao e deliberada e nao um esquecimento: presenca e dado pessoal de
 * comportamento, de menores inclusive, e as telas do financeiro (mensalidades,
 * despesas, relatorios) nao consomem frequencia. Decisao de retencao a partir
 * de quem esta sumindo e de admin e recepcao, que ja enxergam.
 *
 * Ate esta branch /presencas estava em TODOS_OS_PAPEIS, o que quebrava a regra
 * do cabecalho deste arquivo: a tabela ficava MAIS permissiva que o RLS, e o
 * financeiro abria a chamada para ver uma tela vazia sem entender por que.
 */
export const PAPEIS_DE_PRESENCA: readonly AppRole[] = [
  "admin",
  "recepcao",
  "professor_adulto",
  "professor_kids",
];

/**
 * Quem enxerga a leitura de risco de evasao.
 *
 * A risco_evasao() NAO e SECURITY DEFINER, entao cada papel ja recebe so os
 * componentes que o RLS dele libera: professor nao le mensalidades (atraso e
 * reincidencia voltam NULL), financeiro nao le presencas (frequencia volta
 * NULL). A funcao degrada com honestidade sozinha.
 *
 * Mas uma tela que mostra "cobertura 0,31, pagamento nao medido" para o
 * professor nao informa nada — e o sinal dominante hoje e inadimplencia, que e
 * dado financeiro. Admin e recepcao sao os unicos papeis que enxergam as duas
 * metades, e sao os mesmos a quem a decisao de retencao ja cabe (ver
 * PAPEIS_DE_PRESENCA acima).
 */
export const PAPEIS_DE_RISCO: readonly AppRole[] = ["admin", "recepcao"];

export const ACESSO_TELAS = {
  "/": TODOS_OS_PAPEIS,
  "/alunos": TODOS_OS_PAPEIS,
  // A ficha responde ao mesmo papel e ao mesmo modulo da lista: quem pode ver
  // a lista pode abrir a ficha, e quem nao pode ver nem chega ao link.
  "/aluno/$id": TODOS_OS_PAPEIS,
  "/horarios": TODOS_OS_PAPEIS,
  "/presencas": PAPEIS_DE_PRESENCA,
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
  "/aluno/$id": "alunos",
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
