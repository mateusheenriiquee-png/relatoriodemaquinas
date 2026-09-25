import { supabase, getApiBaseUrl } from "../config/supabase";
import { paraIso, paraLinha, linhaParaDados } from "../../../../shared/suporte-row.mjs";
import { TOTAL_FOLLOWUPS } from "../utils/followup";
import {
  formatContato,
  formatCpfCnpj,
  formatProtocolo,
  norm,
  normKey,
  normStatus,
  normalizeSearchText,
  titleCaseName,
  toComparableDate
} from "../utils/format";
import { aplicarLocal, assinarTabela } from "./suportesStore";

export const COLLECTION = "suportes";
const TABELA = "suportes";

/**
 * Chave de busca do nome do cliente — minúscula e sem acento.
 *
 * No Firestore era um campo gravado junto do nome; no Postgres a coluna
 * `busca` é GERADA pelo banco (protocolo + nome + CPF + contato + responsável,
 * sem acento), então não há mais o que esquecer de gravar. A função continua
 * exportada porque a importação e os testes a usam para comparar nomes.
 */
export function chaveNomeCliente(nome) {
  return normalizeSearchText(nome);
}
const MAX_LIVE_DOCS = 500;

/* ---------------------------------------------------------------- mapeamento */

function resolverDataAbertura(data = {}) {
  const dataWebhook = norm(data.dataAbertura || data.carimboDataHora || "");
  if (dataWebhook) return dataWebhook;
  if (typeof data.createdAt === "string") return norm(data.createdAt);
  if (data.createdAt?.toDate) return data.createdAt.toDate().toISOString();
  return "";
}

function resolverDateTime(value) {
  if (!value) return "";
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  return String(value);
}

/** Dados no formato camelCase (o que o Firestore devolvia) -> registro da tela. */
export function mapDadosParaRegistro(id, data = {}) {
  return {
    id,
    protocolo: norm(data.protocolo || data.idSuporte || ""),
    responsavelAbertura: norm(data.responsavelAbertura || data.responsavel || data.cliente || ""),
    // Nome do cliente final (Kommo: "Nome completo", com fallback pro "Lead
    // título" sem prefixo — ver importExportService). Distinto de
    // `responsavelAbertura`, que no Kommo é quem tratou o lead, não o cliente.
    nomeCliente: norm(data.nomeCliente || ""),
    cpfCnpj: norm(data.cpfCnpj || data.cpf_cnpj || ""),
    contato: norm(data.contato || data.telefone || ""),
    tipo: norm(data.tipo || ""),
    ac: norm(data.ac || data.AC || ""),
    tecnico: norm(data.tecnico || data.tecnicoResponsavel || ""),
    tecnicoKey: normKey(data.tecnico || data.tecnicoResponsavel || ""),
    status: normStatus(data.status || data.situacao || data.situacaoAtendimento || "EM ABERTO"),
    statusAbertura: norm(data.statusAbertura || ""),
    anotacoes: norm(data.anotacoes || data.anotacao || ""),
    motivo: norm(data.motivo || data.motivoSemRetorno || ""),
    motivoIndevido: norm(data.motivoIndevido || ""),
    /* Classificação do chamado — base das métricas por motivo / uso / plataforma.
       `motivoCat` é a categoria fechada (utils/catalogos.js) e `motivoDetalhe` o
       texto livre. São campos distintos de `motivo`, que aqui sempre significou
       "motivo do sem retorno" e continua com esse sentido. */
    motivoCat: norm(data.motivoCat || ""),
    motivoDetalhe: norm(data.motivoDetalhe || ""),
    usoCat: norm(data.usoCat || ""),
    usoPlat: norm(data.usoPlat || ""),
    excluirDaMedia: Boolean(data.excluirDaMedia),
    justificativaMedia: norm(data.justificativaMedia || ""),
    dataAbertura: resolverDataAbertura(data),
    dataInicioAtendimento: resolverDateTime(data.dataInicioAtendimento),
    dataFinalizacao: resolverDateTime(data.dataFinalizacao),
    dataReagendamento: resolverDateTime(
      data.dataReagendamento || data.dataReag || data.reagendamento
    ),
    // Follow-up por ligação e linha do tempo do chamado. Registros antigos não
    // têm nenhum dos dois — array vazio é o estado correto, não um erro.
    followups: Array.isArray(data.followups) ? data.followups : [],
    // Contagem vinda de planilha, quando não há os carimbos de cada tentativa.
    followupsImportados: Number(data.followupsImportados) || 0,
    historico: Array.isArray(data.historico) ? data.historico : [],
    foraDaMedia: Boolean(data.foraDaMedia),
    // Preenchidos na tela de finalização (ConcluirSuporteModal).
    emailCliente: norm(data.emailCliente || ""),
    comprouOutroProduto: typeof data.comprouOutroProduto === "boolean" ? data.comprouOutroProduto : null,
    protocoloCertificado: norm(data.protocoloCertificado || ""),
    dataEmissao: norm(data.dataEmissao || ""),
    dataVencimento: norm(data.dataVencimento || ""),
    tipoCertificado: norm(data.tipoCertificado || ""),
    validadeEstendida: norm(data.validadeEstendida || ""),
    sistema: norm(data.sistema || ""),
    valorVenda: Number(data.valorVenda) || 0
  };
}

/** Compatível com o formato antigo: qualquer coisa com `id` e `data()`. */
export function mapDocToRegistro(docSnap) {
  return mapDadosParaRegistro(docSnap.id, docSnap.data() || {});
}

/** Linha da tabela `suportes` -> registro da tela. */
export function mapLinhaParaRegistro(linha) {
  return mapDadosParaRegistro(linha.id, linhaParaDados(linha));
}

function involvesSoluti(...values) {
  return values.some((value) => normKey(value).includes("soluti"));
}

export function isRegistroSoluti(record) {
  return involvesSoluti(
    record.ac,
    record.tipo,
    record.responsavelAbertura,
    record.protocolo,
    record.tecnico
  );
}

/* -------------------------------------------------------------------- queries */

/** Marca "apagar este campo" (o `deleteField()` do Firestore). Vira NULL/'' no banco. */
const deleteField = () => null;

const inicioIso = (dia) => new Date(`${dia}T00:00:00Z`).toISOString();
const fimIso = (dia) => new Date(`${dia}T23:59:59Z`).toISOString();

/** Aplica os filtros da tela à consulta do banco. */
export function aplicarFiltros(qb, filtros = {}) {
  let q = qb;
  if (filtros.status && filtros.status !== "todos") q = q.eq("status", filtros.status);
  if (filtros.ac && filtros.ac !== "todos") q = q.eq("ac", filtros.ac);
  if (filtros.tecnico && filtros.tecnico !== "todos") {
    q = q.eq("tecnico", titleCaseName(filtros.tecnico));
  }
  if (filtros.dataInicio) q = q.gte("data_abertura", inicioIso(filtros.dataInicio));
  if (filtros.dataFim) q = q.lte("data_abertura", fimIso(filtros.dataFim));
  return q;
}

/**
 * O mesmo filtro, para registros que chegam pelo realtime ou pelo feedback
 * otimista — eles não passam pela consulta, então o teste precisa ser refeito
 * aqui. Tem que dizer o mesmo que `aplicarFiltros`, senão a lista mostraria
 * linhas que o filtro esconderia (ou o contrário) até o próximo recarregamento.
 */
export function registroPassaNosFiltros(registro, filtros = {}) {
  if (filtros.status && filtros.status !== "todos" && registro.status !== filtros.status) return false;
  if (filtros.ac && filtros.ac !== "todos" && registro.ac !== filtros.ac) return false;
  if (
    filtros.tecnico &&
    filtros.tecnico !== "todos" &&
    registro.tecnico !== titleCaseName(filtros.tecnico)
  ) {
    return false;
  }
  const quando = registro.dataAbertura ? new Date(registro.dataAbertura).getTime() : NaN;
  if (filtros.dataInicio && !(quando >= new Date(inicioIso(filtros.dataInicio)).getTime())) return false;
  if (filtros.dataFim && !(quando <= new Date(fimIso(filtros.dataFim)).getTime())) return false;
  return true;
}

/**
 * Aplica um patch otimista a um registro da tela. `patch` tem a forma
 * { campos, historico, followup } — os mesmos dados que vão para o banco.
 */
function aplicarPatchLocal(registro, patch) {
  const campos = patch.campos || {};
  const proximo = { ...registro };
  for (const [campo, valor] of Object.entries(campos)) {
    if (campo === "tecnicoKey" || campo === "nomeClienteKey") continue;
    if (valor === null) {
      proximo[campo] = typeof registro[campo] === "boolean" ? false : "";
    } else if (valor instanceof Date) {
      proximo[campo] = valor.toISOString();
    } else {
      proximo[campo] = valor;
    }
  }
  if (Object.prototype.hasOwnProperty.call(campos, "tecnico")) {
    proximo.tecnicoKey = normKey(proximo.tecnico);
  }
  if (Object.prototype.hasOwnProperty.call(campos, "status")) {
    proximo.status = normStatus(proximo.status);
  }
  if (patch.historico) proximo.historico = [...registro.historico, patch.historico];
  if (patch.followup) proximo.followups = [...registro.followups, patch.followup];
  return proximo;
}

function assinarRegistros({ filtros, onData, onError, rotulo }) {
  return assinarTabela({
    tabela: TABELA,
    // Mais recentes primeiro, como o Firestore fazia.
    consulta: (qb) =>
      aplicarFiltros(qb, filtros)
        .order("data_abertura", { ascending: false, nullsFirst: false })
        .limit(MAX_LIVE_DOCS),
    mapear: mapLinhaParaRegistro,
    predicado: (r) => registroPassaNosFiltros(r, filtros) && !isRegistroSoluti(r),
    aplicarPatch: aplicarPatchLocal,
    teto: MAX_LIVE_DOCS,
    onData,
    onError: (error) => {
      console.error(`[Suportes] Erro no listener${rotulo}:`, error);
      onError?.(error);
    }
  });
}

/**
 * Listener em tempo real da lista principal. Retorna unsubscribe.
 * O segundo argumento de `onData` avisa quando o teto de registros foi
 * atingido — sem isso a tela mostraria menos registros do que existem, calada.
 */
export function subscribeRegistros(filtros, onData, onError) {
  return assinarRegistros({ filtros: filtros || {}, onData, onError, rotulo: "" });
}

/** Listener dedicado aos suportes EM ABERTO (independente dos filtros). */
export function subscribeSuportesEmAberto(onData, onError) {
  return assinarRegistros({ filtros: { status: "EM ABERTO" }, onData, onError, rotulo: " EM ABERTO" });
}

export async function contarPorStatus() {
  const contar = async (status) => {
    let q = supabase.from(TABELA).select("id", { count: "exact", head: true });
    if (status) q = q.eq("status", status);
    const { count, error } = await q;
    if (error) throw error;
    return Number(count || 0);
  };

  const [total, abertos, andamento, finalizados, semRetorno, reagendado] = await Promise.all([
    contar(),
    contar("EM ABERTO"),
    contar("EM ANDAMENTO"),
    contar("FINALIZADO"),
    contar("SEM RETORNO"),
    contar("REAGENDADO")
  ]);

  return { total, abertos, andamento, finalizados, semRetorno, reagendado };
}

/* ------------------------------------------------------------------- histórico */

/**
 * Uma linha da linha do tempo do chamado.
 *
 * A data vai em ISO, gerada no cliente: o histórico é um array dentro do
 * chamado, e a diferença de relógio é irrelevante perto da granularidade de
 * minutos que a tela exibe.
 */
function entradaHistorico(texto, por) {
  return {
    em: new Date().toISOString(),
    texto: String(texto || "").slice(0, 300),
    por: String(por || "")
  };
}

/**
 * Texto padrão de troca de status. Sem o status anterior (a maioria das telas
 * tem o item em mãos, mas nem todas), registra só o destino.
 */
function textoStatus(novo, anterior) {
  return anterior && anterior !== novo ? `Status: ${anterior} → ${novo}` : `Status: ${novo}`;
}

/* ------------------------------------------------------------------- escritas */

/**
 * Executa uma escrita com feedback otimista: a tela muda já, e volta atrás se
 * o banco recusar. É o que o Firestore fazia sozinho com o cache local.
 */
async function comFeedbackOtimista(id, patch, gravar, opcoes) {
  const local = aplicarLocal(TABELA, id, patch, opcoes);
  try {
    const resultado = await gravar();
    local.confirmar();
    return resultado;
  } catch (erro) {
    local.reverter();
    throw erro;
  }
}

function lancarSeErro({ error }) {
  if (error) {
    const e = new Error(error.message || "Falha ao gravar no banco.");
    e.code = error.code;
    throw e;
  }
}

/**
 * `nota` entra na primeira linha do histórico. Hoje é usada pela abertura
 * retroativa: a data do chamado passa a ser outra que não a de criação do
 * registro, e essa diferença precisa estar escrita em algum lugar.
 *
 * Devolve `{ id }`, como o `addDoc` devolvia uma referência com `.id`.
 */
export async function criarSuporte(payload, { por, nota } = {}) {
  const descricao = [payload.tipo, payload.ac].filter(Boolean).join(" · ");
  const historico = [
    entradaHistorico(
      `Chamado aberto${descricao ? ` · ${descricao}` : ""}${nota ? ` · ${nota}` : ""}`,
      por
    )
  ];
  // O id nasce aqui para a tela poder mostrar o chamado antes do banco responder.
  const id = crypto.randomUUID();
  const dados = { dataAbertura: new Date().toISOString(), ...payload, historico };
  const linha = { id, ...paraLinha(dados) };
  const base = mapDadosParaRegistro(id, { ...dados, createdAt: new Date().toISOString() });

  await comFeedbackOtimista(
    id,
    { campos: dados },
    async () => lancarSeErro(await supabase.from(TABELA).insert(linha)),
    { base }
  );
  return { id };
}

/**
 * Atualização genérica. `historico` (opcional) é a frase que descreve a
 * mudança — quando presente, entra na linha do tempo na mesma escrita, para
 * que nunca exista alteração sem registro correspondente. `followup`
 * (opcional) acrescenta uma tentativa de contato no mesmo passo: a função do
 * banco `atualizar_suporte` faz tudo numa operação só.
 */
export function atualizarSuporte(id, payload, historico = null, followup = null) {
  const entrada = historico ? entradaHistorico(historico.texto, historico.por) : null;
  return comFeedbackOtimista(
    id,
    { campos: payload, historico: entrada, followup },
    async () =>
      lancarSeErro(
        await supabase.rpc("atualizar_suporte", {
          p_id: id,
          p_patch: paraLinha(payload),
          p_historico: entrada,
          p_followup: followup
        })
      )
  );
}

/** Anotação livre na linha do tempo, sem alterar mais nada no chamado. */
export function registrarNoHistorico(id, texto, por) {
  return atualizarSuporte(id, {}, { texto, por });
}

export function excluirSuporte(id) {
  return comFeedbackOtimista(id, { excluir: true }, async () =>
    lancarSeErro(await supabase.from(TABELA).delete().eq("id", id))
  );
}

/**
 * Marca o fim do atendimento. `dataFinalizacao` é gravada no instante do clique —
 * é ela que fecha a medição de tempo, e não `updatedAt`, que muda a cada edição
 * posterior do registro.
 */
export function concluirSuporte(id, extras = {}, { por, statusAnterior } = {}) {
  return atualizarSuporte(
    id,
    {
      status: "FINALIZADO",
      dataFinalizacao: new Date().toISOString(),
      ...extras
    },
    { texto: textoStatus("FINALIZADO", statusAnterior), por }
  );
}

export function marcarSemRetorno(id, motivo, { por, statusAnterior } = {}) {
  return atualizarSuporte(
    id,
    {
      status: "SEM RETORNO",
      motivo,
      dataFinalizacao: new Date().toISOString()
    },
    { texto: `${textoStatus("SEM RETORNO", statusAnterior)}${motivo ? ` · ${motivo}` : ""}`, por }
  );
}

/** Reabrir zera a medição: o próximo ciclo começa quando alguém se associar de novo. */
export function voltarParaEmAberto(id, { por, statusAnterior } = {}) {
  return atualizarSuporte(
    id,
    {
      status: "EM ABERTO",
      tecnico: "",
      dataInicioAtendimento: deleteField(),
      dataFinalizacao: deleteField()
    },
    { texto: textoStatus("EM ABERTO", statusAnterior), por }
  );
}

export function reagendarSuporte(id, dataReagendamento, { por, statusAnterior } = {}) {
  const quando = dataReagendamento instanceof Date ? dataReagendamento : new Date(dataReagendamento);
  const legivel = Number.isNaN(quando.getTime()) ? "" : quando.toLocaleString("pt-BR");
  return atualizarSuporte(
    id,
    { status: "REAGENDADO", dataReagendamento },
    { texto: `${textoStatus("REAGENDADO", statusAnterior)}${legivel ? ` · para ${legivel}` : ""}`, por }
  );
}

export function salvarAnotacoes(id, anotacoes, { por } = {}) {
  return atualizarSuporte(id, { anotacoes }, { texto: "Anotações atualizadas", por });
}

export function definirIndevido(id, motivoIndevido, { por } = {}) {
  return atualizarSuporte(
    id,
    { statusAbertura: "INDEVIDO", motivoIndevido },
    { texto: `Abertura marcada como INDEVIDA${motivoIndevido ? ` · ${motivoIndevido}` : ""}`, por }
  );
}

export function definirDevido(id, { por } = {}) {
  return atualizarSuporte(
    id,
    { statusAbertura: "DEVIDO" },
    { texto: "Abertura marcada como DEVIDA", por }
  );
}

/**
 * Tira (ou devolve) um chamado das médias de tempo, sempre com justificativa.
 *
 * É a válvula de escape dos outliers que o dashboard aponta: o atendimento que
 * ficou uma semana parado por causa do cliente não deve puxar a média da
 * equipe, mas apagá-lo do banco seria perder o registro. A justificativa é
 * obrigatória justamente para que a exclusão possa ser contestada depois.
 */
export function definirForaDaMedia(id, { excluir, justificativa = "" }, { por } = {}) {
  return atualizarSuporte(
    id,
    excluir
      ? { excluirDaMedia: true, justificativaMedia: String(justificativa).slice(0, 300) }
      : { excluirDaMedia: false, justificativaMedia: deleteField() },
    {
      texto: excluir
        ? `Excluído da média${justificativa ? ` · ${justificativa}` : ""}`
        : "Devolvido para a média",
      por
    }
  );
}

export function alterarTecnico(id, tecnico, { por } = {}) {
  const nome = titleCaseName(tecnico);
  return atualizarSuporte(id, { tecnico: nome }, { texto: `Técnico alterado para ${nome}`, por });
}

/* ----------------------------------------------------------------- follow-up */

/**
 * Registra uma tentativa de contato por ligação.
 *
 * A validação da janela mínima (10 min entre 1º e 2º, 30 min entre 2º e 3º)
 * é da interface — aqui só gravamos, para que a função continue utilizável por
 * um script de correção ou por outra tela sem duplicar a regra.
 *
 * No 3º, o chamado sai da média de tempo do dashboard (`foraDaMedia`): esperar
 * um cliente que não atende não é tempo de trabalho da equipe.
 */
export function registrarFollowup(id, { ordem, observacao = "", por = "" }) {
  const numero = Number(ordem);
  if (!Number.isInteger(numero) || numero < 1 || numero > TOTAL_FOLLOWUPS) {
    return Promise.reject(new Error(`Follow-up inválido: ${ordem}`));
  }

  const texto = String(observacao || "").trim();
  const tentativa = {
    ordem: numero,
    em: new Date().toISOString(),
    observacao: texto.slice(0, 300),
    por: String(por || "")
  };

  return atualizarSuporte(
    id,
    numero === TOTAL_FOLLOWUPS ? { foraDaMedia: true } : {},
    {
      texto:
        `${numero}º follow-up por ligação registrado` +
        (texto ? ` · ${texto}` : "") +
        (numero === TOTAL_FOLLOWUPS ? " · chamado sai da média" : ""),
      por
    },
    tentativa
  );
}

/**
 * Associa o técnico responsável.
 *
 * Caminho preferido: a API do Worker, que resolve o nome pelo perfil no
 * servidor — assim ninguém assume um chamado com o nome de outra pessoa.
 * Se ela não responder, grava direto no banco com o nome do usuário logado,
 * para o painel não travar por causa do backend.
 */
export async function associarTecnico(item, { getIdToken, displayName }) {
  try {
    const token = await getIdToken();
    const response = await fetch(`${getApiBaseUrl()}/api/admin/supports/${item.id}/associate`, {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Erro ao associar técnico.");
    return data.tecnico;
  } catch (err) {
    console.warn("[Suportes] associarTecnico via API falhou, usando fallback:", err?.message || err);
    const tecnico = titleCaseName(displayName || "Desconhecido");
    const payload = { tecnico, status: "EM ANDAMENTO" };
    if (!item.dataInicioAtendimento) {
      payload.dataInicioAtendimento = new Date().toISOString();
    }
    await atualizarSuporte(item.id, payload, {
      texto: `Atendimento assumido por ${tecnico}`,
      por: tecnico
    });
    return tecnico;
  }
}

/* --------------------------------------------------------- busca no servidor */

/**
 * O banco guarda os valores já formatados (123-456-789, 000.000.000-00,
 * (85) 99999-9999). Quem digita raramente formata. Geramos então as variações
 * plausíveis do termo e procuramos todas — cobre os dois jeitos de digitar.
 */
function variacoesDeBusca(termo) {
  const bruto = norm(termo);
  if (!bruto) return [];

  const variacoes = new Set([bruto]);
  const digitos = bruto.replace(/\D/g, "");

  if (digitos) {
    variacoes.add(digitos);
    variacoes.add(formatProtocolo(digitos));
    variacoes.add(formatCpfCnpj(digitos));
    variacoes.add(formatContato(digitos));
  }

  return [...variacoes].filter(Boolean);
}

/** Tira o que viraria curinga ou quebraria a sintaxe do filtro `or` do PostgREST. */
const limparParaFiltro = (t) => t.replace(/[%_\\",()*]/g, " ").replace(/\s+/g, " ").trim();

/**
 * Busca no banco inteiro por protocolo / CPF-CNPJ / contato / nome do cliente.
 *
 * Usa a coluna `busca` (gerada pelo banco: sem acento e minúscula) com
 * `ilike '%termo%'` — busca por TRECHO, o que o Firestore não fazia (só
 * prefixo): "ramos" agora acha "Bruno Ramos". O índice trigrama a mantém
 * rápida mesmo com centenas de milhares de linhas.
 *
 * Não aplica os filtros da tela de propósito: quem busca um protocolo quer
 * achá-lo esteja ele em que status estiver.
 */
export async function buscarRegistrosNoServidor(termo, { max = 50 } = {}) {
  const alvos = new Set(variacoesDeBusca(termo).map((v) => limparParaFiltro(chaveNomeCliente(v))));
  const nome = limparParaFiltro(chaveNomeCliente(termo));
  if (nome) alvos.add(nome);
  const validos = [...alvos].filter(Boolean);
  if (!validos.length) return [];

  const filtro = validos.map((v) => `busca.ilike."%${v}%"`).join(",");
  const { data, error } = await supabase
    .from(TABELA)
    .select("*")
    .or(filtro)
    .order("data_abertura", { ascending: false, nullsFirst: false })
    .limit(max);

  if (error) {
    console.warn("[Suportes] Busca no servidor falhou:", error.message);
    return [];
  }

  return data
    .map(mapLinhaParaRegistro)
    .filter((registro) => !isRegistroSoluti(registro))
    .sort((a, b) => toComparableDate(b.dataAbertura) - toComparableDate(a.dataAbertura))
    .slice(0, max);
}

/**
 * Devolve para EM ABERTO os suportes cujo reagendamento já venceu.
 *
 * A execução periódica disso é do Cron Trigger do Worker (src/backend/reagendados.mjs) —
 * o front chama esta versão só como rede de segurança na abertura da tela.
 * É um único UPDATE condicional: não há janela entre "ler quem venceu" e
 * "reabrir" em que outro cliente possa alterar o mesmo chamado.
 */
export async function processarReagendadosVencidos() {
  const { data, error } = await supabase
    .from(TABELA)
    .update({ status: "EM ABERTO", data_reagendamento: null })
    .eq("status", "REAGENDADO")
    .not("data_reagendamento", "is", null)
    .lte("data_reagendamento", paraIso(new Date()))
    .select("protocolo");
  if (error) throw error;
  return (data || []).map((linha) => linha.protocolo || "S/N");
}
