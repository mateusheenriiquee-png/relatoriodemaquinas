/**
 * auth-secondary.mjs — Instância Firebase Admin Secundária
 * Usada para operações de usuário (criar, editar, excluir)
 * Impede que o admin seja deslogado durante essas operações
 */

import admin from "./firebase-admin-shim.mjs";

let secondaryApp = null;

/**
 * Parse da variável de ambiente FIREBASE_SERVICE_ACCOUNT
 * Suporta Base64 (FIREBASE_SERVICE_ACCOUNT_BASE64) ou JSON string direto
 * Trata diferentes formatos (JSON string, escapado, com quebras de linha, etc)
 */
function parseServiceAccount(raw, isBase64 = false) {
  if (!raw) return null;

  try {
    let serviceAccount;
    let jsonString = raw;
    
    // Se for Base64, decodificar primeiro
    if (isBase64) {
      try {
        // Limpar caracteres de controle e espaços
        const cleanedBase64 = raw
          .replace(/[\s\n\r\t]/g, "")      // Remove quebras de linha, tabs, espaços
          .replace(/[^\w+/=]/g, "");        // Remove caracteres inválidos

        jsonString = atob(cleanedBase64);
        console.log("[FirebaseSecondary] ✓ Base64 decodificado com sucesso");
      } catch (e) {
        console.error("[FirebaseSecondary] Erro ao decodificar Base64:", e.message);
        return null;
      }
    }
    
    if (typeof jsonString === "string") {
      // Remover caracteres de controle problemáticos (\f, \r sem \n, etc)
      const cleaned = jsonString
        .replace(/[\f\r\t\v\b]/g, "")  // Remove form feed, carriage return (sem newline), tab, etc
        .replace(/\\n/g, "\n")          // Converte \n literal para newline real (para private_key)
        .replace(/\\t/g, "\t")          // Converte \t literal para tab real
        .replace(/\\"/g, '"');          // Converte \" literal para aspas
      
      try {
        serviceAccount = JSON.parse(cleaned);
      } catch (parseError) {
        console.error("[FirebaseSecondary] Erro ao parsear JSON:", parseError.message);
        console.error("[FirebaseSecondary] Raw length:", jsonString.length);
        throw parseError;
      }
    } else {
      serviceAccount = jsonString;
    }

    // Validar que tem os campos essenciais
    if (!serviceAccount.project_id || !serviceAccount.private_key || !serviceAccount.client_email) {
      console.error("[FirebaseSecondary] Service account inválido - campos:", Object.keys(serviceAccount));
      return null;
    }

    // Normalizar private_key
    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key
        .replace(/\\n/g, "\n")  // Converter \n literal para quebra real
        .trim();                 // Remover espaços extras
    }

    console.log("[FirebaseSecondary] ✓ Service account parseado com sucesso");
    console.log("[FirebaseSecondary] Project ID:", serviceAccount.project_id);
    console.log("[FirebaseSecondary] Client Email:", serviceAccount.client_email);

    return serviceAccount;
  } catch (error) {
    console.error("[FirebaseSecondary] Erro ao parsear service account:", error.message);
    return null;
  }
}

/**
 * Inicializa Firebase Admin SDK (instância secundária)
 * Usada para operações de usuário sem afetar a sessão do admin principal
 */
function initializeSecondaryApp(env) {
  if (secondaryApp) {
    return secondaryApp;
  }

  const serviceAccountBase64 = env?.FIREBASE_SERVICE_ACCOUNT_BASE64;
  const serviceAccountRaw = env?.FIREBASE_SERVICE_ACCOUNT;
  const isBase64 = !!serviceAccountBase64;
  const credentialToUse = serviceAccountBase64 || serviceAccountRaw;

  console.log("[FirebaseSecondary] Inicializando Admin SDK Secundário...");
  console.log("[FirebaseSecondary] Using Base64:", isBase64);

  if (!credentialToUse) {
    const errorMsg = "FIREBASE_SERVICE_ACCOUNT ou FIREBASE_SERVICE_ACCOUNT_BASE64 não configuradas.";
    console.error("[FirebaseSecondary] ❌", errorMsg);
    throw new Error(errorMsg);
  }

  const serviceAccount = parseServiceAccount(credentialToUse, isBase64);
  const projectId = env?.FIREBASE_PROJECT_ID || serviceAccount?.project_id || "suportetecnico-api2";

  if (!serviceAccount) {
    const errorMsg = "Erro ao parsear FIREBASE_SERVICE_ACCOUNT";
    console.error("[FirebaseSecondary] ❌", errorMsg);
    throw new Error(errorMsg);
  }

  try {
    if (!admin.apps.length) {
      // Primeira inicialização - usar como app padrão
      secondaryApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId
      });
    } else {
      // Apps já existem - inicializar com nome único
      secondaryApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: projectId
      }, "secondary");
    }
    console.log("[FirebaseSecondary] ✓ Admin SDK Secundário inicializado");
    return secondaryApp;
  } catch (error) {
    console.error("[FirebaseSecondary] ❌ Erro ao inicializar:", error.message);
    throw new Error(`Erro ao inicializar Firebase Secondary: ${error.message}`);
  }
}

export function getSecondaryApp(env) {
  return initializeSecondaryApp(env);
}

export function getSecondaryAuth(env) {
  const app = initializeSecondaryApp(env);
  return admin.auth(app);
}

export function getSecondaryDb(env) {
  const app = initializeSecondaryApp(env);
  return admin.firestore(app);
}
