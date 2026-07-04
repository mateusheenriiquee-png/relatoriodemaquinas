const TOKEN_URL = "https://oauth2.googleapis.com/token";
const FIRESTORE_SCOPE = "https://www.googleapis.com/auth/datastore";

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

    // Se for base64, decodificar antes de tentar parsear
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
      throw new Error("JSON inválido ou serviço de conta mal formatado.");
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
      scope: FIRESTORE_SCOPE,
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

async function getAccessToken(serviceAccountRaw) {
  const now = Date.now();
  if (cachedToken && cachedTokenExpiresAt > now + 60_000) {
    return cachedToken;
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
    throw new Error(data.error_description || data.error || "Falha ao obter token OAuth.");
  }

  cachedToken = data.access_token;
  cachedTokenExpiresAt = now + Number(data.expires_in || 3600) * 1000;
  return cachedToken;
}

function encodeFirestoreValue(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string") {
    return { stringValue: value };
  }
  if (typeof value === "boolean") {
    return { booleanValue: value };
  }
  if (typeof value === "number") {
    if (Number.isInteger(value)) {
      return { integerValue: String(value) };
    }
    return { doubleValue: value };
  }
  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map((item) => encodeFirestoreValue(item)).filter(Boolean)
      }
    };
  }
  if (typeof value === "object") {
    const fields = {};
    for (const [key, nested] of Object.entries(value)) {
      const encoded = encodeFirestoreValue(nested);
      if (encoded) {
        fields[key] = encoded;
      }
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(value) };
}

function toFirestoreFields(record) {
  const encoded = encodeFirestoreValue(record);
  return encoded?.mapValue?.fields || {};
}

function isoTimestamp() {
  return new Date().toISOString();
}

async function patchDocument({ documentName, fields, accessToken, updateMaskPaths }) {
  const maskParams = updateMaskPaths
    .map((path) => `updateMask.fieldPaths=${encodeURIComponent(path)}`)
    .join("&");
  const response = await fetch(`https://firestore.googleapis.com/v1/${documentName}?${maskParams}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ fields })
  });
  return response;
}

function decodeFirestoreValue(value) {
  if (value === null || value === undefined) return null;
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("nullValue" in value) return null;
  if ("mapValue" in value) return decodeFirestoreFields(value.mapValue.fields || {});
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(decodeFirestoreValue);
  if ("timestampValue" in value) return value.timestampValue;
  return null;
}

function decodeFirestoreFields(fields = {}) {
  const result = {};
  for (const [key, val] of Object.entries(fields)) {
    result[key] = decodeFirestoreValue(val);
  }
  return result;
}

export async function getDocument({ serviceAccountRaw, collection, docId }) {
  const serviceAccount = parseServiceAccount(serviceAccountRaw);
  const accessToken = await getAccessToken(serviceAccountRaw);
  const projectId = serviceAccount.project_id;
  const documentName = `projects/${projectId}/databases/(default)/documents/${collection}/${docId}`;

  const response = await fetch(`https://firestore.googleapis.com/v1/${documentName}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (response.status === 404) {
    return null;
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || "Falha ao ler documento no Firestore.");
  }

  return decodeFirestoreFields(data.fields || {});
}

export async function updateDocument({ serviceAccountRaw, collection, docId, fields }) {
  const serviceAccount = parseServiceAccount(serviceAccountRaw);
  const accessToken = await getAccessToken(serviceAccountRaw);
  const projectId = serviceAccount.project_id;
  const documentName = `projects/${projectId}/databases/(default)/documents/${collection}/${docId}`;

  const firestoreFields = toFirestoreFields(fields);
  const fieldPaths = Object.keys(firestoreFields);
  if (!fieldPaths.length) {
    return { skipped: true };
  }

  const response = await patchDocument({
    documentName,
    fields: firestoreFields,
    accessToken,
    updateMaskPaths: fieldPaths
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || "Falha ao atualizar documento no Firestore.");
  }

  return data;
}

export async function upsertRecords({ serviceAccountRaw, collection, records }) {
  if (!records.length) {
    return 0;
  }

  const serviceAccount = parseServiceAccount(serviceAccountRaw);
  const accessToken = await getAccessToken(serviceAccountRaw);
  const projectId = serviceAccount.project_id;
  const parent = `projects/${projectId}/databases/(default)/documents/${collection}`;
  let upserted = 0;

  for (const { docId, fields } of records) {
    if (!docId) continue;

    const { createdAt: _c, updatedAt: _u, ...payload } = fields;
    const patchPayload = {
      ...payload,
      updatedAt: isoTimestamp()
    };
    const firestoreFields = toFirestoreFields(patchPayload);
    const fieldPaths = Object.keys(firestoreFields);
    if (!fieldPaths.length) continue;

    const documentName = `${parent}/${docId}`;
    let response = await patchDocument({
      documentName,
      fields: firestoreFields,
      accessToken,
      updateMaskPaths: fieldPaths
    });

    if (response.status === 404) {
      const createFields = toFirestoreFields({
        ...patchPayload,
        createdAt: isoTimestamp()
      });
      response = await fetch(
        `https://firestore.googleapis.com/v1/${parent}?documentId=${encodeURIComponent(docId)}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ fields: createFields })
        }
      );
    }

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error?.message || "Falha ao gravar no Firestore.");
    }

    upserted += 1;
  }

  return upserted;
}

export async function commitRecords(options) {
  return upsertRecords(options);
}
