import { useEffect } from "react";
import { createPortal } from "react-dom";

/**
 * Modal genérico — reaproveita as classes .modal / .modal-content do main.css.
 * variant: "default" | "confirm" | "export" | "wide"
 *
 * "wide" existe para formulários de duas colunas: no diálogo padrão (560px) o
 * cadastro de suporte virava uma coluna de treze campos que exigia rolagem
 * antes de chegar no botão de salvar.
 *
 * Renderiza em portal no <body>. `position: fixed` se ancora no ancestral mais
 * próximo que tenha transform/filter/animação de transform, e não na janela —
 * dentro de `.container` (que é animado na entrada) o overlay ficava do tamanho
 * do container, deixando faixas claras nas bordas da tela.
 */
export default function Modal({
  open,
  onClose,
  title,
  children,
  actions,
  variant = "default",
  icon,
  width
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const contentClass = [
    "modal-content",
    variant === "confirm" ? "modal-confirm" : "",
    variant === "export" ? "modal-export" : "",
    variant === "wide" ? "modal-wide" : ""
  ]
    .filter(Boolean)
    .join(" ");

  return createPortal(
    <div
      className="modal"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className={contentClass} style={width ? { maxWidth: width } : undefined}>
        {icon ? (
          <div className="modal-confirm-icon" aria-hidden="true">
            {icon}
          </div>
        ) : null}

        {title ? (
          variant === "confirm" ? (
            <h2>{title}</h2>
          ) : (
            <div className="modal-header">
              <h2>{title}</h2>
              <button type="button" className="btn btn-ghost btn-small" onClick={onClose}>
                Fechar
              </button>
            </div>
          )
        ) : null}

        {children}

        {actions ? <div className="modal-confirm-actions">{actions}</div> : null}
      </div>
    </div>,
    document.body
  );
}
