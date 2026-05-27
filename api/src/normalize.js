const STATUS_OPTIONS = new Set(["ABERTO", "EM ANDAMENTO", "FINALIZADO"]);
const CANAL_OPTIONS = new Set(["WEBHOOK", "WHATSAPP", "TELEFONE", "EMAIL"]);

const IGNORED_FIELDS = new Set([
  "observacao",
  "observacao do tecnico",
  "observacao do técnico"
]);

function normalizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getValueByAliases(source, aliases) {
  for (const [key, value] of Object.entries(source || {})) {
    const normalizedKey = normalizeKey(key);
    if (IGNORED_FIELDS.has(normalizedKey)) {
      continue;
    }
    if (aliases.includes(normalizedKey)) {
      return value;
    }
  }
  return "";
}

function normalizeStatus(value) {
  const status = normalizeText(value).toUpperCase();
  if (STATUS_OPTIONS.has(status)) return status;
  if (status === "CONCLUIDO" || status === "CONCLUÍDO") return "FINALIZADO";
  return "ABERTO";
}

function normalizeCanal(value) {
  const canal = normalizeText(value).toUpperCase();
  if (CANAL_OPTIONS.has(canal)) return canal;
  return "WEBHOOK";
}

function normalizeSupport(input) {
  const protocolo = normalizeText(getValueByAliases(input, ["protocolo", "ticket", "id suporte", "id"]));
  const cliente = normalizeText(getValueByAliases(input, ["cliente", "nome cliente", "razao social", "nome"]));
  const cpfCnpj = normalizeText(getValueByAliases(input, ["cpf/cnpj", "cpf cnpj", "cpfcnpj", "cpf", "cnpj", "documento"]));
  const contato = normalizeText(getValueByAliases(input, ["contato", "telefone", "celular", "whatsapp", "email"]));
  const tecnico = normalizeText(getValueByAliases(input, ["tecnico", "tecnico responsavel", "responsavel tecnico", "analista"]));
  const status = normalizeStatus(getValueByAliases(input, ["status", "situacao", "situação"]));
  const canal = normalizeCanal(getValueByAliases(input, ["canal", "origem", "source"])) || "WEBHOOK";
  const dataAbertura = normalizeText(getValueByAliases(input, ["data abertura", "data de abertura", "abertura", "data"]));

  return { protocolo, cliente, cpfCnpj, contato, tecnico, status, canal, dataAbertura };
}

module.exports = {
  normalizeSupport,
  normalizeText
};
