/**
 * gerenciar-usuario.mjs — Editar, atualizar cargo e excluir usuários
 * (Supabase Auth admin + tabela public.usuarios).
 */

import {
  atualizarContaAuth,
  atualizarPerfil,
  excluirContaAuth
} from "./supabase-rest.mjs";

const EMAIL_DUPLICADO = new Set(["email_exists", "user_already_exists"]);

/**
 * Editar usuário (email, nome, senha, cargo)
 */
export async function editarUsuario({ uid, emailAtual, nome, emailNovo, cargo, novaSenha, env = {} }) {
  try {
    const avisos = [];

    // Conta primeiro: se o email novo já existe, o perfil não pode ter sido mudado.
    const mudouEmail = Boolean(emailNovo?.trim()) && emailNovo.trim() !== emailAtual?.trim();
    if (mudouEmail || novaSenha?.trim() || nome?.trim()) {
      try {
        await atualizarContaAuth(env, uid, {
          email: mudouEmail ? emailNovo.trim() : undefined,
          password: novaSenha?.trim() || undefined,
          displayName: nome?.trim() || undefined
        });
      } catch (error) {
        if (EMAIL_DUPLICADO.has(error?.code)) {
          return { ok: false, error: "Este email já está cadastrado.", avisos };
        }
        throw error;
      }
    }

    const perfil = {};
    if (nome?.trim()) perfil.display_name = nome.trim();
    if (mudouEmail) perfil.email = emailNovo.trim();
    if (cargo?.trim()) perfil.cargo = cargo.trim();
    if (Object.keys(perfil).length) await atualizarPerfil(env, uid, perfil);

    return { ok: true, avisos };
  } catch (error) {
    console.error("[UserManage] Erro ao editar usuário:", error?.message);
    return { ok: false, error: "Erro ao atualizar usuário.", avisos: [] };
  }
}

/**
 * Atualizar apenas o cargo do usuário
 */
export async function atualizarCargo(uid, cargo, env = {}) {
  try {
    await atualizarPerfil(env, uid, { cargo: cargo.trim() });
    return { ok: true };
  } catch (error) {
    console.error("[UserManage] Erro ao atualizar cargo:", error?.message);
    return { ok: false, error: "Erro ao atualizar cargo." };
  }
}

/**
 * Excluir usuário. Apagar a conta do Auth apaga o perfil junto (FK em cascata).
 */
export async function excluirUsuario({ uid, email, env = {} }) {
  try {
    try {
      await excluirContaAuth(env, uid);
    } catch (error) {
      // Conta já inexistente não impede limpar o resto.
      if (error?.status !== 404) throw error;
    }
    return {
      ok: true,
      avisos: [`✓ Usuário ${email} removido com sucesso.`, "✓ Email liberado para novo cadastro."]
    };
  } catch (error) {
    console.error("[UserManage] Erro ao excluir usuário:", error?.message);
    return { ok: false, error: "Erro ao excluir usuário.", avisos: [] };
  }
}
