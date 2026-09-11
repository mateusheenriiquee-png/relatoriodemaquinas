/**
 * admin-api.mjs — rotas administrativas do Worker.
 *
 * Criar e excluir usuário exigem privilégio de Admin SDK, que o navegador não
 * tem: por isso essas operações vivem aqui. Os blocos que fazem o trabalho
 * (identity-rest, criar-usuario, gerenciar-usuario) já existiam no projeto —
 * só nunca tinham sido ligados a uma rota. Antes disso o painel antigo chamava
 * a API Express, que não é o que está publicado.
 *
 * Listar usuários NÃO passa por aqui: as Firestore Rules já liberam leitura
 * para autenticados, então o React lê direto e ganha a lista em tempo real.
 */

import { verifyFirebaseIdToken } from "./verify-id-token.mjs";
import { getDocument, updateDocument } from "./firestore-rest.mjs";
import { getServiceAccountRaw } from "./identity-rest.mjs";
import { criarUsuarioFirebase } from "./criar-usuario.mjs";
import { atualizarCargo, editarUsuario, excluirUsuario } from "./gerenciar-usuario.mjs";
import { normalizarCargo } from "../shared/funcoes.mjs";
import { normalizeTecnico } from "../shared/tecnico.js";

export const ADMIN_PREFIX = "/api/admin";

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

function json(status, payload) {
  return new Response(JSON.stringify(payload), { status, headers: JSON_HEADERS });
}

/**
 * Identifica quem está chamando: valida o ID token pela JWKS do Firebase e
 * lê o cargo no Firestore. O cargo do token não serve — ele não existe lá; a
 * fonte da verdade é o documento em `usuarios`.
 */
async function autenticar(request, env) {
  const header = request.headers.get("authorization") || "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!token) return { ok: false, status: 401, error: "Token ausente." };

  const verificado = await verifyFirebaseIdToken(token, env);
  if (!verificado.valid) {
    return { ok: false, status: 401, error: `Token inválido: ${verificado.error}` };
  }

  const collection = env.USUARIOS_COLLECTION || "usuarios";
  let perfil = null;
  try {
    perfil = await getDocument({
      serviceAccountRaw: getServiceAccountRaw(env),
      collection,
      docId: verificado.uid
    });
  } catch (error) {
    console.error("[Admin] Falha ao ler perfil do usuário:", error?.message || error);
  }

  const cargo = normalizarCargo(perfil?.cargo || "");
  return {
    ok: true,
    uid: verificado.uid,
    email: verificado.email || perfil?.email || "",
    displayName: String(perfil?.displayName || "").trim(),
    cargo,
    isAdmin: cargo === "Administrador"
  };
}

async function lerCorpo(request) {
  try {
    const texto = await request.text();
    return texto ? JSON.parse(texto) : {};
  } catch {
    return {};
  }
}

/**
 * Roteia tudo sob /api/admin. Devolve null quando o caminho não é daqui, para
 * o index.mjs seguir para os arquivos estáticos.
 */
export async function handleAdminRequest(request, env, url) {
  const { pathname } = url;
  if (!pathname.startsWith(ADMIN_PREFIX)) return null;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: JSON_HEADERS });
  }

  const rota = pathname.slice(ADMIN_PREFIX.length).replace(/\/+$/, "");
  const sessao = await autenticar(request, env);
  if (!sessao.ok) return json(sessao.status, { ok: false, error: sessao.error });

  try {
    // --- associar técnico: qualquer usuário autenticado, não só admin -------
    const associar = rota.match(/^\/supports\/([^/]+)\/associate$/);
    if (associar && request.method === "POST") {
      return associarTecnico(env, decodeURIComponent(associar[1]), sessao);
    }

    // --- daqui para baixo, só administrador --------------------------------
    if (!sessao.isAdmin) {
      return json(403, { ok: false, error: "Apenas administradores podem fazer isso." });
    }

    if (rota === "/usuarios" && request.method === "POST") {
      const corpo = await lerCorpo(request);
      const resultado = await criarUsuarioFirebase({
        email: corpo.email,
        password: corpo.password,
        displayName: corpo.displayName,
        cargo: normalizarCargo(corpo.cargo),
        env
      });
      return json(resultado.ok ? 201 : 400, resultado);
    }

    const usuario = rota.match(/^\/usuarios\/([^/]+)$/);
    if (usuario) {
      const uid = decodeURIComponent(usuario[1]);

      if (request.method === "PATCH") {
        const corpo = await lerCorpo(request);

        // Ninguém rebaixa nem promove a si mesmo: é assim que um painel fica
        // sem nenhum administrador, e não há tela para desfazer isso.
        if (uid === sessao.uid && corpo.cargo && normalizarCargo(corpo.cargo) !== sessao.cargo) {
          return json(400, { ok: false, error: "Você não pode alterar o próprio cargo." });
        }

        // Só o cargo mudou? O caminho curto não toca no Firebase Auth.
        const soCargo = Object.keys(corpo).every((chave) => chave === "cargo");
        const resultado = soCargo
          ? await atualizarCargo(uid, normalizarCargo(corpo.cargo), env)
          : await editarUsuario({
              uid,
              emailAtual: corpo.emailAtual,
              emailNovo: corpo.email,
              nome: corpo.displayName,
              cargo: corpo.cargo ? normalizarCargo(corpo.cargo) : undefined,
              novaSenha: corpo.password,
              env
            });
        return json(resultado.ok ? 200 : 400, resultado);
      }

      if (request.method === "DELETE") {
        if (uid === sessao.uid) {
          return json(400, { ok: false, error: "Você não pode excluir a própria conta." });
        }
        const corpo = await lerCorpo(request);
        const resultado = await excluirUsuario({ uid, email: corpo.email || "", env });
        return json(resultado.ok ? 200 : 400, resultado);
      }
    }

    return json(404, { ok: false, error: "Rota administrativa não encontrada." });
  } catch (error) {
    console.error("[Admin] Erro não tratado:", error?.stack || error);
    return json(500, {
      ok: false,
      error: "Erro interno na API administrativa.",
      details: String(error?.message || error)
    });
  }
}

/**
 * Title Case, igual ao `titleCaseName` do painel.
 *
 * `normalizeTecnico` devolve o nome em MAIÚSCULAS, mas o painel grava e
 * FILTRA em Title Case (`where("tecnico", "==", "Matheus")`). Gravar "MATHEUS"
 * daqui faria o chamado sumir do filtro por técnico — então usamos
 * normalizeTecnico só para casar com a lista canônica e reescrevemos no
 * formato que a tela espera.
 */
function titleCaseNome(valor) {
  return String(valor || "")
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((parte) =>
      parte
        .split("-")
        .map((p) => (p ? p[0].toUpperCase() + p.slice(1).toLowerCase() : ""))
        .join("-")
    )
    .join(" ");
}

/**
 * Assume o atendimento em nome de quem está logado.
 *
 * O nome do técnico vem do perfil no servidor, e não de um campo enviado pelo
 * navegador — assim ninguém assume um chamado com o nome de outra pessoa.
 */
async function associarTecnico(env, supportId, sessao) {
  const collection = env.FIRESTORE_COLLECTION || "suportes_tecnicos";
  const serviceAccountRaw = getServiceAccountRaw(env);

  const tecnico = titleCaseNome(
    normalizeTecnico(sessao.displayName || (sessao.email ? sessao.email.split("@")[0] : ""))
  );
  if (!tecnico) {
    return json(400, { ok: false, error: "Não foi possível determinar o nome do técnico." });
  }

  const atual = await getDocument({ serviceAccountRaw, collection, docId: supportId });
  if (!atual) return json(404, { ok: false, error: "Registro não encontrado." });

  const agora = new Date().toISOString();
  await updateDocument({
    serviceAccountRaw,
    collection,
    docId: supportId,
    fields: {
      tecnico,
      tecnicoKey: tecnico.toLowerCase(),
      status: "EM ANDAMENTO",
      // Só marca o início na primeira associação — reassociar não pode zerar a
      // medição de tempo de um atendimento que já começou.
      dataInicioAtendimento: atual.dataInicioAtendimento || agora,
      updatedAt: agora
    }
  });

  return json(200, { ok: true, tecnico, message: `Técnico associado: ${tecnico}` });
}
