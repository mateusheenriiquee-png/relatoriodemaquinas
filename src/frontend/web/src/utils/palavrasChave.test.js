import { describe, expect, it } from "vitest";
import { adicionarPalavras, limparLista, normalizarPalavra, removerPalavra } from "./palavrasChave";

describe("palavras-chave do chat (13/10)", () => {
  it("grava no formato que o n8n compara: sem acento, minúsculas, espaço único", () => {
    expect(normalizarPalavra("  Não  RECEBI! ")).toBe("nao recebi");
    expect(normalizarPalavra("Instalação")).toBe("instalacao");
    expect(normalizarPalavra("gov.br")).toBe("gov.br");
    expect(normalizarPalavra("E-CAC")).toBe("e-cac");
  });

  it("acrescenta várias de uma vez e conta repetidas e inválidas", () => {
    const r = adicionarPalavras(["chave", "token"], "Não achei, chave,  x , não localizo\nperdi o arquivo");
    expect(r.adicionadas).toEqual(["nao achei", "nao localizo", "perdi o arquivo"]);
    expect(r.repetidas).toEqual(["chave"]);
    expect(r.invalidas).toEqual(["x"]);
    expect(r.lista).toEqual(["chave", "token", "nao achei", "nao localizo", "perdi o arquivo"]);
  });

  it("não repete a mesma palavra digitada duas vezes na mesma entrada", () => {
    expect(adicionarPalavras([], "senha, Senha").lista).toEqual(["senha"]);
  });

  it("remove e limpa a lista vinda do banco", () => {
    expect(removerPalavra(["a1", "senha"], "senha")).toEqual(["a1"]);
    expect(limparLista(["Senha", "senha", "", "x", null, "Não Acho"])).toEqual(["senha", "nao acho"]);
    expect(limparLista(undefined)).toEqual([]);
  });
});
