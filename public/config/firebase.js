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

// Detectar ambiente de emulador (opcional - para desenvolvimento local)
if (typeof window !== "undefined" && window.location.hostname === "localhost") {
  try {
    // Conectar ao emulador se disponível (porta 9099 para Auth, 8080 para Firestore)
    if (!auth.emulatorConfig) {
      connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
    }
    if (!db._firebaseApp._config.emulatorConfig?.firestoreDatabase) {
      connectFirestoreEmulator(db, "localhost", 8080);
    }
  } catch (error) {
    // Emulador não disponível, usar Firebase remoto
    console.log("Emulador não disponível, usando Firebase remoto");
  }
}

export default app;
