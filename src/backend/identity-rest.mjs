const TOKEN_URL = "https://oauth2.googleapis.com/token";
const IDENTITY_BASE = "https://identitytoolkit.googleapis.com/v1";
const IDENTITY_SCOPE = "https://www.googleapis.com/auth/identitytoolkit";

let cachedAdminToken = null;
let cachedAdminTokenExpiresAt = 0;

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

function parseServiceAccount(raw) {
  if (!raw) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT nao configurada.");
  }

  try {
    let jsonString = raw;

    const tryParseJson = (value) => {
      if (typeof value !== "string") return null;
      try {
        return JSON.parse(value);
      } catch (_err) {
        return null;
      }
    };

    if (typeof raw === "string") {
      const normalizedBase64 = raw.replace(/\s+/g, "");
      const decoded = (() => {
        try {
          return atob(normalizedBase64);
        } catch (_err) {
          return null;
        }
      })();
      if (decoded) {
        const parsed = tryParseJson(decoded);
        if (parsed) {
          jsonString = decoded;
        }
      }
    }

    const cleaned = typeof jsonString === "string"
      ? jsonString
          .replace(/[\f\r\t\v\b]/g, "")
          .replace(/\\n/g, "\\n")
          .replace(/\u0000/g, "")
      : jsonString;

    let parsed = tryParseJson(cleaned);
    if (!parsed && typeof cleaned === "string") {
      const safe = cleaned.replace(/\r\n|\r|\n/g, "\\n");
      parsed = tryParseJson(safe);
    }

    if (!parsed) {
      throw new Error("JSON invalido ou service account mal formatado.");
    }

    if (parsed.private_key) {
      parsed.private_key = String(parsed.private_key).replace(/\\n/g, "\n");
    }
    return parsed;
  } catch (error) {
    throw new Error("Erro ao parsear FIREBASE_SERVICE_ACCOUNT: " + error.message);
  }
}

async function signJwt(serviceAccount) {
  const header = base64UrlEncodeString(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload = base64UrlEncodeString(
    JSON.stringify({
      iss: serviceAccount.client_email,
      scope: IDENTITY_SCOPE,
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

async function getAdminAccessToken(serviceAccountRaw) {
  const now = Date.now();
  if (cachedAdminToken && cachedAdminTokenExpiresAt > now + 60_000) {
    return cachedAdminToken;
  }

  const serviceAccount = parseServiceAccount(serviceAccountRaw);
  const assertion = await signJwt(serviceAccount);
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
    throw new Error(data.error_description || data.error || "Falha ao obter token OAuth para Identity Toolkit.");
  }

  cachedAdminToken = data.access_token;
  cachedAdminTokenExpiresAt = now + Number(data.expires_in || 3600) * 1000;
  return cachedAdminToken;
}

// Mesma apiKey pública do frontend (public/js/config/firebase.js).
// Pode ser sobrescrita via FIREBASE_WEB_API_KEY no Cloudflare Dashboard.
const DEFAULT_WEB_API_KEY = "AIzaSyA2I3nATaimqXIlMQaCN7FgsxuLWFRoMaM";

function getWebApiKey(env = {}) {
  return (env.FIREBASE_WEB_API_KEY || DEFAULT_WEB_API_KEY).trim();
}

function mapIdentityError(errorPayload) {
  const message = errorPayload?.error?.message || errorPayload?.message || "";
  const codeMap = {
    EMAIL_EXISTS: "auth/email-already-exists",
    INVALID_EMAIL: "auth/invalid-email",
    WEAK_PASSWORD: "auth/weak-password",
    USER_NOT_FOUND: "auth/user-not-found"
  };

  for (const [apiCode, firebaseCode] of Object.entries(codeMap)) {
    if (message.includes(apiCode)) {
      const err = new Error(message);
      err.code = firebaseCode;
      return err;
    }
  }

  const err = new Error(message || "Erro na Identity Toolkit API.");
  err.code = "auth/internal-error";
  return err;
}

async function parseIdentityResponse(response) {
  const data = await response.json();
  if (!response.ok) {
    throw mapIdentityError(data);
  }
  return data;
}

/**
 * Cria conta email/senha via REST público (equivalente a createUserWithEmailAndPassword).
 * Não afeta sessão de ninguém — roda servidor-a-servidor.
 */
export async function createUser({ env, email, password, displayName }) {
  const webApiKey = getWebApiKey(env);

  const signupResp = await fetch(`${IDENTITY_BASE}/accounts:signUp?key=${webApiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: email.trim(),
      password,
      returnSecureToken: true
    })
  });

  const signupData = await parseIdentityResponse(signupResp);
  const uid = signupData.localId;
  const idToken = signupData.idToken;

  if (displayName?.trim() && idToken) {
    const updateResp = await fetch(`${IDENTITY_BASE}/accounts:update?key=${webApiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idToken,
        displayName: displayName.trim(),
        returnSecureToken: false
      })
    });
    await parseIdentityResponse(updateResp);
  }

  return {
    uid,
    email: signupData.email || email.trim(),
    displayName: displayName?.trim() || ""
  };
}

/**
 * Atualiza conta de outro usuário (operação admin — requer OAuth da service account).
 */
export async function updateUserAdmin({ serviceAccountRaw, localId, email, password, displayName, disableUser }) {
  const accessToken = await getAdminAccessToken(serviceAccountRaw);
  const body = { localId };

  if (email?.trim()) body.email = email.trim();
  if (password?.trim()) body.password = password;
  if (displayName?.trim()) body.displayName = displayName.trim();
  if (typeof disableUser === "boolean") body.disableUser = disableUser;

  const response = await fetch(`${IDENTITY_BASE}/accounts:update`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  return parseIdentityResponse(response);
}

/**
 * Remove conta de login de outro usuário (operação admin).
 */
export async function deleteUserAdmin({ serviceAccountRaw, localId }) {
  const accessToken = await getAdminAccessToken(serviceAccountRaw);

  const response = await fetch(`${IDENTITY_BASE}/accounts:delete`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ localId })
  });

  return parseIdentityResponse(response);
}

export function getServiceAccountRaw(env = {}) {
  return env.FIREBASE_SERVICE_ACCOUNT_BASE64 || env.FIREBASE_SERVICE_ACCOUNT;
}
