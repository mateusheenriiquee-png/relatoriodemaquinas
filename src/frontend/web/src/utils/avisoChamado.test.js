import { describe, expect, it } from "vitest";
import { chamadosQueEntraram, RECENTE_MS, textoDoAviso } from "./avisoChamado";

const agora = Date.parse("2026-10-05T18:00:00Z");
const chamado = (id, extra = {}) => ({
  id,
  nomeCliente: `Cliente ${id}`,
  dataAbertura: new Date(agora - 60000).toISOString(),
  historico: [{ por: "Automação Kommo (IA)", texto: "Cliente pediu suporte" }],
  ...extra
});

describe("aviso de chamado novo", () => {
  it("avisa só o que não estava na lista anterior", () => {
    const novos = chamadosQueEntraram(new Set(["a"]), [chamado("a"), chamado("b")], { meuNome: "Henrique", agora });
    expect(novos.map((r) => r.id)).toEqual(["b"]);
    expect(novos[0].voltou).toBe(false);
  });

  it("não avisa o que a própria pessoa abriu ou devolveu para Em aberto", () => {
    const meu = chamado("c", { responsavelAbertura: "Henrique", historico: [{ por: "Henrique" }] });
    const devolvido = chamado("d", { historico: [{ por: "Kommo" }, { por: "henrique", texto: "Status: EM ANDAMENTO → EM ABERTO" }] });
    expect(chamadosQueEntraram(new Set(), [meu, devolvido], { meuNome: "Henrique", agora })).toEqual([]);
  });

  it("chamado antigo de volta para Em aberto (ex.: reagendado vencido) é 'voltou'", () => {
    const antigo = chamado("e", { dataAbertura: new Date(agora - RECENTE_MS - 60000).toISOString() });
    const [r] = chamadosQueEntraram(new Set(), [antigo], { meuNome: "Henrique", agora });
    expect(r.voltou).toBe(true);
    expect(textoDoAviso([r]).titulo).toBe("Chamado voltou para Em aberto");
  });

  it("texto para um e para vários", () => {
    expect(textoDoAviso([{ nomeCliente: "Maria", motivoCat: "Instalação A1", voltou: false }])).toEqual({
      titulo: "Novo chamado em aberto",
      corpo: "Maria · Instalação A1"
    });
    const varios = textoDoAviso(["A", "B", "C", "D"].map((n) => ({ nomeCliente: n })));
    expect(varios.titulo).toBe("4 chamados em aberto chegaram");
    expect(varios.corpo).toBe("A, B, C…");
    expect(textoDoAviso([])).toBeNull();
  });
});
