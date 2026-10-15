import { describe, expect, it } from "vitest";
import { chamadoParado } from "./chamadoParado";

const H = 3600000;
const agora = Date.parse("2026-10-09T18:00:00Z");
const ha = (horas) => new Date(agora - horas * H).toISOString();

describe("chamado parado (09/10)", () => {
  it("menos de 4 h sem mensagem do cliente: nada", () => {
    expect(chamadoParado({ status: "EM ANDAMENTO", dataInicioAtendimento: ha(3) }, agora)).toBeNull();
  });

  it("4 h ou mais: destaque 'parado há X h'", () => {
    const r = chamadoParado({ status: "EM ANDAMENTO", dataInicioAtendimento: ha(5) }, agora);
    expect(r).toMatchObject({ nivel: "parado", texto: "parado há 5 h" });
  });

  it("conta desde a última mensagem do cliente, se for mais recente que o 'assumir'", () => {
    const item = { status: "EM ANDAMENTO", dataInicioAtendimento: ha(30), ultimaMensagemClienteEm: ha(2) };
    expect(chamadoParado(item, agora)).toBeNull();
  });

  it("24 h ou mais sem mensagem: sugere sem retorno", () => {
    const r = chamadoParado({ status: "EM ANDAMENTO", dataInicioAtendimento: ha(26) }, agora);
    expect(r).toMatchObject({ nivel: "sem-retorno", texto: "parado há 1 dia" });
    expect(chamadoParado({ status: "EM ANDAMENTO", dataInicioAtendimento: ha(75) }, agora).texto).toBe("parado há 3 dias");
  });

  it("com mensagem do cliente não lida (bolinha) não sugere sem retorno: a equipe é que deve a resposta", () => {
    const r = chamadoParado({ status: "EM ANDAMENTO", dataInicioAtendimento: ha(40), ultimaMensagemClienteEm: ha(30), mensagensNaoLidas: 2 }, agora);
    expect(r.nivel).toBe("parado");
  });

  it("só vale para EM ANDAMENTO", () => {
    for (const status of ["EM ABERTO", "REAGENDADO", "FINALIZADO"]) {
      expect(chamadoParado({ status, dataInicioAtendimento: ha(50) }, agora)).toBeNull();
    }
  });
});
