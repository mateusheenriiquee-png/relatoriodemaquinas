

const crypto = require("crypto");
const { normalizeText } = require("./normalize");

function normalizeIdPart(value) {
  return normalizeText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function getIdempotencyDocId(support = {}, input = {}) {
  const explicitId = normalizeText(
    input.id || input.docId || input.documentId || input.firestoreId || input._id
  );
  if (explicitId) {
    return explicitId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 200);
  }

  const keyParts = [support.protocolo, support.cpfCnpj, support.dataAbertura]
    .map(normalizeIdPart)
    .filter(Boolean);

  if (keyParts.length) {
    return `support_${keyParts.join("_")}`.slice(0, 200);
  }

  const fallbackHash = crypto
    .createHash("sha1")
    .update(JSON.stringify(support || {}))
    .digest("hex");
  return `support_hash_${fallbackHash}`;
}

function stripEmptyFields(record = {}) {
  const cleaned = {};
  for (const [key, value] of Object.entries(record)) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && !normalizeText(value)) continue;
    cleaned[key] = value;
  }
  return cleaned;
}

module.exports = {
  getIdempotencyDocId,
  stripEmptyFields,
  normalizeIdPart
};
