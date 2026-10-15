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
  IconExternalLink,
  IconInfo,
  IconNotes,
  IconReturn,
  IconTrash,
  IconWhatsApp
} from "./Icons";
import { buscarLeadDeVendas } from "../services/suportesService";
import { chamadoParado } from "../utils/chamadoParado";
import {
  buildWhatsAppPhone,
  formatDate,
  getWhatsAppMessageForType,
  mensagemPrimeiroContato,
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

/** "2026-09-23" -> "23/09/2026", sem passar por Date (que puxaria para o dia anterior no UTC-3). */
function formatarDia(dia) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dia || "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "-";
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
  const { isAdmin, displayName, getIdToken } = useAuth();
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

  // Lead do cliente no "01 - Funil de vendas". O id gravado no chamado é o do
  // lead em que a conversa estava, que pode ser de outro funil (cobranças,
  // pós-venda...). Resolvido ao abrir o painel, para o botão já estar pronto.
  const [leadVendas, setLeadVendas] = useState(null);
  const kommoLeadId = item?.kommoLeadId;
  useEffect(() => {
    setLeadVendas(null);
    if (!open || !kommoLeadId || !getIdToken) return undefined;
    let ativo = true;
    buscarLeadDeVendas(item, { getIdToken }).then((id) => {
      if (ativo) setLeadVendas(id);
    });
    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item?.id, kommoLeadId, getIdToken]);

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

  // Conta específica deste projeto — não tem como descobrir isso por conta
  // própria (não é dado que venha em nenhum campo do chamado).
  const KOMMO_SUBDOMINIO = "certifybrasil.kommo.com";

  /**
   * Abre o lead direto no Kommo, na aba de conversa — confirmado com o
   * usuário que `/leads/detail/{id}` já cai ali, sem precisar do prefixo
   * `/chats/{algo}/` que aparece quando se navega pela lista de conversas.
   *
   * Ao contrário do WhatsApp, o Kommo não tem um jeito de pré-preencher o
   * texto da mensagem por URL — o técnico digita na hora, manualmente.
   */
  async function abrirNoKommo() {
    const url = (id) => `https://${KOMMO_SUBDOMINIO}/leads/detail/${id}`;
    if (leadVendas) {
      window.open(url(leadVendas), "_blank");
      return;
    }
    // Clicou antes de o lead de vendas chegar: abre a aba já (o navegador só
    // permite no clique) e aponta para o lead certo quando a resposta vier.
    const aba = window.open("about:blank", "_blank");
    const id = (await buscarLeadDeVendas(item, { getIdToken })) || item.kommoLeadId;
    if (aba) aba.location.href = url(id);
    else window.open(url(id), "_blank");
  }

  /**
   * Chama o cliente no WhatsApp com a primeira mensagem pronta (saudação pelo
   * horário). Usa o link wa.me: abre o aplicativo do WhatsApp quando está
   * instalado e, senão, o WhatsApp Web. Só abre a conversa — quem envia é o
   * técnico.
   */
  function chamarNoWhatsApp() {
    const phone = buildWhatsAppPhone(item.contato);
    if (!phone) {
      toast.error("Número inválido para WhatsApp.");
      return;
    }
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(mensagemPrimeiroContato(displayName))}`, "_blank");
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
  const parado = chamadoParado(item);
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
          {/* Aberto como possível duplicado (09/10): o sistema não juntou com o
              outro chamado porque é outro contato no Kommo — o técnico decide. */}
          {item.possivelDuplicadoDe ? (
            <div className="drawer-aviso" role="note">
              <span>
                <strong>Possível duplicado.</strong> Há outro chamado aberto com o mesmo telefone, documento ou
                protocolo, mas de outro contato no Kommo.
              </span>
              <div className="drawer-aviso-acoes">
                <button type="button" className="btn btn-tonal btn-small" onClick={() => actions.onAbrirDuplicado(item.possivelDuplicadoDe)}>
                  Abrir o outro chamado
                </button>
                <button type="button" className="btn btn-ghost btn-small" onClick={() => actions.onNaoEDuplicado(item)}>
                  Não é o mesmo cliente
                </button>
              </div>
            </div>
          ) : null}

          {parado?.nivel === "sem-retorno" ? (
            <div className="drawer-aviso drawer-aviso-sem-retorno" role="note">
              <span>
                <strong>Sem mensagem do cliente</strong> — {parado.texto.replace("parado ", "")}. Marcar como sem retorno?
              </span>
              <div className="drawer-aviso-acoes">
                <button type="button" className="btn btn-ghost btn-small" onClick={() => actions.onSemRetorno(item)}>
                  Marcar sem retorno
                </button>
              </div>
            </div>
          ) : null}

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
              {item.contato || "-"} {item.contato ? <CopyBtn value={item.contato} /> : null}{" "}
              {/* Com lead no Kommo, abre a conversa lá (sem mensagem pronta — o
                  Kommo não tem esse recurso). Sem lead vinculado, cai no
                  WhatsApp de sempre, que já escreve a mensagem pronta. */}
              {item.kommoLeadId ? (
                <>
                  <button
                    type="button"
                    className="btn btn-ghost btn-small"
                    title="Abrir conversa no Kommo"
                    onClick={abrirNoKommo}
                  >
                    <IconExternalLink size={14} />
                  </button>
                  {item.contato ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-small"
                      title="Chamar no WhatsApp (mensagem pronta)"
                      aria-label="Chamar no WhatsApp com mensagem pronta"
                      onClick={chamarNoWhatsApp}
                    >
                      <IconWhatsApp size={14} />
                    </button>
                  ) : null}
                </>
              ) : item.contato ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-small"
                  title="Abrir no WhatsApp"
                  onClick={abrirWhatsApp}
                >
                  <IconWhatsApp size={14} />
                </button>
              ) : null}
            </Field>
          </div>

          <div className="drawer-section">
            <h4 className="drawer-section-title">Atendimento</h4>
            <Field label="Tipo">{item.tipo || "-"}</Field>
            <Field label="AC">{item.ac || "-"}</Field>
            {item.descricao ? <Field label="Descrição">{item.descricao}</Field> : null}
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

          {/* Dados preenchidos ao finalizar. Chamados antigos (ou finalizados
              antes desta tela existir) não têm nada disso — a seção some. */}
          {item.emailCliente || item.protocoloCertificado || item.tipoCertificado ? (
            <div className="drawer-section">
              <h4 className="drawer-section-title">Finalização</h4>
              <Field label="Email">{item.emailCliente || "-"}</Field>
              <Field label="Comprou outro produto">
                {item.comprouOutroProduto === true ? "Sim" : item.comprouOutroProduto === false ? "Não" : "-"}
              </Field>
              <Field label="Protocolo do certificado">{item.protocoloCertificado || "-"}</Field>
              <Field label="CPF">{item.cpf || "-"}</Field>
              <Field label="Tipo de certificado">{item.tipoCertificado || "-"}</Field>
              <Field label="Emissão / vencimento">
                {formatarDia(item.dataEmissao)} → {formatarDia(item.dataVencimento)}
              </Field>
              <Field label="Valor">
                {item.valorVenda
                  ? item.valorVenda.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                  : "-"}
              </Field>
              <Field label="Valor V.E">
                {typeof item.valorVE === "number"
                  ? item.valorVE.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                  : "-"}
              </Field>
              <Field label="Validade estendida">{item.validadeEstendida || "-"}</Field>
              <Field label="Sistema">{item.sistema || "-"}</Field>
            </div>
          ) : null}

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
