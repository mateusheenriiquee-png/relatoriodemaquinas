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

// Mapa de valores legados → valores atuais
const CARGO_LEGACY_MAP = {
  "operador": "Operador",
  "atendente": "Atendente",
  "agente": "Atendente",
  "supervisor": "Supervisor",
  "admin": "Administrador",
  "administrador": "Administrador"
};

// Cargos válidos
const CARGOS_VALIDOS = ["Operador", "Atendente", "Supervisor", "Administrador"];

/**
 * Normalizar cargo para valor padrão
 */
function normalizarCargoFrontend(cargo = "") {
  if (!cargo) return "Operador";
  const lower = String(cargo).toLowerCase().trim();
  return CARGO_LEGACY_MAP[lower] || CARGOS_VALIDOS[0];
}

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
              const userData = userDocSnap.data();
              this.currentUserData = {
                ...userData,
                cargo: normalizarCargoFrontend(userData.cargo)
              };
            } else {
              this.currentUserData = {
                uid: user.uid,
                email: user.email,
                displayName: user.displayName || "",
                cargo: "Operador",
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              };
            }
          } catch (err) {
            console.error("Erro ao carregar dados do usuário:", err);
            this.currentUserData = {
              uid: user.uid,
              email: user.email,
              displayName: user.displayName || "",
              cargo: "Operador"
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
    const cargo = this.currentUserData?.cargo || "";
    return normalizarCargoFrontend(cargo) === "Administrador";
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

  async getIdToken() {
    if (!this.currentUser) {
      console.error("[Auth] ❌ Erro: currentUser não está definido");
      throw new Error("Usuário não autenticado");
    }
    try {
      const token = await this.currentUser.getIdToken();
      console.log(`[Auth] ✅ Firebase ID Token obtido com sucesso`);
      console.log(`[Auth] Token preview: ${token.substring(0, 50)}...`);
      return token;
    } catch (error) {
      console.error("[Auth] ❌ Erro ao obter token:", error.message);
      throw error;
    }
  }

  async createUser(email, password, displayName, cargo = "Operador") {
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

      console.log(`[Auth] === Iniciando Criação de Usuário ===`);
      console.log(`[Auth] API Base: ${apiBase}`);
      console.log(`[Auth] Hostname: ${window.location.hostname}`);
      
      // Obter o token do Firebase para autenticação
      console.log(`[Auth] Obtendo Firebase ID Token...`);
      const token = await this.getIdToken();
      
      console.log(`[Auth] ✅ Token obtido`);
      console.log(`[Auth] Enviando requisição para: ${apiBase}/admin/create-user`);
      console.log(`[Auth] Email: ${email}`);
      console.log(`[Auth] Cargo: ${cargo}`);

      const response = await fetch(`${apiBase}/admin/create-user`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ email, password, displayName, cargo })
      });

      const data = await response.json();

      console.log(`[Auth] Status da resposta: ${response.status}`);
      console.log(`[Auth] Dados da resposta:`, data);

      if (!response.ok || !data.ok) {
        console.error("[Auth] ❌ Erro ao criar usuário:", data.error);
        return {
          success: false,
          error: data.error || "Erro ao criar usuário."
        };
      }

      console.log("[Auth] ✅ Usuário criado com sucesso:", data.uid);
      return { success: true, uid: data.uid };
    } catch (error) {
      console.error("[Auth] ❌ Erro na requisição:", error);
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
        ...doc.data(),
        cargo: normalizarCargoFrontend(doc.data().cargo)
      }));
    } catch (error) {
      console.error("Erro ao buscar usuários:", error);
      return [];
    }
  }

  async updateUserCargo(userId, cargo) {
    try {
      const cargoNormalizado = normalizarCargoFrontend(cargo);
      await updateDoc(doc(db, USUARIOS_COLLECTION, userId), {
        cargo: cargoNormalizado,
        updatedAt: new Date().toISOString()
      });
      if (this.currentUser?.uid === userId) {
        this.currentUserData.cargo = cargoNormalizado;
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
