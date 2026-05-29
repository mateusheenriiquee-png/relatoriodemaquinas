const admin = require("firebase-admin");
const { normalizeText } = require("./normalize");
const { prepareWebhookRecords } = require("./webhook-shared");

let dbInstance = null;

function getEnv(overrideEnv = null) {
  const source = overrideEnv || process.env;
  return {
    collection: source.FIRESTORE_COLLECTION || "suportes_tecnicos",
    webhookToken: normalizeText(source.WEBHOOK_TOKEN || ""),
    serviceAccountRaw: source.FIREBASE_SERVICE_ACCOUNT
  };
}

function getServiceAccountFromEnv(serviceAccountRaw) {
  if (!serviceAccountRaw) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT nao configurada.");
  }
  const parsed = JSON.parse(serviceAccountRaw);
  if (parsed.private_key) {
    parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
  }
  return parsed;
}

function getDb(serviceAccountRaw) {
  if (!dbInstance) {
    const serviceAccount = getServiceAccountFromEnv(serviceAccountRaw);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    dbInstance = admin.firestore();
  }
  return dbInstance;
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

async function processWebhookPost(
  { httpMethod = "POST", body = "", headers = {}, queryStringParameters = {} },
  { origemIntegracao = "webhook", env = null } = {}
) {
  if (httpMethod !== "POST") {
    return jsonResponse(405, { ok: false, error: "Metodo nao permitido." });
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

    const db = getDb(config.serviceAccountRaw);
    const batch = db.batch();
    let upserted = 0;

    for (const { docId, fields } of records) {
      const ref = db.collection(config.collection).doc(docId);
      batch.set(
        ref,
        {
          ...fields,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );
      upserted += 1;
    }

    await batch.commit();
    return jsonResponse(201, { ok: true, upserted, inserted: upserted });
  } catch (error) {
    return jsonResponse(500, {
      ok: false,
      error: "Erro interno ao processar webhook.",
      details: String(error?.message || error)
    });
  }
}

module.exports = { processWebhookPost };
