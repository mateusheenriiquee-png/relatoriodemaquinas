/**
 * followup.js — regra do follow-up por ligação.
 *
 * São três tentativas de contato, com uma janela mínima entre elas:
 *
 *   1º  →  imediato (assim que o chamado existe)
 *   2º  →  10 min depois do 1º
 *   3º  →  30 min depois do 2º
 *
 * Depois do 3º, o chamado sai da média de tempo do dashboard: ficar esperando
 * um cliente que não atende não é trabalho da equipe, e deixar isso na média
 * distorce o número de todo mundo (ver `duracaoAtendimento` em dashboardService).
 *
 * Este módulo é só cálculo — não toca no Firestore nem no React.
 */

export const TOTAL_FOLLOWUPS = 3;

/**
 * Espera mínima, em minutos, ANTES de cada follow-up, contada a partir do
 * follow-up anterior. O 1º não espera nada. Mudou a política? É só aqui.
 */
export const ESPERA_MINUTOS = [0, 10, 30];

/** Rótulo ordinal, para não espalhar "1º"/"2º"/"3º" pela interface. */
export function ordinal(ordem) {
  return `${ordem}º`;
}

function paraData(valor) {
  if (!valor) return null;
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor;
  if (typeof valor?.toDate === "function") {
    const d = valor.toDate();
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Normaliza a lista vinda do Firestore: ordena por `ordem` e descarta o que
 * não dá para interpretar. Dados de importação e edições manuais chegam
 * torto com mais frequência do que se imagina.
 */
export function normalizarFollowups(lista) {
  if (!Array.isArray(lista)) return [];
  return lista
    .map((registro) => ({
      ordem: Number(registro?.ordem) || 0,
      em: paraData(registro?.em),
      observacao: String(registro?.observacao || ""),
      por: String(registro?.por || "")
    }))
    .filter((registro) => registro.ordem >= 1 && registro.ordem <= TOTAL_FOLLOWUPS)
    .sort((a, b) => a.ordem - b.ordem);
}

/**
 * Estado completo do follow-up de um chamado, pronto para renderizar.
 *
 * @param {object} item registro do suporte
 * @param {number} agora timestamp de referência (injetável para testar)
 * @returns {{
 *   etapas: Array<{ordem:number, registrado:boolean, em:Date|null, observacao:string, por:string,
 *                   liberado:boolean, liberadoEm:Date|null, faltaMs:number}>,
 *   proximo: number|null,
 *   concluido: boolean,
 *   foraDaMedia: boolean
 * }}
 */
export function estadoFollowups(item = {}, agora = Date.now()) {
  const registrados = normalizarFollowups(item.followups);
  const porOrdem = new Map(registrados.map((r) => [r.ordem, r]));

  // O 1º follow-up conta a partir da abertura; os demais, do anterior.
  const abertura = paraData(item.dataAbertura);
  let referencia = abertura;

  const etapas = [];
  let proximo = null;

  for (let ordem = 1; ordem <= TOTAL_FOLLOWUPS; ordem += 1) {
    const registro = porOrdem.get(ordem) || null;
    const esperaMs = (ESPERA_MINUTOS[ordem - 1] || 0) * 60000;

    // Sem referência (registro antigo sem data de abertura) o cálculo de espera
    // não faz sentido — liberamos, em vez de travar a ação para sempre.
    const liberadoEm =
      esperaMs > 0 && referencia ? new Date(referencia.getTime() + esperaMs) : null;
    const faltaMs = liberadoEm ? Math.max(0, liberadoEm.getTime() - agora) : 0;

    // Uma etapa só fica disponível quando a anterior já foi registrada — não dá
    // para pular o 2º e registrar o 3º.
    const anteriorOk = ordem === 1 || porOrdem.has(ordem - 1);
    const liberado = anteriorOk && faltaMs === 0;

    etapas.push({
      ordem,
      registrado: Boolean(registro),
      em: registro?.em || null,
      observacao: registro?.observacao || "",
      por: registro?.por || "",
      liberado,
      liberadoEm,
      faltaMs
    });

    if (!registro && proximo === null) proximo = ordem;
    if (registro?.em) referencia = registro.em;
  }

  return {
    etapas,
    proximo,
    concluido: proximo === null,
    foraDaMedia: Boolean(item.foraDaMedia) || proximo === null
  };
}

/** "em 7 min" / "em 45 s" — texto curto para a contagem regressiva do botão. */
export function faltaTexto(faltaMs) {
  if (faltaMs <= 0) return "";
  const segundos = Math.ceil(faltaMs / 1000);
  if (segundos < 60) return `em ${segundos} s`;
  return `em ${Math.ceil(segundos / 60)} min`;
}
