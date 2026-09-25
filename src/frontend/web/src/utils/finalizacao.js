/**
 * Regras do formulário de finalização do suporte (ConcluirSuporteModal).
 * Ficam fora do componente para poderem ser testadas sem montar a tela.
 */

/** As mesmas três opções que o banco aceita (check em suportes.validade_estendida). */
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

/** Devolve { campo: mensagem } — vazio quando está tudo certo. Todos os campos são obrigatórios. */
export function validarFinalizacao(form) {
  const erros = {};
  const vazio = (v) => !String(v ?? "").trim();

  if (vazio(form.emailCliente)) erros.emailCliente = "Informe o email.";
  else if (!EMAIL_RE.test(form.emailCliente.trim())) erros.emailCliente = "Email inválido.";

  if (typeof form.comprouOutroProduto !== "boolean") erros.comprouOutroProduto = "Escolha Sim ou Não.";
  if (vazio(form.protocoloCertificado)) erros.protocoloCertificado = "Informe o protocolo do certificado.";
  if (vazio(form.tipoCertificado)) erros.tipoCertificado = "Informe o tipo de certificado.";

  if (!DIA_RE.test(form.dataEmissao || "")) erros.dataEmissao = "Informe a data de emissão.";
  if (!DIA_RE.test(form.dataVencimento || "")) erros.dataVencimento = "Informe a data de vencimento.";
  else if (!erros.dataEmissao && form.dataVencimento < form.dataEmissao) {
    erros.dataVencimento = "O vencimento não pode ser antes da emissão.";
  }

  const valor = parseValor(form.valor);
  if (vazio(form.valor)) erros.valor = "Informe o valor.";
  else if (Number.isNaN(valor)) erros.valor = "Valor inválido. Use o formato 150,00.";

  if (!VALIDADES_ESTENDIDAS.includes(form.validadeEstendida)) erros.validadeEstendida = "Escolha a validade.";
  if (vazio(form.sistema)) erros.sistema = "Informe o sistema.";

  return erros;
}
