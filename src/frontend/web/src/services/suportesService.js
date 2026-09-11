import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getCountFromServer,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where
} from "firebase/firestore";
import { db, getApiBaseUrl } from "../config/firebase";
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

export const COLLECTION = "suportes_tecnicos";

/**
 * Chave de busca do nome do cliente — minúscula e sem acento.
 *
 * O Firestore não faz busca case-insensitive nem ignora acento: consultar
 * `nomeCliente` direto acharia "Bruno Ramos" só para quem digitasse com o B
 * maiúsculo. O campo normalizado é gravado junto do nome e é nele que a
 * consulta por prefixo roda. Mesma ideia do `tecnicoKey`.
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

export function mapDocToRegistro(docSnap) {
  const data = docSnap.data() || {};
  return {
    id: docSnap.id,
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
    foraDaMedia: Boolean(data.foraDaMedia)
  };
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

export function buildQueryConstraints(filtros = {}) {
  const constraints = [orderBy("dataAbertura", "desc")];

  if (filtros.status && filtros.status !== "todos") {
    constraints.push(where("status", "==", filtros.status));
  }
  if (filtros.ac && filtros.ac !== "todos") {
    constraints.push(where("ac", "==", filtros.ac));
  }
  if (filtros.tecnico && filtros.tecnico !== "todos") {
    constraints.push(where("tecnico", "==", titleCaseName(filtros.tecnico)));
  }
  if (filtros.dataInicio) {
    constraints.push(
      where("dataAbertura", ">=", new Date(`${filtros.dataInicio}T00:00:00Z`).toISOString())
    );
  }
  if (filtros.dataFim) {
    constraints.push(
      where("dataAbertura", "<=", new Date(`${filtros.dataFim}T23:59:59Z`).toISOString())
    );
  }
  return constraints;
}

/**
 * Listener em tempo real da lista principal. Retorna unsubscribe.
 * O segundo argumento de `onData` avisa quando o teto de documentos foi
 * atingido — sem isso a tela mostraria menos registros do que existem, calada.
 */
export function subscribeRegistros(filtros, onData, onError) {
  const q = query(
    collection(db, COLLECTION),
    ...buildQueryConstraints(filtros),
    limit(MAX_LIVE_DOCS)
  );
  return onSnapshot(
    q,
    (snap) => {
      const registros = snap.docs.map(mapDocToRegistro).filter((r) => !isRegistroSoluti(r));
      onData(registros, { truncado: snap.docs.length >= MAX_LIVE_DOCS, teto: MAX_LIVE_DOCS });
    },
    (error) => {
      console.error("[Suportes] Erro no listener:", error);
      onError?.(error);
    }
  );
}

/** Listener dedicado aos suportes EM ABERTO (independente dos filtros). */
export function subscribeSuportesEmAberto(onData, onError) {
  const q = query(
    collection(db, COLLECTION),
    where("status", "==", "EM ABERTO"),
    orderBy("dataAbertura", "desc"),
    limit(MAX_LIVE_DOCS)
  );
  return onSnapshot(
    q,
    (snap) =>
      onData(snap.docs.map(mapDocToRegistro).filter((r) => !isRegistroSoluti(r)), {
        truncado: snap.docs.length >= MAX_LIVE_DOCS,
        teto: MAX_LIVE_DOCS
      }),
    (error) => {
      console.error("[Suportes] Erro no listener EM ABERTO:", error);
      onError?.(error);
    }
  );
}

export async function contarPorStatus() {
  const ref = collection(db, COLLECTION);
  const contar = async (constraints = []) => {
    const snap = await getCountFromServer(query(ref, ...constraints));
    return Number(snap.data().count || 0);
  };

  const [total, abertos, andamento, finalizados, semRetorno, reagendado] = await Promise.all([
    contar(),
    contar([where("status", "==", "EM ABERTO")]),
    contar([where("status", "==", "EM ANDAMENTO")]),
    contar([where("status", "==", "FINALIZADO")]),
    contar([where("status", "==", "SEM RETORNO")]),
    contar([where("status", "==", "REAGENDADO")])
  ]);

  return { total, abertos, andamento, finalizados, semRetorno, reagendado };
}

/* ------------------------------------------------------------------- histórico */

/**
 * Uma linha da linha do tempo do chamado.
 *
 * Gravamos data em ISO (e não serverTimestamp) porque `arrayUnion` não aceita
 * sentinelas dentro do array — e a diferença de relógio aqui é irrelevante
 * perto da granularidade de minutos que a tela exibe.
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
 * Garante que `nomeClienteKey` acompanhe `nomeCliente` em toda escrita.
 *
 * Fica aqui, e não em cada chamador, porque um lugar que esquecesse de gravar
 * a chave criaria um chamado invisível para a busca por nome — falha silenciosa,
 * que só apareceria quando alguém não achasse o cliente pelo nome. A chave só
 * entra quando o nome está no payload: `atualizarSuporte` é usado para
 * alterações parciais (mudar status, por exemplo) e não pode zerar o campo.
 */
function comChaveDeNome(payload = {}) {
  if (!Object.prototype.hasOwnProperty.call(payload, "nomeCliente")) return payload;
  return { ...payload, nomeClienteKey: chaveNomeCliente(payload.nomeCliente) };
}

/**
 * `nota` entra na primeira linha do histórico. Hoje é usada pela abertura
 * retroativa: a data do chamado passa a ser outra que não a de criação do
 * registro, e essa diferença precisa estar escrita em algum lugar.
 */
export function criarSuporte(payload, { por, nota } = {}) {
  const descricao = [payload.tipo, payload.ac].filter(Boolean).join(" · ");
  return addDoc(collection(db, COLLECTION), {
    ...comChaveDeNome(payload),
    historico: [
      entradaHistorico(
        `Chamado aberto${descricao ? ` · ${descricao}` : ""}${nota ? ` · ${nota}` : ""}`,
        por
      )
    ],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

/**
 * Atualização genérica. `historico` (opcional) é a frase que descreve a
 * mudança — quando presente, entra na linha do tempo na mesma escrita, para
 * que nunca exista alteração sem registro correspondente.
 */
export function atualizarSuporte(id, payload, historico = null) {
  return updateDoc(doc(db, COLLECTION, id), {
    ...comChaveDeNome(payload),
    ...(historico
      ? { historico: arrayUnion(entradaHistorico(historico.texto, historico.por)) }
      : {}),
    updatedAt: serverTimestamp()
  });
}

/** Anotação livre na linha do tempo, sem alterar mais nada no chamado. */
export function registrarNoHistorico(id, texto, por) {
  return atualizarSuporte(id, {}, { texto, por });
}

export function excluirSuporte(id) {
  return deleteDoc(doc(db, COLLECTION, id));
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
      tecnicoKey: "",
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
  return atualizarSuporte(
    id,
    { tecnico: nome, tecnicoKey: normKey(nome) },
    { texto: `Técnico alterado para ${nome}`, por }
  );
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
  const payload = {
    followups: arrayUnion({
      ordem: numero,
      em: new Date().toISOString(),
      observacao: texto.slice(0, 300),
      por: String(por || "")
    })
  };

  if (numero === TOTAL_FOLLOWUPS) {
    payload.foraDaMedia = true;
  }

  return atualizarSuporte(id, payload, {
    texto:
      `${numero}º follow-up por ligação registrado` +
      (texto ? ` · ${texto}` : "") +
      (numero === TOTAL_FOLLOWUPS ? " · chamado sai da média" : ""),
    por
  });
}

/**
 * Associa o técnico responsável.
 *
 * Caminho preferido: a API do Worker, que resolve o nome pelo perfil no
 * servidor — assim ninguém assume um chamado com o nome de outra pessoa.
 * Se ela não responder, grava direto no Firestore com o nome do usuário logado,
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
    const payload = {
      tecnico,
      tecnicoKey: normKey(tecnico),
      status: "EM ANDAMENTO"
    };
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
 * Campos aceitos pela busca. Cada um tem índice de campo único no Firestore —
 * o que é automático.
 *
 * Os identificadores e o nome pedem termos diferentes: protocolo/CPF/contato
 * são consultados nas variações formatadas do que foi digitado, enquanto o
 * nome é consultado na forma normalizada (ver `chaveNomeCliente`). Cruzar
 * todos com todos só geraria consultas que nunca casam.
 */
const CAMPOS_IDENTIFICADOR = ["protocolo", "cpfCnpj", "contato"];
const CAMPO_NOME = "nomeClienteKey";

/**
 * O banco guarda os valores já formatados (123-456-789, 000.000.000-00,
 * (85) 99999-9999). Quem digita raramente formata. Geramos então as variações
 * plausíveis do termo e consultamos todas — é mais barato do que varrer a
 * coleção, e cobre os dois jeitos de digitar.
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

/**
 * Busca direta no Firestore por protocolo / CPF-CNPJ / contato / nome do cliente.
 *
 * O nome é consultado em `nomeClienteKey`, e não em `nomeCliente`: a busca do
 * Firestore diferencia maiúscula e acento, então "bruno" só acha "Bruno Ramos"
 * pela chave normalizada.
 *
 * O filtro da tela só enxerga os registros já carregados pelo listener (teto de
 * MAX_LIVE_DOCS). Procurar um protocolo de seis meses atrás não achava nada e a
 * tela não sabia dizer se era "não existe" ou "não carreguei". Esta função vai
 * ao banco: usa consulta por prefixo (`>=` termo, `<` termo + "\uf8ff"), que o
 * Firestore resolve com o índice de campo único, sem índice composto.
 *
 * Não aplica os filtros da tela de propósito: quem busca um protocolo quer
 * achá-lo esteja ele em que status estiver.
 */
export async function buscarRegistrosNoServidor(termo, { max = 50 } = {}) {
  const variacoes = variacoesDeBusca(termo);
  const nomeNormalizado = chaveNomeCliente(termo);
  if (!variacoes.length && !nomeNormalizado) return [];

  const ref = collection(db, COLLECTION);

  // Pares (campo, termo): o nome vai s\u00f3 na sua chave normalizada.
  const alvos = CAMPOS_IDENTIFICADOR.flatMap((campo) =>
    variacoes.map((valor) => [campo, valor])
  );
  if (nomeNormalizado) alvos.push([CAMPO_NOME, nomeNormalizado]);

  const consultas = alvos.map(([campo, valor]) =>
    getDocs(
      query(
        ref,
        where(campo, ">=", valor),
        where(campo, "<", `${valor}\uf8ff`),
        orderBy(campo),
        limit(max)
      )
    )
  );

  // `allSettled`: um campo sem índice ou uma permissão negada não pode derrubar
  // a busca inteira — o que os outros campos acharem ainda vale.
  const resultados = await Promise.allSettled(consultas);
  const porId = new Map();

  for (const resultado of resultados) {
    if (resultado.status !== "fulfilled") {
      console.warn("[Suportes] Consulta de busca falhou:", resultado.reason?.message);
      continue;
    }
    for (const docSnap of resultado.value.docs) {
      if (!porId.has(docSnap.id)) porId.set(docSnap.id, mapDocToRegistro(docSnap));
    }
  }

  return [...porId.values()]
    .filter((registro) => !isRegistroSoluti(registro))
    .sort((a, b) => toComparableDate(b.dataAbertura) - toComparableDate(a.dataAbertura))
    .slice(0, max);
}

/**
 * Devolve para EM ABERTO os suportes cujo reagendamento já venceu.
 *
 * A execução periódica disso é do Cron Trigger do Worker (src/backend/reagendados.mjs) —
 * o front chama esta versão só como rede de segurança na abertura da tela.
 */
export async function processarReagendadosVencidos() {
  const snap = await getDocs(
    query(collection(db, COLLECTION), where("status", "==", "REAGENDADO"))
  );
  const agora = new Date();
  const reabertos = [];

  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    if (!data.dataReagendamento) continue;

    let dataReag = data.dataReagendamento;
    if (dataReag?.toDate) dataReag = dataReag.toDate();
    else if (typeof dataReag === "string") dataReag = new Date(dataReag);

    if (dataReag instanceof Date && !Number.isNaN(dataReag.getTime()) && dataReag <= agora) {
      await updateDoc(doc(db, COLLECTION, docSnap.id), {
        status: "EM ABERTO",
        dataReagendamento: deleteField(),
        updatedAt: serverTimestamp()
      });
      reabertos.push(data.protocolo || "S/N");
    }
  }
  return reabertos;
}
