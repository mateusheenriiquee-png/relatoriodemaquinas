import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBzCwpa4Z_jUh1kIw5tdGXF69nG4Hdi4Ic",
  authDomain: "suportetecnico-api-9386b.firebaseapp.com",
  projectId: "suportetecnico-api-9386b",
  storageBucket: "suportetecnico-api-9386b.firebasestorage.app",
  messagingSenderId: "790334341463",
  appId: "1:790334341463:web:1d726fde261c955d6a3e12"
};
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
