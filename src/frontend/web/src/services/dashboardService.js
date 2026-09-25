import { linhaParaDados } from "../../../../shared/suporte-row.mjs";
import { norm, normKey, normStatus } from "../utils/format";
import { classificarMotivo, classificarUso } from "../utils/catalogos";
import { isRegistroSoluti } from "./suportesService";
import { assinarTabela } from "./suportesStore";

const TABELA = "suportes";
const MAX_DOCS = 2000;

function toDate(value) {
  if (!value) return null;
  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;
  return null;
}

function resolverDataAbertura(data = {}) {
  const dataWebhook = norm(data.dataAbertura || data.carimboDataHora || "");
  if (dataWebhook) {
    const d = new Date(dataWebhook);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return toDate(data.createdAt);
}

function normStatusAbertura(v) {
  const s = norm(v).toUpperCase();
  if (s.includes("INDEV")) return "INDEVIDO";
  if (s.includes("DEVID")) return "DEVIDO";
  return s ? "OUTRO" : "NAO INFORMADO";
}

export function mapDashboardDoc(id, data) {
  return {
    id,
    protocolo: norm(data.protocolo || data.idSuporte || ""),
    responsavelAbertura:
      norm(data.responsavelAbertura || data.responsavel || data.cliente || "") || "Não informado",
    cpfCnpj: norm(data.cpfCnpj || data.cpf_cnpj || ""),
    tipo: norm(data.tipo || "") || "Não informado",
    ac: norm(data.ac || data.AC || "") || "Não informado",
    tecnico: norm(data.tecnico || data.tecnicoResponsavel || "") || "Não atribuído",
    status: normStatus(data.status || data.situacao || data.situacaoAtendimento || "EM ABERTO"),
    statusAbertura: normStatusAbertura(data.statusAbertura || ""),
    dataAbertura: resolverDataAbertura(data),
    dataInicioAtendimento: toDate(data.dataInicioAtendimento),
    // Registros antigos não têm dataFinalizacao; para eles o updatedAt é a
    // melhor aproximação disponível do momento do encerramento.
    dataFinalizacao: toDate(data.dataFinalizacao),
    dataAtualizacao: toDate(data.updatedAt),
    // Marcado ao registrar o 3º follow-up por ligação: o chamado deixa de
    // contar nas médias de tempo (ver duracaoAtendimento abaixo).
    foraDaMedia: Boolean(data.foraDaMedia),
    // Exclusão manual da média, sempre acompanhada de justificativa.
    excluirDaMedia: Boolean(data.excluirDaMedia),
    justificativaMedia: norm(data.justificativaMedia || ""),
    // Classificação do chamado (ver utils/catalogos.js). A categoria é o que
    // entra nas contagens; `motivoDetalhe` guarda o que foi escrito à mão.
    motivoCat: classificarMotivo(data.motivoCat || data.motivoChamado || ""),
    motivoDetalhe: norm(data.motivoDetalhe || ""),
    usoCat: classificarUso(data.usoCat || ""),
    usoPlat: norm(data.usoPlat || ""),
    // As médias precisam saber quantas tentativas de contato houve.
    followups: Array.isArray(data.followups) ? data.followups : [],
    followupsImportados: Number(data.followupsImportados) || 0,
    // Resultado da venda ligada ao chamado — vem do Kommo (status_id de
    // ganho/perdido) ou é informado manualmente ao concluir o suporte.
    vendaStatus: norm(data.vendaStatus || "").toUpperCase(),
    valorVenda: Number(data.valorVenda) || 0
  };
}

/**
 * Duração de um atendimento encerrado, em horas.
 *
 * Início: a associação do técnico. A maioria dos registros antigos não tem esse
 * carimbo (só passou a ser gravado agora), então para eles o início é a abertura
 * do chamado — sem isso quase todo o histórico ficaria fora da média.
 * Fim: o clique em finalizar / sem retorno; nos antigos, o último updatedAt.
 *
 * Chamados com as 3 tentativas de contato registradas (`foraDaMedia`) são
 * excluídos: o tempo ali é o cliente que não atendeu, não o trabalho da equipe,
 * e mantê-los na conta distorce a média de todo mundo. Como média e percentil
 * descartam nulos, devolver null já os tira de todas as agregações.
 *
 * Retorna null apenas quando o suporte não está encerrado, está fora da média
 * ou não tem data nenhuma.
 */
export function duracaoAtendimento(registro) {
  if (!isSuporteEncerrado(registro.status)) return null;
  if (registro.foraDaMedia) return null;
  const inicio = registro.dataInicioAtendimento || registro.dataAbertura;
  const fim = registro.dataFinalizacao || registro.dataAtualizacao;
  if (!inicio || !fim) return null;
  return horasEntre(inicio, fim);
}

/** True quando os dois carimbos exatos existem (associação e finalização). */
export function duracaoEhPrecisa(registro) {
  return Boolean(registro.dataInicioAtendimento && registro.dataFinalizacao);
}

/** Tempo na fila: da abertura até alguém se associar. */
export function tempoDeFila(registro) {
  if (!registro.dataInicioAtendimento || !registro.dataAbertura) return null;
  return horasEntre(registro.dataAbertura, registro.dataInicioAtendimento);
}

/**
 * Tempo de atendimento propriamente dito: da associação ao encerramento.
 * Mesma exclusão de `duracaoAtendimento` para os chamados fora da média.
 */
export function tempoDeAtendimento(registro) {
  if (registro.foraDaMedia) return null;
  if (!registro.dataInicioAtendimento) return null;
  const fim = registro.dataFinalizacao;
  if (!fim) return null;
  return horasEntre(registro.dataInicioAtendimento, fim);
}

/**
 * Percentil por interpolação linear. p em 0..100.
 * A mediana (p50) e o p90 dizem o que a média esconde: alguns atendimentos
 * esquecidos por uma semana distorcem a média de toda a equipe.
 */
export function percentil(valores, p) {
  const validos = valores
    .filter((n) => n !== null && n !== undefined && !Number.isNaN(n))
    .sort((a, b) => a - b);
  if (!validos.length) return null;
  if (validos.length === 1) return validos[0];

  const pos = ((validos.length - 1) * p) / 100;
  const base = Math.floor(pos);
  const resto = pos - base;
  const proximo = validos[base + 1];
  if (proximo === undefined) return validos[base];
  return validos[base] + resto * (proximo - validos[base]);
}

/** Variação percentual entre dois números. Retorna null quando não há base. */
export function variacao(atual, anterior) {
  if (!anterior || anterior === 0) return null;
  if (atual === null || atual === undefined) return null;
  return ((atual - anterior) / anterior) * 100;
}

/* ------------------------------------------------------- série temporal */

const DIA_MS = 24 * 60 * 60 * 1000;

function inicioDoDia(data) {
  const d = new Date(data);
  d.setHours(0, 0, 0, 0);
  return d;
}

function chaveDoBalde(data) {
  return inicioDoDia(data).getTime();
}

function rotuloDoBalde(timestamp) {
  const d = new Date(timestamp);
  const dia = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  return `${dia}/${mes}`;
}

/**
 * Volume de aberturas e de encerramentos por dia.
 * Os baldes vazios entram com zero — buraco no meio da linha esconde queda real.
 */
export function serieTemporal(dados, intervalo) {
  const datasAbertura = dados.map((r) => r.dataAbertura).filter(Boolean);
  if (!datasAbertura.length) return { labels: [], abertos: [], encerrados: [] };

  // Sem intervalo (ou com extremo aberto), a própria amostra define as pontas.
  const inicioMs =
    intervalo && Number.isFinite(intervalo[0])
      ? intervalo[0]
      : Math.min(...datasAbertura.map((d) => d.getTime()));
  // O fim nunca passa de agora: uma "dataAbertura" no futuro é erro de
  // digitação na planilha de origem (ano trocado, por exemplo), não um
  // chamado real esperando o calendário chegar lá — deixar isso esticar o
  // eixo inteiro é o que fazia o gráfico parecer errado.
  const fimMs = intervalo && Number.isFinite(intervalo[1]) ? Math.min(intervalo[1], Date.now()) : Date.now();

  const primeiro = chaveDoBalde(new Date(inicioMs));
  // `fimMs` é um limite EXCLUSIVO quando vem do intervalo (cai na virada do
  // dia seguinte), então o último balde é o do instante anterior — senão todo
  // período fechado ganhava um dia vazio a mais na ponta direita do gráfico.
  // Quando o fim é "agora", tirar 1ms não muda o dia.
  const ultimo = chaveDoBalde(new Date(fimMs - 1));

  const baldes = new Map();
  for (let t = primeiro; t <= ultimo; t += DIA_MS) {
    baldes.set(t, { abertos: 0, encerrados: 0 });
  }
  // Limite de segurança: mais que ~2 anos de baldes diários vira ruído no gráfico.
  if (baldes.size > 800) return { labels: [], abertos: [], encerrados: [] };

  dados.forEach((registro) => {
    if (registro.dataAbertura) {
      const chave = chaveDoBalde(registro.dataAbertura);
      if (baldes.has(chave)) baldes.get(chave).abertos += 1;
    }
    if (isSuporteEncerrado(registro.status)) {
      const fim = registro.dataFinalizacao || registro.dataAtualizacao;
      if (fim) {
        const chave = chaveDoBalde(fim);
        if (baldes.has(chave)) baldes.get(chave).encerrados += 1;
      }
    }
  });

  const chaves = [...baldes.keys()].sort((a, b) => a - b);
  return {
    labels: chaves.map((t) => rotuloDoBalde(t)),
    abertos: chaves.map((t) => baldes.get(t).abertos),
    encerrados: chaves.map((t) => baldes.get(t).encerrados)
  };
}

export const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/**
 * Quantidade de aberturas por dia da semana × hora do dia — matriz 7×24
 * (linha = dia da semana, 0=domingo; coluna = hora, 0–23) pro mapa de calor
 * "Suporte por dia e hora". Usa a hora local do navegador, a mesma que o
 * resto do dashboard já usa pra abertura/encerramento.
 */
export function matrizDiaHora(dados) {
  const matriz = Array.from({ length: 7 }, () => Array(24).fill(0));
  dados.forEach((registro) => {
    const data = registro.dataAbertura ? new Date(registro.dataAbertura) : null;
    if (!data || Number.isNaN(data.getTime())) return;
    matriz[data.getDay()][data.getHours()] += 1;
  });
  return matriz;
}

/** Formata horas como "3,4 h" ou "2,1 d". */
export function formatarDuracao(horas) {
  if (horas === null || horas === undefined || Number.isNaN(horas)) return "—";
  if (horas < 1) return `${Math.round(horas * 60)} min`;
  if (horas < 24) return `${horas.toFixed(1).replace(".", ",")} h`;
  return `${(horas / 24).toFixed(1).replace(".", ",")} d`;
}

/**
 * Listener do dashboard.
 *
 * `limiteMs` é o instante mais antigo que a tela precisa enxergar — o hook o
 * calcula a partir do período A, do período B e da janela de comparação, e
 * passa `null` quando alguma delas é aberta ("todo o período"). Deixar essa
 * conta no hook é o que permite comparar março com setembro sem trazer o banco
 * inteiro em toda troca de filtro.
 */
export function subscribeDashboard(limiteMs, onData, onError) {
  const temLimite = limiteMs !== null && limiteMs !== undefined && Number.isFinite(limiteMs);

  // Se o teto for atingido, as médias e contagens ficam incompletas — o
  // segundo argumento de onData avisa a tela (`truncado`).
  return assinarTabela({
    tabela: TABELA,
    consulta: (qb) => {
      let q = qb;
      if (temLimite) q = q.gte("data_abertura", new Date(limiteMs).toISOString());
      return q.order("data_abertura", { ascending: false, nullsFirst: false }).limit(MAX_DOCS);
    },
    mapear: (linha) => mapDashboardDoc(linha.id, linhaParaDados(linha)),
    predicado: (r) =>
      !isRegistroSoluti(r) && (!temLimite || (r.dataAbertura && r.dataAbertura.getTime() >= limiteMs)),
    ordenar: (a, b) => (b.dataAbertura?.getTime() || 0) - (a.dataAbertura?.getTime() || 0),
    teto: MAX_DOCS,
    onData,
    onError: (error) => {
      console.error("[Dashboard] Erro no listener:", error);
      onError?.(error);
    }
  });
}

/* --------------------------------------------------------------- agregações */

export function horasEntre(inicio, fim) {
  if (!inicio || !fim) return null;
  const diff = fim.getTime() - inicio.getTime();
  return diff < 0 ? null : diff / (1000 * 60 * 60);
}

export function media(valores) {
  const validos = valores.filter((n) => n !== null && n !== undefined && !Number.isNaN(n));
  if (!validos.length) return null;
  return validos.reduce((a, b) => a + b, 0) / validos.length;
}

export function percent(parte, total) {
  if (!total) return "0%";
  return `${Math.round((parte / total) * 100)}%`;
}

export function agruparContagem(lista, chaveFn) {
  const mapa = new Map();
  lista.forEach((item) => {
    const chave = chaveFn(item);
    mapa.set(chave, (mapa.get(chave) || 0) + 1);
  });
  return [...mapa.entries()].sort((a, b) => b[1] - a[1]);
}

/** Agrupa por técnico ignorando diferenças de caixa, preferindo o rótulo em MAIÚSCULAS. */
export function agruparPorTecnico(lista) {
  const mapa = new Map();
  lista.forEach((item) => {
    const chave = normKey(item.tecnico);
    const anterior = mapa.get(chave);
    const ehMaiusculo = item.tecnico === item.tecnico.toUpperCase();
    const label = ehMaiusculo ? item.tecnico : anterior?.label || item.tecnico;
    mapa.set(chave, { label, count: (anterior?.count || 0) + 1 });
  });
  return [...mapa.values()]
    .map(({ label, count }) => [label, count])
    .sort((a, b) => b[1] - a[1]);
}

export function listarTecnicosUnicos(registros) {
  const mapa = new Map();
  registros.forEach((registro) => {
    if (!registro.tecnico) return;
    const chave = normKey(registro.tecnico);
    const anterior = mapa.get(chave);
    const ehMaiusculo = registro.tecnico === registro.tecnico.toUpperCase();
    mapa.set(chave, ehMaiusculo ? registro.tecnico : anterior || registro.tecnico);
  });
  return [...mapa.values()].sort((a, b) =>
    a.localeCompare(b, "pt-BR", { sensitivity: "base" })
  );
}

export function isSuporteEncerrado(status) {
  return status === "FINALIZADO" || status === "SEM RETORNO";
}
