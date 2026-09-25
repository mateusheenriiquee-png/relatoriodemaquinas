import { supabase } from "../config/supabase";
import { assinarTabela } from "./suportesStore";

/**
 * metricasConfigService.js — configuração das métricas, em `config/metricas`.
 *
 * Um documento só, lido por todo mundo e escrito só por admin (as regras do
 * Firestore já garantem isso em `match /config/{document=**}`). Está no banco,
 * e não no localStorage, porque expediente e feriado são da EQUIPE: se cada
 * navegador guardasse o seu, dois técnicos veriam tempos médios diferentes para
 * o mesmo chamado e nenhum dos dois estaria errado.
 *
 * O log de alterações fica no mesmo documento. É pequeno (um registro por
 * feriado informado) e serve para responder "por que a média de março mudou
 * depois que ela já tinha sido fechada".
 */

const CHAVE = "metricas";
const MAX_LOG = 200;

export const CONFIG_METRICAS_PADRAO = {
  // Expediente real da equipe: 7h às 22h.
  bhStart: "07:00",
  bhEnd: "22:00",
  workDays: [1, 2, 3, 4, 5, 6],
  diasNaoTrab: [],
  diasLog: []
};

const HORA_RE = /^\d{2}:\d{2}$/;
const DIA_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Preenche o que faltar e descarta o que estiver malformado. */
export function normalizarConfigMetricas(data = {}) {
  const bhStart = HORA_RE.test(data.bhStart) ? data.bhStart : CONFIG_METRICAS_PADRAO.bhStart;
  const bhEnd = HORA_RE.test(data.bhEnd) ? data.bhEnd : CONFIG_METRICAS_PADRAO.bhEnd;

  const workDays = Array.isArray(data.workDays)
    ? [...new Set(data.workDays.map(Number).filter((n) => n >= 0 && n <= 6))].sort()
    : [...CONFIG_METRICAS_PADRAO.workDays];

  const diasNaoTrab = Array.isArray(data.diasNaoTrab)
    ? data.diasNaoTrab
        .filter((d) => d && DIA_RE.test(d.date))
        .map((d) => ({
          date: d.date,
          nota: String(d.nota || "").slice(0, 120),
          addedAt: d.addedAt || "",
          por: String(d.por || "")
        }))
        .sort((a, b) => (a.date < b.date ? 1 : -1))
    : [];

  const diasLog = Array.isArray(data.diasLog) ? data.diasLog.slice(-MAX_LOG) : [];

  return { bhStart, bhEnd, workDays: workDays.length ? workDays : CONFIG_METRICAS_PADRAO.workDays, diasNaoTrab, diasLog };
}

export function subscribeConfigMetricas(onData, onError) {
  return assinarTabela({
    tabela: "config",
    consulta: (qb) => qb.eq("chave", CHAVE),
    mapear: (linha) => ({ id: linha.chave, valor: linha.valor }),
    predicado: (registro) => registro.id === CHAVE,
    // Sem a linha (ainda não configurado, ou apagada) vale o padrão.
    onData: (lista) => onData(normalizarConfigMetricas(lista[0]?.valor || {})),
    onError: (error) => {
      console.error("[Métricas] Erro ao ler a configuração:", error);
      onError?.(error);
    }
  });
}

async function lerAtual() {
  const { data, error } = await supabase.from("config").select("valor").eq("chave", CHAVE).maybeSingle();
  if (error) throw error;
  return normalizarConfigMetricas(data?.valor || {});
}

/** Grava só as chaves enviadas e preserva as outras (o `merge: true` do Firestore). */
async function mesclar(valor) {
  const { error } = await supabase.rpc("mesclar_config", { p_chave: CHAVE, p_valor: valor });
  if (error) throw new Error(error.message);
}

function entradaLog(acao, date, nota, por) {
  return {
    acao,
    date,
    nota: String(nota || "").slice(0, 120),
    por: String(por || ""),
    em: new Date().toISOString()
  };
}

/** Expediente e escala da semana. cria a linha na primeira vez. */
export function salvarHorarioComercial({ bhStart, bhEnd, workDays }) {
  return mesclar({ bhStart, bhEnd, workDays, updatedAt: new Date().toISOString() });
}

/**
 * Marca um dia como não trabalhado.
 *
 * Escreve o array inteiro (em vez de `arrayUnion`) porque a mesma escrita
 * precisa recusar a data repetida e podar o log — duas coisas que o arrayUnion
 * não faz. O documento tem dezenas de entradas, não milhares: reescrevê-lo é
 * barato e mantém a operação atômica.
 */
export async function adicionarDiaNaoTrabalhado(date, nota, { por } = {}) {
  const atual = await lerAtual();
  if (atual.diasNaoTrab.some((d) => d.date === date)) {
    throw new Error("Este dia já está registrado.");
  }
  const diasNaoTrab = [
    ...atual.diasNaoTrab,
    { date, nota: String(nota || "").slice(0, 120), addedAt: new Date().toISOString(), por: por || "" }
  ];
  const diasLog = [...atual.diasLog, entradaLog("informado", date, nota, por)].slice(-MAX_LOG);
  return mesclar({ diasNaoTrab, diasLog });
}

export async function removerDiaNaoTrabalhado(date, { por } = {}) {
  const atual = await lerAtual();
  const alvo = atual.diasNaoTrab.find((d) => d.date === date);
  const diasNaoTrab = atual.diasNaoTrab.filter((d) => d.date !== date);
  const diasLog = [...atual.diasLog, entradaLog("removido", date, alvo?.nota, por)].slice(-MAX_LOG);
  return mesclar({ diasNaoTrab, diasLog });
}
