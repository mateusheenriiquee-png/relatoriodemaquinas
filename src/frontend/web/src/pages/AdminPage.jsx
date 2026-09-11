import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Brand from "../components/Brand";
import ThemeToggle from "../components/ThemeToggle";
import { IconDashboard, IconSupport } from "../components/Icons";
import ConfirmModal from "../components/modals/ConfirmModal";
import { useToast } from "../components/ToastProvider";
import { useAuth } from "../contexts/AuthContext";
import {
  alterarCargo,
  CARGOS,
  criarUsuario,
  excluirUsuario,
  lerEmailAdmin,
  salvarEmailAdmin,
  subscribeUsuarios
} from "../services/adminService";

const ABAS = [
  { id: "usuarios", label: "Usuários" },
  { id: "novo", label: "Novo usuário" },
  { id: "config", label: "Configurações" }
];

const FORM_VAZIO = { email: "", password: "", displayName: "", cargo: "Operador" };

function formatarData(valor) {
  if (!valor) return "-";
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleDateString("pt-BR");
}

/**
 * Painel de administrador — substitui admin.html + js/pages/admin-panel.js.
 *
 * A lista vem do Firestore em tempo real; criar, alterar cargo e excluir vão
 * pela API do Worker, que é quem tem privilégio de Admin SDK.
 */
export default function AdminPage() {
  const toast = useToast();
  const { displayName, getIdToken, logout } = useAuth();
  const navigate = useNavigate();

  const [aba, setAba] = useState("usuarios");
  const [usuarios, setUsuarios] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [form, setForm] = useState(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [emailAdmin, setEmailAdmin] = useState("");
  const [confirmacao, setConfirmacao] = useState(null);

  useEffect(() => {
    const unsubscribe = subscribeUsuarios(
      (lista) => {
        setUsuarios(lista);
        setCarregando(false);
      },
      (error) => {
        toast.error(error?.message || "Erro ao carregar usuários.");
        setCarregando(false);
      }
    );
    return unsubscribe;
  }, [toast]);

  useEffect(() => {
    lerEmailAdmin()
      .then(setEmailAdmin)
      .catch((error) => console.warn("[Admin] Falha ao ler config:", error));
  }, []);

  const executar = useCallback(
    async (acao, mensagem) => {
      setSalvando(true);
      try {
        await acao();
        if (mensagem) toast.success(mensagem);
        return true;
      } catch (error) {
        toast.error(error?.message || "Não foi possível concluir a operação.");
        return false;
      } finally {
        setSalvando(false);
      }
    },
    [toast]
  );

  async function handleCriar(e) {
    e.preventDefault();
    if (!form.email.trim() || !form.password || !form.displayName.trim()) {
      toast.error("Preencha email, senha e nome.");
      return;
    }
    if (form.password.length < 6) {
      toast.error("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }

    const ok = await executar(
      () => criarUsuario(form, { getIdToken }),
      `Usuário ${form.email} criado.`
    );
    if (ok) {
      setForm(FORM_VAZIO);
      setAba("usuarios");
    }
  }

  function handleCargo(usuario, cargo) {
    if (cargo === usuario.cargo) return;
    executar(
      () => alterarCargo(usuario.uid, cargo, { getIdToken }),
      `Cargo de ${usuario.displayName || usuario.email} alterado para ${cargo}.`
    );
  }

  return (
    <div className="container">
      <header className="header">
        <Brand subtitulo="Painel de administrador" />
        <div className="actions">
          <Link className="btn btn-tonal" to="/">
            <IconSupport />
            Suportes
          </Link>
          <Link className="btn btn-tonal" to="/dashboard">
            <IconDashboard />
            Dashboard
          </Link>

          <ThemeToggle />

          <span className="user-info">
            <span>{displayName}</span>
            <button
              type="button"
              className="btn btn-ghost btn-small"
              onClick={async () => {
                await logout();
                navigate("/login", { replace: true });
              }}
            >
              Sair
            </button>
          </span>
        </div>
      </header>

      <nav className="admin-tabs" role="tablist">
        {ABAS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={aba === item.id}
            className={`admin-tab ${aba === item.id ? "active" : ""}`}
            onClick={() => setAba(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {aba === "usuarios" ? (
        <section className="admin-section">
          {carregando ? (
            <div className="infinite-loader">Carregando usuários...</div>
          ) : usuarios.length === 0 ? (
            <div className="empty">Nenhum usuário cadastrado.</div>
          ) : (
            <div className="tabela-wrapper">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Nome</th>
                    <th>Cargo</th>
                    <th>Criado em</th>
                    <th aria-label="Ações" />
                  </tr>
                </thead>
                <tbody>
                  {usuarios.map((usuario) => (
                    <tr key={usuario.id}>
                      <td>{usuario.email || "-"}</td>
                      <td>{usuario.displayName || "-"}</td>
                      <td>
                        <select
                          className="cargo-select"
                          value={usuario.cargo}
                          disabled={salvando}
                          onChange={(e) => handleCargo(usuario, e.target.value)}
                          aria-label={`Cargo de ${usuario.displayName || usuario.email}`}
                        >
                          {CARGOS.map((cargo) => (
                            <option key={cargo} value={cargo}>
                              {cargo}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>{formatarData(usuario.criadoEm)}</td>
                      <td className="tabela-acoes">
                        <button
                          type="button"
                          className="btn btn-ghost btn-small"
                          disabled={salvando}
                          onClick={() => setConfirmacao(usuario)}
                        >
                          Excluir
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {aba === "novo" ? (
        <section className="admin-section">
          <form className="admin-form" onSubmit={handleCriar}>
            <div className="admin-form-grid">
              <div className="field">
                <label htmlFor="novoEmail">Email</label>
                <input
                  id="novoEmail"
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="novaSenha">Senha</label>
                <input
                  id="novaSenha"
                  type="password"
                  required
                  minLength={6}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="novoNome">Nome completo</label>
                <input
                  id="novoNome"
                  type="text"
                  required
                  value={form.displayName}
                  onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="novoCargo">Cargo</label>
                <select
                  id="novoCargo"
                  value={form.cargo}
                  onChange={(e) => setForm({ ...form, cargo: e.target.value })}
                >
                  {CARGOS.map((cargo) => (
                    <option key={cargo} value={cargo}>
                      {cargo}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button type="submit" className="btn btn-primary" disabled={salvando}>
              {salvando ? "Criando..." : "Criar usuário"}
            </button>
          </form>
        </section>
      ) : null}

      {aba === "config" ? (
        <section className="admin-section">
          <div className="admin-form">
            <div className="field">
              <label htmlFor="emailAdmin">Email do administrador principal</label>
              <input
                id="emailAdmin"
                type="email"
                placeholder="admin@exemplo.com"
                value={emailAdmin}
                onChange={(e) => setEmailAdmin(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="btn btn-primary"
              disabled={salvando}
              onClick={() => {
                if (!emailAdmin.trim()) {
                  toast.error("Informe um email válido.");
                  return;
                }
                executar(
                  () => salvarEmailAdmin(emailAdmin.trim()),
                  "Email de administrador salvo."
                );
              }}
            >
              Salvar
            </button>
          </div>
        </section>
      ) : null}

      <ConfirmModal
        open={Boolean(confirmacao)}
        title="Excluir usuário?"
        text="A conta de login e o perfil serão removidos. Esta ação não pode ser desfeita."
        details={confirmacao ? `${confirmacao.displayName || "—"} · ${confirmacao.email}` : ""}
        confirmLabel="Excluir"
        onClose={() => setConfirmacao(null)}
        onConfirm={async () => {
          const alvo = confirmacao;
          const ok = await executar(
            () => excluirUsuario(alvo.uid, alvo.email, { getIdToken }),
            `Usuário ${alvo.email} excluído.`
          );
          if (ok) setConfirmacao(null);
        }}
      />
    </div>
  );
}
