const STATUS_OPTIONS = new Set(["EM ABERTO", "EM ANDAMENTO", "FINALIZADO", "SEM RETORNO"]);

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
  if (status === "ABERTO") return "EM ABERTO";
  if (status === "CONCLUIDO" || status === "CONCLUÍDO") return "FINALIZADO";
  return "EM ABERTO";
}

function normalizeStatusByRule(statusValue, stepValue) {
  const statusText = normalizeText(statusValue)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const stepText = normalizeText(stepValue)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const combined = `${statusText} ${stepText}`.trim();

  if (!combined) return "EM ABERTO";
  if (/sem retorno|nao respondeu|não respondeu|aguardando cliente|cliente nao responde|cliente não responde/.test(combined)) {
    return "SEM RETORNO";
  }
  if (/finalizado|concluido|concluido com sucesso|resolvido|encerrado|fechado/.test(combined)) {
    return "FINALIZADO";
  }
  if (/em andamento|em atendimento|em tratativa|aguardando atendimento|em analise|analise tecnica|analise tecnica|triagem/.test(combined)) {
    return "EM ANDAMENTO";
  }
  if (/em aberto|aberto|novo|nova solicitacao|nova solicitacao|a fazer|backlog|entrada/.test(combined)) {
    return "EM ABERTO";
  }
  return normalizeStatus(statusValue);
}

function normalizeSupport(input) {
  const protocolo = normalizeText(getValueByAliases(input, ["protocolo", "ticket", "id suporte", "id"]));
  const responsavelAbertura = normalizeText(getValueByAliases(input, ["responsavel da abertura", "responsavel", "cliente", "nome cliente", "razao social", "nome"]));
  const cpfCnpj = normalizeText(getValueByAliases(input, ["cpf/cnpj", "cpf cnpj", "cpfcnpj", "cpf", "cnpj", "documento"]));
  const contato = normalizeText(getValueByAliases(input, ["contato", "contato ou grupo", "telefone", "celular", "whatsapp", "email"]));
  const descricao = normalizeText(getValueByAliases(input, ["descricao", "descrição", "description", "descricao do problema", "descrição do problema"]));
  const tipo = normalizeText(getValueByAliases(input, ["tipo"]));
  const ac = normalizeText(getValueByAliases(input, ["ac"]));
  const tecnico = normalizeText(getValueByAliases(input, ["tecnico", "tecnico responsavel", "responsavel tecnico", "analista"]));
  const statusRaw = getValueByAliases(input, [
    "status",
    "sit. atendimento",
    "situacao atendimento",
    "situacao",
    "situação",
    "coluna 8"
  ]);
  const stepTitle = getValueByAliases(input, [
    "step title",
    "steptitle",
    "etapa",
    "fase",
    "coluna",
    "status card",
    "status do card",
    "step"
  ]);
  const status = normalizeStatusByRule(statusRaw, stepTitle);
  const statusAbertura = normalizeText(getValueByAliases(input, ["status da abertura", "status abertura"]));
  const dataAbertura = normalizeText(getValueByAliases(input, ["carimbo de data/hora", "data abertura", "data de abertura", "abertura", "data"]));

  return { protocolo, responsavelAbertura, cpfCnpj, contato, descricao, tipo, ac, tecnico, status, statusAbertura, dataAbertura };
}

module.exports = {
  normalizeSupport,
  normalizeText
};
