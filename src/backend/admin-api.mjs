/**
 * admin-api.mjs — rotas administrativas do Worker.
 *
 * Criar e excluir usuário exigem a chave service_role do Supabase, que o
 * navegador não pode ter: por isso essas operações vivem aqui (criar-usuario,
 * gerenciar-usuario, supabase-rest).
 *
 * Listar usuários NÃO passa por aqui: a RLS do banco já libera leitura para
 * autenticados, então o React lê direto e ganha a lista em tempo real.
 */

import {
  acharChamadoAberto,
  atualizarSuporte,
  lerPerfil,
  lerSuporte,
  lerSuportePorLead,
  verificarToken
} from "./supabase-rest.mjs";
import { criarUsuario } from "./criar-usuario.mjs";
import { atualizarCargo, editarUsuario, excluirUsuario } from "./gerenciar-usuario.mjs";
import { normalizarCargo } from "../shared/funcoes.mjs";
import { normalizeTecnico } from "../shared/tecnico.js";
import { normalizeText } from "../shared/normalize.js";
import {
  getLeadChatEvents,
  getLeadsByIds,
  getContact,
  getContactCustomFields,
  getLead,
  getLeadCustomFields,
  getTalkMessages,
  updateContact,
  updateLead
} from "../shared/kommo-client.js";
import { cpfValido, DOCS_DA_CERTIFY, formatarDoc, montarPrefill } from "../shared/prefill-finalizacao.mjs";
import { extrairLeadId, montarFormularioNovo, talkIdDosEventos } from "../shared/novo-por-lead.mjs";
import { contatoTemEmail, montarCamposKommo, opcoesFinalizacao } from "../shared/kommo-campos.mjs";
import { escolherLeadDeVendas, FUNIL_VENDAS, leadDeVendasAberto } from "../shared/kommo-funil.mjs";
import { registrarErro } from "./erros.mjs";

function credenciaisKommo(env) {
  const baseUrl = normalizeText(env.KOMMO_BASE_URL || "");
  const accessToken = normalizeText(env.KOMMO_ACCESS_TOKEN || "");
  return baseUrl && accessToken ? { baseUrl, accessToken } : null;
}

// Definições dos campos do lead mudam raramente; buscar a cada finalização
// seria uma chamada a mais contra o limite de 7 req/s do Kommo. Cache por
// isolate do Worker — some sozinho quando o isolate é reciclado.
const CACHE_CAMPOS_MS = 10 * 60 * 1000;
let cacheCampos = { em: 0, campos: null };

/**
 * Definições dos campos de lead E de contato: os dados do certificado ficam
 * parte num grupo do lead, parte em campos do contato (os que aparecem no
 * card — Doc. Cliente, Valor, Sistema...). Ver MAPA_FINALIZACAO.
 */
async function camposDoKommo(kommo) {
  if (cacheCampos.campos && Date.now() - cacheCampos.em < CACHE_CAMPOS_MS) return cacheCampos.campos;
  const [lead, contato] = await Promise.all([getLeadCustomFields(kommo), getContactCustomFields(kommo)]);
  const campos = { lead, contato };
  cacheCampos = { em: Date.now(), campos };
  return campos;
}

/** Só para os testes: esquece as definições em cache. */
export function limparCacheCamposKommo() {
  cacheCampos = { em: 0, campos: null };
}

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
 * Identifica quem está chamando: o Supabase Auth valida o access_token e o
 * cargo vem de `public.usuarios`. O cargo do token não serve — ele não existe
 * lá; a fonte da verdade é a linha do perfil.
 */
async function autenticar(request, env) {
  const header = request.headers.get("authorization") || "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!token) return { ok: false, status: 401, error: "Token ausente." };

  const verificado = await verificarToken(env, token);
  if (!verificado.valid) {
    // O motivo ("iss inválido", "kid não encontrado"...) vai só para o log:
    // na resposta ele serviria de guia para quem estiver forjando tokens.
    console.warn("[Admin] Token recusado:", verificado.error);
    return { ok: false, status: 401, error: "Token inválido." };
  }

  let perfil = null;
  try {
    perfil = await lerPerfil(env, verificado.uid);
  } catch (error) {
    console.error("[Admin] Falha ao ler perfil do usuário:", error?.message || error);
  }

  const cargo = normalizarCargo(perfil?.cargo || "");
  return {
    ok: true,
    uid: verificado.uid,
    email: verificado.email || perfil?.email || "",
    displayName: String(perfil?.display_name || "").trim(),
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

    // --- dados da finalização no Kommo (campos; não mexe na etapa) ---------
    const moverEtapa = rota.match(/^\/supports\/([^/]+)\/kommo-etapa$/);
    if (moverEtapa && request.method === "POST") {
      return gravarFinalizacaoNoKommo(env, decodeURIComponent(moverEtapa[1]));
    }

    // --- "Novo suporte": só o lead -> formulário preenchido ----------------
    if (rota === "/supports/novo-por-lead" && request.method === "POST") {
      return novoSuportePorLead(env, await lerCorpo(request));
    }

    // --- lead do funil de vendas, para o botão do Kommo no painel ----------
    const leadVendas = rota.match(/^\/supports\/([^/]+)\/lead-vendas$/);
    if (leadVendas && request.method === "GET") {
      return leadDeVendasDoChamado(env, decodeURIComponent(leadVendas[1]));
    }

    // --- pré-preenchimento da tela de finalizar (qualquer autenticado) -----
    const prefill = rota.match(/^\/supports\/([^/]+)\/prefill$/);
    if (prefill && request.method === "GET") {
      return prefillFinalizacao(env, decodeURIComponent(prefill[1]));
    }
    const prefillIA = rota.match(/^\/supports\/([^/]+)\/prefill-ia$/);
    if (prefillIA && request.method === "POST") {
      return prefillFinalizacaoIA(env, decodeURIComponent(prefillIA[1]), await lerCorpo(request));
    }

    // --- opções das listas do Kommo para a tela de finalizar ----------------
    if (rota === "/kommo/campos-finalizacao" && request.method === "GET") {
      return opcoesDaFinalizacao(env);
    }

    // --- daqui para baixo, só administrador --------------------------------
    if (!sessao.isAdmin) {
      return json(403, { ok: false, error: "Apenas administradores podem fazer isso." });
    }

    if (rota === "/usuarios" && request.method === "POST") {
      const corpo = await lerCorpo(request);
      const resultado = await criarUsuario({
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

        // Só o cargo mudou? O caminho curto não toca no Supabase Auth.
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
    const ref = registrarErro("Admin", error);
    return json(500, { ok: false, error: "Erro interno na API administrativa.", ref });
  }
}

/**
 * Title Case, igual ao `titleCaseName` do painel.
 *
 * `normalizeTecnico` devolve o nome em MAIÚSCULAS, mas o painel grava e
 * FILTRA em Title Case (`eq("tecnico", "Matheus")`). Gravar "MATHEUS"
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
  const tecnico = titleCaseNome(
    normalizeTecnico(sessao.displayName || (sessao.email ? sessao.email.split("@")[0] : ""))
  );
  if (!tecnico) {
    return json(400, { ok: false, error: "Não foi possível determinar o nome do técnico." });
  }

  const atual = await lerSuporte(env, supportId);
  if (!atual) return json(404, { ok: false, error: "Registro não encontrado." });

  // Campos + linha do histórico na mesma operação (função atualizar_suporte).
  // `tecnicoKey` deixou de existir: a busca por técnico usa a própria coluna.
  await atualizarSuporte(
    env,
    supportId,
    {
      tecnico,
      status: "EM ANDAMENTO",
      // Só marca o início na primeira associação — reassociar não pode zerar a
      // medição de tempo de um atendimento que já começou.
      dataInicioAtendimento: atual.data_inicio_atendimento || new Date().toISOString()
    },
    { em: new Date().toISOString(), texto: `Atendimento assumido por ${tecnico}`, por: tecnico }
  );

  // O sistema não move mais o lead de etapa no Kommo (retirado em 2026-10-03).
  return json(200, { ok: true, tecnico, message: `Técnico associado: ${tecnico}` });
}

/**
 * O lead do cliente no "01 - Funil de vendas" — é nele que ficam a Etapa de
 * suporte, o Pagamento Concluído e os campos do certificado. O id gravado no
 * chamado é o do lead em que a conversa do WhatsApp estava, que pode ser de
 * outro funil (cobranças, pós-venda...). Se for, procura pelo contato
 * principal os outros leads dele e escolhe o de vendas (escolherLeadDeVendas).
 * Sem lead no funil de vendas, fica com o original. Devolve o lead completo
 * (com contatos), igual a getLead.
 */
async function leadDoSuporte(kommo, leadId, { preferido = "" } = {}) {
  // 1) O lead que o sistema JÁ levou para a Etapa de suporte neste chamado
  //    (extras.kommo_suporte.lead_id) é o do atendimento — não há o que decidir.
  if (preferido && String(preferido) !== String(leadId)) {
    try {
      const marcado = await getLead({ ...kommo, leadId: preferido });
      if (String(marcado?.pipeline_id ?? "") === FUNIL_VENDAS) return marcado;
    } catch {
      // some do Kommo ou sem acesso: segue pela regra normal
    }
  }

  const lead = await getLead({ ...kommo, leadId });
  // 2) Lead do funil de vendas AINDA ABERTO: é ele. Fechado (ganho/perdido)
  //    não basta — o cliente pode ter outro, aberto, e a conversa do WhatsApp
  //    costuma ficar presa ao mais antigo (caso Larissa, 2026-10-02).
  if (leadDeVendasAberto(lead)) return lead;

  const contatos = lead?._embedded?.contacts || [];
  const contatoId = (contatos.find((c) => c.is_main) || contatos[0])?.id;
  if (!contatoId) return lead;

  const contato = await getContact({ ...kommo, contactId: contatoId, withLeads: true });
  const ids = (contato?._embedded?.leads || []).map((l) => l.id).filter((id) => String(id) !== String(leadId));
  const candidatos = [...(await getLeadsByIds({ ...kommo, ids })), lead];
  const escolhido = escolherLeadDeVendas(candidatos);
  if (!escolhido || String(escolhido.id) === String(lead.id)) return lead;
  return getLead({ ...kommo, leadId: escolhido.id });
}

/**
 * "Novo suporte" a partir de um lead (pedido do usuário, 2026-10-01): o
 * técnico informa só o lead; aqui se lê o Kommo (lead + contato), acha a
 * conversa, pede à IA do n8n a classificação e devolve o formulário
 * preenchido. NÃO cria nada — o técnico confere e salva no painel.
 *
 * Antes de tudo, confere se o cliente já tem chamado ABERTO: pelo próprio lead
 * ou pelas pistas de cliente (achar_chamado_aberto, a mesma regra que as
 * automações usam para não duplicar). Se tiver, devolve `existente` para o
 * painel oferecer abrir esse chamado. Lead cujo chamado já foi encerrado NÃO
 * barra: é um novo suporte (desde 2026-10-02), e o formulário abre preenchido.
 */
async function novoSuportePorLead(env, corpo) {
  const leadId = extrairLeadId(corpo?.lead);
  if (!leadId) {
    return json(400, { ok: false, error: "Informe o número do lead ou cole o link do lead no Kommo." });
  }
  const kommo = credenciaisKommo(env);
  if (!kommo) {
    const ref = registrarErro("Kommo", new Error("KOMMO_ACCESS_TOKEN/KOMMO_BASE_URL nao configurados."));
    return json(500, { ok: false, error: "Integração com o Kommo não configurada.", ref });
  }

  const resumo = (linha) => ({
    id: linha.id,
    status: linha.status,
    protocolo: linha.protocolo || "",
    nomeCliente: linha.nome_cliente || "",
    tecnico: linha.tecnico || ""
  });

  const jaDoLead = await lerSuportePorLead(env, leadId); // só abertos
  if (jaDoLead) return json(200, { ok: true, leadId, existente: { ...resumo(jaDoLead), motivo: "mesmo lead" } });

  let lead;
  try {
    lead = await getLead({ ...kommo, leadId });
  } catch (error) {
    const ref = registrarErro("Kommo", error);
    const naoExiste = /Kommo API (204|404)/.test(String(error?.message));
    return json(naoExiste ? 404 : 502, {
      ok: false,
      error: naoExiste ? `Lead ${leadId} não encontrado no Kommo.` : "Falha ao consultar o lead no Kommo.",
      ref
    });
  }
  if (!lead) return json(404, { ok: false, error: `Lead ${leadId} não encontrado no Kommo.` });

  const opcional = (promessa, padrao) => promessa.catch((error) => (registrarErro("Kommo", error), padrao));
  const contatos = lead?._embedded?.contacts || [];
  const contatoId = (contatos.find((c) => c.is_main) || contatos[0])?.id || null;
  const [contato, eventos] = await Promise.all([
    contatoId ? opcional(getContact({ ...kommo, contactId: contatoId }), null) : Promise.resolve(null),
    opcional(getLeadChatEvents({ ...kommo, leadId }), [])
  ]);
  const talkId = talkIdDosEventos(eventos);
  const mensagens = talkId ? await opcional(getTalkMessages({ ...kommo, talkId }), []) : [];

  // Chamado aberto do mesmo cliente (aberto à mão, ou de outro lead)?
  const semIA = montarFormularioNovo({ lead, contato, mensagens });
  const achado = await acharChamadoAberto(env, {
    talkId,
    contactId: contatoId || "",
    contato: semIA.campos.contato || "",
    cpfCnpj: semIA.campos.cpfCnpj || "",
    protocolo: semIA.campos.protocolo || ""
  }).catch((error) => (registrarErro("Supabase", error), null));
  if (achado) {
    const linha = await lerSuporte(env, achado);
    if (linha) return json(200, { ok: true, leadId, existente: { ...resumo(linha), motivo: "mesmo cliente" } });
  }

  // IA do n8n: classificação e descrição a partir da conversa (e prints).
  const avisos = [];
  let ia = null;
  if (!talkId) {
    avisos.push("Não achei conversa do chat neste lead: preencha motivo e descrição à mão.");
  } else {
    ia = await lerConversaParaNovo(env, { leadId, talkId });
    if (!ia) avisos.push("Não foi possível ler a conversa com a IA agora: preencha motivo e descrição à mão.");
  }

  const { campos, dados, fontes } = montarFormularioNovo({ lead, contato, mensagens, ia });
  return json(200, {
    ok: true,
    leadId,
    campos,
    dados,
    fontes,
    // Liga o chamado à conversa e ao contato (bolinha, pré-preenchimento,
    // verificação de pagamento e "não duplicar" dependem disso).
    extras: Object.fromEntries(
      Object.entries({ kommo_talk_id: talkId, kommo_contact_id: contatoId ? String(contatoId) : "" }).filter(([, v]) => v)
    ),
    avisos
  });
}

/**
 * Pede ao n8n (modo "novo" do webhook de pré-preenchimento) a leitura da
 * conversa para um chamado novo. Devolve o objeto lido ou null em qualquer
 * falha — o formulário abre do mesmo jeito, só com menos campos.
 */
async function lerConversaParaNovo(env, { leadId, talkId }) {
  const url = normalizeText(env.N8N_PREFILL_URL || "");
  const token = normalizeText(env.N8N_PREFILL_TOKEN || "");
  if (!url || !token) return null;
  try {
    const resposta = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ modo: "novo", lead_id: leadId, talk_id: talkId }),
      signal: AbortSignal.timeout(PREFILL_IA_TIMEOUT_MS)
    });
    if (!resposta.ok) throw new Error(`n8n ${resposta.status}`);
    const dados = await resposta.json().catch(() => ({}));
    return dados?.novo && typeof dados.novo === "object" ? dados.novo : null;
  } catch (error) {
    registrarErro("n8n", error);
    return null;
  }
}

/** Id do lead de vendas para o botão "Abrir no Kommo" do painel. */
async function leadDeVendasDoChamado(env, supportId) {
  const atual = await lerSuporte(env, supportId);
  if (!atual) return json(404, { ok: false, error: "Registro não encontrado." });
  const kommo = credenciaisKommo(env);
  if (!kommo || !atual.kommo_lead_id) return json(200, { ok: true, leadId: atual.kommo_lead_id || null });
  try {
    const lead = await leadDoSuporte(kommo, atual.kommo_lead_id, { preferido: atual.extras?.kommo_suporte?.lead_id });
    return json(200, { ok: true, leadId: String(lead?.id || atual.kommo_lead_id), pipelineId: String(lead?.pipeline_id ?? "") });
  } catch (error) {
    // Kommo fora: o botão abre o lead gravado no chamado, como antes.
    const ref = registrarErro("Kommo", error);
    return json(200, { ok: true, leadId: atual.kommo_lead_id, ref });
  }
}

/**
 * Sugestões para a tela de finalizar, lidas do Kommo (lead + contato
 * principal) e do texto da conversa (quando o chamado sabe qual é). Só leitura:
 * nada é gravado aqui. Qualquer falha devolve o que deu para montar — a tela
 * só fica com menos campos preenchidos, nunca trava a finalização.
 */
async function prefillFinalizacao(env, supportId) {
  const atual = await lerSuporte(env, supportId);
  if (!atual) return json(404, { ok: false, error: "Registro não encontrado." });
  const campos = await sugestoesDoKommo(env, atual);
  return json(200, { ok: true, campos, temConversa: Boolean(atual.extras?.kommo_talk_id) });
}

/**
 * Lead + contato + texto da conversa -> sugestões (montarPrefill). Falha do
 * Kommo vira "menos sugestões", nunca erro. `incluirConversa: false` lê só os
 * campos personalizados (usado antes de acionar a IA).
 */
async function sugestoesDoKommo(env, atual, { incluirConversa = true } = {}) {
  const kommo = credenciaisKommo(env);
  const leadId = atual.kommo_lead_id;
  if (!kommo || !leadId) return {};

  const talkId = incluirConversa ? atual.extras?.kommo_talk_id || "" : "";
  const opcional = (promessa) => promessa.catch((error) => (registrarErro("Kommo", error), null));

  const [lead, mensagens] = await Promise.all([
    opcional(leadDoSuporte(kommo, leadId, { preferido: atual.extras?.kommo_suporte?.lead_id })),
    talkId ? opcional(getTalkMessages({ ...kommo, talkId })) : Promise.resolve([])
  ]);
  const contatos = lead?._embedded?.contacts || [];
  const contatoId = (contatos.find((c) => c.is_main) || contatos[0])?.id;
  const contato = contatoId ? await opcional(getContact({ ...kommo, contactId: contatoId })) : null;

  return montarPrefill({ lead, contato, mensagens: mensagens || [] }).campos;
}

/**
 * Segunda camada, mais lenta: repassa para o workflow do n8n que lê a conversa
 * com IA, incluindo fotos e PDFs (prints do certificado, documentos,
 * comprovantes). O Worker não tem chave de IA — quem analisa é o n8n.
 * Sem N8N_PREFILL_URL, ou se o n8n demorar/falhar, devolve vazio sem erro.
 */
const PREFILL_IA_TIMEOUT_MS = 25000;

async function prefillFinalizacaoIA(env, supportId, corpo) {
  const url = normalizeText(env.N8N_PREFILL_URL || "");
  const token = normalizeText(env.N8N_PREFILL_TOKEN || "");
  if (!url || !token) return json(200, { ok: true, campos: {}, motivo: "ia-nao-configurada" });

  const atual = await lerSuporte(env, supportId);
  if (!atual) return json(404, { ok: false, error: "Registro não encontrado." });
  const talkId = atual.extras?.kommo_talk_id || "";
  if (!atual.kommo_lead_id && !talkId) return json(200, { ok: true, campos: {}, motivo: "sem-conversa" });

  // Os campos personalizados do Kommo vêm ANTES da leitura de fotos e PDFs
  // (pedido do usuário, 2026-09-29): o que já está preenchido lá — lido
  // literalmente, não deduzido — não é procurado pela IA. Se não sobrar
  // nada, nem chama o n8n (economiza a chamada e o custo da IA).
  const daTela = Array.isArray(corpo?.jaPreenchidos) ? corpo.jaPreenchidos.map(String) : [];
  const doKommo = await sugestoesDoKommo(env, atual, { incluirConversa: false });
  const jaTem = new Set([
    ...daTela,
    ...Object.entries(doKommo).filter(([, s]) => s.fonte === "kommo" && !s.sugerido).map(([k]) => k)
  ]);
  const faltando = Object.keys(CHAVES_IA).filter((k) => !jaTem.has(k));
  // Valor V.E é opcional: sozinho não justifica acionar a IA.
  if (!faltando.some((k) => k !== "valorVE")) return json(200, { ok: true, campos: {}, motivo: "kommo-completo" });

  try {
    const resposta = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        lead_id: atual.kommo_lead_id || "",
        talk_id: talkId,
        // Tudo que a tela ou o Kommo já têm: a IA só procura o resto.
        ja_preenchidos: Object.keys(CHAVES_IA).filter((k) => jaTem.has(k))
      }),
      signal: AbortSignal.timeout(PREFILL_IA_TIMEOUT_MS)
    });
    if (!resposta.ok) throw new Error(`n8n ${resposta.status}`);
    const dados = await resposta.json().catch(() => ({}));
    return json(200, { ok: true, campos: camposDaIA(dados) });
  } catch (error) {
    const ref = registrarErro("n8n", error);
    return json(200, { ok: true, campos: {}, motivo: "ia-falhou", ref });
  }
}

/**
 * Resposta do n8n -> `{ chaveTela: { valor, fonte: "foto"|"conversa", sugerido } }`.
 * Só aceita as chaves e formatos conhecidos: a resposta vem de uma IA, então
 * é tratada como dado não confiável (nada de campo novo ou texto gigante).
 */
const CHAVES_IA = {
  protocoloCertificado: "texto",
  cpfCnpj: "texto",
  // CPF da pessoa (RG, CNH, conversa) — só entra se for um CPF válido.
  cpf: "texto",
  tipoCertificado: "texto",
  dataEmissao: "dia",
  dataVencimento: "dia",
  valor: "numero",
  valorVE: "numero",
  sistema: "texto",
  emailCliente: "texto"
};

function camposDaIA(dados) {
  const origem = dados?.campos && typeof dados.campos === "object" ? dados.campos : {};
  const campos = {};
  for (const [chave, tipo] of Object.entries(CHAVES_IA)) {
    const item = origem[chave];
    const bruto = item && typeof item === "object" ? item.valor : item;
    let valor = null;
    if (tipo === "dia" && /^\d{4}-\d{2}-\d{2}$/.test(String(bruto || ""))) valor = String(bruto);
    else if (tipo === "numero" && Number(bruto) > 0 && Number(bruto) < 1e6) valor = Number(bruto);
    else if (tipo === "texto" && typeof bruto === "string" && bruto.trim()) valor = bruto.trim().slice(0, 120);
    if (valor === null) continue;
    // O CNPJ da Certify aparece nas mensagens-modelo: nunca é do cliente.
    if (chave === "cpfCnpj" && DOCS_DA_CERTIFY.has(String(valor).replace(/\D/g, ""))) continue;
    if (chave === "cpf") {
      const d = String(valor).replace(/\D/g, "");
      if (!cpfValido(d)) continue;
      valor = formatarDoc(d);
    }
    campos[chave] = {
      valor,
      fonte: item?.fonte === "foto" ? "foto" : "conversa",
      // Tudo que vem da IA é conferido pelo técnico.
      sugerido: true
    };
  }
  return campos;
}

/** Opções reais das listas (Sistema, Validade estendida, Tipo) para a tela de finalizar. */
async function opcoesDaFinalizacao(env) {
  const kommo = credenciaisKommo(env);
  if (!kommo) return json(200, { ok: true, opcoes: {} });
  try {
    const campos = await camposDoKommo(kommo);
    return json(200, { ok: true, opcoes: opcoesFinalizacao(campos.lead, campos.contato) });
  } catch (error) {
    const ref = registrarErro("Kommo", error);
    return json(502, { ok: false, error: "Falha ao ler os campos do Kommo.", ref });
  }
}

/**
 * Ao finalizar um suporte, leva os dados da finalização para o Kommo:
 *
 * 1. Os dados da tela de finalizar vão para os campos personalizados — do
 *    LEAD e do CONTATO principal, onde cada um existir (nesta conta, parte
 *    dos campos do certificado é do contato: Doc. Cliente, Valor, Sistema...).
 *    Lidos da linha JÁ GRAVADA no banco — a fonte da verdade, não o que o
 *    navegador mandar. Campo vazio no painel não apaga nada no Kommo.
 * 2. O email vai para o email de sistema do contato só se ele ainda não tiver
 *    nenhum — nunca sobrescreve. Vai no mesmo PATCH dos campos do contato.
 *
 * O sistema NÃO move o lead de etapa no Kommo: nem ida para "Pagamento
 * Concluído" (retirada em 2026-10-01), nem a ida/volta da "Etapa de suporte"
 * (retirada em 2026-10-03). A rota continua se chamando /kommo-etapa só para
 * não quebrar o painel já publicado.
 *
 * Não é "sem lead = erro": chamado aberto manualmente no painel não tem
 * kommo_lead_id nenhum, e isso é normal, não uma falha.
 */
async function gravarFinalizacaoNoKommo(env, supportId) {
  const atual = await lerSuporte(env, supportId);
  if (!atual) return json(404, { ok: false, error: "Registro não encontrado." });

  const leadId = atual.kommo_lead_id;
  if (!leadId) return json(200, { ok: true, acao: "sem-lead" });

  const kommo = credenciaisKommo(env);
  if (!kommo) {
    const ref = registrarErro("Kommo", new Error("KOMMO_ACCESS_TOKEN/KOMMO_BASE_URL nao configurados."));
    return json(500, { ok: false, error: "Integração com o Kommo não configurada.", ref });
  }

  let lead;
  let definicoes;
  try {
    [lead, definicoes] = await Promise.all([
      leadDoSuporte(kommo, leadId, { preferido: atual.extras?.kommo_suporte?.lead_id }),
      camposDoKommo(kommo)
    ]);
  } catch (error) {
    const ref = registrarErro("Kommo", error);
    return json(502, { ok: false, error: "Falha ao consultar o lead no Kommo.", ref });
  }

  const contatos = lead?._embedded?.contacts || [];
  const contatoId = (contatos.find((c) => c.is_main) || contatos[0])?.id || null;

  // Sem contato vinculado, os campos que só existem no contato viram aviso.
  const { campos, camposContato, ignorados } = montarCamposKommo(
    atual,
    definicoes.lead,
    contatoId ? definicoes.contato : []
  );

  // Nomes dos campos (para os avisos do painel) e as opções das listas.
  const defs = new Map([...definicoes.lead, ...definicoes.contato].map((d) => [d.id, d]));
  const leadAlvo = lead?.id || leadId;

  // O lead do funil de vendas, que pode não ser o id gravado no chamado.
  const noLead = await gravarConferindo({
    gravar: (customFields) => updateLead({ ...kommo, leadId: leadAlvo, customFields }),
    ler: () => getLead({ ...kommo, leadId: leadAlvo }),
    campos,
    defs,
    onde: "lead"
  });

  // Contato principal: campos da finalização + email de sistema (só se vazio).
  const noContato = await gravarNoContato(kommo, contatoId, camposContato, atual.email_cliente, defs);

  return json(200, {
    ok: true,
    acao: "campos",
    camposGravados: noLead.gravados + noContato.gravados,
    camposIgnorados: [...ignorados, ...noLead.problemas, ...noContato.problemas],
    emailGravado: noContato.emailGravado
  });
}

/**
 * Contato principal: os campos da finalização + o email de sistema, este só
 * se o contato ainda não tiver nenhum. Mesma conferência do lead.
 */
async function gravarNoContato(kommo, contatoId, camposContato, email, defs) {
  const texto = String(email || "").trim();
  if (!contatoId || (!camposContato.length && !texto)) return { gravados: 0, problemas: [], emailGravado: false };
  const campos = [...camposContato];
  let emailGravado = false;
  if (texto) {
    try {
      const contato = await getContact({ ...kommo, contactId: contatoId });
      if (!contatoTemEmail(contato)) {
        campos.push({ field_code: "EMAIL", values: [{ value: texto, enum_code: "WORK" }] });
        emailGravado = true;
      }
    } catch {
      // sem conseguir ler o contato, não arrisca sobrescrever o email
    }
  }
  if (!campos.length) return { gravados: 0, problemas: [], emailGravado: false };
  const r = await gravarConferindo({
    gravar: (customFields) => updateContact({ ...kommo, contactId: contatoId, customFields }),
    ler: () => getContact({ ...kommo, contactId: contatoId }),
    campos,
    defs,
    onde: "contato"
  });
  return { ...r, emailGravado: emailGravado && !r.problemas.some((p) => p.startsWith("Email")) };
}

/** "Kommo API 400: {...}" -> trecho curto para o aviso do painel. */
function resumoErroKommo(error) {
  return String(error?.message || error || "erro").replace(/\s+/g, " ").slice(0, 180);
}

/** Itens de lista (enum_id) enviados que não aparecem no que o Kommo devolveu. */
export function listasNaoGravadas(enviados, entidade) {
  const atuais = entidade?.custom_fields_values || [];
  return enviados.filter((c) => {
    const pedidos = (c.values || []).map((v) => v.enum_id).filter((id) => id !== undefined);
    if (!pedidos.length) return false;
    const atual = atuais.find((a) => String(a.field_id) === String(c.field_id));
    const ids = (atual?.values || []).map((v) => String(v.enum_id));
    return !pedidos.every((id) => ids.includes(String(id)));
  });
}

/**
 * Grava e CONFERE (2026-10-08: Validade estendida e Comprou Outro não ficavam
 * no contato, sem erro nenhum).
 *
 * 1. Tudo num PATCH. Se o Kommo recusar, grava campo a campo — um campo ruim
 *    não derruba os outros — e cada recusa vira aviso com o motivo do Kommo.
 * 2. Relê a entidade. Campo de lista que não ficou é reenviado sozinho, pelo
 *    TEXTO da opção em vez do código; se ainda assim não ficar, vira aviso.
 * Nunca lança: devolve { gravados, problemas }.
 */
async function gravarConferindo({ gravar, ler, campos, defs, onde }) {
  const problemas = [];
  if (!campos.length) return { gravados: 0, problemas };
  const nome = (c) => (c.field_code === "EMAIL" ? "Email" : defs.get(c.field_id)?.name || `campo ${c.field_id}`);
  const recusados = new Set();

  try {
    await gravar(campos);
  } catch (error) {
    registrarErro("Kommo", error);
    for (const c of campos) {
      try {
        await gravar([c]);
      } catch (e) {
        recusados.add(c);
        problemas.push(`${nome(c)} (${onde}): o Kommo recusou — ${resumoErroKommo(e)}`);
      }
    }
  }

  const aceitos = campos.filter((c) => !recusados.has(c));
  let faltam = [];
  try {
    faltam = listasNaoGravadas(aceitos, await ler());
  } catch {
    return { gravados: aceitos.length, problemas }; // sem conferir: fica o que foi aceito
  }
  if (faltam.length) {
    for (const c of faltam) {
      const def = defs.get(c.field_id);
      const textos = c.values.map((v) => ({ value: def?.enums?.find((e) => e.id === v.enum_id)?.value })).filter((v) => v.value);
      try {
        if (textos.length) await gravar([{ field_id: c.field_id, values: textos }]);
      } catch (e) {
        registrarErro("Kommo", e);
      }
    }
    try {
      const ainda = listasNaoGravadas(faltam, await ler());
      for (const c of ainda) {
        const opcao = defs.get(c.field_id)?.enums?.find((e) => e.id === c.values[0]?.enum_id)?.value || "";
        problemas.push(`${nome(c)} (${onde}): o Kommo não guardou a opção "${opcao}" — preencha no Kommo`);
      }
      return { gravados: aceitos.length - ainda.length, problemas };
    } catch {
      return { gravados: aceitos.length, problemas };
    }
  }
  return { gravados: aceitos.length, problemas };
}
