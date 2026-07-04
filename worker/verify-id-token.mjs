// verify-id-token.mjs — Verifica Firebase ID Tokens usando as chaves públicas JWKS
// Endpoint JWKS: https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com

const JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

let cachedJwks = null;
let cachedJwksExpiresAt = 0;

function base64UrlDecodeToUint8Array(input) {
  // base64url -> base64
  input = input.replace(/-/g, '+').replace(/_/g, '/');
  // pad
  while (input.length % 4) input += '=';
  const str = atob(input);
  const arr = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) arr[i] = str.charCodeAt(i);
  return arr;
}

async function fetchJwks() {
  const now = Date.now();
  if (cachedJwks && cachedJwksExpiresAt > now) return cachedJwks;

  const res = await fetch(JWKS_URL);
  if (!res.ok) throw new Error('Falha ao obter JWKS: ' + res.status);

  const cacheControl = res.headers.get('cache-control') || '';
  const m = cacheControl.match(/max-age=(\d+)/);
  const maxAge = m ? parseInt(m[1], 10) * 1000 : 60_000;
  cachedJwksExpiresAt = now + maxAge;

  const data = await res.json();
  cachedJwks = data.keys || data;
  return cachedJwks;
}

function parseJwt(token) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Token inválido');
  const [h, p, s] = parts;
  const header = JSON.parse(new TextDecoder().decode(base64UrlDecodeToUint8Array(h)));
  const payload = JSON.parse(new TextDecoder().decode(base64UrlDecodeToUint8Array(p)));
  const signature = base64UrlDecodeToUint8Array(s);
  const signingInput = new TextEncoder().encode(h + '.' + p);
  return { header, payload, signature, signingInput };
}

export async function verifyFirebaseIdToken(token, env = {}) {
  try {
    const { header, payload, signature, signingInput } = parseJwt(token);

    const projectId = env.FIREBASE_PROJECT_ID || (env.FIREBASE_SERVICE_ACCOUNT && (() => {
      try { return JSON.parse(env.FIREBASE_SERVICE_ACCOUNT).project_id; } catch (_) { return null; }
    })()) || null;

    const jwks = await fetchJwks();
    const jwk = jwks.find((k) => k.kid === header.kid);
    if (!jwk) throw new Error('Chave JWKS não encontrada para kid: ' + header.kid);

    // Importar chave JWK
    const alg = jwk.alg || 'RS256';
    const key = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, signingInput);
    if (!valid) return { valid: false, error: 'Assinatura inválida' };

    const now = Math.floor(Date.now() / 1000);
    if (!payload.aud) return { valid: false, error: 'aud ausente' };
    if (!payload.iss) return { valid: false, error: 'iss ausente' };
    if (!payload.sub) return { valid: false, error: 'sub ausente' };
    if (payload.exp && now >= payload.exp) return { valid: false, error: 'token expirado' };

    // Validar projeto/issuer quando possível
    if (projectId) {
      const expectedIss = `https://securetoken.google.com/${projectId}`;
      if (payload.iss !== expectedIss) return { valid: false, error: `iss inválido (${payload.iss})` };
      if (payload.aud !== projectId) return { valid: false, error: `aud inválido (${payload.aud})` };
    }

    return { valid: true, uid: payload.sub, email: payload.email };
  } catch (error) {
    return { valid: false, error: String(error.message || error) };
  }
}

export default { verifyFirebaseIdToken };
