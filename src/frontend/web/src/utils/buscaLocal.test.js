import { describe, expect, it } from "vitest";
import { combinaComBusca } from "./buscaLocal";

const item = {
  protocolo: "102-993-661",
  cpfCnpj: "57.090.018/0001-49",
  cpf: "529.982.247-25",
  contato: "+5511944334807",
  nomeCliente: "Beatriz Ramos",
  kommoLeadId: "55914262"
};

describe("busca da lista por número (09/10)", () => {
  it("telefone em qualquer formato", () => {
    for (const t of ["11944334807", "11 94433-4807", "(11) 94433-4807", "+55 11 94433-4807", "94433-4807"]) {
      expect(combinaComBusca(item, t), t).toBe(true);
    }
  });

  it("número do lead do Kommo, com ou sem #", () => {
    expect(combinaComBusca(item, "55914262")).toBe(true);
    expect(combinaComBusca(item, "#55914262")).toBe(true);
  });

  it("protocolo, CNPJ e CPF só com dígitos", () => {
    expect(combinaComBusca(item, "102993661")).toBe(true);
    expect(combinaComBusca(item, "57090018000149")).toBe(true);
    expect(combinaComBusca(item, "52998224725")).toBe(true);
  });

  it("texto continua como antes; número que não existe não acha", () => {
    expect(combinaComBusca(item, "ramos")).toBe(true);
    expect(combinaComBusca(item, "102-993")).toBe(true);
    expect(combinaComBusca(item, "99999999")).toBe(false);
    expect(combinaComBusca(item, "abc 1234")).toBe(false);
  });
});
