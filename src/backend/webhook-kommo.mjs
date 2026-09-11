import { normalizeText } from "../shared/normalize.js";
import { parseKommoBody } from "../shared/kommo-form-parser.js";
import { getLead } from "../shared/kommo-client.js";
import { buildSupportRecordFromKommoLead } from "../shared/kommo-mapper.js";
import { getDocument, upsertRecords } from "./firestore-rest.mjs";

function getEnv(env) {
  const firebaseBase64 = env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  const firebaseRaw = env.FIREBASE_SERVICE_ACCOUNT;

  let serviceAccountRaw = firebaseBase64 || firebaseRaw;
  const isBase64 = !!firebaseBase64;

  if (isBase64 && serviceAccountRaw) {
    try {
      serviceAccountRaw = atob(serviceAccountRaw);
    } catch (e) {
      console.error("[Kommo] Erro ao decodificar Base64:", e.message);
    }
  }

  return {
    collection: env.FIRESTORE_COLLECTION || "suportes_tecnicos",
    webhookToken: normalizeText(env.WEBHOOK_TOKEN || ""),
    serviceAccountRaw,
    kommoBaseUrl: normalizeText(env.KOMMO_BASE_URL || ""),
    kommoAccessToken: normalizeText(env.KOMMO_ACCESS_TOKEN || "")
  };
}

function isAuthorized({ headers = {}, queryStringParameters = {} }, webhookToken) {
  if (!webhookToken) return true;
  const token =
    normalizeText(headers["x-webhook-token"]) ||
    normalizeText(headers["X-Webhook-Token"]) ||
    normalizeText(queryStringParameters?.token);
  return token === webhookToken;
}

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    body: JSON.stringify(payload)
  };
}

/**
 * O Kommo manda mudanças de lead agrupadas por tipo de evento
 * (leads.status[], leads.add[], leads.update[]). Cada entrada tem pelo menos
 * `id`; os outros campos (name, price, tags...) vêm só na chamada de callback
 * `GET /leads/{id}`, não no webhook em si.
 */
function extractLeadChanges(payload) {
  const leadsNode = (payload && payload.leads) || {};
  const changes = [];
  const seen = new Set();

  for (const group of ["status", "add", "update"]) {
    const entries = leadsNode[group];
    if (!entries) continue;
    const list = Array.isArray(entries) ? entries : Object.values(entries);
    for (const entry of list) {
      const id = entry && entry.id;
      if (!id || seen.has(String(id))) continue;
      seen.add(String(id));
      changes.push(entry);
    }
  }

  return changes;
}

export async function processKommoWebhookPost(
  { httpMethod = "POST", body = "", headers = {}, queryStringParameters = {}, contentType = "" },
  { env } = {}
) {
  if (httpMethod !== "POST") {
    return jsonResponse(405, { ok: false, error: "Metodo nao permitido." });
  }

  if (!env) {
    return jsonResponse(500, { ok: false, error: "Ambiente Cloudflare nao configurado." });
  }

  try {
    const config = getEnv(env);

    if (!isAuthorized({ headers, queryStringParameters }, config.webhookToken)) {
      return jsonResponse(401, { ok: false, error: "Nao autorizado." });
    }

    const parsedBody = parseKommoBody(body, contentType);
    const changes = extractLeadChanges(parsedBody);
    if (!changes.length) {
      return jsonResponse(400, {
        ok: false,
        error: "Nenhuma mudanca de lead reconhecida no payload."
      });
    }

    if (!config.kommoAccessToken || !config.kommoBaseUrl) {
      return jsonResponse(500, {
        ok: false,
        error: "KOMMO_ACCESS_TOKEN/KOMMO_BASE_URL nao configurados."
      });
    }

    const kommoConfig =
      (await getDocument({
        serviceAccountRaw: config.serviceAccountRaw,
        collection: "config",
        docId: "kommo"
      })) || {};

    const records = [];
    const errors = [];

    for (const change of changes) {
      try {
        const lead = await getLead({
          baseUrl: config.kommoBaseUrl,
          accessToken: config.kommoAccessToken,
          leadId: change.id
        });
        const record = buildSupportRecordFromKommoLead(lead, kommoConfig);
        if (record) records.push(record);
      } catch (error) {
        errors.push({ leadId: change.id, error: String(error?.message || error) });
      }
    }

    if (!records.length) {
      return jsonResponse(502, {
        ok: false,
        error: "Falha ao buscar leads no Kommo.",
        details: errors
      });
    }

    const upserted = await upsertRecords({
      serviceAccountRaw: config.serviceAccountRaw,
      collection: config.collection,
      records
    });

    return jsonResponse(201, {
      ok: true,
      upserted,
      errors: errors.length ? errors : undefined
    });
  } catch (error) {
    return jsonResponse(500, {
      ok: false,
      error: "Erro interno ao processar webhook do Kommo.",
      details: String(error?.message || error)
    });
  }
}
