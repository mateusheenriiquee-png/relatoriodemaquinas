import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  acharCampo,
  chaveNome,
  contatoTemEmail,
  diaParaUnix,
  montarCamposKommo,
  opcoesFinalizacao
} from "../../shared/kommo-campos.mjs";

// Definições no formato de GET /api/v4/leads/custom_fields (nomes como no card do lead).
const DEFINICOES = [
  { id: 1, name: "Protocolo do Certificado", type: "text" },
  { id: 2, name: "Doc. Cliente", type: "text" },
  { id: 3, name: "Tipo de Certificado", type: "select", enums: [
    { id: 31, value: "PF A1", sort: 1 }, { id: 32, value: "PF A3 EM NUVEM", sort: 2 }
  ] },
  { id: 4, name: "Data de Emissão", type: "date" },
  { id: 5, name: "Data de Vencimento", type: "date" },
  { id: 6, name: "Valor", type: "text" },
  { id: 7, name: "Valor V.E", type: "numeric" },
  { id: 8, name: "Validade estendida", type: "select", enums: [
    { id: 82, value: "2 anos", sort: 2 }, { id: 81, value: "1 ano", sort: 1 }
  ] },
  { id: 9, name: "Comprou Outro", type: "radiobutton", enums: [{ id: 91, value: "Sim" }, { id: 92, value: "Não" }] },
  { id: 10, name: "Sistema", type: "select", enums: [{ id: 101, value: "Consulti" }] }
];

const LINHA = {
  protocolo_certificado: "102-856-427",
  cpf_cnpj: "123.456.789-09",
  tipo_certificado: "pf a1",
  data_emissao: "2026-08-28",
  data_vencimento: "2027-08-28",
  valor_venda: 109.9,
  valor_ve: 49.9,
  validade_estendida: "2 anos",
  comprou_outro_produto: false,
  sistema: "Consulti"
};

const valorDe = (campos, id) => campos.find((c) => c.field_id === id)?.values[0];

describe("Kommo — campos da finalização", () => {
  it("nome do campo casa sem acento, caixa ou pontuação", () => {
    assert.equal(chaveNome("Doc. Cliente"), "doccliente");
    assert.equal(acharCampo(DEFINICOES, ["Data de Emissao"]).id, 4);
    assert.equal(acharCampo(DEFINICOES, ["Não existe", "valor ve"]).id, 7);
    assert.equal(acharCampo(DEFINICOES, ["Não existe"]), null);
  });

  it("data vira unix ao meio-dia de Brasília (não volta um dia)", () => {
    const unix = diaParaUnix("2026-08-28");
    assert.equal(new Date(unix * 1000).toISOString(), "2026-08-28T15:00:00.000Z");
    assert.equal(diaParaUnix(""), null);
  });

  it("monta cada tipo de campo no formato do Kommo", () => {
    const { campos, ignorados } = montarCamposKommo(LINHA, DEFINICOES);
    assert.deepEqual(ignorados, []);
    assert.deepEqual(valorDe(campos, 1), { value: "102-856-427" });
    assert.deepEqual(valorDe(campos, 2), { value: "123.456.789-09" });
    assert.deepEqual(valorDe(campos, 3), { enum_id: 31 }, "lista casa a opção pelo texto");
    assert.deepEqual(valorDe(campos, 4), { value: diaParaUnix("2026-08-28") });
    assert.deepEqual(valorDe(campos, 6), { value: "109,90" }, "valor em campo de texto vai no formato brasileiro");
    assert.deepEqual(valorDe(campos, 7), { value: 49.9 });
    assert.deepEqual(valorDe(campos, 8), { enum_id: 82 });
    assert.deepEqual(valorDe(campos, 9), { enum_id: 92 }, "'Não' é resposta, não vazio");
    assert.deepEqual(valorDe(campos, 10), { enum_id: 101 });
  });

  it("vazio no painel não apaga nada no Kommo", () => {
    const { campos, ignorados } = montarCamposKommo(
      { ...LINHA, valor_ve: null, comprou_outro_produto: null, sistema: "" },
      DEFINICOES
    );
    assert.equal(valorDe(campos, 7), undefined);
    assert.equal(valorDe(campos, 9), undefined);
    assert.equal(valorDe(campos, 10), undefined);
    assert.deepEqual(ignorados, []);
  });

  it("campo ou opção que não existe no Kommo vira aviso com o motivo, não erro", () => {
    const semValorVE = DEFINICOES.filter((d) => d.id !== 7);
    const { campos, ignorados } = montarCamposKommo({ ...LINHA, sistema: "Outro AC" }, semValorVE);
    assert.deepEqual(ignorados.sort(), [
      'Sistema: opção "Outro AC" não existe (opções: Consulti)',
      "Valor V.E: campo não encontrado no Kommo"
    ]);
    assert.equal(campos.length, 8);
  });

  it("campo numérico recusando texto explica o tipo", () => {
    const docNumerico = DEFINICOES.map((d) => (d.id === 2 ? { ...d, type: "numeric" } : d));
    const { ignorados } = montarCamposKommo(LINHA, docNumerico);
    assert.deepEqual(ignorados, ['Doc. Cliente: valor "123.456.789-09" não serve para campo do tipo numeric']);
  });

  it("nomes repetidos: grava no primeiro campo que aceita o valor", () => {
    const repetido = [{ id: 99, name: "Sistema", type: "select", enums: [{ id: 991, value: "Safeweb" }] }, ...DEFINICOES];
    const { campos, ignorados } = montarCamposKommo(LINHA, repetido);
    assert.deepEqual(valorDe(campos, 10), { enum_id: 101 });
    assert.equal(valorDe(campos, 99), undefined);
    assert.deepEqual(ignorados, []);
    assert.deepEqual(opcoesFinalizacao(repetido).sistema, ["Safeweb"], "opções: o primeiro campo de lista com esse nome");
  });

  it("opções das listas saem na ordem do Kommo; campo de texto fica de fora", () => {
    assert.deepEqual(opcoesFinalizacao(DEFINICOES), {
      tipo_certificado: ["PF A1", "PF A3 EM NUVEM"],
      validade_estendida: ["2 anos", "1 ano"], // ordem da API, não do `sort`
      sistema: ["Consulti"]
    });
  });

  it("conta real: cada dado vai para o lead, para o contato, ou para os dois", () => {
    // Campos de LEAD reais (GET /api/v4/leads/custom_fields, 2026-09-28), resumidos.
    const LEAD_REAL = [
      { id: 2070484, name: "Tipo de Certificado", type: "text" },
      { id: 2070486, name: "E-mail", type: "text" },
      { id: 2070488, name: "Data de Emissão", type: "date" },
      { id: 2070490, name: "Data de Vencimento", type: "date" },
      { id: 2070492, name: "Protocolo do Certificado", type: "text" },
      { id: 2070498, name: "Validade", type: "radiobutton", enums: [{ id: 1811884, value: "1 ano" }] },
      { id: 2070500, name: "Comprou Outro Produto", type: "radiobutton", enums: [{ id: 1811894, value: "Sim" }, { id: 1811896, value: "Não" }] },
      { id: 2073360, name: "Sistema Operacional", type: "text" },
      { id: 2073970, name: "CNPJ", type: "text" },
      { id: 2073980, name: "CPF", type: "numeric" },
      { id: 2074772, name: "Tipo de Certificado", type: "text" }
    ];
    // Campos de CONTATO reais (GET /api/v4/contacts/custom_fields, 2026-09-28), resumidos.
    const CONTATO = [
      { id: 1515317, name: "Valor", type: "text" },
      { id: 1515319, name: "Tipo de Certificado", type: "text" },
      { id: 1515421, name: "Data de Emissão do Certificado", type: "date" },
      { id: 1515422, name: "Data de Vencimento do Certificado", type: "date" },
      { id: 1515423, name: "Protocolo do Certificado", type: "text" },
      { id: 1515443, name: "Comprou Outro Produto?", type: "radiobutton", enums: [{ id: 1293847, value: "Sim" }, { id: 1293849, value: "Não" }] },
      { id: 1900726, name: "Validade estendida", type: "multiselect", enums: [
        { id: 1643124, value: "1 ano", sort: 500 }, { id: 1643126, value: "2 anos", sort: 1 }, { id: 1643128, value: "3 anos", sort: 2 }
      ] },
      { id: 2019058, name: "Sistema", type: "select", enums: [
        { id: 1757486, value: "Soluti", sort: 500 }, { id: 1757488, value: "Consulti", sort: 1 }, { id: 1803446, value: "Valid", sort: 2 }
      ] },
      { id: 2024054, name: "Doc. Cliente", type: "text" },
      { id: 2024220, name: "CPF", type: "text" },
      { id: 2073619, name: "Valor V.E", type: "numeric" }
    ];
    // Chamado real finalizado em 2026-09-28 (lead 55043462).
    const linha = {
      protocolo_certificado: "47325441960", cpf_cnpj: "054.623.245-02", tipo_certificado: "A1 PJ",
      data_emissao: "2026-09-24", data_vencimento: "2027-09-24", valor_venda: 80, valor_ve: 0,
      validade_estendida: "1 ano", comprou_outro_produto: false, sistema: "Valid",
      email_cliente: "oraequipamentosutilidades@gmail.com"
    };
    const { campos, camposContato, ignorados } = montarCamposKommo(linha, LEAD_REAL, CONTATO);

    assert.deepEqual(ignorados, []);
    assert.deepEqual(valorDe(campos, 2070484), { value: "A1 PJ" }, "Tipo: o primeiro dos dois campos de mesmo nome");
    assert.equal(valorDe(campos, 2074772), undefined);
    assert.deepEqual(valorDe(campos, 2073980), { value: "05462324502" }, "CPF numérico mantém o zero à esquerda");
    assert.equal(valorDe(campos, 2073970), undefined, "CPF não vai para o campo CNPJ");
    assert.deepEqual(valorDe(campos, 2070486), { value: "oraequipamentosutilidades@gmail.com" });
    assert.deepEqual(valorDe(campos, 2070500), { enum_id: 1811896 });
    assert.equal(valorDe(campos, 2070498), undefined, "'Validade' do lead é a do certificado, não a estendida");
    assert.equal(valorDe(campos, 2073360), undefined, "'Sistema Operacional' não é 'Sistema'");

    assert.deepEqual(valorDe(camposContato, 2024054), { value: "054.623.245-02" });
    assert.deepEqual(valorDe(camposContato, 2024220), { value: "054.623.245-02" }, "CPF de texto do contato, formatado");
    assert.deepEqual(valorDe(camposContato, 1515317), { value: "80,00" });
    assert.equal(valorDe(camposContato, 2073619), undefined, "V.E zerado não é gravado");
    assert.deepEqual(valorDe(camposContato, 1900726), { enum_id: 1643124 });
    assert.deepEqual(valorDe(camposContato, 2019058), { enum_id: 1803446 });
    assert.deepEqual(valorDe(camposContato, 1515443), { enum_id: 1293849 }, "'Comprou Outro Produto?' com interrogação");
    assert.deepEqual(valorDe(camposContato, 1515421), { value: diaParaUnix("2026-09-24") }, "Data de Emissão do Certificado");
    assert.deepEqual(valorDe(camposContato, 1515422), { value: diaParaUnix("2027-09-24") }, "Data de Vencimento do Certificado");
    assert.deepEqual(valorDe(camposContato, 1515319), { value: "A1 PJ" });
    assert.deepEqual(valorDe(camposContato, 1515423), { value: "47325441960" });
    assert.deepEqual(valorDe(campos, 2070488), { value: diaParaUnix("2026-09-24") }, "e a data também no lead");

    // Valor V.E preenchido vai como número no campo numérico do contato.
    const comVE = montarCamposKommo({ ...linha, valor_ve: 49.9 }, LEAD_REAL, CONTATO);
    assert.deepEqual(valorDe(comVE.camposContato, 2073619), { value: 49.9 });

    // CNPJ vai para o campo CNPJ do lead; sem contato, os campos do contato viram aviso.
    const semContato = montarCamposKommo({ ...linha, cpf_cnpj: "11222333000181" }, LEAD_REAL, []);
    assert.deepEqual(valorDe(semContato.campos, 2073970), { value: "11.222.333/0001-81" });
    assert.deepEqual(semContato.ignorados.map((i) => i.split(":")[0]), ["Doc. Cliente", "Valor", "Validade estendida", "Sistema"]);

    assert.deepEqual(opcoesFinalizacao(LEAD_REAL, CONTATO), {
      validade_estendida: ["1 ano", "2 anos", "3 anos"],
      sistema: ["Soluti", "Consulti", "Valid"]
    });
  });

  it("contato com email é detectado para não sobrescrever", () => {
    assert.equal(contatoTemEmail({ custom_fields_values: [{ field_code: "EMAIL", values: [{ value: "a@a.com" }] }] }), true);
    assert.equal(contatoTemEmail({ custom_fields_values: [{ field_code: "PHONE", values: [{ value: "48" }] }] }), false);
    assert.equal(contatoTemEmail({}), false);
  });
});

describe("Kommo — CPF próprio da tela (08/10)", () => {
  const DEFS_LEAD = [{ id: 50, name: "CPF", type: "numeric" }, { id: 51, name: "CNPJ", type: "text" }, { id: 2, name: "Doc. Cliente", type: "text" }];
  const DEFS_CONTATO = [{ id: 60, name: "CPF", type: "text" }, { id: 2, name: "Doc. Cliente", type: "text" }];
  const valorDe = (lista, id) => lista.find((c) => c.field_id === id)?.values?.[0]?.value;

  it("certificado PJ: CNPJ no Doc. Cliente/CNPJ e o CPF da tela no campo CPF", () => {
    const r = montarCamposKommo({ cpf_cnpj: "33.891.390/0001-96", cpf: "529.982.247-25" }, DEFS_LEAD, DEFS_CONTATO);
    assert.equal(valorDe(r.campos, 51), "33.891.390/0001-96");
    assert.equal(valorDe(r.campos, 50), "52998224725"); // numérico: só dígitos, com zero à esquerda preservado
    assert.equal(valorDe(r.camposContato, 60), "529.982.247-25");
    assert.equal(valorDe(r.camposContato, 2), "33.891.390/0001-96");
  });

  it("sem CPF na tela, o Doc. Cliente que é CPF continua indo para o campo CPF", () => {
    const r = montarCamposKommo({ cpf_cnpj: "054.623.245-02", cpf: "" }, DEFS_LEAD, DEFS_CONTATO);
    assert.equal(valorDe(r.campos, 50), "05462324502");
    assert.equal(valorDe(r.camposContato, 60), "054.623.245-02");
  });
});
