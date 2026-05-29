import { processWebhookPost } from "./webhook.mjs";

function jsonResponse(statusCode, body) {
  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname !== "/webhook/suportes") {
      return env.ASSETS.fetch(request);
    }

    if (request.method !== "POST") {
      return jsonResponse(405, { ok: false, error: "Metodo nao permitido." });
    }

    try {
      const result = await processWebhookPost(
        {
          httpMethod: "POST",
          body: await request.text(),
          headers: Object.fromEntries(request.headers),
          queryStringParameters: Object.fromEntries(url.searchParams)
        },
        { origemIntegracao: "webhook-cloudflare-worker", env }
      );
      return jsonResponse(result.statusCode, JSON.parse(result.body));
    } catch (error) {
      return jsonResponse(500, {
        ok: false,
        error: "Erro interno ao processar webhook.",
        details: String(error?.message || error)
      });
    }
  }
};
