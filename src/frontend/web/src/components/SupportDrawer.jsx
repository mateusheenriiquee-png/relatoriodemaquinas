import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "./ToastProvider";
import FollowupBox from "./FollowupBox";
import HistoricoLista from "./HistoricoLista";
import {
  IconAssign,
  IconChangeTech,
  IconCheck,
  IconClock,
  IconClose,
  IconCopy,
  IconEdit,
  IconInfo,
  IconNotes,
  IconReturn,
  IconTrash,
  IconWhatsApp
} from "./Icons";
import {
  buildWhatsAppPhone,
  formatDate,
  getWhatsAppMessageForType,
  statusClass
} from "../utils/format";

/** Fora da média sem ninguém ter pedido: o 3º follow-up marca automaticamente. */
function automaticamenteForaDaMedia(item) {
  return (
    Boolean(item.foraDaMedia) ||
    (Array.isArray(item.followups) && item.followups.length >= 3) ||
    Number(item.followupsImportados) >= 3
  );
}

function Field({ label, children }) {
  return (
    <div className="drawer-field">
      <label>{label}</label>
      <div className="val">{children}</div>
    </div>
  );
}

function ActionButton({ className, title, onClick, carregando, children }) {
  return (
    <button
      type="button"
      className={`btn btn-icon ${className}`}
      title={title}
      aria-label={title}
      aria-busy={carregando || undefined}
      disabled={carregando}
      onClick={onClick}
    >
      {carregando ? <span className="loading-spinner loading-spinner-btn" /> : children}
    </button>
  );
}

export default function SupportDrawer({ item, open, onClose, actions }) {
  const { isAdmin, displayName } = useAuth();
  const toast = useToast();
  const [visible, setVisible] = useState(false);
  // Nome da ação que acabou de ser clicada, só para o botão mostrar um
  // spinner por meio segundo. A gravação em si é otimista (o Firestore já
  // atualiza a tela antes de confirmar com o servidor — ver `executar` em
  // SuportesPage.jsx); isto aqui é só para o dedo não conseguir clicar duas
  // vezes no instante entre o clique e a tela reagir.
  const [acaoEmCurso, setAcaoEmCurso] = useState(null);

  // Item novo ou painel fechado: nenhuma ação daquele clique ainda vale.
  useEffect(() => {
    setAcaoEmCurso(null);
  }, [item?.id, open]);

  useEffect(() => {
    if (!open) {
      setVisible(false);
      return undefined;
    }

    // Trava a rolagem da página atrás do painel e fecha no Esc.
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKeyDown);

    const id = requestAnimationFrame(() => setVisible(true));

    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflowAnterior;
    };
  }, [open, onClose]);

  if (!open || !item) return null;

  async function copiar(valor) {
    try {
      await navigator.clipboard.writeText(valor);
      toast.success("Copiado para a área de transferência.", 1800);
    } catch {
      toast.error("Falha ao copiar.");
    }
  }

  function abrirWhatsApp() {
    const phone = buildWhatsAppPhone(item.contato);
    if (!phone) {
      toast.error("Número inválido para WhatsApp.");
      return;
    }
    const mensagem = getWhatsAppMessageForType(
      displayName,
      item.tipo || "Suporte",
      item.protocolo || "N/A"
    );
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(mensagem)}`, "_blank");
  }

  /** Marca o botão ocupado, dispara a ação e libera sozinho em meio segundo. */
  function disparar(nome, fn) {
    setAcaoEmCurso(nome);
    fn();
    setTimeout(() => setAcaoEmCurso((atual) => (atual === nome ? null : atual)), 600);
  }

  const encerrado = item.status === "FINALIZADO" || item.status === "SEM RETORNO";
  const podeVerInfo = item.statusAbertura !== "INDEVIDO" || isAdmin;

  const CopyBtn = ({ value }) => (
    <button
      type="button"
      className="btn btn-ghost btn-small"
      title="Copiar"
      onClick={() => copiar(value)}
    >
      <IconCopy size={14} />
    </button>
  );

  /*
   * Portal no <body>. `position: fixed` se ancora no ancestral mais próximo com
   * transform/filter/animação de transform, e não na janela — como o drawer
   * ficava dentro de `.container` (animado na entrada), o fundo escuro e o
   * painel eram recortados no tamanho do container, aparecendo como faixas
   * claras nas bordas da tela. No <body> não há ancestral nenhum para conter.
   */
  return createPortal(
    <>
      <div
        className={`drawer-backdrop ${visible ? "visible" : ""}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside className={`support-drawer ${visible ? "visible" : ""}`}>
        <div className="drawer-header">
          <h3>Detalhes do suporte</h3>
          <button type="button" className="btn btn-ghost btn-small" onClick={onClose}>
            Fechar
          </button>
        </div>

        <div className="drawer-body">
          <div className="drawer-section">
            <h4 className="drawer-section-title">Identificação</h4>
            <Field label="Protocolo">
              {item.protocolo || "-"} {item.protocolo ? <CopyBtn value={item.protocolo} /> : null}
            </Field>
            <Field label="Data/Hora">{formatDate(item.dataAbertura)}</Field>
          </div>

          <div className="drawer-section">
            <h4 className="drawer-section-title">Contato</h4>
            {item.nomeCliente ? <Field label="Nome do cliente">{item.nomeCliente}</Field> : null}
            <Field label="Responsável pela abertura">{item.responsavelAbertura || "-"}</Field>
            <Field label="CPF/CNPJ">
              {item.cpfCnpj || "-"} {item.cpfCnpj ? <CopyBtn value={item.cpfCnpj} /> : null}
            </Field>
            <Field label="Contato">
              {item.contato || "-"}{" "}
              {item.contato ? (
                <>
                  <CopyBtn value={item.contato} />{" "}
                  <button
                    type="button"
                    className="btn btn-ghost btn-small"
                    title="Abrir no WhatsApp"
                    onClick={abrirWhatsApp}
                  >
                    <IconWhatsApp size={14} />
                  </button>
                </>
              ) : null}
            </Field>
          </div>

          <div className="drawer-section">
            <h4 className="drawer-section-title">Atendimento</h4>
            <Field label="Tipo">{item.tipo || "-"}</Field>
            <Field label="AC">{item.ac || "-"}</Field>
            <Field label="Sit. Atendimento">
              <span className={`status-pill ${statusClass(item.status)}`}>{item.status}</span>
            </Field>
            <Field label="Status da abertura">
              {item.statusAbertura || "-"}{" "}
              {podeVerInfo ? (
                <ActionButton
                  className="btn-icon-flag"
                  title="Marcar como indevido"
                  onClick={() => actions.onIndevido(item)}
                >
                  <IconInfo />
                </ActionButton>
              ) : null}
            </Field>
            {item.status === "REAGENDADO" && item.dataReagendamento ? (
              <Field label="Reagendado para">{formatDate(item.dataReagendamento)}</Field>
            ) : null}
            {item.status === "SEM RETORNO" && item.motivo ? (
              <Field label="Motivo">{item.motivo}</Field>
            ) : null}
          </div>

          <div className="drawer-section">
            <h4 className="drawer-section-title">Classificação</h4>
            <Field label="Motivo do chamado">
              {item.motivoCat || "Não classificado"}
              {item.motivoDetalhe ? <span className="drawer-detalhe"> · {item.motivoDetalhe}</span> : null}
            </Field>
            <Field label="Motivo da utilização">{item.usoCat || "Não informado"}</Field>
            {item.usoPlat ? <Field label="Plataforma">{item.usoPlat}</Field> : null}

            {/* A exclusão da média é o que separa "atendimento demorado" de
                "cliente que sumiu". Fica visível aqui, com a justificativa, para
                que a decisão possa ser revista por quem olhar o chamado depois. */}
            <Field label="Média de tempo">
              {item.excluirDaMedia ? (
                <span className="fora-media-tag">Fora da média</span>
              ) : automaticamenteForaDaMedia(item) ? (
                <span className="fora-media-tag">Fora da média (3 follow-ups)</span>
              ) : (
                "Conta na média"
              )}{" "}
              <button
                type="button"
                className="btn btn-ghost btn-small"
                disabled={acaoEmCurso === "fora-media"}
                onClick={() => disparar("fora-media", () => actions.onForaDaMedia(item))}
              >
                {acaoEmCurso === "fora-media" ? (
                  <span className="loading-spinner loading-spinner-btn" />
                ) : item.excluirDaMedia ? (
                  "Devolver à média"
                ) : (
                  "Excluir da média"
                )}
              </button>
            </Field>
            {item.excluirDaMedia && item.justificativaMedia ? (
              <Field label="Justificativa">{item.justificativaMedia}</Field>
            ) : null}
          </div>

          <div className="drawer-section">
            <h4 className="drawer-section-title">Técnico</h4>
            <Field label="Técnico">
              {item.tecnico || "-"}{" "}
              {isAdmin ? (
                <ActionButton
                  className="btn-icon-tech"
                  title="Alterar técnico"
                  onClick={() => actions.onAlterarTecnico(item)}
                >
                  <IconChangeTech />
                </ActionButton>
              ) : null}
            </Field>
          </div>

          <div className="drawer-section">
            <h4 className="drawer-section-title">Comentários / Anotações</h4>
            <div className="drawer-field">
              <div className={`val ${item.anotacoes ? "" : "empty"}`}>
                {item.anotacoes || "Sem anotações"}
              </div>
            </div>
          </div>

          {/* Chamado importado: a planilha traz quantas tentativas houve, mas não
              quando cada uma foi. Mostrar o número é honesto; montar a linha do
              tempo com horários inventados não seria. */}
          {!item.followups?.length && Number(item.followupsImportados) > 0 ? (
            <div className="drawer-section">
              <h4 className="drawer-section-title">Follow-up</h4>
              <Field label="Tentativas de contato">
                {item.followupsImportados}{" "}
                <span className="drawer-detalhe">· importado, sem horários</span>
              </Field>
            </div>
          ) : null}

          {/* Follow-up só faz sentido enquanto o chamado está vivo — em um
              finalizado, o bloco viraria um botão que ninguém deve apertar. */}
          {!encerrado ? (
            <div className="drawer-section">
              <FollowupBox item={item} onRegistrar={actions.onFollowup} />
            </div>
          ) : null}

          <div className="drawer-section">
            <h4 className="drawer-section-title">Histórico</h4>
            <HistoricoLista
              entradas={item.historico}
              vazioTexto="Sem histórico registrado para este chamado."
            />
          </div>
        </div>

        <div className="drawer-actions">
          <div className="drawer-actions-row">
            {isAdmin ? (
              <ActionButton
                className="btn-icon-edit"
                title="Editar"
                onClick={() => actions.onEditar(item)}
              >
                <IconEdit />
              </ActionButton>
            ) : null}

            <ActionButton
              title="Anotações"
              className="btn-icon-notes"
              onClick={() => actions.onNotas(item)}
            >
              <IconNotes />
            </ActionButton>

            <ActionButton
              className="btn-icon-assign"
              title="Associar técnico"
              carregando={acaoEmCurso === "associar"}
              onClick={() => disparar("associar", () => actions.onAssociar(item))}
            >
              <IconAssign />
            </ActionButton>

            <ActionButton
              className="btn-icon-novo"
              title="Novo chamado para este cliente"
              onClick={() => actions.onNovoParaCliente(item)}
            >
              <IconCopy size={16} />
            </ActionButton>

            {!encerrado ? (
              <ActionButton
                className="btn-icon-done"
                title="Concluir suporte"
                onClick={() => actions.onConcluir(item)}
              >
                <IconCheck />
              </ActionButton>
            ) : null}

            {!encerrado ? (
              <ActionButton
                className="btn-icon-schedule"
                title="Reagendar suporte"
                onClick={() => actions.onReagendar(item)}
              >
                <IconClock />
              </ActionButton>
            ) : null}

            {item.status === "EM ANDAMENTO" ? (
              <ActionButton
                className="btn-icon-noreturn"
                title="Marcar como sem retorno"
                onClick={() => actions.onSemRetorno(item)}
              >
                <IconClose />
              </ActionButton>
            ) : null}

            {item.status !== "EM ABERTO" && !encerrado ? (
              <ActionButton
                className="btn-icon-reopen"
                title="Voltar para em aberto"
                carregando={acaoEmCurso === "voltar-aberto"}
                onClick={() => disparar("voltar-aberto", () => actions.onVoltarEmAberto(item))}
              >
                <IconReturn />
              </ActionButton>
            ) : null}

            {isAdmin ? (
              <ActionButton
                className="btn-icon-delete"
                title="Excluir suporte"
                onClick={() => actions.onExcluir(item)}
              >
                <IconTrash />
              </ActionButton>
            ) : null}
          </div>
        </div>
      </aside>
    </>,
    document.body
  );
}
