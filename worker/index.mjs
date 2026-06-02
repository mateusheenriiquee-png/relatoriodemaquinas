import { processWebhookPost } from "./webhook.mjs";
import { upsertSheetRow, deleteSheetRow } from "./sheets-sync.mjs";
import { createUserInFirebase } from "./auth-admin.mjs";

function jsonResponse(statusCode, body) {
  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

function isSheetsAuthorized(request, env) {
  const expected = (env.SHEETS_SYNC_TOKEN || "").toString();
  if (!expected) return true;
  const token = (request.headers.get("x-sync-token") || "").toString();
  return token && token === expected;
}

function getSheetsConfig(env) {
  return {
    spreadsheetId: env.SHEETS_SPREADSHEET_ID,
    sheetName: env.SHEETS_SHEET_NAME || "Sheet1",
    serviceAccountRaw: env.SHEETS_SERVICE_ACCOUNT || env.FIREBASE_SERVICE_ACCOUNT
  };
}

async function handleSheetsRoute(request, env, action) {
  if (request.method !== "POST") {
    return jsonResponse(405, { ok: false, error: "Metodo nao permitido." });
  }
  if (!isSheetsAuthorized(request, env)) {
    return jsonResponse(401, { ok: false, error: "Nao autorizado." });
  }

  const { spreadsheetId, sheetName, serviceAccountRaw } = getSheetsConfig(env);
  if (!spreadsheetId || !serviceAccountRaw) {
    return jsonResponse(400, {
      ok: false,
      error: "SHEETS_SPREADSHEET_ID ou FIREBASE_SERVICE_ACCOUNT nao configurados."
    });
  }

  try {
    const body = await request.json();
    if (action === "upsert") {
      const doc = body?.doc;
      if (!doc?.id) {
        return jsonResponse(400, { ok: false, error: "doc com id necessario." });
      }
      const result = await upsertSheetRow({ serviceAccountRaw, spreadsheetId, sheetName, doc });
      return jsonResponse(200, { ok: true, ...result });
    }

    const docId = body?.docId;
    if (!docId) {
      return jsonResponse(400, { ok: false, error: "docId requerido." });
    }
    const result = await deleteSheetRow({ serviceAccountRaw, spreadsheetId, sheetName, docId });
    return jsonResponse(200, { ok: true, ...result });
  } catch (error) {
    return jsonResponse(500, {
      ok: false,
      error: "Erro ao sincronizar com a planilha.",
      details: String(error?.message || error)
    });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/sheets/upsert") {
      return handleSheetsRoute(request, env, "upsert");
    }
    if (url.pathname === "/sheets/delete") {
      return handleSheetsRoute(request, env, "delete");
    }

    if (url.pathname === "/webhook/suportes") {
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

    // Endpoint para criar novo usuário via Cloudflare Worker
    if (url.pathname === "/admin/create-user") {
      if (request.method !== "POST") {
        return jsonResponse(405, { ok: false, error: "Metodo nao permitido." });
      }

      try {
        const body = await request.json();
        const { email, password, displayName, cargo } = body;

        if (!email || !password) {
          return jsonResponse(400, {
            ok: false,
            error: "Email e senha são obrigatórios."
          });
        }

        const result = await createUserInFirebase(email, password, displayName, cargo);

        if (result.ok) {
          return jsonResponse(201, result);
        } else {
          return jsonResponse(400, result);
        }
      } catch (error) {
        console.error("[Cloudflare] Erro:", error);
        return jsonResponse(500, {
          ok: false,
          error: "Erro ao processar requisição.",
          details: String(error?.message || error)
        });
      }
    }

    return env.ASSETS.fetch(request);
  }
};
