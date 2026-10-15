import { supabase } from "../config/supabase";
import { assinarTabela } from "./suportesStore";

/**
 * "Possíveis pedidos de suporte" (2026-10-09): mensagens que o filtro do chat
 * descartou — sem palavra-chave (cliente já na videoconferência em diante) ou
 * que a IA disse não ser suporte. Gravadas pelo n8n
 * (registrar_mensagem_descartada); o painel só lê e decide pelas funções do
 * banco (a tabela não aceita escrita direta).
 */
const TABELA = "mensagens_descartadas";

export const MOTIVO_DESCARTE = {
  sem_palavra_chave: "Sem palavra-chave",
  ia_nao_suporte: "A IA disse que não é suporte"
};

export function mapDescartada(linha = {}) {
  return {
    id: linha.id,
    criadoEm: linha.criado_em || "",
    atualizadoEm: linha.atualizado_em || linha.criado_em || "",
    leadId: linha.kommo_lead_id || "",
    talkId: linha.kommo_talk_id || "",
    nome: linha.nome || "",
    mensagem: linha.mensagem || "",
    motivo: linha.motivo || "",
    resumoIa: linha.resumo_ia || "",
    status: linha.status || "pendente"
  };
}

const maisRecenteAntes = (a, b) => new Date(b.atualizadoEm || 0).getTime() - new Date(a.atualizadoEm || 0).getTime();

/** Pendentes ao vivo (somem da lista quando alguém converte ou ignora). Devolve o unsubscribe. */
export function subscribeDescartadasPendentes(onData, onError) {
  return assinarTabela({
    tabela: TABELA,
    consulta: (qb) => qb.eq("status", "pendente").order("atualizado_em", { ascending: false }).limit(200),
    mapear: mapDescartada,
    predicado: (r) => r.status === "pendente",
    ordenar: maisRecenteAntes,
    teto: 200,
    onData,
    onError
  });
}

/** "Virar chamado": abre (ou atualiza) o chamado do cliente. Devolve o id do chamado. */
export async function converterDescartada(id, { por } = {}) {
  const { data, error } = await supabase.rpc("converter_mensagem_descartada", { p_id: id, p_por: por || "" });
  if (error) throw new Error(error.message);
  return data?.chamado_id || null;
}

export async function ignorarDescartada(id, { por } = {}) {
  const { error } = await supabase.rpc("ignorar_mensagem_descartada", { p_id: id, p_por: por || "" });
  if (error) throw new Error(error.message);
}
