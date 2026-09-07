import type { RiscoLinha } from "@/integrations/supabase/tabelas-pendentes";

/**
 * Apresentação da leitura de risco. Nenhuma conta acontece aqui: a soma, os
 * pesos e o denominador saem prontos de risco_evasao(). Este arquivo só decide
 * como mostrar.
 *
 * A regra que atravessa tudo: `risco` nulo NÃO vira 0 e NÃO vira "sem risco".
 * Vira uma frase dizendo que não deu para ler.
 */
export const SEM_LEITURA = "Sem leitura de risco";

/** A nota, ou `null` para a tela desenhar o estado "não medido". */
export function fmtRisco(risco: number | null): string | null {
  return risco === null ? null : String(risco);
}

/** "31% dos sinais" — quanto do peso total pôde ser medido. */
export function fmtCobertura(cobertura: number): string {
  return `${Math.round(cobertura * 100)}% dos sinais`;
}

/**
 * Faixa da nota, para escolher COR — nunca para escrever um rótulo.
 *
 * Deliberadamente sem nome: não existe "aluno em risco" nem "aluno saudável"
 * nesta tela. Uma cor é um convite a olhar; um rótulo é um veredito, e o
 * veredito é do gestor, que conhece o aluno e sabe de coisas que o banco não
 * sabe. `null` é cinza, igual a qualquer outro dado ausente.
 */
export function tomDoRisco(risco: number | null): "neutro" | "atencao" | "alto" {
  if (risco === null) return "neutro";
  if (risco >= 60) return "alto";
  if (risco >= 30) return "atencao";
  return "neutro";
}

/**
 * A leitura se apoia em pouca coisa?
 *
 * 0,31 é o piso estrutural: contrato e tempo de casa estão sempre disponíveis.
 * Abaixo de 0,60 significa que pagamento OU frequência ficou de fora, e a nota
 * merece a ressalva ao lado.
 */
export function baseFina(linha: RiscoLinha): boolean {
  return linha.risco !== null && linha.cobertura < 0.6;
}
