import { createContext, useContext, type ReactNode } from "react";

/**
 * Modo somente leitura.
 *
 * Quando o teste de 14 dias termina sem assinatura, a conta deixa de ser
 * expulsa do sistema: ela continua navegando e consultando os próprios dados,
 * e só a ESCRITA é recusada. É a mesma regra que subscription.ts já aplica no
 * servidor — reter dado de cliente como alavanca de cobrança é prática ruim e
 * problema de LGPD.
 *
 * A trava que vale é a do banco (gatilho tg_exigir_assinatura, que roda mesmo
 * se alguém chamar o Supabase direto pelo console). Este contexto existe só
 * para a interface avisar ANTES, em vez de deixar o usuário preencher um
 * formulário inteiro para tomar erro no fim.
 */
export type SituacaoLeitura = {
  /** true quando a academia não pode mais escrever. */
  ativo: boolean;
  /** Por quê — texto pronto para mostrar ao usuário. */
  motivo: string;
};

const LIBERADO: SituacaoLeitura = { ativo: false, motivo: "" };

const Ctx = createContext<SituacaoLeitura>(LIBERADO);

export function SomenteLeituraProvider({
  valor,
  children,
}: {
  valor: SituacaoLeitura;
  children: ReactNode;
}) {
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

/**
 * Fora do provider devolve "liberado". Assim uma tela usada fora do app
 * (ou num teste) não some com os botões por engano.
 */
export function useSomenteLeitura(): SituacaoLeitura {
  return useContext(Ctx);
}
