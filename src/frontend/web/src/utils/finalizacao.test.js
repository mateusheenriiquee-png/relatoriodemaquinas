import { describe, expect, it } from "vitest";
import { parseValor, validarFinalizacao } from "./finalizacao";

const valido = {
  emailCliente: "cliente@exemplo.com",
  comprouOutroProduto: false,
  protocoloCertificado: "123456",
  dataEmissao: "2026-09-23",
  dataVencimento: "2027-09-23",
  tipoCertificado: "e-CPF A1",
  valor: "150,00",
  validadeEstendida: "2 anos",
  sistema: "VALID"
};

describe("finalização do suporte", () => {
  it("valor no formato brasileiro", () => {
    expect(parseValor("1.234,56")).toBe(1234.56);
    expect(parseValor("R$ 150")).toBe(150);
    expect(parseValor("150.5")).toBe(150.5);
    expect(parseValor("abc")).toBeNaN();
    expect(parseValor("")).toBeNaN();
  });

  it("formulário completo passa", () => {
    expect(validarFinalizacao(valido)).toEqual({});
  });

  it("'Não' em comprou outro produto é resposta válida; não responder não é", () => {
    expect(validarFinalizacao({ ...valido, comprouOutroProduto: false }).comprouOutroProduto).toBeUndefined();
    expect(validarFinalizacao({ ...valido, comprouOutroProduto: null }).comprouOutroProduto).toBeDefined();
  });

  it("aponta cada campo que falta ou está errado", () => {
    const erros = validarFinalizacao({
      ...valido,
      emailCliente: "sem-arroba",
      dataVencimento: "2026-01-01",
      valor: "x",
      validadeEstendida: "5 anos",
      sistema: " "
    });
    expect(Object.keys(erros).sort()).toEqual(["dataVencimento", "emailCliente", "sistema", "validadeEstendida", "valor"]);
  });
});
