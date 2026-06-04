const { db, admin } = require("../firebase-admin");
const { logAuditEntry } = require("./audit-log");
const { parseBody, getEnvConfig, authorizeWebhook, validatePayload, jsonResponse } = require("./webhook-common");

async function processWebhookPayload({ body = "", headers = {}, queryStringParameters = {}, origemIntegracao = "webhook", env = process.env }) {
  let parsedBody;
  try {
    parsedBody = parseBody(body);
  } catch (error) {
    return jsonResponse(400, { ok: false, error: String(error.message) });
  }

  const config = getEnvConfig(env);
  if (!authorizeWebhook({ headers, query: queryStringParameters, body: parsedBody }, config.webhookToken)) {
    return jsonResponse(401, { ok: false, error: "Nao autorizado." });
  }

  const validation = validatePayload(parsedBody, origemIntegracao);
  if (!validation.valid) {
    return validation.response;
  }

  try {
    const batch = db.batch();
    for (const { docId, fields } of validation.records) {
      const ref = db.collection(config.collection).doc(docId);
      batch.set(ref, {
        ...fields,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }
    await batch.commit();

    await logAuditEntry({
      action: "WEBHOOK_UPSERT",
      entity: config.collection,
      entityId: null,
      details: {
        origemIntegracao,
        count: validation.records.length,
        tokenProvided: Boolean(queryStringParameters?.token || headers["x-webhook-token"] || headers["X-Webhook-Token"] || parsedBody?.token)
      }
    });

    return jsonResponse(201, { ok: true, upserted: validation.records.length, inserted: validation.records.length });
  } catch (error) {
    return jsonResponse(500, {
      ok: false,
      error: "Erro interno ao processar webhook.",
      details: String(error?.message || error)
    });
  }
}

module.exports = { processWebhookPayload };