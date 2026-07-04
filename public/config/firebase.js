import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, connectFirestoreEmulator } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/**
 * Configuração do Firebase para suportetecnico-api2
 * Credenciais públicas - seguras para cliente (sem chave privada)
 */
const firebaseConfig = {
  apiKey: "AIzaSyBMpPJPrhEcDUOgQEg5vVpHMEKThGu31y4",
  authDomain: "suportetecnico-api2.firebaseapp.com",
  projectId: "suportetecnico-api2",
  storageBucket: "suportetecnico-api2.firebasestorage.app",
  messagingSenderId: "192795919231",
  appId: "1:192795919231:web:7385d3a7e6ba418a2e504a",
  measurementId: "G-XXXXXXXXXX"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);

// Inicializar Auth e Firestore
export const auth = getAuth(app);
export const db = getFirestore(app);

// Conectar ao emulador apenas quando for explicitamente ativado.
// Para testes locais com emulador, defina `window.__USE_FIREBASE_EMULATORS = true` antes de importar este arquivo.
const USE_FIREBASE_EMULATORS = typeof window !== "undefined" && window.__USE_FIREBASE_EMULATORS === true;

if (USE_FIREBASE_EMULATORS) {
  try {
    // Conectar aos emuladores localmente (porta 9099 para Auth, 8080 para Firestore)
    connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "localhost", 8080);
    console.log("✓ Firebase emulator conectado");
  } catch (error) {
    console.warn("⚠️ Falha ao conectar aos emuladores Firebase:", error.message || error);
  }
}

export default app;
