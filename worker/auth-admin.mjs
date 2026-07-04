import admin from "./firebase-admin-shim.mjs";
import { verifyFirebaseIdToken } from "./verify-id-token.mjs";
import { normalizarCargo } from "./funcoes.mjs";

let adminApp = null;
let cachedEnv = null;

/**
 * Parse da variável de ambiente FIREBASE_SERVICE_ACCOUNT
 * Suporta Base64 (FIREBASE_SERVICE_ACCOUNT_BASE64) ou JSON string direto
 * Trata diferentes formatos (JSON string, escapado, com quebras de linha, etc)
 * 
 * 📝 DICA: Para encodar JSON em Base64, use:
 *   cat firebase-service-account.json | base64 -w0 > firebase-base64.txt (Linux/Mac)
 *   ou no Node.js: console.log(Buffer.from(JSON.stringify(obj)).toString('base64'))
 */
function parseServiceAccount(raw, isBase64 = false) {
  if (!raw) return null;

  try {
    let serviceAccount;
    let jsonString = raw;
    
    // Se for Base64, decodificar primeiro
    if (isBase64) {
      try {
        // 🔧 Limpar caracteres de controle e espaços ANTES de usar atob()
        const cleanedBase64 = raw
          .replace(/[\s\n\r\t]/g, "")              // Remove quebras de linha, tabs, espaços
          .replace(/[^A-Za-z0-9+/=]/g, "");       // Remove caracteres inválidos (segurança)
        
        jsonString = atob(cleanedBase64);
        console.log("[Firebase] ✓ Base64 decodificado com sucesso");
      } catch (e) {
        console.error("[Firebase] ❌ Erro ao decodificar Base64:", e.message);
        console.error("[Firebase] Verifique se a string Base64 está correta e bem formatada");
        return null;
      }
    }
    
    if (typeof jsonString === "string") {
      // Remover caracteres de controle problemáticos (\f, \r sem \n, etc)
      const cleaned = jsonString
        .replace(/[\f\r\t\v\b]/g, "")  // Remove form feed, carriage return (sem newline), tab, etc
        .replace(/\\n/g, "\n")          // Converte \n literal para newline real (para private_key)
        .replace(/\\t/g, "\t")          // Converte \t literal para tab real
        .replace(/\\"/g, '"')           // Converte \" literal para aspas
        .trim();
      
      try {
        serviceAccount = JSON.parse(cleaned);
      } catch (parseError) {
        console.error("[Firebase] ❌ Erro ao parsear JSON:", parseError.message);
        console.error("[Firebase] Raw length:", jsonString.length);
        console.error("[Firebase] Primeiros 100 chars:", cleaned.substring(0, 100));
        throw parseError;
      }
    } else {
      serviceAccount = jsonString;
    }

    // Validar que tem os campos essenciais
    if (!serviceAccount.project_id || !serviceAccount.private_key || !serviceAccount.client_email) {
      console.error("[Firebase] ❌ Service account inválido");
      console.error("[Firebase] Campos encontrados:", Object.keys(serviceAccount));
      console.error("[Firebase] Campos faltando:", {
        project_id: !serviceAccount.project_id,
        private_key: !serviceAccount.private_key,
        client_email: !serviceAccount.client_email
      });
      return null;
    }

    // ✅ Normalizar private_key
    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key
        .replace(/\\n/g, "\n")  // Converter \n literal para quebra real
        .trim();                 // Remover espaços extras
    }

    console.log("[Firebase] ✓ Service account parseado com sucesso");
    console.log("[Firebase] Project ID:", serviceAccount.project_id);
    console.log("[Firebase] Client Email:", serviceAccount.client_email);

    return serviceAccount;
  } catch (error) {
    console.error("[Firebase] ❌ Erro ao parsear service account:", error.message);
    console.error("[Firebase] Raw input tipo:", typeof raw);
    console.error("[Firebase] Raw input length:", raw?.length);
    return null;
  }
}

/**
 * Inicializa Firebase Admin SDK (lazy initialization)
 * Chamado apenas quando necessário (primeira requisição)
 */
function initializeFirebaseAdmin(env) {
  if (adminApp) {
    return adminApp;
  }

  // Tentar primeiro FIREBASE_SERVICE_ACCOUNT_BASE64, depois fallback
  const firebaseBase64 = env?.FIREBASE_SERVICE_ACCOUNT_BASE64;
  const firebaseRaw = env?.FIREBASE_SERVICE_ACCOUNT;
  
  let serviceAccountRaw = firebaseBase64 || firebaseRaw;
  let isBase64 = !!firebaseBase64;

  console.log("[Firebase] Inicializando Admin SDK...");
  console.log("[Firebase] Using Base64:", isBase64);
  console.log("[Firebase] Service Account disponível:", !!serviceAccountRaw);

  if (!serviceAccountRaw) {
    const errorMsg = "❌ FIREBASE_SERVICE_ACCOUNT ou FIREBASE_SERVICE_ACCOUNT_BASE64 não estão configuradas. Configure no Cloudflare Dashboard → Settings → Variables and Secrets.";
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  const serviceAccount = parseServiceAccount(serviceAccountRaw, isBase64);
  const projectId = env?.FIREBASE_PROJECT_ID || serviceAccount?.project_id || "suportetecnico-api2";

  if (!serviceAccount) {
    const errorMsg = "❌ Erro ao parsear FIREBASE_SERVICE_ACCOUNT. Verifique o formato JSON ou Base64 no Cloudflare Dashboard.";
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  try {
    if (!admin.apps.length) {
      adminApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId
      });
    } else {
      adminApp = admin.app();
    }
    console.log("[Firebase] ✓ Admin SDK inicializado com sucesso");
    return adminApp;
  } catch (error) {
    console.error("[Firebase] ❌ Erro ao inicializar:", error.message);
    console.error("[Firebase] Stack:", error.stack);
    throw new Error(`Erro ao inicializar Firebase: ${error.message}`);
  }
}

/**
 * Criar novo usuário no Firebase Auth e Firestore
 * @param {string} email
 * @param {string} password
 * @param {string} displayName
 * @param {string} cargo
 * @param {object} env - Variáveis de ambiente do Cloudflare
 * @returns {Promise<{ok: boolean, uid?: string, error?: string}>}
 */
export async function createUserInFirebase(email, password, displayName, cargo = "Operador", env = {}) {
  try {
    // Inicializar Firebase (se não estiver já)
    const app = initializeFirebaseAdmin(env);
    const db = admin.firestore();

    console.log(`[Firebase] Criando novo usuário: ${email}`);
    console.log(`[Firebase] Cargo: ${cargo}`);
    
    const cargoNormalizado = normalizarCargo(cargo);

    // Criar usuário em Firebase Authentication
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: displayName || email
    });

    console.log(`[Firebase] ✓ Auth user criado. UID: ${userRecord.uid}`);

    // Criar documento em Firestore
    const usuariosCollection = env?.USUARIOS_COLLECTION || "usuarios";
    console.log(`[Firebase] Salvando no Firestore - Coleção: ${usuariosCollection}`);

    await db.collection(usuariosCollection).doc(userRecord.uid).set({
      uid: userRecord.uid,
      email: email,
      displayName: displayName || "",
      cargo: cargoNormalizado,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    console.log(`[Firebase] ✓ Documento Firestore criado para ${userRecord.uid}`);

    return {
      ok: true,
      uid: userRecord.uid,
      message: `Usuário ${email} criado com sucesso!`
    };
  } catch (error) {
    console.error(`[Firebase] ❌ Erro ao criar usuário:`, error);
    console.error(`[Firebase] Código de erro:`, error.code);
    console.error(`[Firebase] Mensagem:`, error.message);

    let errorMessage = "Erro ao criar usuário.";
    if (error.code === "auth/email-already-exists") {
      errorMessage = "Este email já está cadastrado.";
    } else if (error.code === "auth/invalid-email") {
      errorMessage = "Email inválido.";
    } else if (error.code === "auth/weak-password") {
      errorMessage = "Senha muito fraca. Use pelo menos 6 caracteres.";
    } else if (error.message?.includes("PERMISSION_DENIED")) {
      errorMessage = "Sem permissão. Verifique as Firestore Rules.";
    }

    return {
      ok: false,
      error: errorMessage,
      details: error.message
    };
  }
}

/**
 * Validar Firebase ID Token
 * @param {string} token - Firebase ID Token
 * @param {object} env - Variáveis de ambiente do Cloudflare
 * @returns {Promise<{valid: boolean, uid?: string, email?: string, error?: string}>}
 */
export async function verifyFirebaseToken(token, env = {}) {
  if (!token) {
    console.error(`[Firebase] ❌ Token não fornecido`);
    return {
      valid: false,
      error: "Token não fornecido"
    };
  }

  console.log(`[Firebase] Iniciando validação de token...`);
  console.log(`[Firebase] Token preview: ${token.substring(0, 50)}...`);

  // Tentativa 1: Firebase Admin SDK (não roda de verdade em Cloudflare Workers,
  // mas tentamos por compatibilidade — qualquer erro aqui (inclusive na
  // inicialização/parse do service account) NÃO deve impedir o fallback JWKS abaixo).
  try {
    const app = initializeFirebaseAdmin(env);
    console.log(`[Firebase] Admin SDK inicializado`);
    console.log(`[Firebase] Chamando admin.auth().verifyIdToken...`);
    const decodedToken = await admin.auth().verifyIdToken(token);
    console.log(`[Firebase] ✅ Token validado com sucesso (Admin SDK)`);
    console.log(`[Firebase] UID: ${decodedToken.uid}`);
    console.log(`[Firebase] Email: ${decodedToken.email}`);
    return {
      valid: true,
      uid: decodedToken.uid,
      email: decodedToken.email
    };
  } catch (adminErr) {
    console.warn(`[Firebase] Admin verify indisponível (esperado em Workers), usando fallback JWKS: ${adminErr.message}`);
  }

  // Tentativa 2: verificação via JWKS (funciona nativamente no runtime do Workers,
  // não depende de service account, só de FIREBASE_PROJECT_ID opcionalmente).
  try {
    const fallback = await verifyFirebaseIdToken(token, env);
    if (fallback.valid) {
      console.log(`[Firebase] ✅ Token validado com sucesso (JWKS)`);
      return { valid: true, uid: fallback.uid, email: fallback.email };
    }
    console.error(`[Firebase] ❌ Fallback JWKS falhou: ${fallback.error}`);
    return { valid: false, error: fallback.error || "Token inválido." };
  } catch (fallbackErr) {
    console.error(`[Firebase] ❌ Erro ao validar token via JWKS:`, fallbackErr.message);
    console.error(`[Firebase] Stack:`, fallbackErr.stack);
    return {
      valid: false,
      error: "Token inválido.",
      details: fallbackErr.message
    };
  }
}
