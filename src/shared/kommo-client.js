/**
 * kommo-client.js — cliente mínimo da REST API do Kommo (v4).
 *
 * O webhook de Digital Pipeline do Kommo manda só id/status_id/pipeline_id;
 * para completar nome, valor, responsável e tags é preciso essa chamada de
 * volta. Usa fetch nativo (Node >=18 / Worker) — sem dependência nova.
 */

async function kommoFetch(path, { baseUrl, accessToken, method = "GET", body, retries = 2 } = {}) {
  if (!baseUrl) throw new Error("KOMMO_BASE_URL nao configurada.");
  if (!accessToken) throw new Error("KOMMO_ACCESS_TOKEN nao configurado.");

  const url = `${String(baseUrl).replace(/\/+$/, "")}${path}`;
  let attempt = 0;

  for (;;) {
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(body ? { "Content-Type": "application/json" } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });

    if (response.status === 429 && attempt < retries) {
      attempt += 1;
      await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
      continue;
    }

    if (!response.ok) {
      const details = await response.text().catch(() => "");
      throw new Error(`Kommo API ${response.status}: ${details || response.statusText}`);
    }

    // PATCH em lead único devolve o objeto atualizado; sem corpo (204) não há o que ler.
    if (response.status === 204) return null;
    return response.json();
  }
}

async function getLead({ baseUrl, accessToken, leadId }) {
  if (!leadId) throw new Error("leadId obrigatorio.");
  return kommoFetch(`/api/v4/leads/${encodeURIComponent(leadId)}?with=contacts`, {
    baseUrl,
    accessToken
  });
}

/**
 * Atualiza um lead num único PATCH /api/v4/leads/{id}: etapa (status_id, e
 * pipeline_id quando informado — necessário se o lead estiver em outro funil)
 * e/ou campos personalizados. Só manda o que vier preenchido.
 */
async function updateLead({ baseUrl, accessToken, leadId, statusId, pipelineId, customFields }) {
  if (!leadId) throw new Error("leadId obrigatorio.");
  const body = {};
  if (statusId) body.status_id = Number(statusId);
  if (pipelineId) body.pipeline_id = Number(pipelineId);
  if (Array.isArray(customFields) && customFields.length) body.custom_fields_values = customFields;
  if (!Object.keys(body).length) return null;
  return kommoFetch(`/api/v4/leads/${encodeURIComponent(leadId)}`, {
    baseUrl,
    accessToken,
    method: "PATCH",
    body
  });
}

/** Move um lead para outra etapa (atalho de updateLead). */
async function updateLeadStatus({ baseUrl, accessToken, leadId, statusId, pipelineId }) {
  if (!statusId) throw new Error("statusId obrigatorio.");
  return updateLead({ baseUrl, accessToken, leadId, statusId, pipelineId });
}

/**
 * Definição de todos os campos personalizados de lead. Pagina de 50 em 50 (o
 * teto dessa rota no Kommo) e segue enquanto vier página cheia ou link
 * `next` — sem isso, campos criados depois ficavam de fora.
 */
async function listarCustomFields(entidade, { baseUrl, accessToken }) {
  const POR_PAGINA = 50;
  const campos = [];
  for (let pagina = 1; pagina <= 40; pagina += 1) {
    const resposta = await kommoFetch(`/api/v4/${entidade}/custom_fields?limit=${POR_PAGINA}&page=${pagina}`, {
      baseUrl,
      accessToken
    });
    const lista = resposta?._embedded?.custom_fields || [];
    campos.push(...lista);
    if (!lista.length || (lista.length < POR_PAGINA && !resposta?._links?.next)) break;
  }
  return campos;
}

const getLeadCustomFields = (credenciais) => listarCustomFields("leads", credenciais);
const getContactCustomFields = (credenciais) => listarCustomFields("contacts", credenciais);

async function getContact({ baseUrl, accessToken, contactId, withLeads = false }) {
  if (!contactId) throw new Error("contactId obrigatorio.");
  const extra = withLeads ? "?with=leads" : "";
  return kommoFetch(`/api/v4/contacts/${encodeURIComponent(contactId)}${extra}`, { baseUrl, accessToken });
}

/** Vários leads de uma vez (id, pipeline_id, status_id, updated_at...). Até 50 ids. */
async function getLeadsByIds({ baseUrl, accessToken, ids }) {
  const lista = [...new Set((ids || []).map(String).filter(Boolean))].slice(0, 50);
  if (!lista.length) return [];
  const filtro = lista.map((id) => `filter[id][]=${encodeURIComponent(id)}`).join("&");
  const resposta = await kommoFetch(`/api/v4/leads?${filtro}&limit=50`, { baseUrl, accessToken });
  return resposta?._embedded?.leads || [];
}

async function updateContact({ baseUrl, accessToken, contactId, customFields }) {
  if (!contactId) throw new Error("contactId obrigatorio.");
  return kommoFetch(`/api/v4/contacts/${encodeURIComponent(contactId)}`, {
    baseUrl,
    accessToken,
    method: "PATCH",
    body: { custom_fields_values: customFields }
  });
}

/**
 * Mensagens de uma conversa do chat (a mesma rota que o workflow do n8n usa).
 * Devolve a lista crua de `_embedded.messages` — vazia se a conversa não
 * existir mais (204) ou vier sem mensagens.
 */
async function getTalkMessages({ baseUrl, accessToken, talkId, limit = 100 }) {
  if (!talkId) throw new Error("talkId obrigatorio.");
  const resposta = await kommoFetch(`/api/v4/talks/${encodeURIComponent(talkId)}/messages?limit=${limit}`, {
    baseUrl,
    accessToken
  });
  return resposta?._embedded?.messages || [];
}

/**
 * Eventos de mensagem do chat de um lead (entrada e saída), os mais recentes
 * primeiro — é por eles que se descobre a conversa (talk) de um lead quando
 * não chegou nenhum webhook de mensagem para o sistema.
 */
async function getLeadChatEvents({ baseUrl, accessToken, leadId, limit = 20 }) {
  if (!leadId) throw new Error("leadId obrigatorio.");
  const filtro = [
    "filter[entity]=lead",
    `filter[entity_id][]=${encodeURIComponent(leadId)}`,
    "filter[type][]=incoming_chat_message",
    "filter[type][]=outgoing_chat_message"
  ].join("&");
  const resposta = await kommoFetch(`/api/v4/events?${filtro}&limit=${limit}`, { baseUrl, accessToken });
  return resposta?._embedded?.events || [];
}

module.exports = {
  getLeadChatEvents,
  getTalkMessages,
  getLeadsByIds,
  getLead,
  updateLead,
  updateLeadStatus,
  getLeadCustomFields,
  getContactCustomFields,
  getContact,
  updateContact
};
