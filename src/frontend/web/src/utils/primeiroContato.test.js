import { describe, expect, it } from "vitest";
import { mensagemPrimeiroContato, saudacaoDoDia } from "./format";

// Brasília é UTC-3 o ano todo (sem horário de verão desde 2019): 11:00Z = 08:00 BRT.
const brt = (hora, min = 0) => new Date(Date.UTC(2026, 9, 2, hora + 3, min));

describe("saudação do primeiro contato", () => {
  it("Bom dia só das 8h às 12h", () => {
    expect(saudacaoDoDia(brt(8, 0))).toBe("Bom dia");
    expect(saudacaoDoDia(brt(11, 59))).toBe("Bom dia");
  });

  it("Boa tarde das 12h às 18h", () => {
    expect(saudacaoDoDia(brt(12, 0))).toBe("Boa tarde");
    expect(saudacaoDoDia(brt(17, 59))).toBe("Boa tarde");
  });

  it("fora da janela nunca é Bom dia: Boa noite a partir das 18h, Olá antes das 8h", () => {
    expect(saudacaoDoDia(brt(18, 0))).toBe("Boa noite");
    expect(saudacaoDoDia(brt(23, 30))).toBe("Boa noite");
    expect(saudacaoDoDia(brt(0, 0))).toBe("Olá");
    expect(saudacaoDoDia(brt(7, 59))).toBe("Olá");
  });

  it("usa o horário de Brasília, não o do fuso da máquina", () => {
    // 15:00 UTC = 12:00 BRT: Boa tarde em qualquer fuso do computador.
    expect(saudacaoDoDia(new Date("2026-10-02T15:00:00Z"))).toBe("Boa tarde");
    expect(saudacaoDoDia(new Date("2026-10-02T14:59:00Z"))).toBe("Bom dia");
  });

  it("mensagem pronta, com o nome de quem atende, no texto pedido", () => {
    expect(mensagemPrimeiroContato("Dayran", brt(9))).toBe(
      "Bom dia, tudo certo?\nAqui é o Dayran da equipe técnica da Certify, pode me explicar melhor sua situação?"
    );
    expect(mensagemPrimeiroContato("Henrique", brt(15))).toBe(
      "Boa tarde, tudo certo?\nAqui é o Henrique da equipe técnica da Certify, pode me explicar melhor sua situação?"
    );
  });

  it("sem nome de usuário a frase continua correta", () => {
    expect(mensagemPrimeiroContato("  ", brt(9))).toBe(
      "Bom dia, tudo certo?\nAqui é da equipe técnica da Certify, pode me explicar melhor sua situação?"
    );
  });
});
