import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  sistemaDoProtocolo,
  extrairDaConversa,
  lerCamposKommo,
  montarPrefill,
  normalizarTipo,
  unixParaDia
} from "../../shared/prefill-finalizacao.mjs";
import { diaParaUnix } from "../../shared/kommo-campos.mjs";

// custom_fields_values como o Kommo devolve em GET /leads/{id} e /contacts/{id}.
const campo = (field_name, value, field_type = "text", extra = {}) => ({
  field_id: Math.floor(Math.random() * 1e6),
  field_name,
  field_type,
  values: [{ value, ...extra }],
  ...(field_type === "multitext" ? {} : {})
});

const CRIADO_EM = diaParaUnix("2026-09-20"); // lead criado em 20/09/2026

// Mensagens-modelo reais da Certify (prints de 2026-09-28).
const MSG_PF_A1 = "Olá! Seu pedido está em verificação final.\nCertificado: *PF A1* ✅\nPedido: 102-856-427\nAcompanhe em https://sigar.consultibrasilpss.com.br";
const MSG_NUVEM = "*Certificado PF A3 EM NUVEM ✅*\nProtocolo - 1001551590\nSenha - Enviada por e-mail";

describe("prefill — leitura do Kommo", () => {
  it("datas unix viram o dia de Brasília, e voltam ao mesmo dia que o painel grava", () => {
    assert.equal(unixParaDia(diaParaUnix("2026-09-24")), "2026-09-24");
    assert.equal(unixParaDia(1790262000), "2026-09-24"); // 24/09 12:00 BRT
    assert.equal(unixParaDia(0), "");
  });

  it("tipo em qualquer grafia vira o formato da Certify", () => {
    assert.equal(normalizarTipo("A1 PJ"), "PJ A1");
    assert.equal(normalizarTipo("e-CPF A3"), "PF A3");
    assert.equal(normalizarTipo("pf a3 nuvem"), "PF A3 EM NUVEM");
    assert.equal(normalizarTipo("Certificado: *PF A1*"), "PF A1");
    assert.equal(normalizarTipo("algo estranho"), "algo estranho");
  });

  it("contato real: lê cada tipo de campo pelo nome", () => {
    const contato = {
      custom_fields_values: [
        campo("Protocolo do Certificado", "47325441960"),
        campo("Data de Emissão do Certificado", diaParaUnix("2026-09-24"), "date"),
        campo("Data de Vencimento do Certificado", diaParaUnix("2027-09-24"), "date"),
        campo("Tipo de Certificado", "A1 PJ"),
        campo("Valor", "109,90"),
        campo("Valor V.E", "49.9", "numeric"),
        campo("Validade estendida", "2 anos", "multiselect", { enum_id: 1643126 }),
        campo("Comprou Outro Produto?", "Não", "radiobutton", { enum_id: 1293849 }),
        campo("Sistema", "Consulti", "select", { enum_id: 1757488 }),
        campo("Doc. Cliente", "054.623.245-02")
      ]
    };
    assert.deepEqual(lerCamposKommo(contato), {
      protocoloCertificado: "47325441960",
      cpfCnpj: "054.623.245-02",
      tipoCertificado: "PJ A1",
      dataEmissao: "2026-09-24",
      dataVencimento: "2027-09-24",
      valor: 109.9,
      valorVE: 49.9,
      validadeEstendida: "2 anos",
      comprouOutroProduto: false,
      sistema: "Consulti"
    });
  });

  it("CPF numérico do lead recupera o zero à esquerda; documento inválido é ignorado", () => {
    assert.equal(lerCamposKommo({ custom_fields_values: [campo("CPF", "5462324502", "numeric")] }).cpfCnpj, "054.623.245-02");
    assert.equal(lerCamposKommo({ custom_fields_values: [campo("CPF", "12345678900", "numeric")] }).cpfCnpj, undefined);
  });
});

describe("prefill — conversa", () => {
  const msgs = (...pares) => pares.map(([type, text], i) => ({ created_at: CRIADO_EM + i * 3600, type, text }));

  it("CNPJ da própria Certify (mensagem-modelo) nunca vira documento do cliente", () => {
    const r = extrairDaConversa(msgs(["outgoing", "Pagamento via PIX\nCertify Certificadora\nCNPJ 57.983.065/0001-11"], ["incoming", "ok"]));
    assert.equal(r.exatos.cpfCnpj, null);
    const doCliente = extrairDaConversa(msgs(["outgoing", "CNPJ 57.983.065/0001-11"], ["incoming", "o meu é 11.222.333/0001-81"]));
    assert.equal(doCliente.exatos.cpfCnpj, "11.222.333/0001-81");
  });

  it("modelos da Certify: protocolo, tipo e sistema pelo link", () => {
    const r = extrairDaConversa(msgs(["outgoing", MSG_PF_A1]));
    assert.equal(r.exatos.protocoloCertificado, "102-856-427");
    assert.equal(r.exatos.tipoCertificado, "PF A1");
    assert.equal(r.sugeridos.sistema, "Consulti");
    assert.equal(r.sugeridos.dataEmissao, "2026-09-20", "dia da mensagem de entrega");
  });

  it("a mensagem mais recente vence", () => {
    const r = extrairDaConversa(msgs(["outgoing", MSG_PF_A1], ["outgoing", MSG_NUVEM]));
    assert.equal(r.exatos.protocoloCertificado, "1001551590");
    assert.equal(r.exatos.tipoCertificado, "PF A3 EM NUVEM");
  });

  it("valor só de mensagem que fala de pagamento; datas explícitas", () => {
    const r = extrairDaConversa(msgs(
      ["outgoing", "O A1 sai por R$ 199,80"],
      ["incoming", "Fiz o pix de R$ 199,80, segue o comprovante"],
      ["outgoing", "Certificado emitido em 24/09/2026, válido até 24/09/2027"]
    ));
    assert.equal(r.sugeridos.valor, 199.8);
    assert.equal(r.exatos.dataEmissao, "2026-09-24");
    assert.equal(r.exatos.dataVencimento, "2027-09-24");
    assert.equal(extrairDaConversa(msgs(["outgoing", "O A1 sai por R$ 199,80"])).sugeridos.valor, null, "cotação não é pagamento");
  });

  it("conversa real (Rodrigo, 28/09): resposta ao modelo de documentação da Certify", () => {
    const r = extrairDaConversa(msgs(
      ["outgoing", "Documentação necessária PESSOA JURÍDICA:\n• Foto da CNH\n• E-mail (em nome do Sócio Administrativo)\n• Número do CNPJ\n• Número de Celular para contato do cliente (com DDD)"],
      ["incoming", "- digocarneiro01@hotmail.com\n- 51712299000148\n- (11) 991155429"]
    ));
    assert.equal(r.exatos.cpfCnpj, "51.712.299/0001-48", "CNPJ válido sem pontuação");
    assert.equal(r.exatos.emailCliente, "digocarneiro01@hotmail.com");
  });

  it("CPF sem pontuação vale se a mensagem anterior pediu; e-mail da Certify não conta", () => {
    const r = extrairDaConversa(msgs(["outgoing", "Me envia o seu CPF, por favor"], ["incoming", "05462324502"]));
    assert.equal(r.exatos.cpfCnpj, "054.623.245-02");
    const e = extrairDaConversa(msgs(["outgoing", "Qualquer dúvida: suporte@certifybrasil.com.br"], ["incoming", "ok"]));
    assert.equal(e.exatos.emailCliente, null, "e-mail do atendente/da Certify não é do cliente");
  });

  it("CPF só com a palavra CPF ou formatado; telefone não vira CPF", () => {
    assert.equal(extrairDaConversa(msgs(["incoming", "meu cpf é 05462324502"])).exatos.cpfCnpj, "054.623.245-02");
    assert.equal(extrairDaConversa(msgs(["incoming", "me liga 05462324502"])).exatos.cpfCnpj, null);
  });
});

describe("prefill — junta tudo", () => {
  it("lead vence o contato; contato de compra antiga não entra nos dados do certificado", () => {
    const lead = { created_at: CRIADO_EM, price: 199.8, custom_fields_values: [campo("Protocolo do Certificado", "102-000-111")] };
    const contatoAntigo = {
      custom_fields_values: [
        campo("Protocolo do Certificado", "999-999-999"),
        campo("Data de Emissão do Certificado", diaParaUnix("2024-05-01"), "date"),
        campo("Sistema", "Valid", "select"),
        campo("Doc. Cliente", "054.623.245-02")
      ]
    };
    const { campos } = montarPrefill({ lead, contato: contatoAntigo });
    assert.deepEqual(campos.protocoloCertificado, { valor: "102-000-111", fonte: "kommo", sugerido: false });
    assert.equal(campos.dataEmissao, undefined, "data de 2024 é de outra compra");
    // Até 14/10 o "Valid" da compra antiga vencia: protocolo Consulti saía como Valid.
    assert.deepEqual(campos.sistema, { valor: "Consulti", fonte: "dedução", sugerido: true }, "o formato do protocolo vence o Sistema antigo do contato");
    assert.equal(campos.cpfCnpj.valor, "054.623.245-02", "documento é do cliente, vale sempre");
    assert.deepEqual(campos.valor, { valor: 199.8, fonte: "kommo", sugerido: true }, "preço do lead é sugestão");
  });

  it("Sistema (14/10): formato do protocolo; contato antigo não entra; contato atual sem protocolo vale", () => {
    assert.equal(sistemaDoProtocolo("103-023-828"), "Consulti");
    assert.equal(sistemaDoProtocolo("1001552089"), "Consulti", "A3 em nuvem");
    assert.equal(sistemaDoProtocolo("62109827044"), "Valid", "ticket da Valid");
    assert.equal(sistemaDoProtocolo("12345"), "");
    assert.equal(sistemaDoProtocolo("ABC-123"), "");
    assert.equal(sistemaDoProtocolo(""), "");

    const lead = { created_at: CRIADO_EM };
    const contato = (data) => ({
      custom_fields_values: [campo("Sistema", "Valid", "select"), campo("Data de Emissão do Certificado", diaParaUnix(data), "date")]
    });
    assert.equal(montarPrefill({ lead, contato: contato("2024-05-01") }).campos.sistema, undefined, "Sistema de compra antiga não entra");
    assert.deepEqual(montarPrefill({ lead, contato: contato("2026-09-21") }).campos.sistema, { valor: "Valid", fonte: "kommo", sugerido: false });

    const comLead = { created_at: CRIADO_EM, custom_fields_values: [campo("Sistema", "Soluti", "select"), campo("Protocolo do Certificado", "102-000-111")] };
    assert.equal(montarPrefill({ lead: comLead }).campos.sistema.valor, "Soluti", "o Sistema marcado no lead (desta venda) vale mais");
  });

  it("vencimento deduzido: emissão + Validade do lead; A1 = 1 ano", () => {
    const lead = { created_at: CRIADO_EM, custom_fields_values: [campo("Validade", "3 anos", "radiobutton")] };
    const mensagens = [{ created_at: CRIADO_EM, type: "outgoing", text: MSG_NUVEM }];
    const { campos } = montarPrefill({ lead, mensagens });
    assert.deepEqual(campos.dataEmissao, { valor: "2026-09-20", fonte: "conversa", sugerido: true });
    assert.deepEqual(campos.dataVencimento, { valor: "2029-09-20", fonte: "dedução", sugerido: true });

    const a1 = montarPrefill({ lead: { created_at: CRIADO_EM }, mensagens: [{ created_at: CRIADO_EM, type: "outgoing", text: MSG_PF_A1 }] });
    assert.equal(a1.campos.dataVencimento.valor, "2027-09-20");
  });

  it("email vem do contato; sem nada, nada", () => {
    const contato = { custom_fields_values: [{ field_code: "EMAIL", field_name: "O email", values: [{ value: "nur@lojanomad.com" }] }] };
    assert.equal(montarPrefill({ contato }).campos.emailCliente.valor, "nur@lojanomad.com");
    assert.deepEqual(montarPrefill({}).campos, {});
  });
});

describe("prefill — CPF próprio (08/10)", () => {
  const msgs = (...pares) => pares.map(([type, text], i) => ({ created_at: CRIADO_EM + i * 3600, type, text }));

  it("Kommo: campo CPF numérico (sem o zero) vira CPF formatado; CNPJ fica no Doc. Cliente", () => {
    const r = lerCamposKommo({ custom_fields_values: [campo("CPF", "5462324502", "numeric"), campo("Doc. Cliente", "33.891.390/0001-96")] });
    assert.equal(r.cpf, "054.623.245-02");
    assert.equal(r.cpfCnpj, "33.891.390/0001-96");
  });

  it("conversa de PJ: pega o CNPJ no Doc. Cliente e o CPF do sócio no CPF", () => {
    const r = extrairDaConversa(msgs(["incoming", "CNPJ 33.891.390/0001-96"], ["outgoing", "Agora o CPF do sócio"], ["incoming", "52998224725"]));
    assert.equal(r.exatos.cpf, "529.982.247-25");
    assert.equal(r.exatos.cpfCnpj, "529.982.247-25"); // a mais recente; o CNPJ também está na conversa
  });

  it("11 dígitos soltos, sem falar de CPF, não viram CPF (pode ser telefone)", () => {
    assert.equal(extrairDaConversa(msgs(["incoming", "me liga no 52998224725"])).exatos.cpf, null);
  });

  it("Doc. Cliente que é CPF preenche o CPF também", () => {
    const { campos } = montarPrefill({ lead: { custom_fields_values: [campo("Doc. Cliente", "529.982.247-25")] } });
    assert.equal(campos.cpf?.valor, "529.982.247-25");
    assert.equal(campos.cpf?.fonte, "kommo");
  });
});

describe("prefill — modelos reais de emissão concluída (09/10)", () => {
  const um = (text) => extrairDaConversa([{ created_at: CRIADO_EM, type: "outgoing", text }]);

  it("Consulti: Pedido, tipo e sistema pelo link", () => {
    const r = um("Sua emissão foi concluída com sucesso!\n \nSegue abaixo o link para emissão Via Web e Nº do Pedido:\nhttps://sigar.consultibrasilpss.com.br/issue?o=\n \n*Certificado PJ A1✅*\nPedido - 102-994-277\n \nChave de Emissão - Enviada por e-mail e SMS");
    assert.equal(r.exatos.protocoloCertificado, "102-994-277");
    assert.equal(r.exatos.tipoCertificado, "PJ A1");
    assert.equal(r.sugeridos.sistema, "Consulti");
    assert.ok(r.sugeridos.dataEmissao);
  });

  it("A3 em nuvem: Protocolo e tipo", () => {
    const r = um("*Sua emissão foi concluída com sucesso!*\n \n*Certificado PF A3 EM NUVEM ✅*\nProtocolo - 1001552089\nSenha - Enviada por e-mail");
    assert.equal(r.exatos.protocoloCertificado, "1001552089");
    assert.equal(r.exatos.tipoCertificado, "PF A3 EM NUVEM");
  });

  it("Valid: o Número do Ticket é o protocolo", () => {
    const r = um("Sua emissão foi concluída com sucesso!\n \nSegue abaixo o link para emissão Via Web e Nº do Ticket:\nhttps://validcertificadora.com.br/pages/emissao-do-certificado-a1-windows\n \n*Certificado e-PJ A1✅*\nNúmero do Ticket - 62109827044\n \nSenha - Criada pelo cliente ao acessar a videoconferência");
    assert.equal(r.exatos.protocoloCertificado, "62109827044");
    assert.equal(r.exatos.tipoCertificado, "PJ A1");
    assert.equal(r.sugeridos.sistema, "Valid");
  });
});

