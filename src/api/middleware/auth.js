const { admin } = require("../firebase-admin");
const { normalizeText } = require("../normalize");
const { createError } = require("../utils/http");

const USERS_COLLECTION = process.env.USUARIOS_COLLECTION || "usuarios";

function getBearerToken(req) {
  const authHeader = req.headers["authorization"] || "";
  return authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : authHeader.trim();
}

function normalizeCargo(cargo = "") {
  const lower = String(cargo).toLowerCase().trim();
  if (lower === "admin" || lower === "administrador") return "administrador";
  if (lower === "supervisor") return "supervisor";
  if (lower === "atendente" || lower === "agente") return "atendente";
  return "operador";
}

function getWebhookToken(req) {
  return (
    normalizeText(req.headers["x-webhook-token"]) ||
    normalizeText(req.headers["X-Webhook-Token"]) ||
    normalizeText(req.query?.token) ||
    normalizeText(req.body?.token)
  );
}

function isWebhookAuthorized(req) {
  const expected = normalizeText(process.env.WEBHOOK_TOKEN || "");
  if (!expected) return true;
  return getWebhookToken(req) === expected;
}



async function verifyFirebaseToken(token) {
  if (!token) return null;
  try {
    return await admin.auth().verifyIdToken(token);
  } catch (error) {
    console.error("[Auth] Erro ao verificar Firebase ID token:", error && error.message ? error.message : error);
    if (process.env.DEBUG_AUTH === '1') {
      console.error('[Auth] verifyFirebaseToken full error:', error);
    }
    return null;
  }
}

async function authenticateToken(req, _res, next) {
  const token = getBearerToken(req);
  const bypassToken = process.env.LOCAL_DEV_BYPASS_TOKEN || "test";
  const allowDevBypass = token === bypassToken || token === "local-dev" || token === "test";

  if (allowDevBypass) {
    req.authUser = { uid: "local-dev", email: "local@dev" };
    return next();
  }

  if (!token) {
    return next(createError(401, "Nao autorizado. Token ausente."));
  }

  const decoded = await verifyFirebaseToken(token);
  if (!decoded?.uid) {
    try {
      const preview = String(token || '').slice(0, 40);
      console.warn('[Auth] Token verification failed. token preview:', preview ? `${preview}...` : '[empty]');
    } catch (e) {
      // ignore
    }
    return next(createError(401, "Nao autorizado. Token invalido."));
  }

  req.authUser = { uid: decoded.uid, email: decoded.email };
  return next();
}

async function requireAdmin(req, _res, next) {
  const token = getBearerToken(req);
  if (!token) {
    return next(createError(401, "Nao autorizado. Token ausente."));
  }

  const decoded = await verifyFirebaseToken(token);
  if (!decoded?.uid) {
    return next(createError(401, "Nao autorizado. Token invalido."));
  }

  try {
    const userDoc = await admin.firestore().collection(USERS_COLLECTION).doc(decoded.uid).get();
    const userData = userDoc.exists ? userDoc.data() : null;
    const cargo = normalizeCargo(userData?.cargo || "");
    if (cargo !== "administrador") {
      return next(createError(403, "Acesso negado. Usuario sem permissao de administrador."));
    }
    req.authUser = { uid: decoded.uid, email: decoded.email, cargo: userData?.cargo || "" };
    return next();
  } catch (error) {
    return next(createError(500, "Erro ao verificar permissao de administrador.", error.message));
  }
}

module.exports = { isWebhookAuthorized, authenticateToken, requireAdmin, verifyFirebaseToken, getBearerToken };