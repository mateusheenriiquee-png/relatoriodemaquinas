const express = require("express");
const cors = require("cors");
const { db, admin } = require("./firebase-admin");
const { normalizeSupport, normalizeText } = require("./normalize");

const app = express();
const PORT = process.env.PORT || 3000;
const COLLECTION = process.env.FIRESTORE_COLLECTION || "suportes_tecnicos";
const WEBHOOK_TOKEN = normalizeText(process.env.WEBHOOK_TOKEN || "");

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

function hasMeaningfulSupportData(support = {}) {
  return Boolean(
    support.protocolo ||
    support.responsavelAbertura ||
    support.cpfCnpj ||
    support.contato ||
    support.descricao ||
    support.tipo ||
    support.ac ||
    support.tecnico ||
    support.statusAbertura ||
    support.dataAbertura
  );
}

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true, service: "suporte-webhook-api" });
});

app.post("/webhook/suportes", async (req, res) => {
  try {
    if (!isAuthorized(req)) {
      return res.status(401).json({ ok: false, error: "Nao autorizado." });
    }

    const payload = req.body;
    const inputs = Array.isArray(payload) ? payload : [payload];
    if (!inputs.length) {
      return res.status(400).json({ ok: false, error: "Payload vazio." });
    }

    const batch = db.batch();
    let inserted = 0;

    for (const input of inputs) {
      const support = normalizeSupport(input);
      if (!hasMeaningfulSupportData(support)) {
        continue;
      }
      const ref = db.collection(COLLECTION).doc();
      batch.set(ref, {
        ...support,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        origemIntegracao: "webhook"
      });
      inserted += 1;
    }

    if (!inserted) {
      return res.status(400).json({ ok: false, error: "Nenhum registro valido no payload." });
    }

    await batch.commit();
    return res.status(201).json({ ok: true, inserted });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Erro interno ao processar webhook.",
      details: String(error?.message || error)
    });
  }
});

app.listen(PORT, () => {
  console.log(`Webhook API rodando em http://localhost:${PORT}`);
});
