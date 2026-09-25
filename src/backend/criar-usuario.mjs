/**
 * criar-usuario.mjs — Cria novo usuário no Supabase Auth + perfil em `public.usuarios`.
 */

import { criarContaAuth, excluirContaAuth, inserirPerfil } from "./supabase-rest.mjs";

const MENSAGENS = {
  email_exists: "Este email já está cadastrado.",
  user_already_exists: "Este email já está cadastrado.",
  weak_password: "Senha muito fraca. Use pelo menos 6 caracteres.",
  validation_failed: "Email inválido."
};

/**
 * @param {string} email
 * @param {string} password - mínimo 6 caracteres
 * @param {string} displayName
 * @param {string} cargo
 * @param {object} env - variáveis do Worker (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
 * @returns {Promise<{ok: boolean, uid?: string, email?: string, error?: string}>}
 */
export async function criarUsuario({ email, password, displayName, cargo = "Operador", env = {} }) {
  if (!email || !email.includes("@")) {
    return { ok: false, error: "Email inválido." };
  }
  if (!password || password.length < 6) {
    return { ok: false, error: "Senha deve ter no mínimo 6 caracteres." };
  }
  if (!displayName?.trim()) {
    return { ok: false, error: "Nome para exibição é obrigatório." };
  }

  let conta = null;
  try {
    conta = await criarContaAuth(env, {
      email: email.trim(),
      password,
      displayName: displayName.trim()
    });

    try {
      await inserirPerfil(env, {
        id: conta.id,
        email: email.trim(),
        display_name: displayName.trim(),
        cargo: cargo.trim() || "Operador",
        status: "ativo"
      });
    } catch (erroPerfil) {
      // Conta sem perfil é um login que entra e não tem cargo: desfaz a conta
      // para o email não ficar "ocupado" por um usuário que não existe de fato.
      await excluirContaAuth(env, conta.id).catch((e) =>
        console.error("[UserCreation] Falha ao desfazer a conta órfã:", e?.message || e)
      );
      throw erroPerfil;
    }

    return {
      ok: true,
      uid: conta.id,
      email: conta.email,
      displayName: displayName.trim(),
      cargo: cargo.trim(),
      message: `Usuário ${email} criado com sucesso!`
    };
  } catch (error) {
    // O detalhe fica só no log: na resposta iria mostrar como o backend é montado.
    console.error("[UserCreation] Erro ao criar usuário:", error?.message, error?.code);
    return { ok: false, error: MENSAGENS[error?.code] || "Erro ao criar usuário." };
  }
}
