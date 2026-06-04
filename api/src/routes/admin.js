const express = require("express");
const { admin } = require("../firebase-admin");
const { requireAdmin } = require("../middleware/auth");
const { jsonSuccess, createError } = require("../utils/http");
const { logAuditEntry } = require("../services/audit-log");

const router = express.Router();
const USERS_COLLECTION = process.env.USUARIOS_COLLECTION || "usuarios";

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

module.exports = router;
