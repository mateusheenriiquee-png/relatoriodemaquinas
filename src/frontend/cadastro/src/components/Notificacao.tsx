import { useEffect } from "react";

export type TipoNotificacao = "success" | "error" | "info";

export interface NotificacaoDados {
  mensagem: string;
  tipo: TipoNotificacao;
  /** Em ms. Erro nunca fecha sozinho: precisa ser lido. */
  duracao?: number;
}

const ICONE: Record<TipoNotificacao, string> = { success: "✓", error: "!", info: "i" };
const TITULO: Record<TipoNotificacao, string> = { success: "Pronto", error: "Erro", info: "Aviso" };

interface Props {
  notificacao: NotificacaoDados | null;
  onFechar: () => void;
}

/** Aviso em modal, no mesmo desenho do cadastro anterior. */
export default function Notificacao({ notificacao, onFechar }: Props) {
  useEffect(() => {
    if (!notificacao || notificacao.tipo === "error") return undefined;
    const t = setTimeout(onFechar, notificacao.duracao ?? 2500);
    return () => clearTimeout(t);
  }, [notificacao, onFechar]);

  useEffect(() => {
    if (!notificacao) return undefined;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFechar();
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [notificacao, onFechar]);

  if (!notificacao) return null;
  const { tipo, mensagem } = notificacao;

  return (
    <div
      className="modal"
      role={tipo === "error" ? "alertdialog" : "dialog"}
      aria-modal="true"
      aria-labelledby="notificacao-titulo"
      style={{ zIndex: 1200 }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onFechar();
      }}
    >
      <div className="modal-content modal-confirm">
        <div className="modal-confirm-icon" aria-hidden="true">
          {ICONE[tipo]}
        </div>
        <h2 id="notificacao-titulo">{TITULO[tipo]}</h2>
        <p className="modal-confirm-text" style={{ margin: "8px 0 12px" }}>
          {mensagem}
        </p>
        <div className="modal-confirm-actions">
          <button className="btn btn-ghost" type="button" onClick={onFechar} autoFocus>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
