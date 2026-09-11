/**
 * kommo-form-parser.js — decodifica o corpo do webhook do Kommo.
 *
 * O Kommo pode mandar o payload como JSON ou como
 * application/x-www-form-urlencoded com notação de colchetes
 * (ex: "leads[status][0][id]=123&leads[status][0][status_id]=142").
 * Nunca lança exceção: corpo vazio ou irreconhecível vira {}.
 */

function isArrayIndex(part) {
  return /^\d+$/.test(part);
}

function bracketKeyToParts(key) {
  const parts = [];
  const topMatch = key.match(/^([^[\]]+)/);
  if (!topMatch) return parts;
  parts.push(topMatch[1]);

  const rest = key.slice(topMatch[1].length);
  const re = /\[([^\]]*)\]/g;
  let match;
  while ((match = re.exec(rest))) {
    if (match[1] !== "") {
      parts.push(match[1]);
    }
  }
  return parts;
}

function setDeep(root, parts, value) {
  let node = root;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i];
    const nextPart = parts[i + 1];
    const wantsArray = isArrayIndex(nextPart);
    if (node[part] === undefined) {
      node[part] = wantsArray ? [] : {};
    }
    node = node[part];
  }
  node[parts[parts.length - 1]] = value;
}

function parseFormUrlEncoded(rawBody) {
  const result = {};
  const params = new URLSearchParams(rawBody);
  for (const [key, value] of params.entries()) {
    const parts = bracketKeyToParts(key);
    if (!parts.length) continue;
    setDeep(result, parts, value);
  }
  return result;
}

function tryParseJson(rawBody) {
  try {
    const parsed = JSON.parse(rawBody);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (_error) {
    return null;
  }
}

function parseKommoBody(rawBody, contentType = "") {
  const body = typeof rawBody === "string" ? rawBody.trim() : "";
  if (!body) return {};

  const ct = String(contentType || "").toLowerCase();

  if (ct.includes("application/json")) {
    return tryParseJson(body) || {};
  }

  if (ct.includes("application/x-www-form-urlencoded")) {
    try {
      return parseFormUrlEncoded(body);
    } catch (_error) {
      return {};
    }
  }

  // Content-Type ausente/desconhecido: tenta JSON e cai para form-urlencoded.
  const asJson = tryParseJson(body);
  if (asJson) return asJson;

  try {
    return parseFormUrlEncoded(body);
  } catch (_error) {
    return {};
  }
}

module.exports = { parseKommoBody };
