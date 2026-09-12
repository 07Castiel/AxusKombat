// Texto do recado que entrega a matricula ao aluno.
//
// Puro de proposito: o disparo passa pela fila de notificacoes e pelo worker,
// que aplica aquecimento, intervalo aleatorio, teto diario e variacao de
// texto. Aqui so se decide o que a mensagem diz.

export type DadosAcessoPortal = {
  nome: string;
  academia: string;
  matricula: string;
  url: string;
};

/**
 * Monta o recado com a matricula e o endereco do portal.
 *
 * Comeca sem saudacao de proposito. O worker prefixa "Olá", "Oi, tudo bem?" ou
 * nada, sorteado por notificacao, e so faz isso quando o texto ainda nao
 * comeca com uma saudacao. Escrever "Olá" aqui desligaria essa variacao e
 * mandaria a mesma abertura para as 59 pessoas, que e exatamente o padrao que
 * faz o WhatsApp derrubar o numero.
 */
export function mensagemAcessoPortal({
  nome,
  academia,
  matricula,
  url,
}: DadosAcessoPortal): string {
  const primeiroNome = nome.trim().split(/\s+/)[0] ?? nome;
  return [
    `${primeiroNome}, seu acesso ao Portal do Aluno da ${academia} já está liberado.`,
    "",
    `Matrícula: ${matricula}`,
    `Portal: ${url}`,
    "",
    "Para entrar, informe a matrícula e a sua data de nascimento.",
    "Esse número é pessoal: não repasse para ninguém.",
  ].join("\n");
}
