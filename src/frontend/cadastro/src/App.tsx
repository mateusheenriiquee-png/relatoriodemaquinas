import { useAuth } from "./auth/AuthContext";
import LoginPage from "./pages/LoginPage";
import NovoSuportePage from "./pages/NovoSuportePage";

/**
 * Duas telas só, escolhidas pela sessão: sem login mostra o login, com login
 * mostra o formulário. A versão anterior fazia isso com redirecionamentos entre
 * login.html e novo-suporte.html via `?next=` — que exigia filtrar o parâmetro
 * contra redirecionamento aberto. Sem URL de destino, esse risco some.
 */
export default function App() {
  const { usuario, carregando } = useAuth();

  if (carregando) {
    return (
      <div className="app-loading" role="status">
        <span className="loading-spinner" aria-hidden="true" />
        Carregando...
      </div>
    );
  }

  return usuario ? <NovoSuportePage /> : <LoginPage />;
}
