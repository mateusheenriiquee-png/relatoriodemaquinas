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

function toObjectIfPossible(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  if (typeof value !== "string") {
    return {};
  }
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch (_error) {
    return {};
  }
  return {};
}

function getInputSources(input) {
  const root = input && typeof input === "object" ? input : {};
  const sources = [root];
  const visited = new Set();
  const queue = [root];

  while (queue.length) {
    const current = queue.shift();
    const parsed = toObjectIfPossible(current);
    if (!parsed || !Object.keys(parsed).length) continue;

    if (visited.has(parsed)) continue;
    visited.add(parsed);
    if (parsed !== root) {
      sources.push(parsed);
    }

    for (const value of Object.values(parsed)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          queue.push(item);
        }
        continue;
      }
      queue.push(value);
    }
  }

  return sources;
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
  const sources = getInputSources(input);

  const protocolo = normalizeText(getValueByAliases(["protocolo", "ticket", "id suporte", "id"], ...sources));
  const responsavelAbertura = normalizeText(getValueByAliases(["responsavel da abertura", "responsavel", "cliente", "nome cliente", "razao social", "nome"], ...sources));
  const cpfCnpj = normalizeText(getValueByAliases(["cpf/cnpj", "cpf cnpj", "cpfcnpj", "cpf", "cnpj", "documento"], ...sources));
  const contato = normalizeText(getValueByAliases(["contato", "contato ou grupo", "telefone", "celular", "whatsapp", "email"], ...sources));
  const descricao = normalizeText(getValueByAliases(["descricao", "descrição", "description", "descricao do problema", "descrição do problema"], ...sources));
  const tipo = normalizeText(getValueByAliases(["tipo"], ...sources));
  const ac = normalizeText(getValueByAliases(["ac"], ...sources));
  const tecnico = normalizeText(getValueByAliases(["tecnico", "tecnico responsavel", "responsavel tecnico", "analista"], ...sources));
  const statusRaw = getValueByAliases([
    "status",
    "sit. atendimento",
    "situacao atendimento",
    "situacao",
    "situação",
    "coluna 8"
  ], ...sources);
  const stepTitle = getValueByAliases([
    "step title",
    "steptitle",
    "etapa",
    "fase",
    "coluna",
    "status card",
    "status do card",
    "step"
  ], ...sources);
  const status = normalizeStatusByRule(statusRaw, stepTitle);
  const statusAbertura = normalizeText(getValueByAliases(["status da abertura", "status abertura"], ...sources));
  const dataAbertura = normalizeText(getValueByAliases(["carimbo de data/hora", "data abertura", "data de abertura", "abertura", "data"], ...sources));

  return { protocolo, responsavelAbertura, cpfCnpj, contato, descricao, tipo, ac, tecnico, status, statusAbertura, dataAbertura };
}

module.exports = {
  normalizeSupport,
  normalizeText
};
