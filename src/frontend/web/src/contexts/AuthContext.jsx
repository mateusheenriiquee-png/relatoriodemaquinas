import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../config/supabase";

const USUARIOS_TABLE = "usuarios";

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

/** Códigos de erro do Supabase Auth (AuthApiError.code) traduzidos para a tela de login. */
const AUTH_ERROR_MESSAGES = {
  user_already_exists: "Este email já está cadastrado.",
  email_exists: "Este email já está cadastrado.",
  weak_password: "Senha muito fraca. Use pelo menos 6 caracteres.",
  validation_failed: "Email inválido.",
  user_not_found: "Usuário não encontrado.",
  invalid_credentials: "Email ou senha incorretos.",
  email_not_confirmed: "Email ainda não confirmado.",
  user_banned: "Esta conta foi desativada.",
  over_request_rate_limit: "Muitas tentativas de login. Tente novamente mais tarde.",
  over_email_send_rate_limit: "Muitas tentativas de login. Tente novamente mais tarde.",
  network_error: "Falha de conexão. Verifique sua internet."
};

export function getAuthErrorMessage(code) {
  return AUTH_ERROR_MESSAGES[code] || "Erro na autenticação. Tente novamente.";
}

/** Linha de `public.usuarios` -> o objeto que o painel sempre usou (userData). */
function paraUserData(linha, fallback) {
  if (!linha) return fallback;
  return {
    uid: linha.id,
    email: linha.email,
    displayName: linha.display_name || "",
    cargo: normalizarCargo(linha.cargo),
    status: linha.status || "ativo"
  };
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);

  // 1) A sessão. O callback NÃO faz chamadas ao Supabase: o cliente segura um
  // lock durante ele, e uma consulta aqui dentro trava o login (armadilha
  // documentada do supabase-js). O perfil é carregado no efeito abaixo.
  useEffect(() => {
    let vivo = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!vivo) return;
      const usuario = data.session?.user || null;
      setUser(usuario ? { ...usuario, uid: usuario.id } : null);
      if (!usuario) setLoading(false);
    });

    const { data: assinatura } = supabase.auth.onAuthStateChange((_evento, sessao) => {
      const usuario = sessao?.user || null;
      setUser((atual) => {
        if (!usuario) return null;
        // TOKEN_REFRESHED chega a cada hora com o mesmo usuário: manter a
        // referência evita recarregar o perfil e re-renderizar o painel todo.
        return atual?.id === usuario.id ? atual : { ...usuario, uid: usuario.id };
      });
      if (!usuario) {
        setUserData(null);
        setLoading(false);
      }
    });

    return () => {
      vivo = false;
      assinatura.subscription.unsubscribe();
    };
  }, []);

  // 2) O perfil (cargo, nome) — quem manda no acesso é a RLS, isto é só exibição.
  useEffect(() => {
    if (!user) return undefined;
    let vivo = true;

    const fallback = {
      uid: user.id,
      email: user.email,
      displayName: user.user_metadata?.display_name || "",
      cargo: "Operador"
    };

    supabase
      .from(USUARIOS_TABLE)
      .select("id, email, display_name, cargo, status")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!vivo) return;
        if (error) console.error("[Auth] Erro ao carregar dados do usuário:", error);
        setUserData(paraUserData(error ? null : data, fallback));
        setLoading(false);
      });

    return () => {
      vivo = false;
    };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          return { success: false, error: getAuthErrorMessage(error.code) };
        }
        return { success: true, user: data.user };
      },
      async logout() {
        const { error } = await supabase.auth.signOut();
        return error ? { success: false, error: error.message } : { success: true };
      },
      /** JWT da sessão — o Worker o valida no Supabase Auth. O cliente o renova sozinho. */
      async getIdToken() {
        const { data } = await supabase.auth.getSession();
        if (!data.session) throw new Error("Usuário não autenticado.");
        return data.session.access_token;
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
