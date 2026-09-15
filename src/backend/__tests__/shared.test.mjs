import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildSupportRecordFromKommoLead } from "../../shared/kommo-mapper.js";
import { prepareWebhookRecords } from "../../shared/webhook-shared.js";

/* ------------------------------------------------------------ kommo-mapper */

// Mesmo formato do doc config/kommo no Firestore. 142/143 são os estágios
// fixos de ganho/perda em qualquer conta Kommo; o resto é específico da conta.
const CONFIG = {
  statusMap: { 55: "EM ANDAMENTO", 56: "FINALIZADO" },
  wonStatusIds: [142],
  lostStatusIds: [143],
  tecnicoTagMap: { Yuri: "Matheus" },
  turnoTagMap: { Manhã: "MANHA" }
};

describe("buildSupportRecordFromKommoLead", () => {
  it("usa o ID do lead como chave — a mesma que a importação por CSV usa", () => {
    // Se as duas divergirem, importar o CSV e depois receber o webhook do
    // mesmo lead cria dois chamados.
    const r = buildSupportRecordFromKommoLead({ id: 555 }, CONFIG);
    assert.equal(r.docId, "kommo_lead_555");
    assert.equal(r.fields.idempotencyKey, "kommo_lead_555");
    assert.equal(r.fields.origemIntegracao, "kommo");
  });

  it("estágio 142 vira venda ganha, com data de fechamento", () => {
    const fechadoEm = Math.floor(new Date("2026-09-02T14:00:00Z").getTime() / 1000);
    const r = buildSupportRecordFromKommoLead({ id: 1, status_id: 142, price: 85, closed_at: fechadoEm }, CONFIG);

    assert.equal(r.fields.vendaStatus, "GANHO");
    assert.equal(r.fields.valorVenda, 85);
    assert.equal(r.fields.dataFinalizacao, "2026-09-02T14:00:00.000Z");
  });

  it("estágio 143 vira venda perdida", () => {
    assert.equal(buildSupportRecordFromKommoLead({ id: 1, status_id: 143 }, CONFIG).fields.vendaStatus, "PERDIDO");
  });

  it("traduz o estágio do funil pelo statusMap da configuração", () => {
    const r = buildSupportRecordFromKommoLead({ id: 1, status_id: 55 }, CONFIG);
    assert.equal(r.fields.status, "EM ANDAMENTO");
    assert.equal(r.fields.vendaStatus, undefined);
  });

  it("estágio fora da configuração não inventa status", () => {
    const r = buildSupportRecordFromKommoLead({ id: 1, status_id: 999 }, CONFIG);
    assert.equal(r.fields.status, undefined);
  });

  it("acha técnico e turno pelas tags, sem ligar para acento e caixa", () => {
    const r = buildSupportRecordFromKommoLead(
      { id: 1, _embedded: { tags: [{ name: "yuri" }, { name: "MANHA" }] } },
      CONFIG
    );
    assert.equal(r.fields.tecnico, "MATHEUS");
    assert.equal(r.fields.turno, "MANHA");
  });

  it("preço zero é gravado (é um valor), preço ausente não é", () => {
    assert.equal(buildSupportRecordFromKommoLead({ id: 1, price: 0 }, CONFIG).fields.valorVenda, 0);
    assert.ok(!("valorVenda" in buildSupportRecordFromKommoLead({ id: 2 }, CONFIG).fields));
  });

  it("devolve null para lead sem ID", () => {
    assert.equal(buildSupportRecordFromKommoLead({ name: "sem id" }, CONFIG), null);
    assert.equal(buildSupportRecordFromKommoLead(null, CONFIG), null);
  });
});

/* ------------------------------------------------------------ webhook-shared */

describe("prepareWebhookRecords", () => {
  it("nunca leva o token do webhook para o registro", () => {
    const [r] = prepareWebhookRecords([{ protocolo: "102-005-389", token: "segredo" }]);
    assert.ok(!JSON.stringify(r).includes("segredo"));
  });

  it("descarta entradas vazias ou só com token", () => {
    const registros = prepareWebhookRecords([{}, { token: "x" }, null, "texto", { protocolo: "102-005-389" }]);
    assert.equal(registros.length, 1);
  });

  it("marca a origem de cada registro", () => {
    const [r] = prepareWebhookRecords([{ protocolo: "102-005-389" }], "formulario");
    assert.equal(r.fields.origemIntegracao, "formulario");
  });

  it("gera a mesma chave para o mesmo chamado — reenvio atualiza em vez de duplicar", () => {
    const [a] = prepareWebhookRecords([{ protocolo: "102-005-389", status: "aberto" }]);
    const [b] = prepareWebhookRecords([{ protocolo: "102-005-389", status: "aberto" }]);
    assert.equal(a.docId, b.docId);
  });
});
