import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyA2I3nATaimqXIlMQaCN7FgsxuLWFRoMaM",
  authDomain: "suportetecnico-api2.firebaseapp.com",
  projectId: "suportetecnico-api2",
  storageBucket: "suportetecnico-api2.firebasestorage.app",
  messagingSenderId: "750082685329",
  appId: "1:750082685329:web:505573434abfb84d2cc230"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
