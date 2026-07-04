/**
 * criar-usuario.mjs — Cria novo usuário no Firebase sem deslogar o admin
 * Usa instância secundária para isolar operações de usuário
 */

import admin from "./firebase-admin-shim.mjs";
import { getSecondaryAuth, getSecondaryDb } from "./auth-secondary.mjs";

/**
 * Criar novo usuário no Firebase Auth e Firestore
 * Usa instância secundária para não afetar session do admin
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
    // Validações básicas
    if (!email || !email.includes("@")) {
      return {
        ok: false,
        error: "Email inválido."
      };
    }

    if (!password || password.length < 6) {
      return {
        ok: false,
        error: "Senha deve ter no mínimo 6 caracteres."
      };
    }

    if (!displayName?.trim()) {
      return {
        ok: false,
        error: "Nome para exibição é obrigatório."
      };
    }

    console.log(`[UserCreation] Criando novo usuário: ${email}`);
    console.log(`[UserCreation] Cargo: ${cargo}`);

    // Obter instâncias secundárias
    const secondaryAuth = getSecondaryAuth(env);
    const secondaryDb = getSecondaryDb(env);

    // Criar usuário em Firebase Authentication (instância secundária)
    const userRecord = await secondaryAuth.createUser({
      email: email.trim(),
      password,
      displayName: displayName.trim()
    });

    console.log(`[UserCreation] ✓ Auth user criado. UID: ${userRecord.uid}`);

    // Criar documento em Firestore (instância secundária)
    const usuariosCollection = env?.USUARIOS_COLLECTION || "usuarios";
    const now = new Date().toISOString();

    await secondaryDb
      .collection(usuariosCollection)
      .doc(userRecord.uid)
      .set({
        uid: userRecord.uid,
        email: email.trim(),
        displayName: displayName.trim(),
        cargo: cargo.trim() || "operador",
        status: "ativo",
        criadoEm: now,
        atualizadoEm: now
      });

    console.log(`[UserCreation] ✓ Documento Firestore criado para ${userRecord.uid}`);

    return {
      ok: true,
      uid: userRecord.uid,
      email: userRecord.email,
      displayName: userRecord.displayName,
      cargo: cargo.trim(),
      message: `Usuário ${email} criado com sucesso!`
    };
  } catch (error) {
    console.error(`[UserCreation] ❌ Erro ao criar usuário:`, error.message);
    console.error(`[UserCreation] Código de erro:`, error.code);

    // Mapear erros específicos do Firebase
    let errorMessage = "Erro ao criar usuário.";
    const errorMap = {
      "auth/email-already-exists": "Este email já está cadastrado.",
      "auth/invalid-email": "Email inválido.",
      "auth/weak-password": "Senha muito fraca. Use pelo menos 6 caracteres.",
      "PERMISSION_DENIED": "Sem permissão. Verifique as Firestore Rules."
    };

    for (const [code, message] of Object.entries(errorMap)) {
      if (error.code === code || error.message?.includes(code)) {
        errorMessage = message;
        break;
      }
    }

    return {
      ok: false,
      error: errorMessage,
      details: error.message,
      code: error.code
    };
  }
}
