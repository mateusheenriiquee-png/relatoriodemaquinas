/**
 * kommo-funil.mjs — qual lead do cliente usar para o suporte.
 *
 * Um mesmo contato tem um lead em cada funil do Kommo (vendas, pós-venda,
 * cobranças, renovações...). A conversa do WhatsApp fica presa a um deles —
 * não necessariamente o de vendas — e é esse id que a automação do chat grava
 * no chamado. Mas é no "01 - Funil de vendas" que ficam a Etapa de suporte,
 * o Pagamento Concluído e os campos do certificado. Visto em produção
 * (2026-09-29): chamado ligado a um lead do "08 - Funil de Cobranças".
 *
 * ESM puro, sem dependências: o Worker e os testes importam o mesmo arquivo.
 */

export const FUNIL_VENDAS = "11884552";
const FECHADOS = new Set(["142", "143"]);

export const ETAPA_SUPORTE = "105673331";

/**
 * Entre os leads do funil de vendas, o do atendimento. Um cliente pode ter
 * vários (um fechado de uma compra antiga e outro aberto da atual): vale, em
 * ordem, o que está na Etapa de suporte, depois os ainda abertos (fora de
 * Fechado-ganho/perdido) e, entre iguais, o mais recentemente atualizado.
 * Nenhum no funil -> null.
 */
export function escolherLeadDeVendas(leads, funil = FUNIL_VENDAS) {
  const doFunil = (leads || []).filter((l) => String(l?.pipeline_id ?? "") === funil);
  if (!doFunil.length) return null;
  const peso = (l) => {
    const etapa = String(l.status_id ?? "");
    if (etapa === ETAPA_SUPORTE) return 2;
    return FECHADOS.has(etapa) ? 0 : 1;
  };
  return [...doFunil].sort((a, b) => peso(b) - peso(a) || (b.updated_at || 0) - (a.updated_at || 0))[0];
}

/** Lead aberto no funil de vendas (nem Fechado-ganho nem Fechado-perdido)? */
export function leadDeVendasAberto(lead, funil = FUNIL_VENDAS) {
  return String(lead?.pipeline_id ?? "") === funil && !FECHADOS.has(String(lead?.status_id ?? ""));
}
