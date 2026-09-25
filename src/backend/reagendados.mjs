import { reabrirReagendadosVencidos } from "./supabase-rest.mjs";

/**
 * reagendados.mjs — devolve para EM ABERTO os suportes cujo reagendamento venceu.
 *
 * Antes isso vivia no navegador (`setInterval` de 5 min na tela de suportes):
 * se ninguém estivesse com o painel aberto às 8h, o suporte reagendado para as
 * 8h só reaparecia quando alguém abrisse a tela. Agora quem roda é o Cron
 * Trigger do Worker (ver `scheduled()` em index.mjs e `[triggers]` no
 * wrangler.toml), que não depende de nenhuma aba.
 *
 * No Firestore era "buscar os REAGENDADO, filtrar a data em memória, atualizar
 * um por um". Aqui é um único UPDATE condicional (status + data já passada):
 * `data_reagendamento` é timestamptz de verdade, então o banco compara, e não
 * existe a janela em que outro cliente altera o chamado entre a leitura e a
 * escrita. Limpar a data no mesmo comando impede o chamado de voltar a ser
 * reaberto a cada execução.
 */

const MAX_POR_EXECUCAO = 300;

/**
 * @returns {Promise<{ verificados: number, reabertos: string[], falhas: Array<{id: string, erro: string}> }>}
 */
export async function processarReagendadosVencidos(env, { agora = new Date() } = {}) {
  const reabertas = await reabrirReagendadosVencidos(env, { agora, limite: MAX_POR_EXECUCAO });
  return {
    // O UPDATE já só toca os vencidos; "verificados" passa a coincidir com os reabertos.
    verificados: reabertas.length,
    reabertos: reabertas.map((linha) => linha.protocolo || linha.id),
    // Uma linha que falhasse derrubaria o comando inteiro (que é atômico) e
    // levantaria erro — o `scheduled()` já registra e propaga.
    falhas: []
  };
}
