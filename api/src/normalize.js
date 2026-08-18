const STATUS_OPTIONS = new Set(["EM ABERTO", "EM ANDAMENTO", "FINALIZADO", "SEM RETORNO", "REAGENDADO"]);
const { normalizeTecnico } = require("./tecnico");

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

function formatPhoneText(text) {
  const v = normalizeText(text || "");
  const digits = v.replace(/\D/g, "");
  if (!digits) return v;
  if (digits.length >= 10) {
    const ddd = digits.slice(0, 2);
    const rest = digits.slice(2);
    return `(${ddd}) ${rest}`;
  }
  return v;
}

function phoneToE164(text, defaultCountry = "55") {
  if (!text) return "";
  let digits = String(text).replace(/\D/g, "");
  if (!digits) return "";

  // Strip international prefix like 00
  digits = digits.replace(/^00+/, "");

  // Remove leading zeros that are not part of country code
  digits = digits.replace(/^0+/, "");

  // If it already starts with the country code, assume it's complete
  if (digits.startsWith(defaultCountry)) {
    return digits;
  }

  // If looks like local Brazilian number (8-11 digits), prefix default country
  // We accept 8/9 (no DDD), 10/11 (with DDD). For all these, prefix country code.
  if (digits.length >= 8 && digits.length <= 11) {
    return `${defaultCountry}${digits}`;
  }

  // For other lengths, just return digits (best-effort)
  return digits;
}

function formatProtocoloText(text) {
  const v = normalizeText(text || "");
  if (!v) return v;
  // already formatted like 111-111-111
  if (/^\d{3}-\d{3}-\d{3}$/.test(v)) return v;
  const digits = v.replace(/\D/g, "");
  if (digits.length === 9) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})/, "$1-$2-$3");
  }
  // do not format if not exactly 9 digits
  return v;
}

function formatCpfCnpjText(text) {
  const v = normalizeText(text || "");
  if (!v) return v;
  // If already formatted as CPF xxx.xxx.xxx-xx or CNPJ xx.xxx.xxx/xxxx-xx, keep
  if (/^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(v) || /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(v)) return v;
  const digits = v.replace(/\D/g, "");
  if (digits.length === 11) {
    // CPF: 000.000.000-00
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  if (digits.length === 14) {
    // CNPJ: 00.000.000/0000-00
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  }
  return v;
}

function assignField(target, key, value, partial) {
  let text = normalizeText(value);
  if (key === "tecnico" && text) {
    text = normalizeTecnico(text);
  }
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
  if (result.protocolo) {
    result.protocolo = formatProtocoloText(result.protocolo);
  }
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
  if (result.cpfCnpj) {
    result.cpfCnpj = formatCpfCnpjText(result.cpfCnpj);
  }
  assignField(
    result,
    "contato",
    getValueByAliases(["contato", "contato ou grupo", "telefone", "celular", "whatsapp", "email"], ...sources),
    partial
  );
  if (result.contato) {
    // formatted human-readable contato
    result.contato = formatPhoneText(result.contato);
    // also store an E.164-ish digits-only form (e.g. 5511999999999) for WhatsApp links
    const rawContato = getValueByAliases(["contato", "contato ou grupo", "telefone", "celular", "whatsapp", "email"], ...sources);
    result.contatoE164 = phoneToE164(rawContato);
  }
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
  if (statusRaw || stepTitle) {
    result.status = normalizeStatusByRule(statusRaw, stepTitle);
  }

  // intentionally do not assign `statusAbertura` by default; frontend no longer sends this field
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
  phoneToE164,
  hasAcceptableWebhookInput,
  collectUnmappedFields,
  stripTokenFromInput
};
