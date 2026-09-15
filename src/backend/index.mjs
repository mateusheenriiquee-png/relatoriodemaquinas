import { processWebhookPost } from "./webhook.mjs";
import { processKommoWebhookPost } from "./webhook-kommo.mjs";
import { processarReagendadosVencidos } from "./reagendados.mjs";
import { handleAdminRequest } from "./admin-api.mjs";
import { normalizeText } from "../shared/normalize.js";
import { registrarErro } from "./erros.mjs";

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-webhook-token"
};

/** Mesmo token do webhook: o disparo manual da rotina não pode ficar aberto. */
function isAuthorized(request, url, env) {
  const esperado = normalizeText(env.WEBHOOK_TOKEN || "");
  if (!esperado) return true;
  const recebido =
    normalizeText(request.headers.get("x-webhook-token")) ||
    normalizeText(url.searchParams.get("token"));
  return recebido === esperado;
}

/**
 * Main Cloudflare Worker Handler
 * Routes requests and serves static assets
 */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    try {
      // 🪝 Webhook endpoint (POST /webhook/suportes)
      if (pathname === "/webhook/suportes" && request.method === "POST") {
        const body = await request.text();
        const response = await processWebhookPost(
          {
            httpMethod: request.method,
            body,
            headers: Object.fromEntries(request.headers),
            queryStringParameters: Object.fromEntries(url.searchParams)
          },
          { env }
        );

        return new Response(response.body, {
          status: response.statusCode,
          headers: JSON_HEADERS
        });
      }

      // 🪝 Webhook do Kommo (POST /webhook/kommo) — mudança de estágio no
      // funil do Kommo. Payload enxuto (id/status_id/pipeline_id); o handler
      // busca o lead completo de volta na API do Kommo antes de gravar.
      if (pathname === "/webhook/kommo" && request.method === "POST") {
        const body = await request.text();
        const response = await processKommoWebhookPost(
          {
            httpMethod: request.method,
            body,
            headers: Object.fromEntries(request.headers),
            queryStringParameters: Object.fromEntries(url.searchParams),
            contentType: request.headers.get("content-type") || ""
          },
          { env }
        );

        return new Response(response.body, {
          status: response.statusCode,
          headers: JSON_HEADERS
        });
      }

      // 🔒 API administrativa (/api/admin/*): criar, editar e excluir
      // usuários e assumir atendimento. Devolve null quando o caminho não é
      // dela, e aí a requisição segue para os arquivos estáticos do painel.
      const respostaAdmin = await handleAdminRequest(request, env, url);
      if (respostaAdmin) return respostaAdmin;

      // ⏰ Disparo manual da mesma rotina do Cron Trigger.
      // Serve para testar sem esperar o cron e para reprocessar depois de uma
      // indisponibilidade. O cron continua sendo o caminho normal.
      if (pathname === "/tasks/reagendados" && request.method === "POST") {
        if (!isAuthorized(request, url, env)) {
          return new Response(JSON.stringify({ ok: false, error: "Nao autorizado." }), {
            status: 401,
            headers: JSON_HEADERS
          });
        }

        const resultado = await processarReagendadosVencidos(env);
        return new Response(JSON.stringify({ ok: true, ...resultado }), {
          status: 200,
          headers: JSON_HEADERS
        });
      }

      // 🔙 Serve static assets (frontend)
      return env.ASSETS.fetch(request);
    } catch (error) {
      const ref = registrarErro("Worker", error);
      return new Response(
        JSON.stringify({ ok: false, error: "Erro interno.", ref }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
  },

  /**
   * ⏰ Cron Trigger — reabre os suportes cujo reagendamento venceu.
   *
   * Roda no Worker, não no navegador: um suporte reagendado para as 8h volta
   * para EM ABERTO às 8h mesmo que ninguém esteja com o painel aberto.
   * A cadência está em `[triggers] crons` no wrangler.toml.
   */
  async scheduled(event, env, ctx) {
    const executar = async () => {
      const inicio = Date.now();
      try {
        const { verificados, reabertos, falhas } = await processarReagendadosVencidos(env);
        console.log(
          `[Cron] reagendados: ${verificados} verificado(s), ${reabertos.length} reaberto(s)` +
            `${reabertos.length ? ` → ${reabertos.join(", ")}` : ""}` +
            `${falhas.length ? ` | ${falhas.length} falha(s)` : ""}` +
            ` (${Date.now() - inicio}ms)`
        );
      } catch (error) {
        // O throw marca a execução como falha no painel da Cloudflare — é
        // justamente o sinal que queremos ver se a rotina parar de funcionar.
        console.error("[Cron] Falha ao processar reagendados:", error?.message || error);
        throw error;
      }
    };

    const promessa = executar();
    ctx.waitUntil(promessa);
    await promessa;
  }
};
