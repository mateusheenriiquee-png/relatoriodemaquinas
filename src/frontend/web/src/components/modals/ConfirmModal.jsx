import { useState } from "react";
import Modal from "../Modal";

export default function ConfirmModal({
  open,
  title = "Confirmar?",
  text,
  details,
  confirmLabel = "Confirmar",
  confirmClass = "btn-danger",
  icon = "!",
  onConfirm,
  onClose
}) {
  const [processando, setProcessando] = useState(false);

  async function handleConfirm() {
    setProcessando(true);
    try {
      await onConfirm();
    } finally {
      setProcessando(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      variant="confirm"
      icon={icon}
      actions={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className={`btn ${confirmClass}`}
            onClick={handleConfirm}
            disabled={processando}
          >
            {processando ? "Processando..." : confirmLabel}
          </button>
        </>
      }
    >
      {text ? <p className="modal-confirm-text">{text}</p> : null}
      {details ? <p className="modal-confirm-details">{details}</p> : null}
    </Modal>
  );
}
