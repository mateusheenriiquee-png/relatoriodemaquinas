/**
 * Registra um erro interno no log do Worker e devolve um código curto de
 * referência para a resposta.
 *
 * A resposta HTTP nunca leva a mensagem original: "FIREBASE_SERVICE_ACCOUNT
 * nao configurada" ou o texto do parser de JSON contam a quem está sondando
 * como o backend é montado. O detalhe completo fica no log (`wrangler tail` ou
 * painel da Cloudflare), e o `ref` liga as duas pontas — quem reportar o erro
 * informa o código e ele é achado no log.
 */
export function registrarErro(contexto, error) {
  const ref = crypto.randomUUID().slice(0, 8);
  console.error(`[${contexto}] ref=${ref}`, error?.stack || error);
  return ref;
}
