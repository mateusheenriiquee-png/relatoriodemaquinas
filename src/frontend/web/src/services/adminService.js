import { supabase } from "../config/supabase";

export const CONFIG_COLLECTION = "config";
export const ADMIN_EMAIL_KEY = "admin_email";

/** Cargos aceitos, na mesma ordem do src/shared/funcoes.mjs. */
export const CARGOS = ["Operador", "Atendente", "Supervisor", "Administrador"];

/**
 * Base da API administrativa do Worker. Em produção o painel é servido pelo
 * próprio Worker, então `origin` já é o endereço certo; VITE_API_BASE_URL
 * cobre o caso de rodar o Vite em outra porta.
 */
function apiBase() {
  const configurada = import.meta.env.VITE_API_BASE_URL;
  return (configurada || window.location.origin).replace(/\/+$/, "");
}

/**
 * Chamada autenticada à API do Worker.
 *
 * O corpo é lido como texto antes do JSON.parse de propósito: quando a rota não
 * existe, o Worker devolve o index.html do painel, e um parse cego transformaria
 * isso num "Unexpected token <" que não diz nada a quem for depurar.
 */
async function chamarApi(caminho, { metodo = "GET", corpo, getIdToken }) {
  const token = await getIdToken();
  const resposta = await fetch(`${apiBase()}/api/admin${caminho}`, {
    method: metodo,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: corpo ? JSON.stringify(corpo) : undefined
  });

  const texto = await resposta.text();
  let dados;
  try {
    dados = texto ? JSON.parse(texto) : {};
  } catch {
    throw new Error(
      `A API administrativa respondeu algo que não é JSON (HTTP ${resposta.status}). ` +
        "Confira se o Worker foi publicado com as rotas /api/admin."
    );
  }

  if (!resposta.ok || dados.ok === false) {
    throw new Error(dados.error || `Falha na operação (HTTP ${resposta.status}).`);
  }
  return dados;
}

/* ------------------------------------------------------------------ leitura */

/**
 * A listagem vive em usuariosService: a tela de escolher técnico também precisa
 * dela e não é uma tela de administrador. Reexportado aqui para quem já
 * importava deste módulo.
 */
export { subscribeUsuarios, USUARIOS_COLLECTION } from "./usuariosService";

export async function lerEmailAdmin() {
  const { data, error } = await supabase
    .from(CONFIG_COLLECTION)
    .select("valor")
    .eq("chave", ADMIN_EMAIL_KEY)
    .maybeSingle();
  if (error) throw error;
  return data?.valor?.value || data?.valor?.email || "";
}

export async function salvarEmailAdmin(email) {
  const { error } = await supabase.rpc("mesclar_config", {
    p_chave: ADMIN_EMAIL_KEY,
    p_valor: { value: email, email, updatedAt: new Date().toISOString() }
  });
  if (error) throw new Error(error.message);
}

/* ------------------------------------------------------------------ escrita */

/** Criar usuário mexe no Supabase Auth: só o Worker consegue. */
export function criarUsuario({ email, password, displayName, cargo }, { getIdToken }) {
  return chamarApi("/usuarios", {
    metodo: "POST",
    corpo: { email, password, displayName, cargo },
    getIdToken
  });
}

export function alterarCargo(uid, cargo, { getIdToken }) {
  return chamarApi(`/usuarios/${encodeURIComponent(uid)}`, {
    metodo: "PATCH",
    corpo: { cargo },
    getIdToken
  });
}

export function editarUsuario(uid, dados, { getIdToken }) {
  return chamarApi(`/usuarios/${encodeURIComponent(uid)}`, {
    metodo: "PATCH",
    corpo: dados,
    getIdToken
  });
}

export function excluirUsuario(uid, email, { getIdToken }) {
  return chamarApi(`/usuarios/${encodeURIComponent(uid)}`, {
    metodo: "DELETE",
    corpo: { email },
    getIdToken
  });
}
