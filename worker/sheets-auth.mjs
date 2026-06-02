const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

let cachedToken = null;
let cachedTokenExpiresAt = 0;

function base64UrlEncode(bytes) {
  let binary = "";
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i += 1) {
    binary += String.fromCharCode(arr[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlEncodeString(value) {
  return base64UrlEncode(new TextEncoder().encode(value));
}

function pemToPkcs8(pem) {
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export function parseServiceAccount(raw) {
  if (!raw) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT nao configurada.");
  }
  
  try {
    let jsonString = raw;
    
    // Verificar se é Base64
    try {
      const decoded = atob(raw);
      // Se conseguir decodificar e for um JSON válido, usar o decodificado
      JSON.parse(decoded);
      jsonString = decoded;
    } catch (e) {
      // Não é Base64, usar direto
    }
    
    // Remover caracteres de controle problemáticos
    const cleaned = typeof jsonString === "string"
      ? jsonString
          .replace(/[\f\r\t\v\b]/g, "")  // Remove caracteres de controle
          .replace(/\\n/g, "\n")
          .replace(/\\t/g, "\t")
          .replace(/\\"/g, '"')
      : jsonString;
    
    const parsed = JSON.parse(cleaned);
    
    // Normalizar quebras de linha na private_key
    if (parsed.private_key) {
      parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
    }
    return parsed;
  } catch (error) {
    throw new Error("Erro ao parsear FIREBASE_SERVICE_ACCOUNT: " + error.message);
  }
}

async function signJwt(serviceAccount, scope) {
  const header = base64UrlEncodeString(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload = base64UrlEncodeString(
    JSON.stringify({
      iss: serviceAccount.client_email,
      scope,
      aud: TOKEN_URL,
      exp: now + 3600,
      iat: now
    })
  );
  const unsigned = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(serviceAccount.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned)
  );
  return `${unsigned}.${base64UrlEncode(signature)}`;
}

export async function getSheetsAccessToken(serviceAccountRaw) {
  const now = Date.now();
  if (cachedToken && cachedTokenExpiresAt > now + 60_000) {
    return cachedToken;
  }

  const serviceAccount = parseServiceAccount(serviceAccountRaw);
  const assertion = await signJwt(serviceAccount, SHEETS_SCOPE);
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error_description || data.error || "Falha ao obter token OAuth para Sheets.");
  }

  cachedToken = data.access_token;
  cachedTokenExpiresAt = now + Number(data.expires_in || 3600) * 1000;
  return cachedToken;
}
