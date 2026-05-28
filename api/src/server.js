const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const { db, admin } = require("./firebase-admin");
const { normalizeSupport, normalizeText } = require("./normalize");

const app = express();
const PORT = process.env.PORT || 3000;
const COLLECTION = process.env.FIRESTORE_COLLECTION || "suportes_tecnicos";
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

function hasAnyInputField(input) {
  return Boolean(input && typeof input === "object" && !Array.isArray(input) && Object.keys(input).length);
}

function normalizeIdPart(value) {
  return normalizeText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function getIdempotencyDocId(support) {
  const keyParts = [support.protocolo, support.cpfCnpj, support.dataAbertura]
    .map(normalizeIdPart)
    .filter(Boolean);

  if (keyParts.length) {
    return `support_${keyParts.join("_")}`.slice(0, 200);
  }

  const fallbackHash = crypto
    .createHash("sha1")
    .update(JSON.stringify(support || {}))
    .digest("hex");
  return `support_hash_${fallbackHash}`;
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

    const batch = db.batch();
    let upserted = 0;

    for (const input of inputs) {
      if (!hasAnyInputField(input)) {
        continue;
      }
      const support = normalizeSupport(input);
      if (!hasMeaningfulSupportData(support)) {
        continue;
      }

      const docId = getIdempotencyDocId(support);
      const ref = db.collection(COLLECTION).doc(docId);
      batch.set(
        ref,
        {
        ...support,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        origemIntegracao: "webhook",
        idempotencyKey: docId
      },
        { merge: true }
      );
      upserted += 1;
    }

    if (!upserted) {
      return res.status(400).json({ ok: false, error: "Nenhum registro valido no payload." });
    }

    await batch.commit();
    return res.status(201).json({ ok: true, upserted });
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

app.listen(PORT, () => {
  console.log(`Webhook API rodando em http://localhost:${PORT}`);
});
