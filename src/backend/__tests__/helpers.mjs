/**
 * Utilitários dos testes do backend.
 *
 * As chaves são RSA de verdade, geradas na hora: a verificação de token e a
 * assinatura do JWT do service account rodam o crypto.subtle real, sem atalho.
 * O que é falso é só a rede — `mockFetch` responde no lugar do Google, do
 * Firestore e do Kommo.
 */

const ALG = { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" };

export const PROJECT_ID = "projeto-teste";

function base64url(bytes) {
  return Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Par de chaves com a pública já no formato JWKS (com `kid`). */
export async function gerarChaveJwks(kid = "kid-teste") {
  const { publicKey, privateKey } = await crypto.subtle.generateKey(ALG, true, ["sign", "verify"]);
  const jwk = await crypto.subtle.exportKey("jwk", publicKey);
  return { privateKey, jwk: { ...jwk, kid, alg: "RS256", use: "sig" } };
}

/** ID token no formato do Firebase, assinado com `privateKey`. */
export async function assinarIdToken({ privateKey, kid = "kid-teste", payload = {} }) {
  const agora = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", kid, typ: "JWT" }));
  const corpo = base64url(
    JSON.stringify({
      iss: `https://securetoken.google.com/${PROJECT_ID}`,
      aud: PROJECT_ID,
      sub: "uid-teste",
      iat: agora,
      exp: agora + 3600,
      ...payload
    })
  );
  const assinatura = await crypto.subtle.sign(ALG.name, privateKey, new TextEncoder().encode(`${header}.${corpo}`));
  return `${header}.${corpo}.${base64url(assinatura)}`;
}

/** Service account falso, mas com chave privada válida — o JWT do OAuth é assinado de verdade. */
export async function gerarServiceAccount() {
  const { privateKey } = await crypto.subtle.generateKey(ALG, true, ["sign", "verify"]);
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", privateKey);
  const b64 = Buffer.from(pkcs8).toString("base64").match(/.{1,64}/g).join("\n");
  return JSON.stringify({
    type: "service_account",
    project_id: PROJECT_ID,
    client_email: `worker@${PROJECT_ID}.iam.gserviceaccount.com`,
    private_key: `-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----\n`
  });
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
    chamadas.push({ url: alvo, method: init.method || "GET", body: init.body });
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

/** Rotas que respondem pelo Google: JWKS dos tokens do Firebase e o OAuth do service account. */
export function rotasGoogle(jwks = []) {
  return [
    // max-age=0: o verificador não guarda cache entre testes com chaves diferentes.
    ["securetoken@system.gserviceaccount.com", () => respostaJson(200, { keys: jwks }, { "cache-control": "max-age=0" })],
    ["oauth2.googleapis.com/token", () => respostaJson(200, { access_token: "token-oauth-teste", expires_in: 3600 })]
  ];
}
