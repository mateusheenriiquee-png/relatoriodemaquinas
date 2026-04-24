import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBMhiikZsVCrPLdV8ud0RBxi2Ac4W_myXk",
  authDomain: "relatorioteste-1771d.firebaseapp.com",
  projectId: "relatorioteste-1771d",
  storageBucket: "relatorioteste-1771d.firebasestorage.app",
  messagingSenderId: "658913328458",
  appId: "1:658913328458:web:fe6b9158c53ab491ecd5b3"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);