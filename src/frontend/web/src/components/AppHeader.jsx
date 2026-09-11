import { Link, useNavigate } from "react-router-dom";
import Brand from "./Brand";
import ThemeToggle from "./ThemeToggle";
import { useAuth } from "../contexts/AuthContext";
import {
  IconAdmin,
  IconDashboard,
  IconExport,
  IconImport,
  IconPlus,
  IconRefresh
} from "./Icons";

export default function AppHeader({ onNovoSuporte, onAtualizar, onImportar, onExportar }) {
  const { isAdmin, displayName, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <header className="header">
      <Brand subtitulo="Atendimentos" />

      <div className="actions">
        <Link to="/dashboard" className="btn btn-tonal">
          <IconDashboard />
          Dashboard
        </Link>

        {isAdmin ? (
          <Link to="/admin" className="btn btn-tonal">
            <IconAdmin />
            Admin
          </Link>
        ) : null}

        <button type="button" className="btn btn-ghost" onClick={onAtualizar}>
          <IconRefresh />
          Atualizar
        </button>

        <button type="button" className="btn btn-ghost" onClick={onExportar}>
          <IconExport />
          Exportar
        </button>

        {/* Importar pode apagar a base inteira no modo "substituir" — fica com
            quem já tem permissão para excluir registros. */}
        {isAdmin ? (
          <button type="button" className="btn btn-ghost" onClick={onImportar}>
            <IconImport />
            Importar
          </button>
        ) : null}

        <button type="button" className="btn btn-primary" onClick={onNovoSuporte}>
          <IconPlus />
          Novo Suporte
        </button>

        <ThemeToggle />

        <span className="user-info">
          <span>{displayName}</span>
          <button type="button" className="btn btn-ghost btn-small" onClick={handleLogout}>
            Sair
          </button>
        </span>
      </div>
    </header>
  );
}
