/**
 * Regras do formulário de finalização do suporte (ConcluirSuporteModal).
 * Ficam fora do componente para poderem ser testadas sem montar a tela.
 */

import { chaveNome } from "../../../../shared/kommo-campos.mjs";
import { cpfValido } from "../../../../shared/prefill-finalizacao.mjs";

/**
 * Valor -> a opção equivalente da lista do Kommo ("pf a1" -> "PF A1"). Sem
 * opção equivalente, "": um valor fora da lista não teria onde ser gravado no
 * lead. Sem lista (Kommo não respondeu), o valor volta como veio.
 */
export function casarOpcao(valor, opcoes) {
  if (!opcoes?.length || !valor) return valor;
  const alvo = chaveNome(valor);
  return opcoes.find((o) => chaveNome(o) === alvo) || "";
}

/** Chave do formulário -> chave das opções do Kommo (carregarOpcoesFinalizacao). */
const OPCOES_DO_CAMPO = {
  tipoCertificado: "tipo_certificado",
  validadeEstendida: "validade_estendida",
  sistema: "sistema"
};

const campoVazio = (valor) => valor === null || valor === undefined || String(valor).trim() === "";

/** Valor do pré-preenchimento -> formato do campo na tela (dinheiro vira "199,80"). */
function paraCampoDaTela(chave, valor) {
  if (chave === "comprouOutroProduto") return typeof valor === "boolean" ? valor : null;
  if (chave === "valor" || chave === "valorVE") {
    const n = Number(valor);
    return Number.isFinite(n) && n > 0 ? n.toFixed(2).replace(".", ",") : "";
  }
  return String(valor ?? "").trim();
}

/**
 * Junta as sugestões (`{ chave: { valor, fonte, sugerido } }`, vindas do
 * Worker ou da IA) ao formulário, sem nunca sobrescrever: só entra em campo
 * VAZIO e que o técnico ainda não mexeu (`editados`). Listas só aceitam uma
 * opção que exista no Kommo.
 *
 * Devolve `{ form, fontes }`; `fontes` diz de onde veio cada campo preenchido
 * agora (a tela mostra "Kommo", "conversa", "foto", "confira").
 */
export function mesclarPrefill(form, campos, { editados = new Set(), opcoes = {} } = {}) {
  const novo = { ...form };
  const fontes = {};
  for (const [chave, sugestao] of Object.entries(campos || {})) {
    if (!(chave in novo) || editados.has(chave) || !campoVazio(novo[chave])) continue;
    let valor = paraCampoDaTela(chave, sugestao?.valor);
    const listaKommo = opcoes[OPCOES_DO_CAMPO[chave]];
    if (listaKommo?.length) valor = casarOpcao(valor, listaKommo);
    if (campoVazio(valor)) continue;
    novo[chave] = valor;
    fontes[chave] = { fonte: sugestao.fonte || "", sugerido: Boolean(sugestao.sugerido) };
  }
  return { form: novo, fontes };
}

/** Campos que a leitura por IA (conversa, fotos, PDFs) sabe procurar. */
export const CAMPOS_DA_IA = [
  "protocoloCertificado",
  "cpfCnpj",
  "cpf",
  "tipoCertificado",
  "dataEmissao",
  "dataVencimento",
  "valor",
  "valorVE",
  "sistema",
  "emailCliente"
];

/**
 * Quais campos da IA a tela já tem, e se ainda vale chamá-la. Valor V.E é
 * opcional: faltar só ele não justifica o custo da leitura de fotos e PDFs.
 */
export function situacaoParaIA(form) {
  const jaPreenchidos = CAMPOS_DA_IA.filter((c) => !campoVazio(form[c]));
  const faltando = CAMPOS_DA_IA.filter((c) => campoVazio(form[c]) && c !== "valorVE");
  return { jaPreenchidos, vale: faltando.length > 0 };
}

/** Rótulo curto da origem, mostrado ao lado do nome do campo. */
export function rotuloFonte({ fonte, sugerido } = {}) {
  const nome = { kommo: "Kommo", conversa: "conversa", foto: "foto", "dedução": "dedução" }[fonte] || fonte;
  return sugerido ? `${nome} · confira` : nome;
}

/**
 * Opções padrão de "Validade estendida". Quando o Kommo responde, a tela usa
 * as opções reais do campo de lista de lá (ver carregarOpcoesFinalizacao) —
 * senão o valor não casaria com nenhuma opção ao gravar no lead.
 */
export const VALIDADES_ESTENDIDAS = ["1 ano", "2 anos", "3 anos"];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DIA_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * "1.234,56", "R$ 150", "150.5" -> número. Vazio ou ilegível -> NaN.
 * Vírgula é o separador decimal brasileiro: quando ela aparece, os pontos são
 * de milhar e saem.
 */
export function parseValor(texto) {
  let t = String(texto ?? "").replace(/R\$/gi, "").replace(/\s/g, "");
  if (!t) return NaN;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}

/**
 * Devolve { campo: mensagem } — vazio quando está tudo certo.
 *
 * Nenhum campo é obrigatório (pedido do usuário em 2026-09-29: nem sempre o
 * técnico tem todos os dados na hora de finalizar). O que for preenchido
 * precisa estar num formato que dê para gravar — email válido, valor legível,
 * vencimento não antes da emissão, validade dentro das opções.
 * `validades` = opções aceitas (as do Kommo, quando carregadas).
 */
export function validarFinalizacao(form, { validades = VALIDADES_ESTENDIDAS } = {}) {
  const erros = {};
  const vazio = (v) => !String(v ?? "").trim();

  if (!vazio(form.emailCliente) && !EMAIL_RE.test(form.emailCliente.trim())) {
    erros.emailCliente = "Email inválido.";
  }

  if (!vazio(form.dataEmissao) && !DIA_RE.test(form.dataEmissao)) erros.dataEmissao = "Data inválida.";
  if (!vazio(form.dataVencimento) && !DIA_RE.test(form.dataVencimento)) erros.dataVencimento = "Data inválida.";
  else if (
    !vazio(form.dataVencimento) &&
    DIA_RE.test(form.dataEmissao || "") &&
    form.dataVencimento < form.dataEmissao
  ) {
    erros.dataVencimento = "O vencimento não pode ser antes da emissão.";
  }

  if (!vazio(form.valor) && Number.isNaN(parseValor(form.valor))) {
    erros.valor = "Valor inválido. Use o formato 150,00.";
  }
  if (!vazio(form.valorVE) && Number.isNaN(parseValor(form.valorVE))) {
    erros.valorVE = "Valor inválido. Use o formato 150,00.";
  }

  if (!vazio(form.cpf) && !cpfValido(String(form.cpf).replace(/\D/g, ""))) {
    erros.cpf = "CPF inválido.";
  }

  if (!vazio(form.validadeEstendida) && !validades.includes(form.validadeEstendida)) {
    erros.validadeEstendida = "Escolha uma das opções.";
  }

  return erros;
}
