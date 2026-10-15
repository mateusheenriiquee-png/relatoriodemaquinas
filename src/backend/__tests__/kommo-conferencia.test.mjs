import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { listasNaoGravadas } from "../admin-api.mjs";

describe("conferência depois de gravar no Kommo (08/10)", () => {
  const enviados = [
    { field_id: 1900726, values: [{ enum_id: 1643124 }] }, // Validade estendida: 1 ano
    { field_id: 1515443, values: [{ enum_id: 1293849 }] }, // Comprou Outro Produto?: Não
    { field_id: 2024054, values: [{ value: "33.891.390/0001-96" }] } // texto: não é conferido
  ];

  it("aponta as listas que o Kommo não guardou", () => {
    const contato = { custom_fields_values: [{ field_id: 1900726, values: [{ enum_id: 1643124, value: "1 ano" }] }] };
    assert.deepEqual(listasNaoGravadas(enviados, contato).map((c) => c.field_id), [1515443]);
  });

  it("tudo gravado → nada a refazer; ids como texto também casam", () => {
    const contato = { custom_fields_values: [
      { field_id: "1900726", values: [{ enum_id: "1643124" }] },
      { field_id: 1515443, values: [{ enum_id: 1293849 }] }
    ] };
    assert.deepEqual(listasNaoGravadas(enviados, contato), []);
  });

  it("entidade sem campos → todas as listas faltam", () => {
    assert.equal(listasNaoGravadas(enviados, {}).length, 2);
  });
});
