import { supabase } from "../config/supabase";

/**
 * suportesStore.js — o "cache local reativo" que o Firestore dava de graça.
 *
 * O SDK do Firestore mostrava uma escrita na tela no mesmo instante, antes de
 * o servidor responder, e a desfazia sozinho se ela falhasse. O Supabase não
 * faz isso: `postgres_changes` só entrega o evento DEPOIS de gravado. Sem esta
 * camada, todo clique (concluir, associar, anotar) esperaria a viagem de ida e
 * volta e o painel pareceria lento — o oposto do que o usuário tinha.
 *
 * Como funciona:
 *  - Um canal realtime por tabela, compartilhado por todas as assinaturas.
 *  - Cada assinatura guarda os seus registros REAIS (o que o banco disse) e um
 *    predicado que diz se um registro pertence a ela (os filtros da tela).
 *  - `aplicarLocal` empilha um "patch otimista" por id; o que a tela vê é o
 *    registro real + os patches pendentes. Se a escrita falha, `reverter`
 *    tira o patch e a tela volta ao real. Se dá certo, o patch fica até o eco
 *    do realtime chegar (ou 4 s), para não piscar o valor antigo no meio.
 *  - Ao reconectar, tudo é buscado de novo: eventos perdidos com a rede fora
 *    não podem deixar a lista mentindo em silêncio.
 */

const PRAZO_ECO_MS = 4000;

const canais = new Map(); // tabela -> estado

function estadoDoCanal(tabela) {
  let estado = canais.get(tabela);
  if (estado) return estado;
  estado = {
    tabela,
    canal: null,
    conectado: false,
    jaConectou: false,
    subs: new Set(),
    overlays: new Map() // id -> [{ token, patch, base, confirmada }]
  };
  canais.set(tabela, estado);
  return estado;
}

/* ------------------------------------------------------------ visão da tela */

function registroVisivel(sub, estado, id) {
  const real = sub.reais.get(id);
  // Assinatura sem aplicarPatch (o dashboard) não entende os patches: só mostra o real.
  if (!sub.aplicarPatch) return real;
  const pilha = estado.overlays.get(id);
  if (!pilha?.length) return real;

  let atual = real || sub.conhecidos.get(id) || pilha.find((o) => o.base)?.base;
  if (!atual) return undefined;
  for (const { patch } of pilha) {
    if (patch.excluir) return undefined;
    atual = sub.aplicarPatch ? sub.aplicarPatch(atual, patch) : atual;
  }
  return sub.predicado(atual) ? atual : undefined;
}

function emitir(estado, sub) {
  const ids = new Set([...sub.reais.keys(), ...estado.overlays.keys()]);
  const lista = [];
  for (const id of ids) {
    const registro = registroVisivel(sub, estado, id);
    if (registro) lista.push(registro);
  }
  lista.sort(sub.ordenar);
  sub.onData(lista.slice(0, sub.teto), { truncado: sub.truncado, teto: sub.teto });
}

function emitirTodas(estado) {
  estado.subs.forEach((sub) => emitir(estado, sub));
}

/* ------------------------------------------------------------------- busca */

async function carregar(estado, sub) {
  const { data, error } = await sub.consulta(supabase.from(estado.tabela).select("*"));
  if (error) {
    console.error(`[${estado.tabela}] Erro ao carregar:`, error);
    sub.onError?.(error);
    return;
  }
  if (!estado.subs.has(sub)) return; // cancelada enquanto a resposta vinha
  sub.reais = new Map();
  for (const linha of data) {
    const registro = sub.mapear(linha);
    sub.conhecidos.set(registro.id, registro);
    if (sub.predicado(registro)) sub.reais.set(registro.id, registro);
  }
  sub.truncado = data.length >= sub.teto;
  emitir(estado, sub);
}

function recarregarTudo(estado) {
  estado.subs.forEach((sub) => carregar(estado, sub));
}

/* ---------------------------------------------------------------- realtime */

function soltarConfirmadas(estado, id) {
  const pilha = estado.overlays.get(id);
  if (!pilha) return;
  const restante = pilha.filter((o) => !o.confirmada);
  if (restante.length) estado.overlays.set(id, restante);
  else estado.overlays.delete(id);
}

function aoReceberEvento(estado, evento) {
  const excluiu = evento.eventType === "DELETE";
  const linha = excluiu ? evento.old : evento.new;
  const id = linha?.[estado.tabela === "config" ? "chave" : "id"];
  if (!id) return;

  if (excluiu) {
    estado.subs.forEach((sub) => sub.conhecidos.delete(id));
    estado.subs.forEach((sub) => sub.reais.delete(id));
  } else {
    estado.subs.forEach((sub) => {
      const registro = sub.mapear(linha);
      sub.conhecidos.set(id, registro);
      if (sub.predicado(registro)) sub.reais.set(id, registro);
      else sub.reais.delete(id);
    });
  }
  // O eco chegou: o valor real já reflete a escrita, o patch pode sair.
  soltarConfirmadas(estado, id);
  emitirTodas(estado);
}

function garantirCanal(estado) {
  if (estado.canal) return;
  estado.canal = supabase
    .channel(`live-${estado.tabela}`)
    .on("postgres_changes", { event: "*", schema: "public", table: estado.tabela }, (evento) =>
      aoReceberEvento(estado, evento)
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        const primeira = !estado.jaConectou;
        const reconexao = estado.jaConectou && !estado.conectado;
        estado.conectado = true;
        estado.jaConectou = true;
        // A busca inicial pode ter rodado antes do canal ficar de pé: qualquer
        // mudança nessa janela seria perdida. Rebuscar fecha o buraco.
        if (primeira || reconexao) recarregarTudo(estado);
      } else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) {
        estado.conectado = false;
      }
    });
}

function fecharCanalSeOcioso(estado) {
  if (estado.subs.size) return;
  if (estado.canal) supabase.removeChannel(estado.canal);
  canais.delete(estado.tabela);
}

/* ---------------------------------------------------------------- interface */

const ordenarPorDataAbertura = (a, b) =>
  new Date(b.dataAbertura || 0).getTime() - new Date(a.dataAbertura || 0).getTime();

/**
 * Assina uma tabela. Devolve o unsubscribe.
 *
 * @param opcoes.tabela       nome da tabela
 * @param opcoes.consulta     (qb) => promessa — aplica filtros/ordem/limite à busca inicial
 * @param opcoes.mapear       linha do banco -> registro (precisa ter `id`)
 * @param opcoes.predicado    registro -> boolean (o registro pertence a esta assinatura?)
 * @param opcoes.aplicarPatch (registro, patch) -> registro — só para o feedback otimista
 * @param opcoes.ordenar      comparador; padrão: dataAbertura desc
 * @param opcoes.teto         máximo de registros entregues
 */
export function assinarTabela({
  tabela,
  consulta,
  mapear,
  predicado = () => true,
  aplicarPatch,
  ordenar = ordenarPorDataAbertura,
  teto = 500,
  onData,
  onError
}) {
  const estado = estadoDoCanal(tabela);
  const sub = {
    consulta,
    mapear,
    predicado,
    aplicarPatch,
    ordenar,
    teto,
    onData,
    onError,
    reais: new Map(),
    conhecidos: new Map(), // id -> último registro real visto (base do feedback otimista)
    truncado: false
  };
  estado.subs.add(sub);
  garantirCanal(estado);
  carregar(estado, sub);

  return () => {
    estado.subs.delete(sub);
    fecharCanalSeOcioso(estado);
  };
}

/**
 * Mostra uma alteração na tela antes de o banco confirmar.
 *
 * `patch` é o que aplicarPatch da assinatura entende; `{ excluir: true }`
 * some com o registro. `base` é o registro completo, para o caso de criação
 * (ainda não existe em lugar nenhum). Devolve { confirmar, reverter }.
 */
export function aplicarLocal(tabela, id, patch, { base } = {}) {
  const estado = estadoDoCanal(tabela);
  const entrada = { token: Symbol(id), patch, base, confirmada: false };
  estado.overlays.set(id, [...(estado.overlays.get(id) || []), entrada]);
  emitirTodas(estado);

  const tirar = () => {
    const pilha = (estado.overlays.get(id) || []).filter((o) => o !== entrada);
    if (pilha.length) estado.overlays.set(id, pilha);
    else estado.overlays.delete(id);
  };

  return {
    /** A escrita deu certo: mantém o patch até o eco do realtime (ou o prazo). */
    confirmar() {
      entrada.confirmada = true;
      setTimeout(() => {
        const ainda = (estado.overlays.get(id) || []).includes(entrada);
        if (!ainda) return;
        tirar();
        // O eco não veio (realtime fora do ar?): não deixa a tela com o valor
        // antigo — busca o estado verdadeiro.
        if (estado.subs.size) recarregarTudo(estado);
        else emitirTodas(estado);
      }, PRAZO_ECO_MS);
    },
    /** A escrita falhou: a tela volta ao que o banco tem. */
    reverter() {
      tirar();
      emitirTodas(estado);
    }
  };
}
