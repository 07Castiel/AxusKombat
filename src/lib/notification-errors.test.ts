import { describe, expect, it } from "vitest";
import {
  BACKOFF_MINUTOS,
  MAX_TENTATIVAS,
  classifyErro,
  erroAcao,
  erroAcaoComTentativas,
  erroLabel,
  isRetentavel,
  proximaTentativaISO,
} from "./notification-errors";

/**
 * Classificação e reagendamento de falhas de envio.
 *
 * Isto decide se uma cobrança será tentada de novo sozinha ou vai esperar
 * alguém arrumar. Errar para o lado errado tem custo dos dois jeitos: retentar
 * um número inválido cinco vezes chama atenção do WhatsApp, e não retentar uma
 * queda de rede deixa o aluno sem aviso.
 */

describe("classifyErro", () => {
  it("reconhece cada motivo pela mensagem que o worker realmente grava", () => {
    expect(classifyErro("Aluno sem telefone cadastrado")).toBe("sem_telefone");
    expect(classifyErro("Número de telefone inválido")).toBe("telefone_invalido");
    expect(classifyErro("WhatsApp não conectado para esta academia")).toBe("whatsapp_desconectado");
    expect(classifyErro("WhatsApp desconectado — reconecte pelo painel")).toBe(
      "whatsapp_desconectado",
    );
    expect(classifyErro("Modelo de mensagem inativo")).toBe("sem_modelo");
  });

  it("agrupa as falhas de infraestrutura como serviço indisponível", () => {
    for (const m of [
      "Evolution HTTP 502",
      "HTTP 503",
      "504 gateway",
      "fetch failed",
      "network error",
      "ECONNREFUSED",
      "timeout",
    ]) {
      expect(classifyErro(m), m).toBe("servico_indisponivel");
    }
  });

  it("reconhece a queda da Evolution atrás do Cloudflare", () => {
    // Caso real do painel: o 530 (error code 1016) e o Cloudflare dizendo que
    // nao resolveu o DNS da origem — a mensagem nem chegou ao servidor. Ficava
    // como "desconhecido" e o admin lia "verifique o historico" para uma queda
    // que se resolve sozinha.
    expect(classifyErro("Evolution HTTP 530: error code: 1016")).toBe("servico_indisponivel");
    for (const m of [
      "Evolution HTTP 500: Internal Server Error",
      "Evolution HTTP 521: web server is down",
      "Evolution HTTP 522: connection timed out",
      "Evolution HTTP 524",
      "Evolution HTTP 429: Too Many Requests",
      "Evolution sem resposta: tempo esgotado após 20s",
      "Evolution inacessível: getaddrinfo ENOTFOUND api.exemplo.com",
      "The operation was aborted",
    ]) {
      expect(classifyErro(m), m).toBe("servico_indisponivel");
    }
  });

  it("não confunde o código do corpo do Cloudflare com um status HTTP", () => {
    // "1016" tem 4 digitos: nao pode casar com a lista de status. Se casasse,
    // qualquer numero grande no corpo do erro viraria "servico_indisponivel".
    expect(classifyErro("resposta estranha: 1016")).toBe("desconhecido");
  });

  it("separa credencial recusada de servidor fora do ar", () => {
    // Sao os dois "a Evolution nao aceitou", mas o desfecho e oposto: um espera
    // o servidor voltar, o outro espera alguem arrumar a chave.
    for (const m of [
      "Evolution HTTP 401: Unauthorized",
      "Evolution HTTP 403: Forbidden",
      "Evolution HTTP 401: {\"message\":\"Invalid apikey\"}",
    ]) {
      expect(classifyErro(m), m).toBe("configuracao_invalida");
    }
  });

  it("trata env var ausente como configuração, não como rede", () => {
    // baseUrl()/apiKey() lançam quando a env var falta e a exceção chega aqui
    // embrulhada. Sem a ordem certa em classifyErro, o "inacessível" do
    // embrulho ganharia e isto viraria "servico_indisponivel" — retentado 5x
    // para um servidor que está no ar e nunca vai aceitar.
    expect(classifyErro("EVOLUTION_API_KEY não configurado no servidor"))
      .toBe("configuracao_invalida");
    expect(classifyErro("Evolution inacessível: EVOLUTION_API_URL não configurado no servidor"))
      .toBe("configuracao_invalida");
  });

  it("cai em desconhecido para vazio, nulo e mensagem que não casa", () => {
    expect(classifyErro(null)).toBe("desconhecido");
    expect(classifyErro(undefined)).toBe("desconhecido");
    expect(classifyErro("")).toBe("desconhecido");
    expect(classifyErro("erro estranho da API")).toBe("desconhecido");
  });

  it("não depende de caixa alta ou baixa", () => {
    expect(classifyErro("ALUNO SEM TELEFONE")).toBe("sem_telefone");
    expect(classifyErro("Timeout")).toBe("servico_indisponivel");
  });
});

describe("isRetentavel", () => {
  it("não retenta o que exige correção humana", () => {
    // Retentar um numero invalido cinco vezes so gasta cota e chama atencao.
    for (const c of ["sem_telefone", "telefone_invalido", "sem_modelo"]) {
      expect(isRetentavel(c), c).toBe(false);
    }
  });

  it("não retenta credencial recusada", () => {
    // A Evolution vai recusar as cinco tentativas igual. O unico efeito de
    // insistir e cinco POSTs recusados por minuto contra o mesmo servidor.
    expect(isRetentavel("configuracao_invalida")).toBe(false);
  });

  it("não retenta desconexão do WhatsApp — o reenvio é decisão do usuário", () => {
    // Depois de reconectar, quem decide se as pendentes saem e o admin, no
    // dialogo de reconexao. Retentar sozinho mandaria cobranca antiga sem aviso.
    expect(isRetentavel("whatsapp_desconectado")).toBe(false);
  });

  it("retenta falha de infraestrutura e o que não deu para classificar", () => {
    expect(isRetentavel("servico_indisponivel")).toBe(true);
    expect(isRetentavel("desconhecido")).toBe(true);
    expect(isRetentavel(null)).toBe(true);
  });
});

describe("proximaTentativaISO", () => {
  it("para de reagendar ao atingir o teto de tentativas", () => {
    expect(proximaTentativaISO(MAX_TENTATIVAS)).toBeNull();
    expect(proximaTentativaISO(MAX_TENTATIVAS + 3)).toBeNull();
  });

  it("respeita a espera crescente de cada tentativa", () => {
    const antes = Date.now();
    for (let t = 0; t < MAX_TENTATIVAS; t++) {
      const iso = proximaTentativaISO(t);
      expect(iso, `tentativa ${t}`).not.toBeNull();
      const esperaMin = (new Date(iso!).getTime() - antes) / 60_000;
      // Margem de um minuto para o tempo que passa durante o proprio teste.
      expect(esperaMin).toBeGreaterThan(BACKOFF_MINUTOS[t] - 1);
      expect(esperaMin).toBeLessThan(BACKOFF_MINUTOS[t] + 1);
    }
  });

  it("a espera nunca diminui de uma tentativa para a seguinte", () => {
    for (let t = 1; t < BACKOFF_MINUTOS.length; t++) {
      expect(BACKOFF_MINUTOS[t]).toBeGreaterThanOrEqual(BACKOFF_MINUTOS[t - 1]);
    }
  });

  it("devolve ISO válido", () => {
    expect(new Date(proximaTentativaISO(0)!).toString()).not.toBe("Invalid Date");
  });
});

describe("mensagens para o usuário", () => {
  it("todo código tem rótulo e ação, inclusive um código desconhecido", () => {
    for (const c of [
      "sem_telefone",
      "telefone_invalido",
      "sem_modelo",
      "whatsapp_desconectado",
      "servico_indisponivel",
      "configuracao_invalida",
      "desconhecido",
      "codigo-que-nao-existe",
      null,
    ]) {
      expect(erroLabel(c), String(c)).toBeTruthy();
      expect(erroAcao(c), String(c)).toBeTruthy();
    }
  });

  it("a ação diz o que fazer, não só o que aconteceu", () => {
    expect(erroAcao("sem_telefone")).toMatch(/cadastre/i);
    expect(erroAcao("whatsapp_desconectado")).toMatch(/reconecte/i);
    // O admin da academia nao tem como trocar a chave da API: a acao precisa
    // aponta-lo para quem tem.
    expect(erroAcao("configuracao_invalida")).toMatch(/suporte/i);
  });
});

describe("erroAcaoComTentativas", () => {
  it("promete nova tentativa enquanto ela existe", () => {
    expect(erroAcaoComTentativas("servico_indisponivel", 2, "2026-09-14T12:00:00Z"))
      .toBe(erroAcao("servico_indisponivel"));
  });

  it("para de prometer quando o teto de tentativas foi atingido", () => {
    // Sem isto o painel dizia "nova tentativa automatica em instantes" para
    // sempre, numa mensagem que so sai se alguem clicar em Reenviar.
    const texto = erroAcaoComTentativas("servico_indisponivel", MAX_TENTATIVAS, null);
    expect(texto).not.toBe(erroAcao("servico_indisponivel"));
    expect(texto).toMatch(/reenviar/i);
    expect(texto).toContain(String(MAX_TENTATIVAS));
  });

  it("não muda a ação de erro que nunca foi retentável", () => {
    // "Cadastre o telefone" continua sendo a instrucao certa, e o teto de
    // tentativas nao tem nada a ver com ela.
    expect(erroAcaoComTentativas("sem_telefone", MAX_TENTATIVAS, null)).toBe(erroAcao("sem_telefone"));
    expect(erroAcaoComTentativas("whatsapp_desconectado", MAX_TENTATIVAS, null))
      .toBe(erroAcao("whatsapp_desconectado"));
  });

  it("trata tentativas nula como zero", () => {
    expect(erroAcaoComTentativas("servico_indisponivel", null, null))
      .toBe(erroAcao("servico_indisponivel"));
  });
});
