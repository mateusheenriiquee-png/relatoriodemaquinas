import { describe, expect, it, vi } from "vitest";
import { normalizeSearchText } from "../../utils/format";

vi.mock("../../config/firebase", () => ({ db: {}, getApiBaseUrl: () => "" }));

const { chaveNomeCliente } = await import("../suportesService");
const { lerArquivo } = await import("../importExportService");

function arquivoCsv(texto, nome = "planilha.csv") {
  return new File([texto], nome, { type: "text/csv" });
}

describe("chaveNomeCliente", () => {
  it("tira acento e caixa alta para o Firestore poder casar por prefixo", () => {
    expect(chaveNomeCliente("Afrânio Ribeiro")).toBe("afranio ribeiro");
    expect(chaveNomeCliente("DÉLIA CRISTINA")).toBe("delia cristina");
  });

  it("colapsa espaço extra, que o Firestore trataria como outro nome", () => {
    expect(chaveNomeCliente("  Bruno   Ramos  ")).toBe("bruno ramos");
  });

  it("devolve string vazia para nome ausente, nunca undefined", () => {
    // Um undefined aqui viraria campo faltando no documento e o registro
    // sumiria da consulta por prefixo em vez de só não casar.
    expect(chaveNomeCliente("")).toBe("");
    expect(chaveNomeCliente(null)).toBe("");
    expect(chaveNomeCliente(undefined)).toBe("");
  });

  it("é a mesma normalização que a tela aplica no termo digitado", () => {
    // Se as duas divergirem, quem digita "Délia" não acha "DÉLIA CRISTINA".
    for (const termo of ["Délia", "BRUNO ramos", " Afrânio "]) {
      expect(chaveNomeCliente(termo)).toBe(normalizeSearchText(termo));
    }
  });

  it("o termo digitado casa por prefixo com a chave gravada", () => {
    const chave = chaveNomeCliente("Délia Cristina Cardoso");
    expect(chave.startsWith(chaveNomeCliente("delia"))).toBe(true);
    expect(chave.startsWith(chaveNomeCliente("DÉLIA CRIS"))).toBe(true);
    expect(chave.startsWith(chaveNomeCliente("cristina"))).toBe(false); // prefixo, não trecho
  });
});

describe("importação grava a chave junto do nome", () => {
  const cabecalho = [
    "ID",
    "Lead título",
    "Lead venda R$",
    "Usuário responsável",
    "Criado em",
    "modificada em",
    "Fechado às",
    "Etapa do lead",
    "Funil de vendas",
    "Nome completo",
    "Pessoa de contato",
    "Telefone comercial",
    "Protocolo do Certificado",
    "Sistema"
  ].join(",");

  it("deriva nomeClienteKey do nome importado", async () => {
    const csv = [
      cabecalho,
      "1,Lead A,0,Suporte,02.09.2026 14:49:35,03.09.2026 10:00:00,não fechado,FINALIZADO,07 - Funil de Suporte,Afrânio Ribeiro,Yuri,+551199999,,"
    ].join("\n");

    const [r] = await lerArquivo(arquivoCsv(csv));

    expect(r.nomeCliente).toBe("Afrânio Ribeiro");
    expect(r.nomeClienteKey).toBe("afranio ribeiro");
  });

  it("não inventa a chave quando o registro não tem nome", async () => {
    // Layout sem coluna de cliente: nem nome nem chave devem ser gravados,
    // para o merge não sobrescrever o que já existe no documento.
    const csv = ["Protocolo;Status;Aberto em", "102-000-001;Encerrado com sucesso;12/08/2026 13:24"].join("\n");

    const [r] = await lerArquivo(arquivoCsv(csv));

    expect(r).not.toHaveProperty("nomeCliente");
    expect(r).not.toHaveProperty("nomeClienteKey");
  });
});
