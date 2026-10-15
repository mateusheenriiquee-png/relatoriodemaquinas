import { supabase } from "../config/supabase";
import { assinarTabela } from "./suportesStore";
import { limparLista } from "../utils/palavrasChave";

/**
 * Palavras-chave do chat (2026-10-13) — linha "palavras_chave_suporte" da
 * tabela config. Todo logado lê; só admin grava (RLS de config). O n8n lê pela
 * função palavras_chave_suporte().
 */
const CHAVE = "palavras_chave_suporte";

/** Lista ao vivo: { lista, atualizadoPor, atualizadoEm }. Devolve o unsubscribe. */
export function subscribePalavrasChave(onData, onError) {
  return assinarTabela({
    tabela: "config",
    consulta: (qb) => qb.eq("chave", CHAVE),
    mapear: (linha) => ({ id: linha.chave, valor: linha.valor }),
    predicado: (registro) => registro.id === CHAVE,
    onData: (linhas) => {
      const valor = linhas[0]?.valor || {};
      onData({
        lista: limparLista(valor.lista),
        atualizadoPor: valor.atualizado_por || "",
        atualizadoEm: valor.atualizado_em || ""
      });
    },
    onError
  });
}

/** Grava a lista inteira (mesclar_config preserva o resto da linha). */
export async function salvarPalavrasChave(lista, { por } = {}) {
  const { error } = await supabase.rpc("mesclar_config", {
    p_chave: CHAVE,
    p_valor: { lista: limparLista(lista), atualizado_por: por || "", atualizado_em: new Date().toISOString() }
  });
  if (error) throw new Error(error.message);
}
