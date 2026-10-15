/**
 * Utilitários dos testes do backend.
 *
 * O que é falso é só a rede: `mockFetch` responde no lugar do Supabase (Auth e
 * PostgREST) e do Kommo. O Worker roda de verdade, com as mesmas URLs e
 * cabeçalhos que usa em produção.
 */

export const SUPABASE_URL = "https://projeto-teste.supabase.co";

/** Variáveis mínimas para o Worker falar com o "Supabase" dos testes. */
export function envSupabase(extra = {}) {
  return { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: "service-role-de-teste", ...extra };
}

export function respostaJson(status, corpo, headers = {}) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "Content-Type": "application/json", ...headers }
  });
}

/**
 * Substitui o fetch global por um roteador de respostas.
 *
 * `rotas` é uma lista de [teste, handler]: o primeiro teste (string contida na
 * URL ou função) que casar responde. URL sem rota falha alto — um teste que
 * dispara uma chamada inesperada precisa quebrar, não passar em silêncio.
 * Devolve { chamadas, restaurar }.
 */
export function mockFetch(rotas) {
  const original = globalThis.fetch;
  const chamadas = [];

  globalThis.fetch = async (url, init = {}) => {
    const alvo = String(url);
    chamadas.push({ url: alvo, method: init.method || "GET", body: init.body, headers: init.headers || {} });
    for (const [teste, handler] of rotas) {
      const casou = typeof teste === "function" ? teste(alvo, init) : alvo.includes(teste);
      if (casou) return handler(alvo, init);
    }
    throw new Error(`fetch inesperado nos testes: ${init.method || "GET"} ${alvo}`);
  };

  return {
    chamadas,
    restaurar: () => {
      globalThis.fetch = original;
    }
  };
}

/**
 * Supabase Auth falso: `tokens` mapeia access_token -> usuário ({ id, email }).
 * Token desconhecido responde 401, como o GET /auth/v1/user de verdade.
 */
export function rotaAuth(tokens = {}) {
  return [
    (url) => url.startsWith(`${SUPABASE_URL}/auth/v1/user`),
    (url, init) => {
      const bruto = String(init.headers?.Authorization || init.headers?.authorization || "");
      const usuario = tokens[bruto.replace(/^Bearer\s+/i, "")];
      return usuario ? respostaJson(200, usuario) : respostaJson(401, { msg: "invalid JWT" });
    }
  ];
}
