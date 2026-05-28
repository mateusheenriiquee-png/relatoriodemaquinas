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

function isMeaningfulValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string" && !normalizeText(value)) return false;
  return true;
}

function getBodyPayload(input) {
  const body = input?.body;
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body;
  }
  if (typeof body !== "string") {
    return {};
  }
  try {
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch (_error) {
    return {};
  }
  return {};
}

function getValueByAliases(aliases, ...sources) {
  for (const source of sources) {
    for (const [key, value] of Object.entries(source || {})) {
      const normalizedKey = normalizeKey(key);
      if (IGNORED_FIELDS.has(normalizedKey)) {
        continue;
      }
      if (aliases.includes(normalizedKey) && isMeaningfulValue(value)) {
        return value;
      }
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
  const bodyPayload = getBodyPayload(input);

  const protocolo = normalizeText(getValueByAliases(["protocolo", "ticket", "id suporte", "id"], input, bodyPayload));
  const responsavelAbertura = normalizeText(getValueByAliases(["responsavel da abertura", "responsavel", "cliente", "nome cliente", "razao social", "nome"], input, bodyPayload));
  const cpfCnpj = normalizeText(getValueByAliases(["cpf/cnpj", "cpf cnpj", "cpfcnpj", "cpf", "cnpj", "documento"], input, bodyPayload));
  const contato = normalizeText(getValueByAliases(["contato", "contato ou grupo", "telefone", "celular", "whatsapp", "email"], input, bodyPayload));
  const descricao = normalizeText(getValueByAliases(["descricao", "descrição", "description", "descricao do problema", "descrição do problema"], input, bodyPayload));
  const tipo = normalizeText(getValueByAliases(["tipo"], input, bodyPayload));
  const ac = normalizeText(getValueByAliases(["ac"], input, bodyPayload));
  const tecnico = normalizeText(getValueByAliases(["tecnico", "tecnico responsavel", "responsavel tecnico", "analista"], input, bodyPayload));
  const statusRaw = getValueByAliases([
    "status",
    "sit. atendimento",
    "situacao atendimento",
    "situacao",
    "situação",
    "coluna 8"
  ], input, bodyPayload);
  const stepTitle = getValueByAliases([
    "step title",
    "steptitle",
    "etapa",
    "fase",
    "coluna",
    "status card",
    "status do card",
    "step"
  ], input, bodyPayload);
  const status = normalizeStatusByRule(statusRaw, stepTitle);
  const statusAbertura = normalizeText(getValueByAliases(["status da abertura", "status abertura"], input, bodyPayload));
  const dataAbertura = normalizeText(getValueByAliases(["carimbo de data/hora", "data abertura", "data de abertura", "abertura", "data"], input, bodyPayload));

  return { protocolo, responsavelAbertura, cpfCnpj, contato, descricao, tipo, ac, tecnico, status, statusAbertura, dataAbertura };
}

module.exports = {
  normalizeSupport,
  normalizeText
};
