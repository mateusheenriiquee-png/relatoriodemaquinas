import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  setPersistence,
  browserSessionPersistence
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../config/firebase";

const USUARIOS_COLLECTION = "usuarios";

const CARGO_LEGACY_MAP = {
  operador: "Operador",
  atendente: "Atendente",
  agente: "Atendente",
  supervisor: "Supervisor",
  admin: "Administrador",
  administrador: "Administrador"
};

export function normalizarCargo(cargo = "") {
  if (!cargo) return "Operador";
  return CARGO_LEGACY_MAP[String(cargo).toLowerCase().trim()] || "Operador";
}

const AUTH_ERROR_MESSAGES = {
  "auth/email-already-in-use": "Este email já está cadastrado.",
  "auth/weak-password": "Senha muito fraca. Use pelo menos 6 caracteres.",
  "auth/invalid-email": "Email inválido.",
  "auth/user-not-found": "Usuário não encontrado.",
  "auth/wrong-password": "Senha incorreta.",
  "auth/invalid-credential": "Email ou senha incorretos.",
  "auth/user-disabled": "Esta conta foi desativada.",
  "auth/too-many-requests": "Muitas tentativas de login. Tente novamente mais tarde.",
  "auth/network-request-failed": "Falha de conexão. Verifique sua internet."
};

export function getAuthErrorMessage(code) {
  return AUTH_ERROR_MESSAGES[code] || "Erro na autenticação. Tente novamente.";
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);

      if (!firebaseUser) {
        setUserData(null);
        setLoading(false);
        return;
      }

      const fallback = {
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        displayName: firebaseUser.displayName || "",
        cargo: "Operador"
      };

      try {
        const snap = await getDoc(doc(db, USUARIOS_COLLECTION, firebaseUser.uid));
        if (snap.exists()) {
          const data = snap.data();
          setUserData({ ...data, cargo: normalizarCargo(data.cargo) });
        } else {
          setUserData(fallback);
        }
      } catch (err) {
        console.error("[Auth] Erro ao carregar dados do usuário:", err);
        setUserData(fallback);
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  const value = useMemo(() => {
    const isAdmin = normalizarCargo(userData?.cargo) === "Administrador";
    const displayName = userData?.displayName || user?.email || "";

    return {
      user,
      userData,
      loading,
      isAuthenticated: Boolean(user),
      isAdmin,
      displayName,
      async login(email, password) {
        try {
          await setPersistence(auth, browserSessionPersistence);
          const result = await signInWithEmailAndPassword(auth, email, password);
          return { success: true, user: result.user };
        } catch (error) {
          return { success: false, error: getAuthErrorMessage(error.code) };
        }
      },
      async logout() {
        try {
          await signOut(auth);
          return { success: true };
        } catch (error) {
          return { success: false, error: error.message };
        }
      },
      async getIdToken() {
        if (!auth.currentUser) throw new Error("Usuário não autenticado.");
        return auth.currentUser.getIdToken();
      }
    };
  }, [user, userData, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth precisa estar dentro de <AuthProvider>.");
  return ctx;
}
