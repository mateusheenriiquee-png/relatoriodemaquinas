import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBMpPJPrhEcDUOgQEg5vVpHMEKThGu31y4",
  authDomain: "suportetecnico-api.firebaseapp.com",
  projectId: "suportetecnico-api",
  storageBucket: "suportetecnico-api.firebasestorage.app",
  messagingSenderId: "192795919231",
  appId: "1:192795919231:web:7385d3a7e6ba418a2e504a"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
