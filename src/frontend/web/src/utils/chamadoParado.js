import { toComparableDate } from "./format";

/**
 * Chamado parado (pedido do usuário, 2026-10-09): EM ANDAMENTO sem mensagem do
 * cliente há muito tempo. Conta desde a última mensagem do cliente ou, se ele
 * ainda não escreveu, desde que o chamado foi assumido. Horas de relógio.
 *
 * - `destaque` horas: o card ganha a etiqueta "parado há X".
 * - `semRetorno` horas: o painel sugere marcar como "sem retorno" — mas só se
 *   não há mensagem do cliente esperando leitura (bolinha): aí quem deve a
 *   resposta é a equipe, não o cliente.
 */
export const PARADO_LIMITES = { destaque: 4, semRetorno: 24 };

function duracao(horas) {
  if (horas >= 48) return `${Math.floor(horas / 24)} dias`;
  if (horas >= 24) return "1 dia";
  return `${Math.floor(horas)} h`;
}

/** @returns {{ nivel: "parado"|"sem-retorno", horas: number, texto: string }|null} */
export function chamadoParado(item, agora = Date.now()) {
  if (item?.status !== "EM ANDAMENTO") return null;
  const desde = Math.max(toComparableDate(item.ultimaMensagemClienteEm), toComparableDate(item.dataInicioAtendimento));
  if (!desde) return null;
  const horas = (agora - desde) / 3600000;
  if (horas < PARADO_LIMITES.destaque) return null;
  const sugerirSemRetorno = horas >= PARADO_LIMITES.semRetorno && !(item.mensagensNaoLidas > 0);
  return {
    nivel: sugerirSemRetorno ? "sem-retorno" : "parado",
    horas,
    texto: `parado há ${duracao(horas)}`
  };
}
