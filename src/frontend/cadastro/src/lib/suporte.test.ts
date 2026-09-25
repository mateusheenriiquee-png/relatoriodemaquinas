import { describe, expect, it } from "vitest";
import { formatContato, formatCpfCnpj, formatProtocolo, paraDatetimeLocal } from "./formatacao";
import { FORMULARIO_VAZIO, faltaIdentificacao, montarSuporte } from "./suporte";

describe("formatação", () => {
  it("protocolo de 9 dígitos ganha os traços; o resto fica como veio", () => {
    expect(formatProtocolo("102005389")).toBe("102-005-389");
    expect(formatProtocolo("102-005-389")).toBe("102-005-389");
    expect(formatProtocolo("1001550191")).toBe("1001550191");
    expect(formatProtocolo("  ")).toBe("");
  });

  it("CPF e CNPJ pelo número de dígitos", () => {
    expect(formatCpfCnpj("12345678901")).toBe("123.456.789-01");
    expect(formatCpfCnpj("12345678000195")).toBe("12.345.678/0001-95");
    expect(formatCpfCnpj("123.456.789-01")).toBe("123.456.789-01");
    expect(formatCpfCnpj("123")).toBe("123");
  });

  it("telefone com DDD é formatado; nome de grupo não", () => {
    expect(formatContato("85999998888")).toBe("(85) 99999-8888");
    expect(formatContato("8533334444")).toBe("(85) 3333-4444");
    expect(formatContato("Grupo Contabilidade")).toBe("Grupo Contabilidade");
  });

  it("datetime-local sem segundos, no fuso local", () => {
    expect(paraDatetimeLocal(new Date(2026, 8, 15, 9, 5))).toBe("2026-09-15T09:05");
  });
});

describe("montarSuporte", () => {
  const agora = new Date("2026-09-15T12:00:00.000Z");

  it("exige protocolo ou CPF/CNPJ", () => {
    expect(faltaIdentificacao(FORMULARIO_VAZIO)).toBe(true);
    expect(faltaIdentificacao({ ...FORMULARIO_VAZIO, protocolo: "102005389" })).toBe(false);
    expect(faltaIdentificacao({ ...FORMULARIO_VAZIO, cpfCnpj: "12345678901" })).toBe(false);
    expect(faltaIdentificacao({ ...FORMULARIO_VAZIO, protocolo: "   " })).toBe(true);
  });

  it("grava formatado, com os mesmos valores fixos da versão anterior", () => {
    const doc = montarSuporte(
      { ...FORMULARIO_VAZIO, protocolo: "102005389", cpfCnpj: "12345678901", contato: "85999998888" },
      "Henrique",
      agora
    );

    expect(doc).toMatchObject({
      status: "EM ABERTO",
      statusAbertura: "DEVIDO",
      dataAbertura: "2026-09-15T12:00:00.000Z",
      responsavelAbertura: "Henrique",
      tipo: "Suporte tecnico",
      ac: "CONSULTI",
      protocolo: "102-005-389",
      cpfCnpj: "123.456.789-01",
      contato: "(85) 99999-8888"
    });
  });

  it("não grava campo vazio como string vazia", () => {
    const doc = montarSuporte({ ...FORMULARIO_VAZIO, protocolo: "102005389" }, "Henrique", agora);
    expect(doc).not.toHaveProperty("cpfCnpj");
    expect(doc).not.toHaveProperty("contato");
  });

  it("não grava técnico — o cadastro rápido não atribui ninguém", () => {
    const doc = montarSuporte({ ...FORMULARIO_VAZIO, protocolo: "102005389" }, "Henrique", agora);
    expect(doc).not.toHaveProperty("tecnico");
  });

  it("abre a linha do tempo no formato do painel principal", () => {
    const doc = montarSuporte({ ...FORMULARIO_VAZIO, protocolo: "102005389", ac: "VALID" }, "Henrique", agora);
    expect(doc.historico).toEqual([
      { em: "2026-09-15T12:00:00.000Z", texto: "Chamado aberto · Suporte tecnico · VALID · pelo cadastro rápido", por: "Henrique" }
    ]);
  });
});
