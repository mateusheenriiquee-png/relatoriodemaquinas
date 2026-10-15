/**
 * prefill-finalizacao.mjs — monta sugestões para a tela "Finalizar suporte" a
 * partir do que já existe fora do painel: campos do lead e do contato no
 * Kommo, e o texto da conversa do chat. É o caminho inverso de
 * kommo-campos.mjs (que grava painel -> Kommo).
 *
 * Nada aqui grava coisa alguma: só devolve `{ campo: { valor, fonte, sugerido } }`
 * para a tela preencher os campos VAZIOS. O técnico confere e, ao finalizar,
 * o que ficou na tela é o que vai para o banco e para o Kommo — como sempre.
 *
 * Ordem de confiança: lead > contato > conversa (regra fixa) > dedução.
 * `sugerido: true` marca o que foi deduzido, e não lido literalmente — a tela
 * mostra "sugerido — confira".
 *
 * ESM puro, sem dependências: o Worker e os testes importam o mesmo arquivo.
 */

import { chaveNome } from "./kommo-campos.mjs";

/**
 * Campo da tela -> nomes do campo no Kommo (lead e contato, lista real de
 * 2026-09-28). Mesmos nomes de MAPA_FINALIZACAO, no sentido inverso.
 */
const NOMES_KOMMO = {
  protocoloCertificado: ["Protocolo do Certificado", "Protocolo"],
  cpfCnpj: ["Doc. Cliente", "Doc Cliente", "CPF/CNPJ", "Documento", "CPF", "CNPJ"],
  // CPF da pessoa (desde 08/10): "CPF" é numérico no lead e texto no contato.
  cpf: ["CPF"],
  tipoCertificado: ["Tipo de Certificado", "Tipo do Certificado"],
  dataEmissao: ["Data de Emissão", "Data de Emissão do Certificado"],
  dataVencimento: ["Data de Vencimento", "Data de Vencimento do Certificado"],
  valor: ["Valor"],
  valorVE: ["Valor V.E", "Valor VE", "Valor Validade Estendida"],
  validadeEstendida: ["Validade Estendida"],
  comprouOutroProduto: ["Comprou Outro", "Comprou Outro Produto"],
  sistema: ["Sistema"],
  emailCliente: ["E-mail"]
};

/**
 * Campos que descrevem UM certificado (uma venda). No contato eles ficam de
 * uma compra para a outra: um cliente que renovou pode ter no contato os
 * dados da compra de dois anos atrás. Ver `contatoDaCompraAtual`.
 */
const CAMPOS_DA_COMPRA = new Set([
  "protocoloCertificado",
  "tipoCertificado",
  "dataEmissao",
  "dataVencimento",
  "valor",
  "valorVE",
  "validadeEstendida",
  "comprouOutroProduto",
  // O "Sistema" do contato é o da ÚLTIMA compra: cliente que já comprou Valid
  // e agora comprou Consulti vinha com "Valid" (caso de 14/10).
  "sistema"
]);

const somenteDigitos = (t) => String(t ?? "").replace(/\D/g, "");

/** unix (segundos) -> "AAAA-MM-DD" no fuso de Brasília (UTC-3, sem horário de verão). */
export function unixParaDia(unix) {
  const n = Number(unix);
  if (!Number.isFinite(n) || n <= 0) return "";
  return new Date((n - 3 * 3600) * 1000).toISOString().slice(0, 10);
}

/** "24/09/2026" -> "2026-09-24"; data impossível -> "". */
function brParaDia(dia, mes, ano) {
  const d = new Date(Date.UTC(+ano, +mes - 1, +dia));
  if (d.getUTCDate() !== +dia || d.getUTCMonth() !== +mes - 1) return "";
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** "1.234,56" / "R$ 109,90" / 109.9 -> número; ilegível -> NaN. */
function paraNumero(valor) {
  if (typeof valor === "number") return valor;
  let t = String(valor ?? "").replace(/R\$/gi, "").replace(/\s/g, "");
  if (!t) return NaN;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}

export function formatarDoc(digitos) {
  const d = somenteDigitos(digitos);
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return "";
}

export function cpfValido(d) {
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  for (let t = 9; t < 11; t++) {
    let s = 0;
    for (let i = 0; i < t; i++) s += Number(d[i]) * (t + 1 - i);
    if (((s * 10) % 11) % 10 !== Number(d[t])) return false;
  }
  return true;
}

/**
 * CNPJ da própria Certify: vem nas mensagens-modelo do chat e já foi lido como
 * se fosse do cliente (18 chamados, 06/10). Nunca é documento de cliente.
 */
export const DOCS_DA_CERTIFY = new Set(["57983065000111"]);

export function cnpjValido(d) {
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const calc = (n) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const r = pesos.reduce((acc, p, i) => acc + Number(d[i]) * p, 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

/**
 * "A1 PJ" / "e-CNPJ A1" / "pf a3 nuvem" -> "PJ A1" / "PJ A1" / "PF A3 EM NUVEM"
 * (o formato das mensagens da Certify). Texto que não é um tipo reconhecível
 * volta como veio.
 */
export function normalizarTipo(texto) {
  const t = String(texto ?? "").replace(/[*_~]/g, " ").trim();
  if (!t) return "";
  const titular = /(?:^|[^a-z])(e-?cpf|pf)(?![a-z])/i.test(t) ? "PF" : /(?:^|[^a-z])(e-?cnpj|pj)(?![a-z])/i.test(t) ? "PJ" : "";
  const midia = (/(?:^|[^a-z0-9])(a1|a3)(?![a-z0-9])/i.exec(t) || [])[1];
  if (!titular || !midia) return t;
  return `${titular} ${midia.toUpperCase()}${/nuvem/i.test(t) ? " EM NUVEM" : ""}`;
}

/* ------------------------------------------------------------------ Kommo */

/** Valor de um item de custom_fields_values já no formato da tela. */
function valorDoCampoKommo(campo, chaveTela) {
  const primeiro = campo?.values?.[0];
  if (!primeiro) return null;
  const bruto = primeiro.value;
  const tipo = campo.field_type;

  if (chaveTela === "dataEmissao" || chaveTela === "dataVencimento") {
    const dia = unixParaDia(bruto);
    return dia || null;
  }
  if (chaveTela === "comprouOutroProduto") {
    const k = chaveNome(bruto);
    return k === "sim" ? true : k === "nao" ? false : null;
  }
  if (chaveTela === "valor" || chaveTela === "valorVE") {
    const n = paraNumero(bruto);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  if (chaveTela === "cpfCnpj") {
    let d = somenteDigitos(bruto);
    // O campo "CPF" do lead é numérico: um CPF que começa com zero chega sem ele.
    if (d.length === 10 || d.length === 13) d = d.padStart(d.length + 1, "0");
    if (DOCS_DA_CERTIFY.has(d)) return null;
    return cpfValido(d) || cnpjValido(d) ? formatarDoc(d) : null;
  }
  if (chaveTela === "cpf") {
    let d = somenteDigitos(bruto);
    if (d.length === 10) d = d.padStart(11, "0"); // numérico perde o zero à esquerda
    return cpfValido(d) ? formatarDoc(d) : null;
  }
  if (chaveTela === "tipoCertificado") return normalizarTipo(bruto) || null;
  if (tipo === "checkbox") return null;
  const texto = String(bruto ?? "").trim();
  return texto || null;
}

/** custom_fields_values de uma entidade -> { chaveTela: valor } pelos nomes. */
export function lerCamposKommo(entidade) {
  const campos = entidade?.custom_fields_values || [];
  const achados = {};
  for (const [chaveTela, nomes] of Object.entries(NOMES_KOMMO)) {
    const alvos = nomes.map(chaveNome);
    // Na ordem dos nomes: "Doc. Cliente" antes de "CPF", por exemplo.
    for (const alvo of alvos) {
      const campo = campos.find((c) => chaveNome(c.field_name) === alvo);
      const valor = campo ? valorDoCampoKommo(campo, chaveTela) : null;
      if (valor !== null && valor !== undefined) {
        achados[chaveTela] = valor;
        break;
      }
    }
  }
  return achados;
}

/** Email de sistema do contato (field_code EMAIL). */
function emailDoContato(contato) {
  const campo = (contato?.custom_fields_values || []).find((c) => c.field_code === "EMAIL");
  const valor = campo?.values?.find((v) => String(v?.value || "").includes("@"))?.value;
  return valor ? String(valor).trim() : "";
}

/**
 * Os dados de certificado do contato são desta compra? Se a data de emissão
 * gravada no contato é anterior à criação do lead, é de uma compra antiga.
 * Sem data no contato, não dá para saber — aceita, mas marca como sugerido.
 */
function contatoDaCompraAtual(dadosContato, lead) {
  const criadoEm = unixParaDia(lead?.created_at);
  if (!dadosContato.dataEmissao || !criadoEm) return "incerto";
  return dadosContato.dataEmissao >= criadoEm ? "sim" : "nao";
}

/** Validade do certificado em anos, do campo "Validade" do lead ("2 anos" -> 2). */
function anosDeValidade(lead) {
  const campo = (lead?.custom_fields_values || []).find((c) => chaveNome(c.field_name) === "validade");
  const n = parseInt(String(campo?.values?.[0]?.value || ""), 10);
  return Number.isFinite(n) && n > 0 && n <= 5 ? n : null;
}

/* --------------------------------------------------------------- conversa */

// Mesmas regras do node "Montar contexto" do n8n (testadas lá com as
// mensagens-modelo reais da Certify), mais valor e datas explícitas.

function protocoloDe(texto) {
  const t = texto.replace(/[*_~]/g, " ");
  // "Ticket" é como a Valid chama o protocolo (modelo da Certify, 09/10:
  // "Número do Ticket - 62109827044").
  const m = /(protocolo|pedido|ticket)(?:\s+d[oe]\s+certificado)?\s*(?:n[º°o.]*\s*)?[:\-–#=]?\s*(\d{3}[-.\s]\d{3}[-.\s]\d{3}(?!\d)|\d{6,12}(?!\d))/i.exec(t);
  if (!m) return "";
  const d = somenteDigitos(m[2]);
  // Protocolo/pedido de 11 dígitos que é um CPF válido é o CPF, não o
  // protocolo. O ticket da Valid tem 11 dígitos e pode coincidir: vale sempre.
  if (d.length === 11 && cpfValido(d) && !/ticket/i.test(m[1])) return "";
  return d.length === 9 ? d.replace(/(\d{3})(\d{3})(\d{3})/, "$1-$2-$3") : d;
}

function tipoDe(texto) {
  const t = texto.replace(/[*_~]/g, " ");
  const m = /(?:^|[^a-z0-9])(e-?cpf|e-?cnpj|pf|pj)\s*-?\s*(a1|a3)(?![a-z0-9])(\s+(?:em\s+)?nuvem)?/i.exec(t);
  return m ? normalizarTipo(m[0]) : "";
}

/**
 * CPF/CNPJ numa mensagem. `anterior` é o texto da mensagem de antes: o cliente
 * costuma responder só com os números ao modelo da Certify que pede
 * "Número do CNPJ" — o pedido está na mensagem anterior, não na resposta.
 *
 * - CNPJ (14 dígitos) válido é aceito sempre: telefone brasileiro não passa
 *   de 13 dígitos, e o dígito verificador descarta número aleatório.
 * - CPF sem pontuação (11 dígitos) tem o mesmo tamanho de um celular com DDD:
 *   só com "cpf/cnpj/documento" nesta mensagem ou na anterior.
 */
function docDe(texto, anterior = "") {
  const falaDeDoc = /cpf|cnpj|documento/i.test(texto) || /cpf|cnpj|documento/i.test(anterior);
  const re = /\d{2,3}\.\d{3}\.\d{3}(?:\/\d{4})?-\d{2}|(?<!\d)\d{11}(?!\d)|(?<!\d)\d{14}(?!\d)/g;
  let m;
  while ((m = re.exec(texto))) {
    const formatado = /[.\-/]/.test(m[0]);
    const d = somenteDigitos(m[0]);
    if (DOCS_DA_CERTIFY.has(d)) continue;
    if (d.length === 14 && cnpjValido(d)) return formatarDoc(d);
    if (!formatado && !falaDeDoc) continue;
    if (cpfValido(d) || cnpjValido(d)) return formatarDoc(d);
  }
  return "";
}

/**
 * Só CPF (11 dígitos, dígito verificador certo). Formatado vale sempre; só
 * dígitos, só com "cpf/documento" nesta mensagem ou na anterior (pode ser
 * telefone). Num certificado PJ a conversa traz o CNPJ E o CPF do sócio:
 * este pega o CPF mesmo quando aparece depois do CNPJ.
 */
function cpfDe(texto, anterior = "") {
  const falaDeCpf = /cpf|documento|rg|cnh/i.test(texto) || /cpf|documento|rg|cnh/i.test(anterior);
  const re = /(?<!\d)\d{3}\.\d{3}\.\d{3}-\d{2}(?!\d)|(?<![\d./-])\d{11}(?![\d./-])/g;
  let m;
  while ((m = re.exec(texto))) {
    const d = somenteDigitos(m[0]);
    if (!/[.-]/.test(m[0]) && !falaDeCpf) continue;
    if (cpfValido(d)) return formatarDoc(d);
  }
  return "";
}

/** E-mail escrito pelo cliente (o da própria Certify e endereços automáticos ficam de fora). */
function emailDe(texto) {
  const achados = String(texto).match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || [];
  const email = achados.find((e) => !/certify|no-?reply|kommo/i.test(e));
  return email ? email.toLowerCase() : "";
}

/** "R$ 199,80" numa mensagem que fala de pagamento/valor/total. */
function valorDe(texto) {
  if (!/pag|pix|boleto|valor|total|cobran|comprovante/i.test(texto)) return null;
  const m = /R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}|\d+)/i.exec(texto);
  const n = m ? paraNumero(m[1]) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

const DATA_BR = String.raw`(\d{1,2})[/.](\d{1,2})[/.](\d{4})`;

function dataEmissaoDe(texto) {
  const m = new RegExp(String.raw`(?:emiss[aã]o|emitido(?:\s+em)?)\D{0,20}?` + DATA_BR, "i").exec(texto);
  return m ? brParaDia(m[1], m[2], m[3]) : "";
}

function dataVencimentoDe(texto) {
  const m = new RegExp(String.raw`(?:vencimento|vence(?:\s+em)?|v[aá]lido\s+at[eé]|validade\s+at[eé])\D{0,20}?` + DATA_BR, "i").exec(texto);
  return m ? brParaDia(m[1], m[2], m[3]) : "";
}

/** Link de uma AC mandado na conversa -> nome do Sistema no Kommo. */
function sistemaDe(texto) {
  if (/consultibrasil|consulti/i.test(texto)) return "Consulti";
  if (/soluti/i.test(texto)) return "Soluti";
  if (/\bvalid(?:certificadora)?\.com|\bcertificado\s+valid\b/i.test(texto)) return "Valid";
  return "";
}

/**
 * Sistema pelo formato do protocolo (14/10). Nos finalizados até aqui:
 * "102-988-714" (pedido) e 10 dígitos (A3 em nuvem) são Consulti em 242 de
 * 247; 11 dígitos é o ticket da Valid em 6 de 7. Formato desconhecido -> "".
 */
export function sistemaDoProtocolo(protocolo) {
  const p = String(protocolo ?? "").trim();
  const d = somenteDigitos(p);
  if (!d || d.length !== p.replace(/[\s.\-]/g, "").length) return "";
  if (d.length === 9 || d.length === 10) return "Consulti";
  if (d.length === 11) return "Valid";
  return "";
}

/** Mensagem-modelo da Certify de certificado entregue ("Certificado … ✅"). */
const MSG_CERTIFICADO_OK = /certificado[^\n]{0,60}✅|✅[^\n]{0,60}certificado/i;

/**
 * Mensagens de /api/v4/talks/{id}/messages -> dados achados. A mensagem mais
 * RECENTE que tiver o dado vence. Considera cliente e atendente: os modelos
 * que a Certify manda trazem protocolo, tipo e links certinhos.
 */
export function extrairDaConversa(mensagens) {
  const textos = [...(mensagens || [])]
    .filter((m) => m && m.text)
    .sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
  // `extrair(texto, anterior, mensagem)`: a mensagem de antes serve de
  // contexto (ver docDe); `soDoCliente` ignora o que o atendente escreveu.
  const ultimo = (extrair, { soDoCliente = false } = {}) => {
    for (let i = textos.length - 1; i >= 0; i--) {
      if (soDoCliente && textos[i].type !== "incoming") continue;
      const v = extrair(String(textos[i].text), i > 0 ? String(textos[i - 1].text) : "");
      if (v !== "" && v !== null && v !== undefined) return v;
    }
    return null;
  };

  const certificadoOk = [...textos].reverse().find((m) => MSG_CERTIFICADO_OK.test(String(m.text)));

  return {
    exatos: {
      protocoloCertificado: ultimo(protocoloDe),
      tipoCertificado: ultimo(tipoDe),
      cpfCnpj: ultimo(docDe),
      cpf: ultimo(cpfDe),
      dataEmissao: ultimo(dataEmissaoDe),
      dataVencimento: ultimo(dataVencimentoDe),
      emailCliente: ultimo(emailDe, { soDoCliente: true })
    },
    // Precisam de conferência: o valor pode ser de uma cotação, o sistema é
    // deduzido de um link, a emissão é o dia da mensagem de entrega.
    sugeridos: {
      valor: ultimo(valorDe),
      sistema: ultimo(sistemaDe),
      dataEmissao: certificadoOk ? unixParaDia(certificadoOk.created_at) : null
    }
  };
}

/* ------------------------------------------------------------------ junta */

/** "AAAA-MM-DD" + N anos. 29/02 vira 28/02 em ano não bissexto. */
function somarAnos(dia, anos) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dia || "");
  if (!m) return "";
  const ano = +m[1] + anos;
  const d = new Date(Date.UTC(ano, +m[2] - 1, +m[3]));
  if (d.getUTCMonth() !== +m[2] - 1) d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}

/**
 * Tudo junto: `{ campos: { chaveTela: { valor, fonte, sugerido } } }`.
 * `fonte`: "kommo" | "conversa" | "dedução". Só entra o que tem valor.
 */
export function montarPrefill({ lead = null, contato = null, mensagens = [] } = {}) {
  const campos = {};
  const por = (chave, valor, fonte, sugerido = false) => {
    if (campos[chave] || valor === null || valor === undefined || valor === "") return;
    campos[chave] = { valor, fonte, sugerido };
  };

  // 1) Lead: é desta venda.
  const doLead = lerCamposKommo(lead);
  for (const [k, v] of Object.entries(doLead)) por(k, v, "kommo");

  // 2) Contato: dados do cliente sempre; dados do certificado só se forem
  //    desta compra (ou sem como saber -> sugerido).
  const doContato = lerCamposKommo(contato);
  const atual = contatoDaCompraAtual(doContato, lead);
  const doContatoDaCompra = (k, v) => {
    if (atual === "sim") por(k, v, "kommo");
    else if (atual === "incerto") por(k, v, "kommo", true);
  };
  for (const [k, v] of Object.entries(doContato)) {
    if (!CAMPOS_DA_COMPRA.has(k)) por(k, v, "kommo");
    // O Sistema do contato espera: o formato do protocolo vale mais (abaixo).
    else if (k !== "sistema") doContatoDaCompra(k, v);
  }
  por("emailCliente", emailDoContato(contato), "kommo");

  // 3) Conversa.
  const conversa = extrairDaConversa(mensagens);
  for (const [k, v] of Object.entries(conversa.exatos)) por(k, v, "conversa");

  // Sistema: o do lead (passo 1) > o formato do protocolo > o do contato > o
  // link mandado na conversa (passo 4).
  por("sistema", sistemaDoProtocolo(campos.protocoloCertificado?.valor), "dedução", true);
  doContatoDaCompra("sistema", doContato.sistema);

  // Doc. Cliente que é um CPF (certificado PF): é o CPF da pessoa também.
  const doc = somenteDigitos(campos.cpfCnpj?.valor);
  if (doc.length === 11 && cpfValido(doc)) por("cpf", formatarDoc(doc), campos.cpfCnpj.fonte, campos.cpfCnpj.sugerido);

  // 4) Deduções (sempre sugeridas).
  for (const [k, v] of Object.entries(conversa.sugeridos)) por(k, v, "conversa", true);
  const preco = Number(lead?.price);
  if (preco > 0) por("valor", preco, "kommo", true);
  const emissao = campos.dataEmissao?.valor;
  if (emissao && !campos.dataVencimento) {
    // A1 vale sempre 1 ano; A3 depende do que o vendedor marcou em "Validade".
    const tipo = String(campos.tipoCertificado?.valor || "");
    const anos = anosDeValidade(lead) || (/\bA1\b/.test(tipo) ? 1 : null);
    if (anos) por("dataVencimento", somarAnos(emissao, anos), "dedução", true);
  }

  return { campos };
}
