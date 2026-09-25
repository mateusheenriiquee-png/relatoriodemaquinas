import { normalizeText } from "../shared/normalize.js";
import { parseKommoBody } from "../shared/kommo-form-parser.js";
import { getLead } from "../shared/kommo-client.js";
import { buildSupportRecordFromKommoLead } from "../shared/kommo-mapper.js";
import { lerConfig, upsertRecords } from "./supabase-rest.mjs";
import { MAX_RECORDS_POR_REQUISICAO } from "../shared/webhook-shared.js";
import { registrarErro } from "./erros.mjs";

function getEnv(env) {
  return {
    webhookToken: normalizeText(env.WEBHOOK_TOKEN || ""),
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
    // Defesa em profundidade: cada mudança dispara uma chamada de volta à API
    // do Kommo (getLead) antes de escrever — aqui o custo por item é maior
    // ainda que no webhook genérico, então o mesmo teto vale a pena.
    if (changes.length > MAX_RECORDS_POR_REQUISICAO) {
      return jsonResponse(413, {
        ok: false,
        error: `Payload com ${changes.length} mudancas excede o limite de ${MAX_RECORDS_POR_REQUISICAO} por chamada.`
      });
    }

    if (!config.kommoAccessToken || !config.kommoBaseUrl) {
      return jsonResponse(500, {
        ok: false,
        error: "KOMMO_ACCESS_TOKEN/KOMMO_BASE_URL nao configurados."
      });
    }

    // Mapa de estágios/tags do Kommo — linha "kommo" da tabela config.
    const kommoConfig = (await lerConfig(env, "kommo")) || {};

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
      // As mensagens da API do Kommo ficam no log; na resposta vão só os IDs,
      // que bastam para saber quais leads reprocessar.
      const ref = registrarErro("Kommo", JSON.stringify(errors));
      return jsonResponse(502, {
        ok: false,
        error: "Falha ao buscar leads no Kommo.",
        leadsComFalha: errors.map((e) => e.leadId),
        ref
      });
    }

    const upserted = await upsertRecords({ env, records });

    return jsonResponse(201, {
      ok: true,
      upserted,
      errors: errors.length ? errors : undefined
    });
  } catch (error) {
    const ref = registrarErro("Kommo", error);
    return jsonResponse(500, { ok: false, error: "Erro interno ao processar webhook do Kommo.", ref });
  }
}
