import { useEffect, useState } from "react";
import Modal from "../Modal";

/**
 * Modal genérico de texto — usado para "Sem retorno", "Indevido" e "Anotações".
 */
export default function TextoModal({
  open,
  title,
  text,
  label = "Motivo",
  placeholder = "Descreva o motivo...",
  initialValue = "",
  maxLength = 400,
  rows = 4,
  required = true,
  icon = "!",
  confirmLabel = "Confirmar",
  readOnly = false,
  extraAction = null,
  onConfirm,
  onClose
}) {
  const [valor, setValor] = useState(initialValue);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (open) setValor(initialValue || "");
  }, [open, initialValue]);

  async function handleConfirm() {
    if (required && !valor.trim()) return;
    setSalvando(true);
    try {
      await onConfirm(valor.trim());
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      variant="confirm"
      icon={icon}
      width="560px"
      actions={
        <>
          {extraAction}
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {readOnly ? "Fechar" : "Cancelar"}
          </button>
          {!readOnly ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleConfirm}
              disabled={salvando || (required && !valor.trim())}
            >
              {salvando ? "Salvando..." : confirmLabel}
            </button>
          ) : null}
        </>
      }
    >
      {text ? <p className="modal-confirm-text">{text}</p> : null}
      <div className="field">
        <label htmlFor="texto-modal">{label}</label>
        <textarea
          id="texto-modal"
          rows={rows}
          maxLength={maxLength}
          placeholder={placeholder}
          value={valor}
          readOnly={readOnly}
          onChange={(e) => setValor(e.target.value)}
        />
      </div>
    </Modal>
  );
}
