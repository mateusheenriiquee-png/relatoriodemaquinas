/**
 * Tempo em que o chamado ficou REAGENDADO (pedido do usuário, 2026-10-05).
 *
 * O cliente pediu para ser atendido depois: essa espera não é demora da
 * equipe, então sai da fila, do atendimento e da conclusão. Os períodos vêm da
 * coluna `periodos_reagendado`, mantida por um gatilho no banco (migração
 * 20261005000000): [{ de, ate }], com `ate` nulo enquanto ainda reagendado.
 */

function emMs(valor) {
  if (!valor) return NaN;
  const t = valor instanceof Date ? valor.getTime() : new Date(valor).getTime();
  return Number.isNaN(t) ? NaN : t;
}

/** Períodos como [inicioMs, fimMs]; o que ainda está aberto vai até `agora`. */
export function periodosReagendado(registro, agora = Date.now()) {
  const lista = Array.isArray(registro?.periodosReagendado) ? registro.periodosReagendado : [];
  return lista
    .map((p) => [emMs(p?.de), p?.ate ? emMs(p.ate) : agora])
    .filter(([de, ate]) => Number.isFinite(de) && Number.isFinite(ate) && ate > de);
}

/**
 * Quanto do intervalo [inicio, fim] o chamado passou reagendado, em ms.
 * `medir(de, ate)` diz como contar cada pedaço: relógio corrido por padrão, ou
 * só as horas do expediente (msUteisEntre) para a duração útil.
 */
export function msReagendadoEntre(registro, inicio, fim, medir = (de, ate) => ate - de) {
  const i = emMs(inicio);
  const f = emMs(fim);
  if (!Number.isFinite(i) || !Number.isFinite(f) || f <= i) return 0;
  return periodosReagendado(registro).reduce((total, [de, ate]) => {
    const a = Math.max(de, i);
    const b = Math.min(ate, f);
    return b > a ? total + medir(a, b) : total;
  }, 0);
}
