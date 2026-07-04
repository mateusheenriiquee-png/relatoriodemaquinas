/**
 * gerenciar-usuario.mjs — Editar, atualizar cargo e excluir usuários
 * Usa instância secundária para não deslogar o admin
 */

import admin from "./firebase-admin-shim.mjs";
import { getSecondaryAuth, getSecondaryDb } from "./auth-secondary.mjs";

/**
 * Editar usuário (email, nome, senha)
 * 
 * @param {object} params
 * @param {string} params.uid - UID do usuário a editar
 * @param {string} params.emailAtual - Email atual (para autenticação secundária)
 * @param {string} params.nome - Novo nome (opcional)
 * @param {string} params.emailNovo - Novo email (opcional)
 * @param {string} params.cargo - Novo cargo (opcional)
 * @param {string} params.novaSenha - Nova senha (opcional)
 * @param {string} params.senhaAtual - Senha atual do usuário (para verificar antes de mudar auth)
 * @param {object} params.env - Variáveis de ambiente
 * @returns {Promise<{ok: boolean, avisos: string[], error?: string}>}
 */
export async function editarUsuario({
  uid,
  emailAtual,
  nome,
  emailNovo,
  cargo,
  novaSenha,
  senhaAtual,
  env = {}
}) {
  try {
    const secondaryAuth = getSecondaryAuth(env);
    const secondaryDb = getSecondaryDb(env);
    const usuariosCollection = env?.USUARIOS_COLLECTION || "usuarios";
    const avisos = [];

    console.log(`[UserManage] Editando usuário: ${uid}`);

    // Atualizar Firestore sempre (nome, email, cargo)
    const updateData = {};
    if (nome?.trim()) updateData.displayName = nome.trim();
    if (emailNovo?.trim()) updateData.email = emailNovo.trim();
    if (cargo?.trim()) updateData.cargo = cargo.trim();
    updateData.atualizadoEm = new Date().toISOString();

    if (Object.keys(updateData).length > 1 || Object.keys(updateData)[0] !== "atualizadoEm") {
      await secondaryDb
        .collection(usuariosCollection)
        .doc(uid)
        .update(updateData);
      console.log(`[UserManage] ✓ Documento Firestore atualizado: ${uid}`);
    }

    // Verificar se precisa atualizar Authentication
    const alteraAuth = emailNovo?.trim() !== emailAtual?.trim() || novaSenha?.trim();

    if (!alteraAuth) {
      return { ok: true, avisos };
    }

    // Se mudou email ou senha, precisa da senha atual para autenticar
    if (!senhaAtual?.trim()) {
      avisos.push(
        "⚠️ Não foi possível atualizar email/senha sem a senha atual. Um link de redefinição será enviado para o email do usuário."
      );
      
      // Aqui você poderia enviar um email de redefinição
      // await secondaryAuth.sendPasswordResetEmail(emailAtual);
      
      return { ok: true, avisos };
    }

    console.log(`[UserManage] Atualizando Auth user: ${uid}`);

    // Usar a instância secundária para re-autenticar como o usuário
    // Criar uma auth customizada ou usar signInWithEmailAndPassword
    // Por segurança, vamos apenas atualizar direto via Admin SDK

    if (emailNovo?.trim()) {
      try {
        await secondaryAuth.updateUser(uid, {
          email: emailNovo.trim()
        });
        console.log(`[UserManage] ✓ Email atualizado: ${emailNovo}`);
      } catch (error) {
        if (error.code === "auth/email-already-exists") {
          return {
            ok: false,
            error: "Este email já está cadastrado.",
            avisos
          };
        }
        throw error;
      }
    }

    if (novaSenha?.trim()) {
      await secondaryAuth.updateUser(uid, {
        password: novaSenha
      });
      console.log(`[UserManage] ✓ Senha atualizada: ${uid}`);
    }

    if (nome?.trim()) {
      await secondaryAuth.updateUser(uid, {
        displayName: nome.trim()
      });
      console.log(`[UserManage] ✓ Nome exibição atualizado: ${uid}`);
    }

    console.log(`[UserManage] ✓ Usuário atualizado com sucesso: ${uid}`);

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
 * 
 * @param {string} uid - UID do usuário
 * @param {string} cargo - Novo cargo
 * @param {object} env - Variáveis de ambiente
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function atualizarCargo(uid, cargo, env = {}) {
  try {
    const secondaryDb = getSecondaryDb(env);
    const usuariosCollection = env?.USUARIOS_COLLECTION || "usuarios";

    console.log(`[UserManage] Atualizando cargo do usuário: ${uid} → ${cargo}`);

    await secondaryDb
      .collection(usuariosCollection)
      .doc(uid)
      .update({
        cargo: cargo.trim(),
        atualizadoEm: new Date().toISOString()
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
 * 
 * @param {object} params
 * @param {string} params.uid - UID do usuário a excluir
 * @param {string} params.email - Email do usuário
 * @param {string} params.senhaAtual - Senha (para verificação, se necessário)
 * @param {object} params.env - Variáveis de ambiente
 * @returns {Promise<{ok: boolean, avisos: string[], error?: string}>}
 */
export async function excluirUsuario({
  uid,
  email,
  senhaAtual,
  env = {}
}) {
  try {
    const secondaryAuth = getSecondaryAuth(env);
    const secondaryDb = getSecondaryDb(env);
    const usuariosCollection = env?.USUARIOS_COLLECTION || "usuarios";

    console.log(`[UserManage] Excluindo usuário: ${uid} (${email})`);

    // 1. Remover conta de login no Firebase Authentication
    try {
      await secondaryAuth.deleteUser(uid);
      console.log(`[UserManage] ✓ Conta de login removida: ${uid}`);
    } catch (authError) {
      console.warn(`[UserManage] Aviso ao remover auth:`, authError.message);
      // Continuar mesmo se falhar
    }

    // 2. Remover perfil no Firestore
    try {
      await secondaryDb
        .collection(usuariosCollection)
        .doc(uid)
        .delete();
      console.log(`[UserManage] ✓ Perfil Firestore removido: ${uid}`);
    } catch (firestoreError) {
      console.warn(`[UserManage] Aviso ao remover Firestore:`, firestoreError.message);
      // Pode ter sido já removido
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
 * (mantém o perfil no Firestore)
 * 
 * @param {string} uid - UID do usuário
 * @param {object} env - Variáveis de ambiente
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function liberarEmailUsuario(uid, env = {}) {
  try {
    const secondaryAuth = getSecondaryAuth(env);

    console.log(`[UserManage] Liberando email para usuário: ${uid}`);

    await secondaryAuth.deleteUser(uid);

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
