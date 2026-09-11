/**
 * metricasService.js — o sistema de métricas do painel "Central de Chamados".
 *
 * Só cálculo: nada aqui toca Firestore nem React, para que as mesmas contas
 * possam ser testadas e reaproveitadas fora da tela.
 *
 * Três medidas de duração convivem de propósito, porque respondem a perguntas
 * diferentes sobre o mesmo chamado:
 *
 *   corrida   — relógio de parede, da abertura ao encerramento. É o que o
 *               cliente sentiu.
 *   ajustada  — a corrida menos os dias em que a equipe não trabalhou
 *               (feriado, ponto facultativo, queda de sistema). É a que entra
 *               na média: um chamado aberto na sexta e fechado na segunda não
 *               é um atendimento de três dias.
 *   útil      — só as horas dentro do expediente configurado. É a que compara
 *               técnicos com honestidade, e a única imune a fuso de horário
 *               de quem abriu o chamado de madrugada.
 *
 * Chamados fora da média (3 follow-ups sem resposta, ou exclusão manual com
 * justificativa) saem das três: esperar cliente não é trabalho da equipe.
 */

import { MOTIVOS, USOS } from "../utils/catalogos";
import { STATUS_OPTIONS } from "../utils/format";

const DIA_MS = 86400000;

export const STATUS_ENCERRADOS = ["FINALIZADO", "SEM RETORNO"];

/* ============================================================ período (A / B) */

export const PRESETS_PERIODO = [
  { valor: "hoje", label: "Hoje" },
  { valor: "ontem", label: "Ontem" },
  { valor: "7d", label: "Últimos 7 dias" },
  { valor: "30d", label: "Últimos 30 dias" },
  { valor: "90d", label: "Últimos 90 dias" },
  { valor: "mes", label: "Este mês" },
  { valor: "mespassado", label: "Mês passado" },
  { valor: "tudo", label: "Todo o período" },
  { valor: "custom", label: "Datas específicas…" }
];

function inicioDoDia(data) {
  const d = new Date(data);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Resolve um preset (ou um par de datas) num intervalo [inicio, fim) em ms.
 *
 * Devolve `null` para "todo o período" — a ausência de intervalo é o que as
 * funções abaixo entendem como "não filtre por data". O fim é sempre exclusivo
 * e cai na virada do dia seguinte, senão os chamados da tarde do último dia
 * ficariam de fora.
 */
export function resolverIntervalo(preset, { de = "", ate = "" } = {}, agora = new Date()) {
  if (!preset || preset === "tudo") return null;

  const hoje = inicioDoDia(agora);

  if (preset === "hoje") return [hoje, hoje + DIA_MS];
  if (preset === "ontem") return [hoje - DIA_MS, hoje];
  if (preset === "7d") return [hoje - 6 * DIA_MS, hoje + DIA_MS];
  if (preset === "30d") return [hoje - 29 * DIA_MS, hoje + DIA_MS];
  if (preset === "90d") return [hoje - 89 * DIA_MS, hoje + DIA_MS];
  if (preset === "mes") {
    return [new Date(agora.getFullYear(), agora.getMonth(), 1).getTime(), hoje + DIA_MS];
  }
  if (preset === "mespassado") {
    return [
      new Date(agora.getFullYear(), agora.getMonth() - 1, 1).getTime(),
      new Date(agora.getFullYear(), agora.getMonth(), 1).getTime()
    ];
  }
  if (preset === "custom") {
    const inicio = de ? new Date(`${de}T00:00:00`).getTime() : -Infinity;
    const fim = ate ? new Date(`${ate}T00:00:00`).getTime() + DIA_MS : Infinity;
    if (Number.isNaN(inicio) || Number.isNaN(fim)) return null;
    return [inicio, fim];
  }
  return null;
}

export function rotuloIntervalo(intervalo) {
  if (!intervalo) return "Todo o período";
  const inicio = Number.isFinite(intervalo[0])
    ? new Date(intervalo[0]).toLocaleDateString("pt-BR")
    : "início";
  const fim = Number.isFinite(intervalo[1])
    ? new Date(intervalo[1] - 1).toLocaleDateString("pt-BR")
    : "hoje";
  return `${inicio} a ${fim}`;
}

/**
 * Janela imediatamente anterior, do mesmo tamanho — base do "vs. período
 * anterior". Intervalos abertos (sem início ou sem fim) não têm tamanho
 * definido e por isso não geram comparação.
 */
export function intervaloAnterior(intervalo) {
  if (!intervalo) return null;
  const [inicio, fim] = intervalo;
  if (!Number.isFinite(inicio) || !Number.isFinite(fim)) return null;
  const tamanho = fim - inicio;
  if (tamanho <= 0) return null;
  return [inicio - tamanho, inicio];
}

/** Menor limite inferior entre vários intervalos — `null` se algum for aberto. */
export function limiteInferior(...intervalos) {
  let menor = Infinity;
  for (const intervalo of intervalos) {
    if (!intervalo) return null;
    if (!Number.isFinite(intervalo[0])) return null;
    menor = Math.min(menor, intervalo[0]);
  }
  return Number.isFinite(menor) ? menor : null;
}

/* ============================================================ datas do registro */

function paraData(valor) {
  if (!valor) return null;
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function abertoEm(registro) {
  return paraData(registro?.dataAbertura);
}

/**
 * Momento do encerramento.
 *
 * `dataFinalizacao` é o carimbo do clique em finalizar / sem retorno. Registros
 * antigos e importados não têm esse campo, e para eles o `updatedAt` é a melhor
 * aproximação disponível — sem esse fallback quase todo o histórico ficaria sem
 * duração nenhuma.
 */
export function encerradoEm(registro) {
  if (!registro || !STATUS_ENCERRADOS.includes(registro.status)) return null;
  return paraData(registro.dataFinalizacao) || paraData(registro.dataAtualizacao);
}

/** Abertura com data no futuro: quase sempre erro de digitação numa abertura retroativa. */
export function ehDataFutura(registro, agora = Date.now()) {
  const abertura = abertoEm(registro);
  return Boolean(abertura) && abertura.getTime() > agora + 60000;
}

/**
 * Chamado que não entra nas médias de tempo.
 * `excluirDaMedia` é a exclusão manual (com justificativa); `foraDaMedia` é a
 * automática, marcada ao registrar o 3º follow-up sem resposta.
 */
export function foraDaMedia(registro) {
  if (!registro) return false;
  if (registro.excluirDaMedia || registro.foraDaMedia) return true;
  return Array.isArray(registro.followups) && registro.followups.length >= 3;
}

/* ============================================================ horário comercial */

function minutosDoRelogio(texto, padrao) {
  const [h, m] = String(texto || "")
    .split(":")
    .map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return padrao;
  return h * 60 + m;
}

function chaveDoDia(data) {
  const d = new Date(data);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Milissegundos de expediente entre dois instantes.
 *
 * Varre dia a dia, intersecta cada janela de trabalho com o intervalo pedido e
 * soma. Dias fora da escala e dias marcados como não trabalhados valem zero.
 * A trava de 4000 voltas evita que uma data corrompida (ano 1900, ano 3000)
 * trave a aba do navegador com um laço de milhões de iterações.
 */
export function msUteisEntre(inicio, fim, config) {
  const a = paraData(inicio);
  const b = paraData(fim);
  if (!a || !b || b <= a) return 0;

  // Sem config (ou com hora malformada), vale o expediente real da equipe:
  // 7h às 22h — o mesmo padrão de CONFIG_METRICAS_PADRAO.
  const abre = minutosDoRelogio(config?.bhStart, 7 * 60);
  const fecha = minutosDoRelogio(config?.bhEnd, 22 * 60);
  if (fecha <= abre) return 0;

  const diasNaoTrab = new Set((config?.diasNaoTrab || []).map((d) => d.date));
  const escala = config?.workDays?.length ? config.workDays : [1, 2, 3, 4, 5, 6];

  const inicioMs = a.getTime();
  const fimMs = b.getTime();
  let total = 0;

  const cursor = new Date(a);
  cursor.setHours(0, 0, 0, 0);

  let guarda = 0;
  while (cursor.getTime() <= fimMs && guarda < 4000) {
    guarda += 1;
    if (escala.includes(cursor.getDay()) && !diasNaoTrab.has(chaveDoDia(cursor))) {
      const base = cursor.getTime();
      const janelaInicio = base + abre * 60000;
      const janelaFim = base + fecha * 60000;
      total += Math.max(0, Math.min(fimMs, janelaFim) - Math.max(inicioMs, janelaInicio));
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return total;
}

/* ============================================================ durações */

/**
 * Encerramento anterior à abertura — dado quebrado, não atendimento rápido.
 *
 * Acontece com abertura retroativa digitada errada (ano 2027 em vez de 2026) e
 * em planilhas importadas. O painel de origem devolvia zero nesses casos, e
 * zero é pior do que nada: entra na média como se o chamado tivesse sido
 * resolvido instantaneamente e puxa o número da equipe para baixo.
 */
export function temDatasInconsistentes(registro) {
  const inicio = abertoEm(registro);
  const fim = encerradoEm(registro);
  return Boolean(inicio && fim && fim.getTime() < inicio.getTime());
}

/** Relógio de parede, em ms. `null` enquanto o chamado não encerrou. */
export function duracaoCorrida(registro) {
  const inicio = abertoEm(registro);
  const fim = encerradoEm(registro);
  if (!inicio || !fim || fim < inicio) return null;
  return fim.getTime() - inicio.getTime();
}

/** Corrida menos os dias não trabalhados que caíram dentro dela. */
export function duracaoAjustada(registro, config) {
  const inicio = abertoEm(registro);
  const fim = encerradoEm(registro);
  if (!inicio || !fim || fim < inicio) return null;

  let duracao = fim.getTime() - inicio.getTime();
  (config?.diasNaoTrab || []).forEach((dia) => {
    const comeco = new Date(`${dia.date}T00:00:00`).getTime();
    if (Number.isNaN(comeco)) return;
    const termino = comeco + DIA_MS;
    duracao -= Math.max(
      0,
      Math.min(fim.getTime(), termino) - Math.max(inicio.getTime(), comeco)
    );
  });
  return Math.max(0, duracao);
}

/** Só as horas dentro do expediente. */
export function duracaoUtil(registro, config) {
  const inicio = abertoEm(registro);
  const fim = encerradoEm(registro);
  if (!inicio || !fim || fim < inicio) return null;
  return msUteisEntre(inicio, fim, config);
}

/** "45 min", "3h 20min", "2d 4h" — a escala muda com a grandeza. */
export function humanDur(ms) {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return "—";
  const minutos = Math.floor(ms / 60000);
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const restoMin = minutos % 60;
  if (horas < 24) return `${horas}h${restoMin ? ` ${restoMin}min` : ""}`;
  const dias = Math.floor(horas / 24);
  const restoH = horas % 24;
  return `${dias}d${restoH ? ` ${restoH}h` : ""}`;
}

function mediaDe(valores) {
  const validos = valores.filter((v) => v !== null && v !== undefined && !Number.isNaN(v));
  if (!validos.length) return NaN;
  return validos.reduce((a, b) => a + b, 0) / validos.length;
}

/* ============================================================ outliers */

/**
 * Média e desvio-padrão das durações ajustadas, com o corte de 2 desvios.
 *
 * Abaixo de 3 amostras não há distribuição nenhuma para falar de desvio: com
 * dois chamados, um deles é sempre "fora do padrão". Nesses casos o corte fica
 * em Infinity e nada é apontado.
 */
export function estatisticasDuracao(lista, config) {
  const valores = lista
    .filter((r) => encerradoEm(r) && !foraDaMedia(r) && !temDatasInconsistentes(r))
    .map((r) => duracaoAjustada(r, config))
    .filter((v) => v !== null);

  const n = valores.length;
  if (!n) return { media: NaN, desvio: 0, n: 0, corte: Infinity };

  const media = valores.reduce((a, b) => a + b, 0) / n;
  const desvio = Math.sqrt(valores.reduce((a, b) => a + (b - media) ** 2, 0) / n);
  return { media, desvio, n, corte: media + 2 * desvio };
}

export function ehOutlier(registro, stats, config) {
  if (!encerradoEm(registro) || foraDaMedia(registro)) return false;
  if (!stats || stats.n < 3 || !Number.isFinite(stats.corte) || stats.desvio === 0) return false;
  return duracaoAjustada(registro, config) > stats.corte;
}

/* ============================================================ reincidência */

const JANELA_REINCIDENCIA_MS = 7 * DIA_MS;

/**
 * Taxa de reincidência: entre os chamados FINALIZADOS encerrados no período,
 * quantos têm o mesmo CPF/CNPJ reabrindo outro chamado nos `janelaMs`
 * seguintes ao encerramento — sinal de que a resolução não durou.
 *
 * Mede resolução de verdade, não só "foi fechado": a taxa de sucesso conta um
 * chamado marcado FINALIZADO ainda que o cliente volte no dia seguinte com o
 * mesmo problema; esta métrica é o contraponto disso.
 *
 * `baseCompleta` precisa ser a base INTEIRA (sem filtro de período) porque a
 * reabertura que prova a reincidência pode cair fora do período escolhido.
 * Chamados sem CPF/CNPJ não entram — não tem como saber se são o mesmo cliente.
 */
export function calcularReincidencia(encerradosNoPeriodo, baseCompleta, janelaMs = JANELA_REINCIDENCIA_MS) {
  const elegiveis = encerradosNoPeriodo.filter((r) => r.status === "FINALIZADO" && r.cpfCnpj);
  if (!elegiveis.length) return { total: 0, reincidentes: 0, taxa: 0 };

  const aberturasPorCpf = new Map();
  baseCompleta.forEach((r) => {
    if (!r.cpfCnpj) return;
    const abertura = abertoEm(r);
    if (!abertura) return;
    const lista = aberturasPorCpf.get(r.cpfCnpj) || [];
    lista.push({ registro: r, aberturaMs: abertura.getTime() });
    aberturasPorCpf.set(r.cpfCnpj, lista);
  });

  const reincidentes = elegiveis.filter((r) => {
    const fim = encerradoEm(r);
    if (!fim) return false;
    const fimMs = fim.getTime();
    const doCliente = aberturasPorCpf.get(r.cpfCnpj) || [];
    return doCliente.some(
      (item) => item.registro !== r && item.aberturaMs > fimMs && item.aberturaMs <= fimMs + janelaMs
    );
  }).length;

  return {
    total: elegiveis.length,
    reincidentes,
    taxa: Math.round((reincidentes / elegiveis.length) * 100)
  };
}

/* ============================================================ agregado do período */

/*
 * A ordem dos dois testes importa: sem data não há como estar dentro de nada,
 * nem mesmo de "todo o período" — invertido, um chamado ainda aberto (sem data
 * de encerramento) contaria como encerrado sempre que nenhum intervalo fosse
 * escolhido, e a taxa de sucesso ficava presa em 100%.
 */
function dentro(instante, intervalo) {
  if (!instante) return false;
  if (!intervalo) return true;
  const t = instante instanceof Date ? instante.getTime() : instante;
  return t >= intervalo[0] && t < intervalo[1];
}

/**
 * Números de um período.
 *
 * Repare em qual data cada métrica usa: contagens de volume e distribuições
 * olham a ABERTURA (quanto entrou), enquanto encerrados, taxa de sucesso e
 * tempos olham o ENCERRAMENTO (quanto saiu). Misturar os dois é o erro clássico
 * que faz a taxa de sucesso passar de 100% no fim do mês.
 */
export function metricasDoPeriodo(lista, intervalo, config) {
  const abertosNo = (r) => dentro(abertoEm(r), intervalo);
  const encerradosNo = (r) => dentro(encerradoEm(r), intervalo);

  const abertos = lista.filter(abertosNo);
  const encerrados = lista.filter(encerradosNo);
  const sucesso = encerrados.filter((r) => r.status === "FINALIZADO").length;

  // Datas invertidas ficam fora da base de tempo, mas continuam contando como
  // encerradas: o chamado existe e foi fechado; o que não dá para medir é quanto
  // tempo levou.
  const base = encerrados.filter((r) => !foraDaMedia(r) && !temDatasInconsistentes(r));
  const tempoAjustado = mediaDe(base.map((r) => duracaoAjustada(r, config)));
  const tempoUtil = mediaDe(base.map((r) => duracaoUtil(r, config)));

  const porStatus = {};
  STATUS_OPTIONS.forEach((s) => {
    porStatus[s] = abertos.filter((r) => r.status === s).length;
  });

  const porMotivo = {};
  MOTIVOS.forEach((m) => {
    porMotivo[m] = abertos.filter((r) => r.motivoCat === m).length;
  });

  const porUso = {};
  USOS.forEach((u) => {
    porUso[u] = abertos.filter((r) => r.usoCat === u).length;
  });

  const plataformas = {};
  USOS.forEach((u) => {
    plataformas[u] = {};
  });
  abertos.forEach((r) => {
    if (!r.usoCat || !r.usoPlat) return;
    const mapa = (plataformas[r.usoCat] = plataformas[r.usoCat] || {});
    mapa[r.usoPlat] = (mapa[r.usoPlat] || 0) + 1;
  });

  // Venda ganha/perdida só faz sentido para o que já foi decidido — mesmo
  // critério de data usado por taxa de sucesso e tempos (encerramento).
  const porVenda = { GANHO: 0, PERDIDO: 0, "NAO INFORMADO": 0 };
  let valorGanho = 0;
  let valorPerdido = 0;
  encerrados.forEach((r) => {
    const v = r.vendaStatus === "GANHO" || r.vendaStatus === "PERDIDO" ? r.vendaStatus : "NAO INFORMADO";
    porVenda[v] += 1;
    if (v === "GANHO") valorGanho += r.valorVenda || 0;
    if (v === "PERDIDO") valorPerdido += r.valorVenda || 0;
  });
  const totalVenda = porVenda.GANHO + porVenda.PERDIDO;
  const reincidencia = calcularReincidencia(encerrados, lista);

  return {
    abertos: abertos.length,
    encerrados: encerrados.length,
    sucesso,
    taxa: encerrados.length ? Math.round((sucesso / encerrados.length) * 100) : 0,
    tempoAjustado,
    tempoUtil,
    medidos: base.filter((r) => duracaoAjustada(r, config) !== null).length,
    inconsistentes: encerrados.filter(temDatasInconsistentes).length,
    porStatus,
    porMotivo,
    porUso,
    plataformas,
    porVenda,
    valorGanho,
    valorPerdido,
    taxaVenda: totalVenda ? Math.round((porVenda.GANHO / totalVenda) * 100) : 0,
    reincidencia
  };
}

/** Registros abertos dentro do intervalo — a lista que alimenta os gráficos. */
export function filtrarPorAbertura(lista, intervalo) {
  if (!intervalo) return lista;
  return lista.filter((r) => dentro(abertoEm(r), intervalo));
}

export function emAbertoAgora(lista) {
  return lista.filter((r) => !STATUS_ENCERRADOS.includes(r.status)).length;
}
