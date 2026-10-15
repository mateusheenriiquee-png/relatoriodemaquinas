import { Link, useNavigate } from "react-router-dom";
import Brand from "./Brand";
import ThemeToggle from "./ThemeToggle";
import AvisoToggle from "./AvisoToggle";
import DescartadasBotao from "./DescartadasBotao";
import { useAuth } from "../contexts/AuthContext";
import {
  IconAdmin,
  IconDashboard,
  IconExport,
  IconImport,
  IconPlus,
  IconRefresh
} from "./Icons";

export default function AppHeader({ onNovoSuporte, onAtualizar, onImportar, onExportar, onAbrirChamado }) {
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
        <Link to="/dashboard" className="btn btn-tonal" title="Dashboard">
          <IconDashboard />
          <span className="btn-rotulo">Dashboard</span>
        </Link>

        {isAdmin ? (
          <Link to="/admin" className="btn btn-tonal" title="Admin">
            <IconAdmin />
            <span className="btn-rotulo">Admin</span>
          </Link>
        ) : null}

        <button type="button" className="btn btn-ghost" onClick={onAtualizar} title="Atualizar">
          <IconRefresh />
          <span className="btn-rotulo">Atualizar</span>
        </button>

        <button type="button" className="btn btn-ghost" onClick={onExportar} title="Exportar">
          <IconExport />
          <span className="btn-rotulo">Exportar</span>
        </button>

        {/* Importar pode apagar a base inteira no modo "substituir" — fica com
            quem já tem permissão para excluir registros. */}
        {isAdmin ? (
          <button type="button" className="btn btn-ghost" onClick={onImportar} title="Importar">
            <IconImport />
            <span className="btn-rotulo">Importar</span>
          </button>
        ) : null}

        <button type="button" className="btn btn-primary" onClick={onNovoSuporte}>
          <IconPlus />
          Novo Suporte
        </button>

        <DescartadasBotao onAbrirChamado={onAbrirChamado} />
        <AvisoToggle />
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
