import { describe, expect, it } from "vitest";
import { bloqueia, classificarDuplicados, variantesCpfCnpj, variantesProtocolo, type LinhaSuporte } from "./duplicidade";
import { FORMULARIO_VAZIO } from "./suporte";

const linha = (extra: Partial<LinhaSuporte>): LinhaSuporte => ({
  id: "x",
  protocolo: "",
  cpf_cnpj: "",
  status: "EM ABERTO",
  data_abertura: "2026-09-01T10:00:00Z",
  responsavel_abertura: "Dayran",
  ...extra
});
const form = (extra: Partial<typeof FORMULARIO_VAZIO>) => ({ ...FORMULARIO_VAZIO, ...extra });

describe("verificação de duplicidade", () => {
  it("consulta o que foi digitado e a forma canônica", () => {
    expect(variantesProtocolo("102005389")).toEqual(["102005389", "102-005-389"]);
    expect(variantesCpfCnpj("12345678901")).toEqual(["12345678901", "123.456.789-01"]);
    expect(variantesProtocolo("  ")).toEqual([]);
  });

  it("mesmo protocolo bloqueia, mesmo já finalizado e escrito de outro jeito", () => {
    const r = classificarDuplicados([linha({ id: "a", protocolo: "102-005-389", status: "FINALIZADO" })], form({ protocolo: "102005389" }));
    expect(r).toHaveLength(1);
    expect(r[0].motivo).toBe("protocolo");
    expect(bloqueia(r)).toBe(true);
  });

  it("mesmo CPF com chamado aberto só avisa", () => {
    const r = classificarDuplicados([linha({ id: "b", cpf_cnpj: "123.456.789-01", status: "EM ANDAMENTO" })], form({ cpfCnpj: "12345678901" }));
    expect(r[0].motivo).toBe("cpf");
    expect(bloqueia(r)).toBe(false);
  });

  it("mesmo CPF com chamado encerrado não conta", () => {
    const r = classificarDuplicados(
      [linha({ cpf_cnpj: "123.456.789-01", status: "FINALIZADO" }), linha({ id: "c", cpf_cnpj: "123.456.789-01", status: "SEM RETORNO" })],
      form({ cpfCnpj: "123.456.789-01" })
    );
    expect(r).toEqual([]);
  });

  it("protocolo diferente e sem CPF não acusa nada", () => {
    expect(classificarDuplicados([linha({ protocolo: "999-999-999" })], form({ protocolo: "102-005-389" }))).toEqual([]);
    expect(classificarDuplicados([linha({ cpf_cnpj: "" })], form({ protocolo: "102-005-389" }))).toEqual([]);
  });

  it("bloqueantes vêm antes dos avisos", () => {
    const r = classificarDuplicados(
      [linha({ id: "cpf", cpf_cnpj: "123.456.789-01", data_abertura: "2026-09-10T00:00:00Z" }), linha({ id: "prot", protocolo: "102-005-389", data_abertura: "2026-01-01T00:00:00Z" })],
      form({ protocolo: "102-005-389", cpfCnpj: "123.456.789-01" })
    );
    expect(r.map((d) => d.id)).toEqual(["prot", "cpf"]);
  });
});
