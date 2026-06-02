import admin from "firebase-admin";

// Inicializar Firebase Admin SDK se ainda não estiver
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || "{}")),
    projectId: process.env.FIREBASE_PROJECT_ID || "suportetecnico-api"
  });
}

const db = admin.firestore();

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
    console.log(`[Cloudflare] Criando novo usuário: ${email}`);

    // Criar usuário em Firebase Authentication
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: displayName || email
    });

    console.log(`[Cloudflare] UID gerado: ${userRecord.uid}`);

    // Criar documento em Firestore
    const usuariosCollection = process.env.USUARIOS_COLLECTION || "usuarios";
    await db.collection(usuariosCollection).doc(userRecord.uid).set({
      uid: userRecord.uid,
      email: email,
      displayName: displayName || "",
      cargo: cargo || "operador",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    console.log(`[Cloudflare] Documento Firestore criado para ${userRecord.uid}`);

    return {
      ok: true,
      uid: userRecord.uid,
      message: `Usuário ${email} criado com sucesso!`
    };
  } catch (error) {
    console.error(`[Cloudflare] Erro ao criar usuário: ${error.message}`);

    let errorMessage = "Erro ao criar usuário.";
    if (error.code === "auth/email-already-exists") {
      errorMessage = "Este email já está cadastrado.";
    } else if (error.code === "auth/invalid-email") {
      errorMessage = "Email inválido.";
    } else if (error.code === "auth/weak-password") {
      errorMessage = "Senha muito fraca. Use pelo menos 6 caracteres.";
    }

    return {
      ok: false,
      error: errorMessage,
      details: error.message
    };
  }
}
