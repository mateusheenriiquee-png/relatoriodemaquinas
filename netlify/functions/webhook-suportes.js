const admin = require("firebase-admin");
const { normalizeSupport, normalizeText } = require("../../api/src/normalize");

const COLLECTION = process.env.FIRESTORE_COLLECTION || "suportes_tecnicos";
const WEBHOOK_TOKEN = normalizeText(process.env.WEBHOOK_TOKEN || "");

function getServiceAccountFromEnv() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT nao configurada.");
  }
  const parsed = JSON.parse(raw);
  if (parsed.private_key) {
    parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
  }
  return parsed;
}

function getDb() {
  if (!admin.apps.length) {
    const serviceAccount = getServiceAccountFromEnv();
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  }
  return admin.firestore();
}

function isAuthorized(event, body) {
  if (!WEBHOOK_TOKEN) return true;
  const token =
    normalizeText(event.headers?.["x-webhook-token"]) ||
    normalizeText(event.queryStringParameters?.token) ||
    normalizeText(body?.token);
  return token === WEBHOOK_TOKEN;
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

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ ok: false, error: "Metodo nao permitido." })
    };
  }

  try {
    const body = event.body ? JSON.parse(event.body) : {};
    if (!isAuthorized(event, body)) {
      return {
        statusCode: 401,
        body: JSON.stringify({ ok: false, error: "Nao autorizado." })
      };
    }

    const inputs = Array.isArray(body) ? body : [body];
    if (!inputs.length) {
      return {
        statusCode: 400,
        body: JSON.stringify({ ok: false, error: "Payload vazio." })
      };
    }

    const db = getDb();
    const batch = db.batch();
    let inserted = 0;

    for (const input of inputs) {
      if (!hasAnyInputField(input)) {
        continue;
      }
      const support = normalizeSupport(input);
      if (!hasMeaningfulSupportData(support)) {
        // Aceita objetos com valores nulos para evitar rejeicao de payloads parciais do webhook.
        const ref = db.collection(COLLECTION).doc();
        batch.set(ref, {
          ...support,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          origemIntegracao: "webhook-netlify"
        });
        inserted += 1;
        continue;
      }
      const ref = db.collection(COLLECTION).doc();
      batch.set(ref, {
        ...support,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        origemIntegracao: "webhook-netlify"
      });
      inserted += 1;
    }

    if (!inserted) {
      return {
        statusCode: 400,
        body: JSON.stringify({ ok: false, error: "Nenhum registro valido no payload." })
      };
    }

    await batch.commit();
    return {
      statusCode: 201,
      body: JSON.stringify({ ok: true, inserted })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        ok: false,
        error: "Erro interno ao processar webhook.",
        details: String(error?.message || error)
      })
    };
  }
};
