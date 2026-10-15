import { describe, expect, it, vi } from "vitest";

vi.mock("../../config/supabase", () => ({ supabase: {}, getApiBaseUrl: () => "" }));

const { acDoRegistro, aplicarFiltros, registroPassaNosFiltros } = await import("../suportesService");

/** Query builder falso: anota as chamadas para conferir o filtro mandado ao banco. */
function qbFalso() {
  const chamadas = [];
  const qb = new Proxy(
    {},
    { get: (_, nome) => (...args) => (chamadas.push([nome, ...args]), qb) }
  );
  return { qb, chamadas };
}

describe("filtros da lista (14/10)", () => {
  it("AC: campo AC ou, vazio, o Sistema gravado ao finalizar", () => {
    expect(acDoRegistro({ ac: "", sistema: "Consulti" })).toBe("CONSULTI");
    expect(acDoRegistro({ ac: "VALID", sistema: "Consulti" })).toBe("VALID");
    expect(acDoRegistro({})).toBe("");
  });

  it("filtro de AC no cliente aceita o Sistema e ignora maiúsculas", () => {
    const f = { ac: "CONSULTI" };
    expect(registroPassaNosFiltros({ ac: "", sistema: "Consulti" }, f)).toBe(true);
    expect(registroPassaNosFiltros({ ac: "", sistema: "Valid" }, f)).toBe(false);
    expect(registroPassaNosFiltros({ ac: "", sistema: "" }, f)).toBe(false);
    expect(registroPassaNosFiltros({ ac: "", sistema: "" }, { ac: "todos" })).toBe(true);
  });

  it("período no horário local: aberto às 22h fica no próprio dia", () => {
    const as22h = { dataAbertura: new Date(2026, 9, 13, 22, 0).toISOString() };
    expect(registroPassaNosFiltros(as22h, { dataInicio: "2026-10-13", dataFim: "2026-10-13" })).toBe(true);
    expect(registroPassaNosFiltros(as22h, { dataInicio: "2026-10-14" })).toBe(false);
    const meiaNoite = { dataAbertura: new Date(2026, 9, 14, 0, 0).toISOString() };
    expect(registroPassaNosFiltros(meiaNoite, { dataFim: "2026-10-13" })).toBe(false);
  });

  it("filtro de AC no banco olha ac OU sistema", () => {
    const { qb, chamadas } = qbFalso();
    aplicarFiltros(qb, { ac: "Consulti", tecnico: "todos" });
    expect(chamadas).toEqual([["or", "ac.ilike.Consulti,sistema.ilike.Consulti"]]);
  });
});
