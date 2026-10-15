/**
 * kommo-campos.mjs — traduz os dados da finalização do suporte (linha da
 * tabela `suportes`) para `custom_fields_values` do lead e do contato no Kommo.
 *
 * O campo é achado pelo NOME (normalizado), nunca por id fixo — o mesmo
 * princípio do node "Extrair dados do lead" do n8n. Assim renomear acento,
 * caixa ou pontuação no Kommo não quebra nada, e não há id de conta embutido
 * no código. Campo ou opção de lista que não existir no Kommo não derruba a
 * finalização: vai para `ignorados`, e o painel avisa quem finalizou.
 *
 * ESM puro, sem dependências: o Worker e os testes importam o mesmo arquivo.
 */

/** "Doc. Cliente" -> "doccliente"; "Valor V.E" -> "valorve". */
export function chaveNome(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Coluna da tabela -> nomes aceitos para o campo no Kommo e o rótulo do aviso
 * do painel.
 *
 * Nesta conta os dados do certificado vivem em DOIS lugares (lista real dos
 * campos de lead, 2026-09-28): um grupo de campos do LEAD (Protocolo, Tipo,
 * datas, Comprou Outro Produto, CPF, CNPJ, E-mail) e campos do CONTATO que
 * aparecem no card (Doc. Cliente, Valor, Valor V.E, Validade estendida,
 * Sistema...). Por padrão cada dado é gravado em todo lugar onde existir um
 * campo com esse nome; `alvo` restringe a um só.
 *
 * `silencioso`: complemento — não gera aviso quando não existe o campo.
 */
export const MAPA_FINALIZACAO = [
  { coluna: "protocolo_certificado", rotulo: "Protocolo do Certificado", nomes: ["Protocolo do Certificado", "Protocolo"] },
  // Sem "CPF"/"CNPJ" aqui: no lead eles são campos separados (CPF é numérico)
  // — tratados abaixo pelas colunas derivadas _cpf/_cnpj.
  { coluna: "cpf_cnpj", rotulo: "Doc. Cliente", nomes: ["Doc. Cliente", "Doc Cliente", "CPF/CNPJ", "Documento"] },
  // CPF: numérico no lead, texto no contato — os dois recebem. Vem do campo
  // CPF da tela (desde 08/10) ou do Doc. Cliente quando é um CPF.
  { coluna: "_cpf", rotulo: "CPF", nomes: ["CPF"], silencioso: true },
  { coluna: "_cnpj", rotulo: "CNPJ", nomes: ["CNPJ"], alvo: "lead", silencioso: true },
  { coluna: "tipo_certificado", rotulo: "Tipo de Certificado", nomes: ["Tipo de Certificado", "Tipo do Certificado"] },
  // No contato os nomes têm "do Certificado" no fim (lista real, 2026-09-28).
  { coluna: "data_emissao", rotulo: "Data de Emissão", nomes: ["Data de Emissão", "Data de Emissão do Certificado"] },
  { coluna: "data_vencimento", rotulo: "Data de Vencimento", nomes: ["Data de Vencimento", "Data de Vencimento do Certificado"] },
  { coluna: "valor_venda", rotulo: "Valor", nomes: ["Valor"] },
  { coluna: "valor_ve", rotulo: "Valor V.E", nomes: ["Valor V.E", "Valor VE", "Valor Validade Estendida"] },
  { coluna: "validade_estendida", rotulo: "Validade estendida", nomes: ["Validade Estendida"] },
  { coluna: "comprou_outro_produto", rotulo: "Comprou Outro", nomes: ["Comprou Outro", "Comprou Outro Produto"] },
  { coluna: "sistema", rotulo: "Sistema", nomes: ["Sistema"] },
  // Só no lead: no contato, "Email" é o campo de sistema (vários emails) —
  // tratado à parte, e só preenchido quando está vazio.
  { coluna: "email_cliente", rotulo: "E-mail", nomes: ["E-mail"], alvo: "lead", silencioso: true }
];

/** CPF (11 dígitos) e CNPJ (14) viram colunas derivadas para os campos próprios do lead. */
function comDocumentosSeparados(linha) {
  const digitos = String(linha?.cpf_cnpj || "").replace(/\D/g, "");
  // CPF da tela (coluna cpf, desde 08/10); sem ele, o Doc. Cliente quando é CPF.
  const cpf = String(linha?.cpf || "").replace(/\D/g, "");
  return {
    ...linha,
    _cpf: cpf.length === 11 ? cpf : digitos.length === 11 ? digitos : "",
    _cnpj: digitos.length === 14 ? digitos.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5") : ""
  };
}

/** Campos de lista que a tela de finalização mostra como <select>. */
export const COLUNAS_COM_OPCOES = ["tipo_certificado", "validade_estendida", "sistema"];

const TIPOS_LISTA = new Set(["select", "radiobutton", "multiselect"]);
const TIPOS_DATA = new Set(["date", "birthday", "date_time"]);
const TIPOS_NUMERO = new Set(["numeric", "price", "monetary"]);

/**
 * Todas as definições com algum dos nomes, na ordem dos nomes. A conta tem
 * campos repetidos com o mesmo nome (ex.: dois "Documentação", de funis
 * diferentes) — por isso devolve todos, e quem grava tenta cada um.
 */
export function acharCampos(definicoes, nomes) {
  const achados = [];
  for (const nome of nomes) {
    const alvo = chaveNome(nome);
    for (const def of definicoes || []) {
      if (chaveNome(def?.name) === alvo && !achados.includes(def)) achados.push(def);
    }
  }
  return achados;
}

/** Acha a definição do campo no Kommo pelo primeiro nome da lista que existir. */
export function acharCampo(definicoes, nomes) {
  return acharCampos(definicoes, nomes)[0] || null;
}

/**
 * "AAAA-MM-DD" -> unix timestamp (segundos) ao meio-dia de Brasília (15h UTC).
 * Meio-dia, e não meia-noite, para o dia não "voltar" um em nenhum fuso que o
 * Kommo use para exibir.
 */
export function diaParaUnix(dia) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dia ?? ""));
  if (!m) return null;
  return Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3], 15) / 1000);
}

function textoDoValor(coluna, valor) {
  if (coluna === "comprou_outro_produto") return valor ? "Sim" : "Não";
  return String(valor).trim();
}

/** Valor da linha -> item de `values` do Kommo, conforme o tipo do campo. null = não dá para gravar. */
function valorKommo(def, coluna, valor) {
  const tipo = def.type;

  if (TIPOS_LISTA.has(tipo)) {
    const alvo = chaveNome(textoDoValor(coluna, valor));
    const opcao = (def.enums || []).find((e) => chaveNome(e.value) === alvo);
    return opcao ? { enum_id: opcao.id } : null;
  }
  if (TIPOS_DATA.has(tipo)) {
    const unix = diaParaUnix(valor);
    return unix === null ? null : { value: unix };
  }
  if (TIPOS_NUMERO.has(tipo)) {
    // CPF em campo numérico: vai como texto de dígitos — como número, o zero
    // à esquerda ("054...") sumiria.
    if (coluna === "_cpf") return /^\d{11}$/.test(String(valor)) ? { value: String(valor) } : null;
    const n = Number(valor);
    return Number.isFinite(n) ? { value: n } : null;
  }
  if (tipo === "checkbox") return { value: Boolean(valor) };

  // texto, textarea e o resto: grava como texto. Valor numérico vai no
  // formato brasileiro ("109,90"), que é como a equipe digita no Kommo.
  if (typeof valor === "number") return { value: valor.toFixed(2).replace(".", ",") };
  // CPF em campo de texto vai formatado, como a equipe digita.
  if (coluna === "_cpf") return { value: String(valor).replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") };
  return { value: textoDoValor(coluna, valor) };
}

function vazio(coluna, valor) {
  if (valor === null || valor === undefined) return true;
  if (coluna === "comprou_outro_produto") return typeof valor !== "boolean";
  if (coluna === "valor_venda" || coluna === "valor_ve") return !(Number(valor) > 0);
  return String(valor).trim() === "";
}

/** Por que um valor não coube no campo — vai no aviso do painel. */
function motivoRecusa(defs, coluna, valor) {
  if (!defs.length) return "campo não encontrado no Kommo";
  const lista = defs.find((d) => TIPOS_LISTA.has(d.type));
  if (lista) {
    const opcoes = (lista.enums || []).map((e) => e.value).join(", ") || "nenhuma";
    return `opção "${textoDoValor(coluna, valor)}" não existe (opções: ${opcoes})`;
  }
  return `valor "${valor}" não serve para campo do tipo ${defs.map((d) => d.type).join("/")}`;
}

/** Primeiro campo (entre os de nome igual) que aceita o valor -> item de custom_fields_values. */
function gravarEm(defs, coluna, valor) {
  for (const def of defs) {
    const item = valorKommo(def, coluna, valor);
    if (item) return { field_id: def.id, values: [item] };
  }
  return null;
}

/**
 * Linha de `suportes` + definições dos campos do lead e do contato -> o que
 * gravar em cada um. `ignorados` lista os campos que tinham valor mas não
 * foram gravados em lugar nenhum, com o motivo ("Sistema: opção "X" não
 * existe..."). Campo vazio no painel é simplesmente pulado (nunca apaga o que
 * já está no Kommo).
 */
export function montarCamposKommo(linha, definicoesLead, definicoesContato = []) {
  const dados = comDocumentosSeparados(linha);
  const campos = [];
  const camposContato = [];
  const ignorados = [];
  for (const { coluna, rotulo, nomes, alvo, silencioso } of MAPA_FINALIZACAO) {
    const valor = dados[coluna];
    if (vazio(coluna, valor)) continue;
    const defsLead = alvo === "contato" ? [] : acharCampos(definicoesLead, nomes);
    const defsContato = alvo === "lead" ? [] : acharCampos(definicoesContato, nomes);
    const noLead = gravarEm(defsLead, coluna, valor);
    const noContato = gravarEm(defsContato, coluna, valor);
    if (noLead) campos.push(noLead);
    if (noContato) camposContato.push(noContato);
    if (!noLead && !noContato && !silencioso) {
      ignorados.push(`${rotulo}: ${motivoRecusa([...defsContato, ...defsLead], coluna, valor)}`);
    }
  }
  return { campos, camposContato, ignorados };
}

/**
 * Opções reais das listas do Kommo para a tela de finalização:
 * { coluna: ["opção", ...] }. Coluna cujo campo não é lista no Kommo fica de
 * fora — a tela mantém o campo como texto livre.
 */
export function opcoesFinalizacao(definicoesLead, definicoesContato = []) {
  // O contato vem primeiro: é o campo que aparece no card do lead.
  const definicoes = [...definicoesContato, ...definicoesLead];
  const opcoes = {};
  for (const { coluna, nomes } of MAPA_FINALIZACAO) {
    if (!COLUNAS_COM_OPCOES.includes(coluna)) continue;
    const def = acharCampos(definicoes, nomes).find((d) => TIPOS_LISTA.has(d.type) && d.enums?.length);
    if (def) {
      // Na ordem em que a API devolve (a do Kommo). O `sort` não serve: a
      // primeira opção criada vem com 500 e iria para o fim da lista.
      opcoes[coluna] = def.enums.map((e) => e.value);
    }
  }
  return opcoes;
}

/** Contato do Kommo já tem algum email? (campo de sistema com field_code EMAIL) */
export function contatoTemEmail(contato) {
  const campo = (contato?.custom_fields_values || []).find((c) => c.field_code === "EMAIL");
  return Boolean(campo?.values?.some((v) => String(v?.value || "").trim()));
}
