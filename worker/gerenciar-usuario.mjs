/**
 * gerenciar-usuario.mjs — Editar, atualizar cargo e excluir usuários
 * Usa Firebase Identity REST (admin) + Firestore REST
 */

import { updateUserAdmin, deleteUserAdmin, getServiceAccountRaw } from "./identity-rest.mjs";
import { updateDocument, deleteDocument } from "./firestore-rest.mjs";

/**
 * Editar usuário (email, nome, senha, cargo)
 */
export async function editarUsuario({
  uid,
  emailAtual,
  nome,
  emailNovo,
  cargo,
  novaSenha,
  env = {}
}) {
  try {
    const serviceAccountRaw = getServiceAccountRaw(env);
    const usuariosCollection = env?.USUARIOS_COLLECTION || "usuarios";
    const avisos = [];

    console.log(`[UserManage] Editando usuário: ${uid}`);

    const updateData = {};
    if (nome?.trim()) updateData.displayName = nome.trim();
    if (emailNovo?.trim()) updateData.email = emailNovo.trim();
    if (cargo?.trim()) updateData.cargo = cargo.trim();
    updateData.updatedAt = new Date().toISOString();
    updateData.atualizadoEm = updateData.updatedAt;

    const firestoreFields = Object.keys(updateData).filter((key) => key !== "updatedAt" && key !== "atualizadoEm");
    if (firestoreFields.length > 0) {
      await updateDocument({
        serviceAccountRaw,
        collection: usuariosCollection,
        docId: uid,
        fields: updateData
      });
      console.log(`[UserManage] ✓ Documento Firestore atualizado: ${uid}`);
    }

    const alteraAuth =
      emailNovo?.trim() !== emailAtual?.trim() ||
      !!novaSenha?.trim() ||
      !!nome?.trim();

    if (!alteraAuth) {
      return { ok: true, avisos };
    }

    console.log(`[UserManage] Atualizando Auth user (admin): ${uid}`);

    try {
      await updateUserAdmin({
        serviceAccountRaw,
        localId: uid,
        email: emailNovo?.trim() !== emailAtual?.trim() ? emailNovo?.trim() : undefined,
        password: novaSenha?.trim() || undefined,
        displayName: nome?.trim() || undefined
      });
      console.log(`[UserManage] ✓ Usuário Auth atualizado: ${uid}`);
    } catch (error) {
      if (error.code === "auth/email-already-exists") {
        return { ok: false, error: "Este email já está cadastrado.", avisos };
      }
      throw error;
    }

    return { ok: true, avisos };
  } catch (error) {
    console.error(`[UserManage] ❌ Erro ao editar usuário:`, error.message);
    return {
      ok: false,
      error: "Erro ao atualizar usuário.",
      details: error.message,
      avisos: []
    };
  }
}

/**
 * Atualizar apenas o cargo do usuário
 */
export async function atualizarCargo(uid, cargo, env = {}) {
  try {
    const serviceAccountRaw = getServiceAccountRaw(env);
    const usuariosCollection = env?.USUARIOS_COLLECTION || "usuarios";

    console.log(`[UserManage] Atualizando cargo do usuário: ${uid} → ${cargo}`);

    const now = new Date().toISOString();
    await updateDocument({
      serviceAccountRaw,
      collection: usuariosCollection,
      docId: uid,
      fields: {
        cargo: cargo.trim(),
        updatedAt: now,
        atualizadoEm: now
      }
    });

    console.log(`[UserManage] ✓ Cargo atualizado: ${uid}`);
    return { ok: true };
  } catch (error) {
    console.error(`[UserManage] ❌ Erro ao atualizar cargo:`, error.message);
    return {
      ok: false,
      error: "Erro ao atualizar cargo.",
      details: error.message
    };
  }
}

/**
 * Excluir usuário (remove conta de login e perfil)
 */
export async function excluirUsuario({ uid, email, env = {} }) {
  try {
    const serviceAccountRaw = getServiceAccountRaw(env);
    const usuariosCollection = env?.USUARIOS_COLLECTION || "usuarios";

    console.log(`[UserManage] Excluindo usuário: ${uid} (${email})`);

    try {
      await deleteUserAdmin({ serviceAccountRaw, localId: uid });
      console.log(`[UserManage] ✓ Conta de login removida: ${uid}`);
    } catch (authError) {
      if (authError.code !== "auth/user-not-found") {
        console.warn(`[UserManage] Aviso ao remover auth:`, authError.message);
      }
    }

    try {
      await deleteDocument({
        serviceAccountRaw,
        collection: usuariosCollection,
        docId: uid
      });
      console.log(`[UserManage] ✓ Perfil Firestore removido: ${uid}`);
    } catch (firestoreError) {
      console.warn(`[UserManage] Aviso ao remover Firestore:`, firestoreError.message);
    }

    console.log(`[UserManage] ✓ Usuário completamente removido: ${uid}`);

    return {
      ok: true,
      avisos: [
        `✓ Usuário ${email} removido com sucesso.`,
        "✓ Email liberado para novo cadastro."
      ]
    };
  } catch (error) {
    console.error(`[UserManage] ❌ Erro ao excluir usuário:`, error.message);
    return {
      ok: false,
      error: "Erro ao excluir usuário.",
      details: error.message,
      avisos: []
    };
  }
}

/**
 * Remover apenas a conta de login, liberando o email
 */
export async function liberarEmailUsuario(uid, env = {}) {
  try {
    const serviceAccountRaw = getServiceAccountRaw(env);

    console.log(`[UserManage] Liberando email para usuário: ${uid}`);

    await deleteUserAdmin({ serviceAccountRaw, localId: uid });

    console.log(`[UserManage] ✓ Email liberado: ${uid}`);
    return { ok: true };
  } catch (error) {
    console.error(`[UserManage] ❌ Erro ao liberar email:`, error.message);
    return {
      ok: false,
      error: "Erro ao liberar email.",
      details: error.message
    };
  }
}
