/**
 * kommo-client.js — cliente mínimo da REST API do Kommo (v4).
 *
 * O webhook de Digital Pipeline do Kommo manda só id/status_id/pipeline_id;
 * para completar nome, valor, responsável e tags é preciso essa chamada de
 * volta. Usa fetch nativo (Node >=18 / Worker) — sem dependência nova.
 */

async function kommoFetch(path, { baseUrl, accessToken, retries = 2 } = {}) {
  if (!baseUrl) throw new Error("KOMMO_BASE_URL nao configurada.");
  if (!accessToken) throw new Error("KOMMO_ACCESS_TOKEN nao configurado.");

  const url = `${String(baseUrl).replace(/\/+$/, "")}${path}`;
  let attempt = 0;

  for (;;) {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
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

module.exports = { getLead };
