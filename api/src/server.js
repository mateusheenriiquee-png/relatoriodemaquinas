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

async function isAdminAuthorized(req) {
  // Obter token do header Authorization
  const authHeader = req.headers["authorization"] || "";
  const headerToken = authHeader.replace("Bearer ", "");
  
  console.log(`[Admin] Verificando autorização:`);
  console.log(`  - Authorization header: ${authHeader ? "✓" : "✗"}`);
  console.log(`  - Token extraído: ${headerToken ? headerToken.substring(0, 50) + "..." : "✗"}`);
  
  // Se há token, validar com Firebase
  if (headerToken) {
    console.log(`[Admin] Validando Firebase Token...`);
    try {
      const decodedToken = await admin.auth().verifyIdToken(headerToken);
      console.log(`[Admin] ✅ Firebase Token válido - UID: ${decodedToken.uid}, Email: ${decodedToken.email}`);
      return true;
    } catch (error) {
      console.error(`[Admin] ❌ Erro ao validar Firebase token:`, error.message);
      return false;
    }
  }
  
  // Sem token - modo desenvolvimento, permitir
  console.log(`[Admin] Nenhum token fornecido - modo desenvolvimento (permitindo)`);
  return true;
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

// Endpoint para criar novo usuário (requer ser admin)
app.post("/admin/create-user", async (req, res) => {
  // Verificar autenticação
  const authorized = await isAdminAuthorized(req);
  if (!authorized) {
    console.log("[Admin] ❌ Requisição não autorizada");
    return res.status(401).json({
      ok: false,
      error: "Não autorizado. Forneça um token válido via header X-Admin-Token ou Authorization: Bearer"
    });
  }

  const { email, password, displayName, cargo } = req.body;

  // Validação básica
  if (!email || !password) {
    return res.status(400).json({
      ok: false,
      error: "Email e senha são obrigatórios."
    });
  }

  try {
    console.log(`[Admin] Criando novo usuário: ${email}`);

    // Criar usuário no Firebase Authentication
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: displayName || email
    });

    console.log(`[Admin] UID gerado: ${userRecord.uid}`);

    // Criar documento na coleção "usuarios" do Firestore
    const usuariosCollection = process.env.USUARIOS_COLLECTION || "usuarios";
    await db.collection(usuariosCollection).doc(userRecord.uid).set({
      uid: userRecord.uid,
      email: email,
      displayName: displayName || "",
      cargo: cargo || "operador",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    console.log(`[Admin] Documento Firestore criado para ${userRecord.uid}`);

    return res.status(201).json({
      ok: true,
      uid: userRecord.uid,
      message: `Usuário ${email} criado com sucesso!`
    });
  } catch (error) {
    console.error(`[Admin] Erro ao criar usuário: ${error.message}`);
    
    // Mapear erro específico do Firebase
    let errorMessage = "Erro ao criar usuário.";
    if (error.code === "auth/email-already-exists") {
      errorMessage = "Este email já está cadastrado.";
    } else if (error.code === "auth/invalid-email") {
      errorMessage = "Email inválido.";
    } else if (error.code === "auth/weak-password") {
      errorMessage = "Senha muito fraca. Use pelo menos 6 caracteres.";
    }

    return res.status(400).json({
      ok: false,
      error: errorMessage,
      details: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Webhook API rodando em http://localhost:${PORT}`);
});
