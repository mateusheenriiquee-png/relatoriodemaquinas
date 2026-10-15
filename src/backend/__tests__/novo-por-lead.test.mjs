import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extrairLeadId, montarFormularioNovo, talkIdDosEventos } from "../../shared/novo-por-lead.mjs";

describe("novo suporte pelo lead", () => {
  it("lê o id do lead do número ou de qualquer link do Kommo", () => {
    assert.equal(extrairLeadId("55312356"), "55312356");
    assert.equal(extrairLeadId(" #55312356 "), "55312356");
    assert.equal(extrairLeadId("https://certifybrasil.kommo.com/leads/detail/55312356"), "55312356");
    assert.equal(
      extrairLeadId("https://certifybrasil.kommo.com/chats/35228/leads/detail/55312356?t=1790691103&tid=fb1f"),
      "55312356",
      "link da aba de chat (o que aparece no print)"
    );
    assert.equal(extrairLeadId("Noel"), "");
    assert.equal(extrairLeadId("123"), "");
  });

  it("acha a conversa mais recente nos eventos, em qualquer lugar do evento", () => {
    const eventos = [
      { created_at: 10, value_after: [{ message: { id: "a", talk_id: 111 } }] },
      { created_at: 30, value_after: [{ message: { id: "b", talk_id: "35228" } }] },
      { created_at: 20, value_after: [] }
    ];
    assert.equal(talkIdDosEventos(eventos), "35228");
    assert.equal(talkIdDosEventos([]), "");
  });

  it("monta o formulário: Kommo primeiro, IA completa e classifica", () => {
    const lead = {
      name: "Autolead: Noel", created_at: 1790000000,
      custom_fields_values: [{ field_name: "Tipo de Certificado", values: [{ value: "a1 pj" }] }]
    };
    const contato = {
      name: "Noel Guidicelli",
      custom_fields_values: [
        { field_code: "PHONE", values: [{ value: "+55 91 81428-257" }] },
        { field_code: "EMAIL", values: [{ value: "noel@exemplo.com" }] },
        { field_name: "Sistema", values: [{ value: "Consulti" }] },
        { field_name: "Doc. Cliente", values: [{ value: "51.712.299/0001-48" }] }
      ]
    };
    const ia = {
      motivo_cat: "instalação a1", tipo: "instalacao", resumo: "Não consegue acessar o sistema com o certificado.",
      descricao: "O cliente tentou acessar e recebeu erro.", uso_cat: "Acessar plataformas", uso_plat: "e-CAC",
      cpf_cnpj: "000.000.000-00", protocolo: "102-555-111", sistema: "Valid"
    };
    const { campos, dados, fontes } = montarFormularioNovo({ lead, contato, ia });
    assert.equal(campos.nomeCliente, "Noel Guidicelli");
    assert.equal(campos.contato, "+55 91 81428-257");
    assert.equal(campos.cpfCnpj, "51.712.299/0001-48", "documento do Kommo vence o da IA");
    assert.equal(campos.ac, "CONSULTI", "sistema do Kommo vence o da IA");
    assert.equal(campos.protocolo, "102-555-111", "sem protocolo no Kommo, a IA completa");
    assert.equal(fontes.protocolo, "ia");
    assert.equal(campos.tipo, "Instalação", "opção casada sem acento/caixa");
    assert.equal(campos.motivoCat, "Instalação A1");
    assert.equal(campos.usoCat, "Acessar plataformas");
    assert.equal(campos.usoPlat, "e-CAC");
    assert.equal(campos.descricao, "O cliente tentou acessar e recebeu erro.");
    assert.deepEqual(dados, { emailCliente: "noel@exemplo.com", tipoCertificado: "PJ A1" });
  });

  it("IA com opção inválida ou ausente não inventa campo", () => {
    const { campos } = montarFormularioNovo({ lead: { name: "X" }, ia: { motivo_cat: "Reclamação", tipo: "Venda", uso_cat: "Emitir nota fiscal" } });
    assert.equal(campos.motivoCat, undefined);
    assert.equal(campos.tipo, undefined);
    assert.equal(campos.usoCat, "Emitir nota fiscal");
    assert.equal(campos.usoPlat, undefined, "plataforma vazia não entra");
    assert.deepEqual(montarFormularioNovo({}).campos, {});
  });
});
