/**
 * Palavras-chave do chat (2026-10-13): a lista que decide se a mensagem do
 * cliente vai para a IA. Fica no banco (config "palavras_chave_suporte") e o
 * n8n a lê a cada mensagem.
 *
 * O n8n compara o texto do cliente sem acento e em minúsculas, como palavra
 * inteira ("pin" não casa com "spinner"). Por isso a lista é guardada já
 * nesse formato: quem digita "Não recebi" grava "nao recebi".
 */

/** "  Não  RECEBI! " -> "nao recebi". Mantém ponto e hífen ("gov.br", "e-cac"). */
export function normalizarPalavra(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9.\- ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Acrescenta o que foi digitado (uma ou várias, separadas por vírgula ou
 * linha). Devolve a lista nova e o que aconteceu com cada termo.
 */
export function adicionarPalavras(lista, texto) {
  const atuais = new Set(lista);
  const adicionadas = [];
  const repetidas = [];
  const invalidas = [];
  for (const bruto of String(texto ?? "").split(/[,;\n]/)) {
    if (!bruto.trim()) continue;
    const p = normalizarPalavra(bruto);
    if (p.length < 2) invalidas.push(bruto.trim());
    else if (atuais.has(p)) repetidas.push(p);
    else {
      atuais.add(p);
      adicionadas.push(p);
    }
  }
  return { lista: [...lista, ...adicionadas], adicionadas, repetidas, invalidas };
}

export function removerPalavra(lista, palavra) {
  return lista.filter((p) => p !== palavra);
}

/** Lista vinda do banco: só texto válido, normalizado e sem repetir. */
export function limparLista(valor) {
  const lista = Array.isArray(valor) ? valor : [];
  return [...new Set(lista.map(normalizarPalavra).filter((p) => p.length >= 2))];
}
