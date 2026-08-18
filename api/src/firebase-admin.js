const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");
const {JWT} = require('google-auth-library');

function parseServiceAccountRaw(raw) {
  if (!raw) return null;
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (parsed.private_key) {
    parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
  }
  return parsed;
}

if (!admin.apps.length) {
  let credential;
  let serviceAccount;

  // Tentar diferentes formas de encontrar as credenciais
  
  // 1. Verificar variável de ambiente GOOGLE_APPLICATION_CREDENTIALS
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.log("✓ Usando GOOGLE_APPLICATION_CREDENTIALS:", process.env.GOOGLE_APPLICATION_CREDENTIALS);
    credential = admin.credential.applicationDefault();
  }
  // 2. Verificar variável FIREBASE_SERVICE_ACCOUNT_BASE64 / FIREBASE_SERVICE_ACCOUNT
  else if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || process.env.FIREBASE_SERVICE_ACCOUNT) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64
      ? Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, "base64").toString("utf8")
      : process.env.FIREBASE_SERVICE_ACCOUNT;
    console.log("✓ Usando FIREBASE_SERVICE_ACCOUNT a partir de variável de ambiente");
    serviceAccount = parseServiceAccountRaw(raw);
    credential = admin.credential.cert(serviceAccount);
  }
  // 3. Tentar arquivo firebase-service-account.json na raiz do projeto
  else if (fs.existsSync(path.join(__dirname, "../../firebase-service-account.json"))) {
    const serviceAccountPath = path.join(__dirname, "../../firebase-service-account.json");
    console.log("✓ Usando credenciais de:", serviceAccountPath);
    serviceAccount = require(serviceAccountPath);
    credential = admin.credential.cert(serviceAccount);
  }
  // 4. Tentar service account JSON padrão no root do projeto
  else {
    const rootPath = path.resolve(__dirname, "../../");
    console.log("🔎 Procurando credenciais no root:", rootPath);
    const candidates = fs.readdirSync(rootPath).filter((name) => name.endsWith(".json") && /firebase-adminsdk|service-account|service_account/i.test(name));
    console.log("🔎 Arquivos JSON candidatos:", candidates);

    // Prefer the last candidate (newest) when multiple service account JSON files exist.
    for (let i = candidates.length - 1; i >= 0; i--) {
      const candidate = candidates[i];
      const candidatePath = path.join(rootPath, candidate);
      try {
        const parsed = require(candidatePath);
        if (parsed && parsed.type === "service_account") {
          console.log("✓ Usando credenciais de:", candidatePath);
          serviceAccount = parsed;
          credential = admin.credential.cert(serviceAccount);
          break;
        }
      } catch (e) {
        console.warn("⚠ Ignorando JSON inválido:", candidatePath, e.message);
      }
    }

    if (!credential && fs.existsSync(path.join(__dirname, "../firebase-service-account.json"))) {
      const serviceAccountPath = path.join(__dirname, "../firebase-service-account.json");
      console.log("✓ Usando credenciais de:", serviceAccountPath);
      serviceAccount = require(serviceAccountPath);
      credential = admin.credential.cert(serviceAccount);
    }

    if (!credential) {
      console.warn("⚠ Nenhum arquivo de credenciais encontrado. Tentando credential padrão...");
      try {
        credential = admin.credential.applicationDefault();
      } catch (err) {
        console.error("✗ Erro ao carregar credenciais:", err.message);
        throw new Error(
          "Firebase Admin SDK não conseguiu inicializar. " +
          "Configure GOOGLE_APPLICATION_CREDENTIALS, FIREBASE_SERVICE_ACCOUNT ou coloque firebase-service-account.json na raiz do projeto."
        );
      }
    }
  }

  const projectId = process.env.FIREBASE_PROJECT_ID || (serviceAccount && serviceAccount.project_id) || "suportetecnico-api2";

  admin.initializeApp({
    credential: credential,
    projectId
  });
}

const db = admin.firestore();

module.exports = { db, admin };