const STATUS_OPTIONS = new Set(["EM ABERTO", "EM ANDAMENTO", "FINALIZADO", "SEM RETORNO", "REAGENDADO"]);

const IGNORED_FIELDS = new Set([
  "observacao",
  "observacao do tecnico",
  "observacao do técnico",
  "token",
  "enviado",
  "sincronizado"
]);

const KNOWN_ALIASES = [
  "protocolo",
  "ticket",
  "id suporte",
  "id",
  "responsavel da abertura",
  "responsavel",
  "cliente",
  "nome cliente",
  "razao social",
  "nome",
  "cpf/cnpj",
  "cpf cnpj",
  "cpfcnpj",
  "cpf",
  "cnpj",
  "documento",
  "contato",
  "contato ou grupo",
  "telefone",
  "celular",
  "whatsapp",
  "email",
  "descricao",
  "descrição",
  "description",
  "descricao do problema",
  "descrição do problema",
  "tipo",
  "ac",
  "tecnico",
  "tecnico responsavel",
  "responsavel tecnico",
  "analista",
  "status",
  "sit. atendimento",
  "situacao atendimento",
  "situacao",
  "situação",
  "coluna 8",
  "step title",
  "steptitle",
  "etapa",
  "fase",
  "status card",
  "status do card",
  "step",
  "status da abertura",
  "status abertura",
  "carimbo de data/hora",
  "data abertura",
  "data de abertura",
  "abertura",
  "data",
  "docid",
  "documentid",
  "firestoreid",
  "_id",
  "origemintegracao",
  "idempotencykey",
  "createdat",
  "updatedat"
];

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

function keyMatchesAlias(normalizedKey, alias) {
  if (normalizedKey === alias) return true;
  const compactKey = normalizedKey.replace(/[^a-z0-9]/g, "");
  const compactAlias = alias.replace(/[^a-z0-9]/g, "");
  if (!compactKey || !compactAlias) return false;
  if (compactKey === compactAlias) return true;
  if (compactAlias.length < 4) return false;
  return compactKey.startsWith(compactAlias) || compactAlias.startsWith(compactKey);
}

function isKnownFieldKey(normalizedKey) {
  return KNOWN_ALIASES.some((alias) => keyMatchesAlias(normalizedKey, alias));
}

function getValueByAliases(aliases, ...sources) {
  for (const source of sources) {
    for (const [key, value] of Object.entries(source || {})) {
      const normalizedKey = normalizeKey(key);
      if (IGNORED_FIELDS.has(normalizedKey)) {
        continue;
      }
      if (!isMeaningfulValue(value)) continue;
      for (const alias of aliases) {
        if (keyMatchesAlias(normalizedKey, alias)) {
          return value;
        }
      }
    }
  }
  return "";
}

function sanitizeExtraFieldKey(key) {
  return normalizeKey(key)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

function stripTokenFromInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return input;
  }
  const { token: _token, ...rest } = input;
  return rest;
}

function collectUnmappedFields(input) {
  const root = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const extras = {};

  for (const [key, value] of Object.entries(root)) {
    const normalizedKey = normalizeKey(key);
    if (IGNORED_FIELDS.has(normalizedKey) || isKnownFieldKey(normalizedKey)) {
      continue;
    }
    if (!isMeaningfulValue(value)) continue;
    const safeKey = sanitizeExtraFieldKey(key);
    if (!safeKey) continue;
    extras[safeKey] = typeof value === "object" ? JSON.stringify(value) : normalizeText(value);
  }

  return extras;
}

function hasAcceptableWebhookInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return false;
  }
  const keys = Object.keys(input).filter((k) => normalizeKey(k) !== "token");
  if (!keys.length) return false;

  const support = normalizeSupport(input, { partial: true });
  if (Object.values(support).some((v) => normalizeText(v))) {
    return true;
  }

  const extras = collectUnmappedFields(input);
  return Object.keys(extras).length > 0;
}

function normalizeStatus(value) {
  const status = normalizeText(value).toUpperCase();
  if (STATUS_OPTIONS.has(status)) return status;
  if (status === "ABERTO") return "EM ABERTO";
  if (status === "CONCLUIDO" || status === "CONCLUÍDO") return "FINALIZADO";
  if (/REAGEND/.test(status)) return "REAGENDADO";
  if (/TRATATIV|ANDAMENTO/.test(status)) return "EM ANDAMENTO";
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
  if (/reagend/.test(combined)) {
    return "REAGENDADO";
  }
  if (/em andamento|em atendimento|em tratativa|aguardando atendimento|em analise|analise tecnica|analise tecnica|triagem/.test(combined)) {
    return "EM ANDAMENTO";
  }
  if (/em aberto|aberto|novo|nova solicitacao|nova solicitacao|a fazer|backlog|entrada/.test(combined)) {
    return "EM ABERTO";
  }
  return normalizeStatus(statusValue);
}

function assignField(target, key, value, partial) {
  const text = normalizeText(value);
  if (text) {
    target[key] = text;
    return;
  }
  if (!partial) {
    target[key] = "";
  }
}

function normalizeSupport(input, options = {}) {
  const { partial = false } = options;
  const sources = getInputSources(input);
  const result = {};

  assignField(
    result,
    "protocolo",
    getValueByAliases(["protocolo", "ticket", "id suporte", "id"], ...sources),
    partial
  );
  assignField(
    result,
    "responsavelAbertura",
    getValueByAliases(
      ["responsavel da abertura", "responsavel", "cliente", "nome cliente", "razao social", "nome"],
      ...sources
    ),
    partial
  );
  assignField(
    result,
    "cpfCnpj",
    getValueByAliases(["cpf/cnpj", "cpf cnpj", "cpfcnpj", "cpf", "cnpj", "documento"], ...sources),
    partial
  );
  assignField(
    result,
    "contato",
    getValueByAliases(["contato", "contato ou grupo", "telefone", "celular", "whatsapp", "email"], ...sources),
    partial
  );
  assignField(
    result,
    "descricao",
    getValueByAliases(
      ["descricao", "descrição", "description", "descricao do problema", "descrição do problema"],
      ...sources
    ),
    partial
  );
  assignField(result, "tipo", getValueByAliases(["tipo"], ...sources), partial);
  assignField(result, "ac", getValueByAliases(["ac"], ...sources), partial);
  assignField(
    result,
    "tecnico",
    getValueByAliases(["tecnico", "tecnico responsavel", "responsavel tecnico", "analista"], ...sources),
    partial
  );

  const statusRaw = getValueByAliases(
    ["status", "sit. atendimento", "situacao atendimento", "situacao", "situação", "coluna 8"],
    ...sources
  );
  const stepTitle = getValueByAliases(
    ["step title", "steptitle", "etapa", "fase", "status card", "status do card", "step"],
    ...sources
  );
  if (statusRaw || stepTitle || !partial) {
    result.status = normalizeStatusByRule(statusRaw, stepTitle);
  }

  assignField(
    result,
    "statusAbertura",
    getValueByAliases(["status da abertura", "status abertura"], ...sources),
    partial
  );
  assignField(
    result,
    "dataAbertura",
    getValueByAliases(["carimbo de data/hora", "data abertura", "data de abertura", "abertura", "data"], ...sources),
    partial
  );

  return result;
}

module.exports = {
  normalizeSupport,
  normalizeText,
  hasAcceptableWebhookInput,
  collectUnmappedFields,
  stripTokenFromInput
};
