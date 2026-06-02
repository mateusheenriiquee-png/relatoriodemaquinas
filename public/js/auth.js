import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  updateProfile,
  setPersistence,
  browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getDoc,
  doc,
  setDoc,
  getDocs,
  collection,
  updateDoc,
  deleteDoc,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { auth, db } from "./config/firebase.js";

const USUARIOS_COLLECTION = "usuarios";
const ADMIN_EMAIL_KEY = "admin_email";

export class AuthManager {
  constructor() {
    this.currentUser = null;
    this.currentUserData = null;
    this.isInitialized = false;
  }

  async initialize() {
    return new Promise((resolve) => {
      onAuthStateChanged(auth, async (user) => {
        this.currentUser = user;
        if (user) {
          try {
            const userDocRef = doc(db, USUARIOS_COLLECTION, user.uid);
            const userDocSnap = await getDoc(userDocRef);
            if (userDocSnap.exists()) {
              this.currentUserData = userDocSnap.data();
            } else {
              this.currentUserData = {
                uid: user.uid,
                email: user.email,
                displayName: user.displayName || "",
                cargo: "operador",
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              };
            }
          } catch (err) {
            console.error("Erro ao carregar dados do usuário:", err);
            this.currentUserData = {
              uid: user.uid,
              email: user.email,
              displayName: user.displayName || ""
            };
          }
        }
        this.isInitialized = true;
        resolve();
      });
    });
  }

  async login(email, password) {
    try {
      await setPersistence(auth, browserSessionPersistence);
      const result = await signInWithEmailAndPassword(auth, email, password);
      return { success: true, user: result.user };
    } catch (error) {
      return {
        success: false,
        error: this._getErrorMessage(error.code)
      };
    }
  }

  async logout() {
    try {
      await firebaseSignOut(auth);
      this.currentUser = null;
      this.currentUserData = null;
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  isAuthenticated() {
    return !!this.currentUser;
  }

  isAdmin() {
    return this.currentUserData?.cargo === "admin";
  }

  getCurrentUser() {
    return this.currentUser;
  }

  getCurrentUserData() {
    return this.currentUserData;
  }

  getUserDisplayName() {
    return this.currentUserData?.displayName || this.currentUser?.email || "";
  }

  async createUser(email, password, displayName, cargo = "operador") {
    try {
      // Detectar automaticamente a URL da API
      // Se está em ambiente de produção (não localhost), usar a mesma origin (Cloudflare Pages)
      // Se está em localhost, usar http://localhost:3000 para desenvolvimento local
      
      let apiBase = window.__API_BASE_URL;
      
      if (!apiBase) {
        if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
          // Desenvolvimento local
          apiBase = "http://localhost:3000";
        } else {
          // Produção (Cloudflare Pages) - usar mesma origem
          apiBase = window.location.origin;
        }
      }

      console.log(`[Auth] Criando usuário via API: ${apiBase}/admin/create-user`);

      const response = await fetch(`${apiBase}/admin/create-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, displayName, cargo })
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        console.error("[Auth] Erro ao criar usuário:", data.error);
        return {
          success: false,
          error: data.error || "Erro ao criar usuário."
        };
      }

      console.log("[Auth] ✅ Usuário criado com sucesso:", data.uid);
      return { success: true, uid: data.uid };
    } catch (error) {
      console.error("[Auth] Erro na requisição:", error);
      return {
        success: false,
        error: `Erro ao conectar à API: ${error.message}`
      };
    }
  }

  async getUsers() {
    try {
      const querySnapshot = await getDocs(collection(db, USUARIOS_COLLECTION));
      return querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error("Erro ao buscar usuários:", error);
      return [];
    }
  }

  async updateUserCargo(userId, cargo) {
    try {
      await updateDoc(doc(db, USUARIOS_COLLECTION, userId), {
        cargo: cargo,
        updatedAt: new Date().toISOString()
      });
      if (this.currentUser?.uid === userId) {
        this.currentUserData.cargo = cargo;
        this.currentUserData.updatedAt = new Date().toISOString();
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async updateUserData(userId, data) {
    try {
      const updateData = {
        ...data,
        updatedAt: new Date().toISOString()
      };
      await updateDoc(doc(db, USUARIOS_COLLECTION, userId), updateData);
      if (this.currentUser?.uid === userId) {
        this.currentUserData = { ...this.currentUserData, ...updateData };
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async deleteUser(userId) {
    try {
      await deleteDoc(doc(db, USUARIOS_COLLECTION, userId));
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async setAdminEmail(email) {
    try {
      const configDoc = doc(db, "config", ADMIN_EMAIL_KEY);
      await setDoc(configDoc, { adminEmail: email }, { merge: true });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async getAdminEmail() {
    try {
      const configDoc = await getDoc(doc(db, "config", ADMIN_EMAIL_KEY));
      if (configDoc.exists()) {
        return configDoc.data().adminEmail;
      }
      return null;
    } catch (error) {
      console.error("Erro ao buscar email de admin:", error);
      return null;
    }
  }

  _getErrorMessage(code) {
    const messages = {
      "auth/email-already-in-use": "Este email já está cadastrado.",
      "auth/weak-password": "Senha muito fraca. Use pelo menos 6 caracteres.",
      "auth/invalid-email": "Email inválido.",
      "auth/user-not-found": "Usuário não encontrado.",
      "auth/wrong-password": "Senha incorreta.",
      "auth/invalid-credential": "Email ou senha incorretos.",
      "auth/user-disabled": "Esta conta foi desativada.",
      "auth/too-many-requests": "Muitas tentativas de login. Tente novamente mais tarde."
    };
    return messages[code] || "Erro na autenticação. Tente novamente.";
  }
}

export const authManager = new AuthManager();
