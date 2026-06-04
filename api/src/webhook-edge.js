const { upsertRecords } = require("./firestore-rest");
const { parseBody, getEnvConfig, authorizeWebhook, validatePayload, jsonResponse } = require("./services/webhook-common");

async function processWebhookPost(
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
    const upserted = await upsertRecords({
      serviceAccountRaw: config.serviceAccountRaw,
      collection: config.collection,
      records: validation.records
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

module.exports = { processWebhookPost };
