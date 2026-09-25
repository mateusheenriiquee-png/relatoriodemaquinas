/**
 * supabase-rest.mjs — o acesso do Worker ao Supabase (substitui firestore-rest,
 * identity-rest e verify-id-token).
 *
 * Fala direto com a API REST (PostgREST) e a de Auth por `fetch`, sem SDK: o
 * Worker é pequeno e o supabase-js traria de volta o peso que ele não precisa.
 *
 * Usa a SERVICE_ROLE, que ignora a RLS. Por isso este módulo só existe no
 * Worker: a chave é um secret dele e nunca vai para o painel nem para o git.
 * Toda regra de "quem pode o quê" tem que ser decidida ANTES de chamar aqui
 * (ver `autenticar` em admin-api.mjs).
 */

import { paraLinha } from "../shared/suporte-row.mjs";

export class ErroSupabase extends Error {
  constructor(mensagem, { status, codigo } = {}) {
    super(mensagem);
    this.name = "ErroSupabase";
    this.status = status;
    this.code = codigo;
  }
}

export function configSupabase(env = {}) {
  const url = String(env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const chave = String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !chave) {
    throw new ErroSupabase("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY nao configurados no Worker.");
  }
  return { url, chave };
}

async function pedir(env, caminho, { metodo = "GET", corpo, prefer, cabecalhos = {} } = {}) {
  const { url, chave } = configSupabase(env);
  const resposta = await fetch(`${url}${caminho}`, {
    method: metodo,
    headers: {
      apikey: chave,
      Authorization: `Bearer ${chave}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
      ...cabecalhos
    },
    body: corpo === undefined ? undefined : JSON.stringify(corpo)
  });

  const texto = await resposta.text();
  let dados = null;
  try {
    dados = texto ? JSON.parse(texto) : null;
  } catch {
    dados = null;
  }

  if (!resposta.ok) {
    const mensagem = dados?.message || dados?.msg || dados?.error_description || dados?.error || `HTTP ${resposta.status}`;
    throw new ErroSupabase(mensagem, { status: resposta.status, codigo: dados?.error_code || dados?.code });
  }
  return dados;
}

/* ------------------------------------------------------------------- suportes */

/**
 * Linha para gravar a partir dos campos do webhook: `null` do mapeador (data
 * que não deu para entender) NÃO vira "apagar" — o webhook nunca quer apagar
 * nada, só informar. A data ilegível é guardada em `extras` para não se perder.
 */
function linhaDoWebhook(id, campos) {
  const linha = { id, ...paraLinha(campos) };
  for (const [coluna, valor] of Object.entries(linha)) {
    if (valor === null) delete linha[coluna];
  }
  if (campos.dataAbertura && !linha.data_abertura) {
    linha.extras = { ...(linha.extras || {}), dataAberturaOriginal: String(campos.dataAbertura) };
  }
  return linha;
}

/**
 * Grava (cria ou mescla) registros vindos dos webhooks.
 *
 * Equivale ao PATCH-com-máscara do Firestore: só as colunas enviadas mudam. O
 * upsert em lote do PostgREST grava as colunas de TODAS as linhas em cada uma,
 * então as linhas são agrupadas pelo conjunto exato de colunas — dentro de
 * cada grupo o UPDATE só toca o que veio. `extras` (campos sem coluna própria)
 * é mesclado com o que já existe, e não substituído.
 *
 * @param records Array<{ docId, fields }> — `fields` em camelCase.
 * @returns quantidade gravada
 */
export async function upsertRecords({ env, records }) {
  const linhas = records
    .filter((r) => r.docId)
    .map((r) => linhaDoWebhook(r.docId, r.fields))
    .filter((l) => Object.keys(l).length > 1);
  if (!linhas.length) return 0;

  // Mesclar `extras` com o existente (uma consulta só para o lote todo).
  const comExtras = linhas.filter((l) => l.extras);
  if (comExtras.length) {
    const ids = comExtras.map((l) => `"${l.id.replace(/"/g, "")}"`).join(",");
    const existentes = await pedir(env, `/rest/v1/suportes?select=id,extras&id=in.(${encodeURIComponent(ids)})`);
    const porId = new Map((existentes || []).map((e) => [e.id, e.extras || {}]));
    for (const linha of comExtras) linha.extras = { ...(porId.get(linha.id) || {}), ...linha.extras };
  }

  const grupos = new Map();
  for (const linha of linhas) {
    const chave = Object.keys(linha).sort().join("|");
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(linha);
  }

  for (const grupo of grupos.values()) {
    await pedir(env, "/rest/v1/suportes?on_conflict=id", {
      metodo: "POST",
      corpo: grupo,
      // merge-duplicates = atualiza quando o id já existe; missing=default =
      // colunas ausentes usam o padrão do banco só na CRIAÇÃO.
      prefer: "resolution=merge-duplicates,missing=default,return=minimal"
    });
  }
  return linhas.length;
}

export async function lerSuporte(env, id) {
  const linhas = await pedir(env, `/rest/v1/suportes?select=*&id=eq.${encodeURIComponent(id)}&limit=1`);
  return linhas?.[0] || null;
}

/**
 * Atualiza um chamado pela função `atualizar_suporte` (campos + linha de
 * histórico na mesma operação atômica).
 */
export async function atualizarSuporte(env, id, campos, historico = null) {
  await pedir(env, "/rest/v1/rpc/atualizar_suporte", {
    metodo: "POST",
    corpo: { p_id: id, p_patch: paraLinha(campos), p_historico: historico, p_followup: null }
  });
}

/**
 * Reabre, num único UPDATE, os REAGENDADO cujo horário já passou. Devolve as
 * linhas reabertas ({ id, protocolo }). Não há janela entre "achar os vencidos"
 * e "reabrir": o filtro roda dentro do próprio comando.
 */
export async function reabrirReagendadosVencidos(env, { agora = new Date(), limite = 300 } = {}) {
  const linhas = await pedir(
    env,
    `/rest/v1/suportes?select=id,protocolo&status=eq.REAGENDADO&data_reagendamento=lte.${encodeURIComponent(agora.toISOString())}&order=id&limit=${limite}`,
    {
      metodo: "PATCH",
      corpo: { status: "EM ABERTO", data_reagendamento: null },
      prefer: "return=representation"
    }
  );
  return linhas || [];
}

/* --------------------------------------------------------------------- config */

/** Valor (jsonb) da linha `config` com a chave dada, ou null. */
export async function lerConfig(env, chave) {
  const linhas = await pedir(env, `/rest/v1/config?select=valor&chave=eq.${encodeURIComponent(chave)}&limit=1`);
  return linhas?.[0]?.valor ?? null;
}

/* ------------------------------------------------------------------- usuários */

export async function lerPerfil(env, uid) {
  const linhas = await pedir(
    env,
    `/rest/v1/usuarios?select=id,email,display_name,cargo,status&id=eq.${encodeURIComponent(uid)}&limit=1`
  );
  return linhas?.[0] || null;
}

/**
 * Confere um access_token perguntando ao próprio Supabase Auth (GET /auth/v1/user).
 * Assim não é preciso guardar o segredo JWT no Worker nem lidar com rotação de
 * chaves: quem emitiu o token é quem o valida, inclusive revogação e ban.
 */
export async function verificarToken(env, token) {
  const { url, chave } = configSupabase(env);
  try {
    const resposta = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: chave, Authorization: `Bearer ${token}` }
    });
    if (!resposta.ok) return { valid: false, error: `Auth respondeu ${resposta.status}` };
    const usuario = await resposta.json();
    if (!usuario?.id) return { valid: false, error: "Resposta sem usuário" };
    return { valid: true, uid: usuario.id, email: usuario.email || "" };
  } catch (error) {
    return { valid: false, error: String(error?.message || error) };
  }
}

/** Cria a conta no Supabase Auth (já confirmada) e devolve { id, email }. */
export async function criarContaAuth(env, { email, password, displayName }) {
  const usuario = await pedir(env, "/auth/v1/admin/users", {
    metodo: "POST",
    corpo: { email, password, email_confirm: true, user_metadata: { display_name: displayName } }
  });
  return { id: usuario.id, email: usuario.email };
}

export async function atualizarContaAuth(env, uid, { email, password, displayName }) {
  const corpo = {};
  if (email) {
    corpo.email = email;
    corpo.email_confirm = true;
  }
  if (password) corpo.password = password;
  if (displayName) corpo.user_metadata = { display_name: displayName };
  if (!Object.keys(corpo).length) return;
  await pedir(env, `/auth/v1/admin/users/${encodeURIComponent(uid)}`, { metodo: "PUT", corpo });
}

/** Apagar a conta apaga o perfil junto (FK `on delete cascade` em public.usuarios). */
export async function excluirContaAuth(env, uid) {
  await pedir(env, `/auth/v1/admin/users/${encodeURIComponent(uid)}`, { metodo: "DELETE" });
}

export async function inserirPerfil(env, perfil) {
  await pedir(env, "/rest/v1/usuarios", { metodo: "POST", corpo: perfil, prefer: "return=minimal" });
}

export async function atualizarPerfil(env, uid, campos) {
  await pedir(env, `/rest/v1/usuarios?id=eq.${encodeURIComponent(uid)}`, {
    metodo: "PATCH",
    corpo: campos,
    prefer: "return=minimal"
  });
}
