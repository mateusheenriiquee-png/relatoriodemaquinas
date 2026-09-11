import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

/**
 * Config padrão — a mesma de src/frontend/public/js/config/firebase.js (app do painel).
 * São credenciais públicas de cliente, já versionadas no projeto antigo.
 * O .env sobrescreve qualquer um destes valores quando presente.
 */
const DEFAULT_CONFIG = {
  apiKey: "AIzaSyA2I3nATaimqXIlMQaCN7FgsxuLWFRoMaM",
  authDomain: "suportetecnico-api2.firebaseapp.com",
  projectId: "suportetecnico-api2",
  storageBucket: "suportetecnico-api2.firebasestorage.app",
  messagingSenderId: "750082685329",
  appId: "1:750082685329:web:505573434abfb84d2cc230"
};

const env = import.meta.env;

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || DEFAULT_CONFIG.apiKey,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || DEFAULT_CONFIG.authDomain,
  projectId: env.VITE_FIREBASE_PROJECT_ID || DEFAULT_CONFIG.projectId,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || DEFAULT_CONFIG.storageBucket,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || DEFAULT_CONFIG.messagingSenderId,
  appId: env.VITE_FIREBASE_APP_ID || DEFAULT_CONFIG.appId
};

if (!env.VITE_FIREBASE_API_KEY) {
  console.warn(
    "[Firebase] .env não encontrado — usando a config padrão embutida (projeto suportetecnico-api2)."
  );
}

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
export default app;

/** Base da API auxiliar (criar usuário / associar técnico). */
export function getApiBaseUrl() {
  const fromEnv = env.VITE_API_BASE_URL;
  if (fromEnv) return fromEnv;
  const { hostname, origin } = window.location;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "http://localhost:3000";
  }
  return origin;
}
