import { describe, expect, it } from "vitest";
import {
  BACKOFF_MINUTOS,
  MAX_TENTATIVAS,
  classifyErro,
  erroAcao,
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
  });
});
