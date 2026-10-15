import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { escolherLeadDeVendas, FUNIL_VENDAS, leadDeVendasAberto } from "../../shared/kommo-funil.mjs";

const lead = (id, pipeline_id, status_id, updated_at) => ({ id, pipeline_id: Number(pipeline_id), status_id, updated_at });
const COBRANCAS = "12013803";
const POS_VENDA = "11901639";

describe("lead do funil de vendas", () => {
  it("escolhe o do funil de vendas entre leads de vários funis", () => {
    const leads = [lead(55113976, COBRANCAS, 1, 300), lead(55000001, FUNIL_VENDAS, 111891287, 100), lead(55000002, POS_VENDA, 1, 400)];
    assert.equal(escolherLeadDeVendas(leads).id, 55000001);
  });

  it("aberto vence fechado, mesmo sendo mais antigo; entre abertos, o mais recente", () => {
    const leads = [
      lead(1, FUNIL_VENDAS, 142, 900), // Fechado - ganho, recente
      lead(2, FUNIL_VENDAS, 92580715, 100),
      lead(3, FUNIL_VENDAS, 92580711, 200)
    ];
    assert.equal(escolherLeadDeVendas(leads).id, 3);
  });

  it("só fechados: o mais recente; nenhum no funil: null", () => {
    assert.equal(escolherLeadDeVendas([lead(1, FUNIL_VENDAS, 142, 10), lead(2, FUNIL_VENDAS, 143, 20)]).id, 2);
    assert.equal(escolherLeadDeVendas([lead(1, COBRANCAS, 1, 10)]), null);
    assert.equal(escolherLeadDeVendas([]), null);
  });

  it("caso Larissa: o lead da Etapa de suporte vence um lead antigo fechado", () => {
    const leads = [lead(18033773, FUNIL_VENDAS, 142, 100), lead(53279909, FUNIL_VENDAS, 105673331, 500)];
    assert.equal(escolherLeadDeVendas(leads).id, 53279909);
  });

  it("Etapa de suporte vence outro aberto; aberto vence fechado; empate, o mais recente", () => {
    const leads = [lead(1, FUNIL_VENDAS, 91552496, 900), lead(2, FUNIL_VENDAS, 105673331, 100), lead(3, FUNIL_VENDAS, 142, 999)];
    assert.equal(escolherLeadDeVendas(leads).id, 2);
    assert.equal(escolherLeadDeVendas([lead(1, FUNIL_VENDAS, 91552496, 900), lead(3, FUNIL_VENDAS, 142, 999)]).id, 1);
    assert.equal(escolherLeadDeVendas([lead(1, FUNIL_VENDAS, 91552496, 10), lead(4, FUNIL_VENDAS, 91552500, 20)]).id, 4);
  });

  it("leadDeVendasAberto: só vendas e fora de Fechado-ganho/perdido", () => {
    assert.equal(leadDeVendasAberto(lead(1, FUNIL_VENDAS, 91552496, 1)), true);
    assert.equal(leadDeVendasAberto(lead(1, FUNIL_VENDAS, 105673331, 1)), true);
    assert.equal(leadDeVendasAberto(lead(1, FUNIL_VENDAS, 142, 1)), false);
    assert.equal(leadDeVendasAberto(lead(1, FUNIL_VENDAS, 143, 1)), false);
    assert.equal(leadDeVendasAberto(lead(1, COBRANCAS, 1, 1)), false);
  });
});
