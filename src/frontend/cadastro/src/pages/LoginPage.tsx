import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";
import Brand from "../components/Brand";
import ThemeToggle from "../components/ThemeToggle";

export default function LoginPage() {
  const { entrar } = useAuth();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [entrando, setEntrando] = useState(false);

  // O erro some sozinho em 4s, como antes.
  useEffect(() => {
    if (!erro) return undefined;
    const t = setTimeout(() => setErro(""), 4000);
    return () => clearTimeout(t);
  }, [erro]);

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !senha) {
      setErro("Por favor, preencha todos os campos.");
      return;
    }

    setEntrando(true);
    const resultado = await entrar(email.trim(), senha);
    // No sucesso não há nada a fazer aqui: o AuthProvider percebe o login e o
    // App troca para o formulário. Desligar o "entrando" só no erro evita o
    // botão piscar "Entrar" durante a troca de tela.
    if (!resultado.ok) {
      setErro(resultado.erro);
      setEntrando(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-brand">
          <Brand markOnly />
        </div>

        <div className="login-header">
          <h1>Suporte Técnico</h1>
          <p>Cadastro de suporte</p>
        </div>

        {erro ? (
          <div className="login-error" role="alert">
            {erro}
          </div>
        ) : null}

        <form className="login-form" onSubmit={aoEnviar} noValidate>
          <div className="form-group">
            <label htmlFor="loginEmail">Email</label>
            <input
              id="loginEmail"
              type="email"
              placeholder="seu.email@example.com"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="loginPassword">Senha</label>
            <input
              id="loginPassword"
              type="password"
              placeholder="••••••••"
              autoComplete="current-password"
              required
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
            />
          </div>

          <button type="submit" className="login-button" disabled={entrando}>
            {entrando ? (
              <>
                <span className="loading-spinner" aria-hidden="true" />
                Entrando...
              </>
            ) : (
              "Entrar"
            )}
          </button>
        </form>

        <div className="login-theme-toggle">
          <ThemeToggle />
        </div>

        <div className="login-footer">Versão 2.0 · Suporte Técnico</div>
      </div>
    </div>
  );
}
