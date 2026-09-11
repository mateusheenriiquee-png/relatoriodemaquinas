/**
 * kommo-mapper.js — converte um lead do Kommo num registro de "suporte".
 *
 * Os campos novos (vendaStatus, valorVenda, kommoLeadId, ...) são atribuídos
 * direto aqui, fora do normalizeSupport genérico: aquele pipeline converte
 * tudo para texto e normaliza chaves desconhecidas para minúsculas
 * (collectUnmappedFields), o que quebraria um valorVenda numérico e a leitura
 * camelCase que o dashboard espera.
 *
 * O mapeamento de status_id -> status interno e de tags -> técnico/turno vem
 * de config/kommo (Firestore), não é hardcoded: os IDs de estágio são
 * específicos de cada conta Kommo.
 */

const { normalizeText } = require("./normalize");
const { normalizeTecnico } = require("./tecnico");
const { stripEmptyFields } = require("./support-id");

function normalizeKeyLoose(value) {
  return normalizeText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function epochToIso(seconds) {
  const n = Number(seconds);
  if (!n) return "";
  return new Date(n * 1000).toISOString();
}

function resolveFromTagMap(map, tagName) {
  if (!map || !tagName) return "";
  const target = normalizeKeyLoose(tagName);
  for (const [mapKey, mapValue] of Object.entries(map)) {
    if (normalizeKeyLoose(mapKey) === target) return mapValue;
  }
  return "";
}

function resolveTecnicoETurno(tags, config) {
  let tecnico = "";
  let turno = "";
  for (const tag of Array.isArray(tags) ? tags : []) {
    const nome = tag && tag.name;
    if (!nome) continue;
    if (!tecnico) tecnico = resolveFromTagMap(config.tecnicoTagMap, nome);
    if (!turno) turno = resolveFromTagMap(config.turnoTagMap, nome);
  }
  return { tecnico, turno };
}

function resolveStatusEVenda(statusId, config) {
  const idText = normalizeText(statusId);
  const wonIds = (config.wonStatusIds || []).map((v) => normalizeText(v));
  const lostIds = (config.lostStatusIds || []).map((v) => normalizeText(v));

  let vendaStatus = "";
  if (idText && wonIds.includes(idText)) vendaStatus = "GANHO";
  else if (idText && lostIds.includes(idText)) vendaStatus = "PERDIDO";

  const statusMap = config.statusMap || {};
  const status = statusMap[idText] || "";

  return { status, vendaStatus };
}

function buildSupportRecordFromKommoLead(lead, config = {}) {
  if (!lead || !lead.id) return null;

  const { status, vendaStatus } = resolveStatusEVenda(lead.status_id, config);
  const tags = (lead._embedded && lead._embedded.tags) || [];
  const { tecnico, turno } = resolveTecnicoETurno(tags, config);
  const docId = `kommo_lead_${lead.id}`;

  const fields = {
    responsavelAbertura: normalizeText(lead.name) || undefined,
    status: status || undefined,
    tecnico: tecnico ? normalizeTecnico(tecnico) : undefined,
    turno: turno || undefined,
    vendaStatus: vendaStatus || undefined,
    valorVenda: typeof lead.price === "number" ? lead.price : undefined,
    dataAbertura: epochToIso(lead.created_at) || undefined,
    dataFinalizacao: vendaStatus ? epochToIso(lead.closed_at) || new Date().toISOString() : undefined,
    kommoLeadId: String(lead.id),
    kommoPipelineId: lead.pipeline_id != null ? String(lead.pipeline_id) : undefined,
    kommoStatusId: lead.status_id != null ? String(lead.status_id) : undefined,
    kommoResponsibleId: lead.responsible_user_id != null ? String(lead.responsible_user_id) : undefined
  };

  return {
    docId,
    fields: {
      ...stripEmptyFields(fields),
      origemIntegracao: "kommo",
      idempotencyKey: docId
    }
  };
}

module.exports = { buildSupportRecordFromKommoLead };
