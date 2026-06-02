import admin from "firebase-admin";

let adminApp = null;

/**
 * Parse da variável de ambiente FIREBASE_SERVICE_ACCOUNT
 * Trata diferentes formatos (JSON string, escapado, com quebras de linha, etc)
 */
function parseServiceAccount(raw) {
  if (!raw) return null;

  try {
    let serviceAccount;
    
    if (typeof raw === "string") {
      // Se for string, tentar fazer parse JSON
      // Primeiro, substitui quebras de linha escapadas
      const cleaned = raw
        .replace(/\\n/g, "\n")   // Converte \n literal para quebra real
        .replace(/\\t/g, "\t")   // Converte \t literal para tab real
        .replace(/\\"/g, '"');   // Converte \" literal para aspas reais
      
      serviceAccount = JSON.parse(cleaned);
    } else {
      serviceAccount = raw;
    }

    // Validar que tem os campos essenciais
    if (!serviceAccount.project_id || !serviceAccount.private_key || !serviceAccount.client_email) {
      console.error("[Firebase] Service account inválido - campos:", Object.keys(serviceAccount));
      console.error("[Firebase] Faltam:", {
        project_id: !serviceAccount.project_id,
        private_key: !serviceAccount.private_key,
        client_email: !serviceAccount.client_email
      });
      return null;
    }

    console.log("[Firebase] ✓ Service account parseado com sucesso");
    console.log("[Firebase] Project ID:", serviceAccount.project_id);
    console.log("[Firebase] Client Email:", serviceAccount.client_email);

    return serviceAccount;
  } catch (error) {
    console.error("[Firebase] Erro ao parsear service account:", error.message);
    console.error("[Firebase] Raw input tipo:", typeof raw);
    console.error("[Firebase] Raw input length:", raw?.length);
    return null;
  }
}

/**
 * Inicializa Firebase Admin SDK (lazy initialization)
 * Chamado apenas quando necessário (primeira requisição)
 */
function initializeFirebaseAdmin() {
  if (adminApp) {
    return adminApp;
  }

  const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
  const projectId = process.env.FIREBASE_PROJECT_ID || "suportetecnico-api";

  console.log("[Firebase] Inicializando Admin SDK...");
  console.log("[Firebase] Project ID:", projectId);
  console.log("[Firebase] Service Account disponível:", !!serviceAccountRaw);

  if (!serviceAccountRaw) {
    const errorMsg = "❌ FIREBASE_SERVICE_ACCOUNT não está configurada. Configure no Cloudflare Dashboard → Settings → Environment variables.";
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  const serviceAccount = parseServiceAccount(serviceAccountRaw);

  if (!serviceAccount) {
    const errorMsg = "❌ Erro ao parsear FIREBASE_SERVICE_ACCOUNT. Verifique o formato JSON no Cloudflare Dashboard.";
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  try {
    if (!admin.apps.length) {
      adminApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: projectId
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
 * @returns {Promise<{ok: boolean, uid?: string, error?: string}>}
 */
export async function createUserInFirebase(email, password, displayName, cargo = "operador") {
  try {
    // Inicializar Firebase (se não estiver já)
    const app = initializeFirebaseAdmin();
    const db = admin.firestore();

    console.log(`[Firebase] Criando novo usuário: ${email}`);
    console.log(`[Firebase] Cargo: ${cargo}`);

    // Criar usuário em Firebase Authentication
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: displayName || email
    });

    console.log(`[Firebase] ✓ Auth user criado. UID: ${userRecord.uid}`);

    // Criar documento em Firestore
    const usuariosCollection = process.env.USUARIOS_COLLECTION || "usuarios";
    console.log(`[Firebase] Salvando no Firestore - Coleção: ${usuariosCollection}`);

    await db.collection(usuariosCollection).doc(userRecord.uid).set({
      uid: userRecord.uid,
      email: email,
      displayName: displayName || "",
      cargo: cargo || "operador",
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
