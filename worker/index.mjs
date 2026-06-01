import { processWebhookPost } from "./webhook.mjs";
import { importFromSheetsWorker } from "./sheets-import.mjs";

function jsonResponse(statusCode, body) {
  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/sheets/full-import") {
      if (request.method !== "POST") {
        return jsonResponse(405, { ok: false, error: "Metodo nao permitido." });
      }

      try {
        const spreadsheetId = env.SHEETS_SPREADSHEET_ID;
        const sheetName = env.SHEETS_SHEET_NAME || "Sheet1";
        const serviceAccountRaw = env.FIREBASE_SERVICE_ACCOUNT;
        const accessToken = env.GOOGLE_API_KEY;

        if (!spreadsheetId || !serviceAccountRaw) {
          return jsonResponse(400, {
            ok: false,
            error: "SHEETS_SPREADSHEET_ID or FIREBASE_SERVICE_ACCOUNT not configured."
          });
        }

        const collection = env.FIRESTORE_COLLECTION || "suportes_tecnicos";
        const result = await importFromSheetsWorker({
          spreadsheetId,
          sheetName,
          accessToken,
          serviceAccountRaw,
          collection
        });
        return jsonResponse(200, { ok: true, ...result });
      } catch (error) {
        return jsonResponse(500, {
          ok: false,
          error: "Erro ao importar dados da planilha.",
          details: String(error?.message || error)
        });
      }
    }

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
