const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");

if (!admin.apps.length) {
  let credential;

  // Tentar diferentes formas de encontrar as credenciais
  
  // 1. Verificar variável de ambiente GOOGLE_APPLICATION_CREDENTIALS
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.log("✓ Usando GOOGLE_APPLICATION_CREDENTIALS:", process.env.GOOGLE_APPLICATION_CREDENTIALS);
    credential = admin.credential.applicationDefault();
  }
  // 2. Tentar arquivo firebase-service-account.json na raiz do projeto
  else if (fs.existsSync(path.join(__dirname, "../../firebase-service-account.json"))) {
    const serviceAccountPath = path.join(__dirname, "../../firebase-service-account.json");
    console.log("✓ Usando credenciais de:", serviceAccountPath);
    const serviceAccount = require(serviceAccountPath);
    credential = admin.credential.cert(serviceAccount);
  }
  // 3. Tentar arquivo na pasta api
  else if (fs.existsSync(path.join(__dirname, "../firebase-service-account.json"))) {
    const serviceAccountPath = path.join(__dirname, "../firebase-service-account.json");
    console.log("✓ Usando credenciais de:", serviceAccountPath);
    const serviceAccount = require(serviceAccountPath);
    credential = admin.credential.cert(serviceAccount);
  }
  // 4. Usar credencial padrão (pode falhar)
  else {
    console.warn("⚠ Nenhum arquivo de credenciais encontrado. Tentando credential padrão...");
    try {
      credential = admin.credential.applicationDefault();
    } catch (err) {
      console.error("✗ Erro ao carregar credenciais:", err.message);
      throw new Error(
        "Firebase Admin SDK não conseguiu inicializar. " +
        "Configure GOOGLE_APPLICATION_CREDENTIALS ou coloque firebase-service-account.json na raiz do projeto."
      );
    }
  }

  admin.initializeApp({
    credential: credential,
    projectId: process.env.FIREBASE_PROJECT_ID || "suportetecnico-api"
  });
}

const db = admin.firestore();

module.exports = { db, admin };
