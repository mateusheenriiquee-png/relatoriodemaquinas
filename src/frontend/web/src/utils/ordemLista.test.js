import { describe, expect, it } from "vitest";
import { ordenarSuportes } from "./ordemLista";

const ids = (lista) => lista.map((r) => r.id);

describe("ordem da lista de suportes", () => {
  it("Em aberto: do mais antigo para o mais novo", () => {
    const lista = [
      { id: "novo", dataAbertura: "2026-10-07T12:00:00Z" },
      { id: "velho", dataAbertura: "2026-10-05T12:00:00Z" },
      { id: "meio", dataAbertura: "2026-10-06T12:00:00Z" }
    ];
    expect(ids(ordenarSuportes(lista, "EM ABERTO"))).toEqual(["velho", "meio", "novo"]);
  });

  it("Em andamento: mensagem nova do cliente leva o chamado para o topo", () => {
    const lista = [
      { id: "assumido-agora", dataAbertura: "2026-10-07T08:00:00Z", dataInicioAtendimento: "2026-10-07T10:00:00Z" },
      { id: "cliente-escreveu", dataAbertura: "2026-10-05T08:00:00Z", dataInicioAtendimento: "2026-10-05T09:00:00Z", ultimaMensagemClienteEm: "2026-10-07T11:00:00Z" },
      { id: "parado", dataAbertura: "2026-10-04T08:00:00Z", dataInicioAtendimento: "2026-10-04T09:00:00Z", ultimaMensagemClienteEm: "2026-10-04T12:00:00Z" }
    ];
    expect(ids(ordenarSuportes(lista, "EM ANDAMENTO"))).toEqual(["cliente-escreveu", "assumido-agora", "parado"]);
  });

  it("outras abas continuam do mais novo para o mais antigo, sem mexer na lista original", () => {
    const lista = [{ id: "a", dataAbertura: "2026-10-01T00:00:00Z" }, { id: "b", dataAbertura: "2026-10-03T00:00:00Z" }];
    expect(ids(ordenarSuportes(lista, "FINALIZADO"))).toEqual(["b", "a"]);
    expect(ids(ordenarSuportes(lista, "todos"))).toEqual(["b", "a"]);
    expect(ids(lista)).toEqual(["a", "b"]);
  });
});
