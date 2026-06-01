const express = require("express");
const cors = require("cors");
const { db, admin } = require("./firebase-admin");
const { normalizeText } = require("./normalize");
const { prepareWebhookRecords } = require("./webhook-shared");
const { upsertSheetRow, deleteSheetRow } = require("./sheets");

const app = express();
const PORT = process.env.PORT || 3000;
const WEBHOOK_TOKEN = normalizeText(process.env.WEBHOOK_TOKEN || "");
const MAX_ITEMS_PER_REQUEST = Number(process.env.MAX_ITEMS_PER_REQUEST || 100);
const MAX_CONCURRENT_WEBHOOKS = Number(process.env.MAX_CONCURRENT_WEBHOOKS || 20);
let activeWebhookRequests = 0;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

function isAuthorized(req) {
  if (!WEBHOOK_TOKEN) return true;
  const token =
    normalizeText(req.headers["x-webhook-token"]) ||
    normalizeText(req.query.token) ||
    normalizeText(req.body?.token);
  return token && token === WEBHOOK_TOKEN;
}

function isSheetsAuthorized(req) {
  const token = (req.headers["x-sync-token"] || "").toString();
  const expected = (process.env.SHEETS_SYNC_TOKEN || "").toString();
  if (!expected) return true;
  return token && token === expected;
}

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true, service: "suporte-webhook-api" });
});

app.post("/webhook/suportes", async (req, res) => {
  if (activeWebhookRequests >= MAX_CONCURRENT_WEBHOOKS) {
    return res.status(429).json({
      ok: false,
      error: "Muitas requisicoes simultaneas. Tente novamente em instantes."
    });
  }

  activeWebhookRequests += 1;
  try {
    if (!isAuthorized(req)) {
      return res.status(401).json({ ok: false, error: "Nao autorizado." });
    }

    const payload = req.body;
    const inputs = Array.isArray(payload) ? payload : [payload];
    if (!inputs.length) {
      return res.status(400).json({ ok: false, error: "Payload vazio." });
    }
    if (inputs.length > MAX_ITEMS_PER_REQUEST) {
      return res.status(413).json({
        ok: false,
        error: `Quantidade maxima por requisicao: ${MAX_ITEMS_PER_REQUEST}.`
      });
    }

    const records = prepareWebhookRecords(inputs, "webhook");
    if (!records.length) {
      return res.status(400).json({
        ok: false,
        error: "Nenhum dado reconhecido no payload. Envie ao menos um campo com valor."
      });
    }

    const batch = db.batch();
    for (const { docId, fields } of records) {
      const ref = db.collection(process.env.FIRESTORE_COLLECTION || "suportes_tecnicos").doc(docId);
      batch.set(
        ref,
        {
          ...fields,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );
    }

    await batch.commit();
    return res.status(201).json({ ok: true, upserted: records.length, inserted: records.length });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Erro interno ao processar webhook.",
      details: String(error?.message || error)
    });
  } finally {
    activeWebhookRequests = Math.max(0, activeWebhookRequests - 1);
  }
});

app.post("/sheets/upsert", async (req, res) => {
  if (!isSheetsAuthorized(req)) return res.status(401).json({ ok: false, error: "Nao autorizado." });
  const doc = req.body?.doc;
  if (!doc || !doc.id) return res.status(400).json({ ok: false, error: "doc com id necessario." });
  try {
    const spreadsheetId = process.env.SHEETS_SPREADSHEET_ID;
    const sheetName = process.env.SHEETS_SHEET_NAME || "Sheet1";
    const serviceAccountRaw = process.env.SHEETS_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT;
    const result = await upsertSheetRow({ serviceAccountRaw, spreadsheetId, sheetName, doc });
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

app.post("/sheets/delete", async (req, res) => {
  if (!isSheetsAuthorized(req)) return res.status(401).json({ ok: false, error: "Nao autorizado." });
  const docId = req.body?.docId;
  if (!docId) return res.status(400).json({ ok: false, error: "docId requerido." });
  try {
    const spreadsheetId = process.env.SHEETS_SPREADSHEET_ID;
    const sheetName = process.env.SHEETS_SHEET_NAME || "Sheet1";
    const serviceAccountRaw = process.env.SHEETS_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT;
    const result = await deleteSheetRow({ serviceAccountRaw, spreadsheetId, sheetName, docId });
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

app.listen(PORT, () => {
  console.log(`Webhook API rodando em http://localhost:${PORT}`);
});
