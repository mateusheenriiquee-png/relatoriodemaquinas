// Script de inicialização - Execute no console do Firebase Console ou localmente com Node.js
// Este script ajuda a criar o primeiro usuário administrador

import {
  getAuth,
  createUserWithEmailAndPassword,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";

const firebaseConfig = {
  apiKey: "AIzaSyBMpPJPrhEcDUOgQEg5vVpHMEKThGu31y4",
  authDomain: "suportetecnico-api.firebaseapp.com",
  projectId: "suportetecnico-api",
  storageBucket: "suportetecnico-api.firebasestorage.app",
  messagingSenderId: "192795919231",
  appId: "1:192795919231:web:7385d3a7e6ba418a2e504a"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/**
 * Cria um novo usuário administrador
 * @param {string} email - Email do novo admin
 * @param {string} password - Senha do novo admin
 * @param {string} displayName - Nome completo do admin
 */
export async function createAdminUser(email, password, displayName) {
  try {
    console.log("Criando novo usuário admin...");

    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    console.log("Atualizando perfil...");
    await updateProfile(user, { displayName });

    console.log("Salvando dados no Firestore...");
    await setDoc(doc(db, "usuarios", user.uid), {
      uid: user.uid,
      email: email,
      displayName: displayName,
      cargo: "admin",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    console.log("✅ Usuário admin criado com sucesso!");
    console.log(`   Email: ${email}`);
    console.log(`   UID: ${user.uid}`);
    console.log(`   Nome: ${displayName}`);

    return user;
  } catch (error) {
    console.error("❌ Erro ao criar usuário admin:", error.message);
    throw error;
  }
}

// ============================================
// INSTRUÇÕES DE USO:
// ============================================
// 1. Salve este arquivo como "init-admin.js"
// 2. Copie o código abaixo no console do Firebase Console (após fazer login):
//
// import { createAdminUser } from './init-admin.js';
// createAdminUser('seu.email@example.com', 'senha-segura', 'Seu Nome Completo');
//
// 3. Ou execute localmente com Node.js:
// node init-admin.js
// ============================================

// Descomente para testar localmente:
// createAdminUser('admin@example.com', 'senha123', 'Administrador')
//   .catch(console.error);
