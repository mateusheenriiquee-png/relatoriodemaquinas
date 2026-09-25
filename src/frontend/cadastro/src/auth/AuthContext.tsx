import type { User } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "../config/supabase";

interface Sessao {
  usuario: User | null;
  /** Como o nome sai no "Responsável da abertura". */
  nome: string;
  carregando: boolean;
  entrar: (email: string, senha: string) => Promise<{ ok: true } | { ok: false; erro: string }>;
  sair: () => Promise<void>;
}

const AuthContext = createContext<Sessao | null>(null);

/** Códigos do Supabase Auth (AuthApiError.code) traduzidos para a tela de login. */
const MENSAGENS: Record<string, string> = {
  validation_failed: "Email inválido.",
  user_not_found: "Usuário não encontrado.",
  invalid_credentials: "Email ou senha incorretos.",
  user_banned: "Esta conta foi desativada.",
  over_request_rate_limit: "Muitas tentativas de login. Tente novamente mais tarde."
};

function mensagemDeErro(erro: unknown): string {
  const codigo = typeof erro === "object" && erro && "code" in erro ? String(erro.code) : "";
  return MENSAGENS[codigo] || "Erro na autenticação. Tente novamente.";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<User | null>(null);
  const [nomePerfil, setNomePerfil] = useState("");
  const [carregando, setCarregando] = useState(true);

  // 1) A sessão. O callback não faz chamadas ao Supabase (o cliente segura um
  // lock durante ele e uma consulta aqui dentro trava o login): o perfil é
  // lido no efeito seguinte.
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setUsuario(data.session?.user ?? null);
      if (!data.session) setCarregando(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_evento, sessao) => {
      const novo = sessao?.user ?? null;
      // O refresh do token chega com o mesmo usuário: manter a referência
      // evita reler o perfil e re-renderizar o formulário à toa.
      setUsuario((atual) => (atual?.id === novo?.id ? atual : novo));
      if (!novo) {
        setNomePerfil("");
        setCarregando(false);
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  // 2) O nome do cadastro em `usuarios` é o mesmo que o painel exibe; sem ele
  // (perfil ausente ou leitura negada), o email serve de nome.
  useEffect(() => {
    if (!usuario) return undefined;
    let vivo = true;
    void supabase
      .from("usuarios")
      .select("display_name")
      .eq("id", usuario.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!vivo) return;
        if (error) console.error("[Cadastro] Não foi possível ler o perfil do usuário:", error);
        setNomePerfil(String(data?.display_name || "").trim());
        setCarregando(false);
      });
    return () => {
      vivo = false;
    };
  }, [usuario]);

  const valor = useMemo<Sessao>(
    () => ({
      usuario,
      nome: nomePerfil || usuario?.email || "",
      carregando,
      async entrar(email, senha) {
        const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
        return error ? { ok: false, erro: mensagemDeErro(error) } : { ok: true };
      },
      async sair() {
        await supabase.auth.signOut();
      }
    }),
    [usuario, nomePerfil, carregando]
  );

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}

export function useAuth(): Sessao {
  const sessao = useContext(AuthContext);
  if (!sessao) throw new Error("useAuth precisa estar dentro de <AuthProvider>.");
  return sessao;
}
