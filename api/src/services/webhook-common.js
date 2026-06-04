const { normalizeText } = require("../normalize");
const { prepareWebhookRecords } = require("../webhook-shared");

function parseBody(payload) {
  if (typeof payload === "string") {
    if (!payload) return {};
    try {
      return JSON.parse(payload);
    } catch (error) {
      throw new Error("Corpo JSON invalido.");
    }
  }
  return payload || {};
}

function getEnvConfig(env = process.env) {
  return {
    collection: env.FIRESTORE_COLLECTION || "suportes_tecnicos",
    webhookToken: normalizeText(env.WEBHOOK_TOKEN || "")
  };
}

function getTokenFromRequest({ headers = {}, query = {}, body = {} }) {
  return (
    normalizeText(headers["x-webhook-token"]) ||
    normalizeText(headers["X-Webhook-Token"]) ||
    normalizeText(query?.token) ||
    normalizeText(body?.token)
  );
}

function authorizeWebhook(request, webhookToken) {
  if (!webhookToken) return true;
  return getTokenFromRequest(request) === webhookToken;
}

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    body: JSON.stringify(payload)
  };
}

function validatePayload(parsedBody, origemIntegracao = "webhook") {
  const inputs = Array.isArray(parsedBody) ? parsedBody : [parsedBody];
  if (!inputs.length) {
    return { valid: false, response: jsonResponse(400, { ok: false, error: "Payload vazio." }) };
  }
  const records = prepareWebhookRecords(inputs, origemIntegracao);
  if (!records.length) {
    return {
      valid: false,
      response: jsonResponse(400, {
        ok: false,
        error: "Nenhum dado reconhecido no payload. Envie ao menos um campo com valor."
      })
    };
  }
  return { valid: true, records };
}

module.exports = { parseBody, getEnvConfig, getTokenFromRequest, authorizeWebhook, jsonResponse, validatePayload };