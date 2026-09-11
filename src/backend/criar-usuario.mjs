/**
 * criar-usuario.mjs — Cria novo usuário via Firebase Identity REST + Firestore REST
 */

import { createUser, getServiceAccountRaw } from "./identity-rest.mjs";
import { createDocument } from "./firestore-rest.mjs";

/**
 * Criar novo usuário no Firebase Auth e Firestore
 *
 * @param {string} email - Email do novo usuário
 * @param {string} password - Senha (min 6 caracteres)
 * @param {string} displayName - Nome para exibição
 * @param {string} cargo - Cargo/função do usuário (padrão: "operador")
 * @param {object} env - Variáveis de ambiente do Cloudflare
 * @returns {Promise<{ok: boolean, uid?: string, email?: string, error?: string}>}
 */
export async function criarUsuarioFirebase({
  email,
  password,
  displayName,
  cargo = "operador",
  env = {}
}) {
  try {
    if (!email || !email.includes("@")) {
      return { ok: false, error: "Email inválido." };
    }

    if (!password || password.length < 6) {
      return { ok: false, error: "Senha deve ter no mínimo 6 caracteres." };
    }

    if (!displayName?.trim()) {
      return { ok: false, error: "Nome para exibição é obrigatório." };
    }

    console.log(`[UserCreation] Criando novo usuário: ${email}`);
    console.log(`[UserCreation] Cargo: ${cargo}`);

    const userRecord = await createUser({
      env,
      email: email.trim(),
      password,
      displayName: displayName.trim()
    });

    console.log(`[UserCreation] ✓ Auth user criado. UID: ${userRecord.uid}`);

    const usuariosCollection = env?.USUARIOS_COLLECTION || "usuarios";
    const now = new Date().toISOString();
    const serviceAccountRaw = getServiceAccountRaw(env);

    await createDocument({
      serviceAccountRaw,
      collection: usuariosCollection,
      docId: userRecord.uid,
      fields: {
        uid: userRecord.uid,
        email: email.trim(),
        displayName: displayName.trim(),
        cargo: cargo.trim() || "operador",
        status: "ativo",
        createdAt: now,
        updatedAt: now,
        criadoEm: now,
        atualizadoEm: now
      }
    });

    console.log(`[UserCreation] ✓ Documento Firestore criado para ${userRecord.uid}`);

    return {
      ok: true,
      uid: userRecord.uid,
      email: userRecord.email,
      displayName: displayName.trim(),
      cargo: cargo.trim(),
      message: `Usuário ${email} criado com sucesso!`
    };
  } catch (error) {
    console.error(`[UserCreation] ❌ Erro ao criar usuário:`, error.message);
    console.error(`[UserCreation] Código de erro:`, error.code);

    const errorMap = {
      "auth/email-already-exists": "Este email já está cadastrado.",
      "auth/invalid-email": "Email inválido.",
      "auth/weak-password": "Senha muito fraca. Use pelo menos 6 caracteres.",
      PERMISSION_DENIED: "Sem permissão. Verifique as Firestore Rules."
    };

    let errorMessage = "Erro ao criar usuário.";
    for (const [code, message] of Object.entries(errorMap)) {
      if (error.code === code || error.message?.includes(code)) {
        errorMessage = message;
        break;
      }
    }

    if (error.message?.includes("FIREBASE_SERVICE_ACCOUNT")) {
      errorMessage = error.message;
    }

    return {
      ok: false,
      error: errorMessage,
      details: error.message,
      code: error.code
    };
  }
}
