import { normalizeText } from "../api/src/normalize.js";
import { upsertRecords } from "./firestore-rest.mjs";
import { prepareWebhookRecords } from "../api/src/webhook-shared.js";

function getEnv(env) {
  // Tentar primeiro FIREBASE_SERVICE_ACCOUNT_BASE64, depois fallback
  const firebaseBase64 = env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  const firebaseRaw = env.FIREBASE_SERVICE_ACCOUNT;
  
  let serviceAccountRaw = firebaseBase64 || firebaseRaw;
  let isBase64 = !!firebaseBase64;
  
  // Se for Base64, decodificar
  if (isBase64 && serviceAccountRaw) {
    try {
      serviceAccountRaw = atob(serviceAccountRaw);
    } catch (e) {
      console.error("[Webhook] Erro ao decodificar Base64:", e.message);
    }
  }
  
  return {
    collection: env.FIRESTORE_COLLECTION || "suportes_tecnicos",
    webhookToken: normalizeText(env.WEBHOOK_TOKEN || ""),
    serviceAccountRaw
  };
}

function isAuthorized({ headers = {}, queryStringParameters = {}, body = {} }, webhookToken) {
  if (!webhookToken) return true;
  const token =
    normalizeText(headers["x-webhook-token"]) ||
    normalizeText(headers["X-Webhook-Token"]) ||
    normalizeText(queryStringParameters?.token) ||
    normalizeText(body?.token);
  return token === webhookToken;
}

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    body: JSON.stringify(payload)
  };
}

export async function processWebhookPost(
  { httpMethod = "POST", body = "", headers = {}, queryStringParameters = {} },
  { origemIntegracao = "webhook", env } = {}
) {
  if (httpMethod !== "POST") {
    return jsonResponse(405, { ok: false, error: "Metodo nao permitido." });
  }

  if (!env) {
    return jsonResponse(500, {
      ok: false,
      error: "Ambiente Cloudflare nao configurado."
    });
  }

  try {
    const config = getEnv(env);
    const parsedBody = body ? JSON.parse(body) : {};

    if (!isAuthorized({ headers, queryStringParameters, body: parsedBody }, config.webhookToken)) {
      return jsonResponse(401, { ok: false, error: "Nao autorizado." });
    }

    const inputs = Array.isArray(parsedBody) ? parsedBody : [parsedBody];
    if (!inputs.length) {
      return jsonResponse(400, { ok: false, error: "Payload vazio." });
    }

    const records = prepareWebhookRecords(inputs, origemIntegracao);
    if (!records.length) {
      return jsonResponse(400, {
        ok: false,
        error: "Nenhum dado reconhecido no payload. Envie ao menos um campo com valor."
      });
    }

    const upserted = await upsertRecords({
      serviceAccountRaw: config.serviceAccountRaw,
      collection: config.collection,
      records
    });

    return jsonResponse(201, { ok: true, upserted, inserted: upserted });
  } catch (error) {
    return jsonResponse(500, {
      ok: false,
      error: "Erro interno ao processar webhook.",
      details: String(error?.message || error)
    });
  }
}
