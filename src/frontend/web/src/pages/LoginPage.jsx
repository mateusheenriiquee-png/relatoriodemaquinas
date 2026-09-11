import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import Brand from "../components/Brand";
import ThemeToggle from "../components/ThemeToggle";

export default function LoginPage() {
  const { login, isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  const destino = location.state?.from?.pathname || "/";

  useEffect(() => {
    if (!loading && isAuthenticated) {
      navigate(destino, { replace: true });
    }
  }, [loading, isAuthenticated, navigate, destino]);

  async function handleSubmit(e) {
    e.preventDefault();
    setErro("");
    setEnviando(true);

    const resultado = await login(email.trim(), senha);

    if (!resultado.success) {
      setErro(resultado.error);
      setEnviando(false);
      return;
    }

    navigate(destino, { replace: true });
  }

  if (loading) {
    return (
      <div className="app-loading">
        <span className="loading-spinner" />
        Carregando...
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-brand">
          <Brand markOnly />
        </div>

        <div className="login-header">
          <h1>Suporte Técnico</h1>
          <p>Acesso ao painel</p>
        </div>

        {erro ? <div className="login-error">{erro}</div> : null}

        <form className="login-form" onSubmit={handleSubmit}>
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

          <button type="submit" className="login-button" disabled={enviando}>
            {enviando ? (
              <>
                <span className="loading-spinner" />
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

        <div className="login-footer">Versão 1.0 · Suporte Técnico</div>
      </div>
    </div>
  );
}
