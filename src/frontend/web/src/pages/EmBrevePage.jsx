import { Link } from "react-router-dom";

/** Placeholder para as telas ainda não migradas (Dashboard e Admin). */
export default function EmBrevePage({ titulo }) {
  return (
    <div className="container">
      <header className="header">
        <div className="brand">
          <h1>{titulo}</h1>
        </div>
        <div className="actions">
          <Link to="/" className="btn btn-tonal">
            Voltar à lista
          </Link>
        </div>
      </header>
      <p className="empty">
        Esta tela ainda não foi migrada para React. Ela entra na próxima etapa da migração.
      </p>
    </div>
  );
}
