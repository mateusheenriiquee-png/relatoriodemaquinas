import { toComparableDate } from "./format";

/**
 * Ordem da lista de suportes (pedido do usuário, 2026-10-07):
 *
 * - EM ABERTO: do mais antigo para o mais novo — quem espera há mais tempo é
 *   atendido primeiro.
 * - EM ANDAMENTO: dinâmica. O chamado cuja conversa recebeu mensagem nova do
 *   cliente sobe para o topo; sem mensagem, conta quando foi assumido.
 * - Demais abas (Finalizados, Total...): do mais novo para o mais antigo, como antes.
 */
export function atividadeEmAndamento(item) {
  return Math.max(
    toComparableDate(item.ultimaMensagemClienteEm),
    toComparableDate(item.dataInicioAtendimento),
    toComparableDate(item.dataAbertura)
  );
}

export function ordenarSuportes(lista, status) {
  const copia = [...lista];
  if (status === "EM ABERTO") {
    return copia.sort((a, b) => toComparableDate(a.dataAbertura) - toComparableDate(b.dataAbertura));
  }
  if (status === "EM ANDAMENTO") {
    return copia.sort((a, b) => atividadeEmAndamento(b) - atividadeEmAndamento(a));
  }
  return copia.sort((a, b) => toComparableDate(b.dataAbertura) - toComparableDate(a.dataAbertura));
}
