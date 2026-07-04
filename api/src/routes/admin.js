const express = require("express");
const { admin } = require("../firebase-admin");
const { requireAdmin, verifyFirebaseToken, getBearerToken } = require("../middleware/auth");
const { jsonSuccess, createError } = require("../utils/http");
const { logAuditEntry } = require("../services/audit-log");
const { normalizeTecnico } = require("../tecnico");

const router = express.Router();
const USERS_COLLECTION = process.env.USUARIOS_COLLECTION || "usuarios";
const SUPPORTS_COLLECTION = process.env.FIRESTORE_COLLECTION || "suportes_tecnicos";


router.post("/create-user", requireAdmin, async (req, res, next) => {
  const { email, password, displayName, cargo } = req.body || {};

  if (!email || !password) {
    return next(createError(400, "Email e senha são obrigatórios."));
  }

  try {
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: displayName || email
    });

    const cargoValue = String(cargo || "Operador").trim();
    const normalizedCargo = /admin|administrador/i.test(cargoValue) ? "Administrador" : cargoValue || "Operador";
    await admin.firestore().collection(USERS_COLLECTION).doc(userRecord.uid).set({
      uid: userRecord.uid,
      email,
      displayName: displayName || "",
      cargo: normalizedCargo,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    await logAuditEntry({
      action: "ADMIN_CREATE_USER",
      entity: USERS_COLLECTION,
      entityId: userRecord.uid,
      userId: req.authUser?.uid,
      userEmail: req.authUser?.email,
      details: { createdEmail: email, cargo: normalizedCargo }
    });

    return jsonSuccess(res, {
      uid: userRecord.uid,
      message: `Usuário ${email} criado com sucesso!`
    }, 201);
  } catch (error) {
    let errorMessage = "Erro ao criar usuário.";
    if (error.code === "auth/email-already-exists") {
      errorMessage = "Este email já está cadastrado.";
    } else if (error.code === "auth/invalid-email") {
      errorMessage = "Email inválido.";
    } else if (error.code === "auth/weak-password") {
      errorMessage = "Senha muito fraca. Use pelo menos 6 caracteres.";
    }
    return next(createError(400, errorMessage, error.message));
  }
});

router.post("/supports/:id/associate", async (req, res, next) => {
  const authHeader = req.headers["authorization"] || req.headers["Authorization"] || "";
  const token = getBearerToken(req);
  console.log("[AssociateRoute] Authorization header present:", Boolean(authHeader));

  if (!token) {
    return next(createError(401, "Nao autorizado. Token ausente."));
  }

  try {
    const decoded = await verifyFirebaseToken(token);
    console.log("[AssociateRoute] token decoded:", decoded?.uid, decoded?.email, decoded?.name);
    if (!decoded?.uid) {
      return next(createError(401, "Nao autorizado. Token invalido."));
    }

    const userDocRef = admin.firestore().collection(USERS_COLLECTION).doc(decoded.uid);
    const userDoc = await userDocRef.get();
    const userData = userDoc.exists ? userDoc.data() : {};
    const userDisplayName = String(userData?.displayName || "").trim();
    const tokenName = String(decoded.name || "").trim();
    const emailFallback = decoded.email ? String(decoded.email).split("@")[0].trim() : "";
    const tecnicoRaw = userDisplayName || tokenName || emailFallback;
    const tecnico = normalizeTecnico(tecnicoRaw);

    console.log("[AssociateRoute] associate request", {
      supportId: req.params.id,
      uid: decoded.uid,
      email: decoded.email,
      userDisplayName,
      tokenName,
      tecnicoRaw,
      tecnico
    });

    if (!tecnico) {
      return next(createError(400, "Nao foi possivel determinar o nome do técnico a partir do usuário autenticado."));
    }

    const supportRef = admin.firestore().collection(SUPPORTS_COLLECTION).doc(req.params.id);
    const supportSnap = await supportRef.get();
    console.log("[AssociateRoute] support document exists?", supportSnap.exists, "id=", req.params.id);
    if (!supportSnap.exists) {
      return next(createError(404, "Registro não encontrado."));
    }

    await supportRef.update({
      tecnico,
      status: "EM ANDAMENTO",
      updatedAt: new Date().toISOString()
    });

    console.log("[AssociateRoute] support document updated", req.params.id, tecnico);

    await logAuditEntry({
      action: "ASSOCIATE_TECHNICIAN",
      entity: SUPPORTS_COLLECTION,
      entityId: req.params.id,
      userId: decoded.uid,
      userEmail: decoded.email,
      details: { tecnico }
    });

    return jsonSuccess(res, { tecnico, message: `Técnico associado com sucesso: ${tecnico}` });
  } catch (error) {
    console.error("[AssociateRoute] Erro interno ao associar técnico:", error.stack || error.message || error);
    return next(createError(500, "Erro ao associar técnico.", error?.message || String(error)));
  }
});

module.exports = router;