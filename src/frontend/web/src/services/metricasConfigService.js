import { doc, getDoc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "../config/firebase";

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

const CAMINHO = ["config", "metricas"];
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
  return onSnapshot(
    doc(db, ...CAMINHO),
    (snap) => onData(normalizarConfigMetricas(snap.exists() ? snap.data() : {})),
    (error) => {
      console.error("[Métricas] Erro ao ler a configuração:", error);
      onError?.(error);
    }
  );
}

async function lerAtual() {
  const snap = await getDoc(doc(db, ...CAMINHO));
  return normalizarConfigMetricas(snap.exists() ? snap.data() : {});
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

/** Expediente e escala da semana. `merge: true` cria o documento na primeira vez. */
export function salvarHorarioComercial({ bhStart, bhEnd, workDays }) {
  return setDoc(
    doc(db, ...CAMINHO),
    { bhStart, bhEnd, workDays, updatedAt: new Date().toISOString() },
    { merge: true }
  );
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
  return setDoc(doc(db, ...CAMINHO), { diasNaoTrab, diasLog }, { merge: true });
}

export async function removerDiaNaoTrabalhado(date, { por } = {}) {
  const atual = await lerAtual();
  const alvo = atual.diasNaoTrab.find((d) => d.date === date);
  const diasNaoTrab = atual.diasNaoTrab.filter((d) => d.date !== date);
  const diasLog = [...atual.diasLog, entradaLog("removido", date, alvo?.nota, por)].slice(-MAX_LOG);
  return setDoc(doc(db, ...CAMINHO), { diasNaoTrab, diasLog }, { merge: true });
}
