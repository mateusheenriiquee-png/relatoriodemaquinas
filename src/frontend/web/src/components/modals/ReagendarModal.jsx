import { useEffect, useState } from "react";
import Modal from "../Modal";

function amanha() {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return d.toISOString().split("T")[0];
}

export default function ReagendarModal({ open, onConfirm, onClose, erro }) {
  const [data, setData] = useState(amanha());
  const [hora, setHora] = useState("08:00");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (open) {
      setData(amanha());
      setHora("08:00");
    }
  }, [open]);

  async function handleConfirm() {
    setSalvando(true);
    try {
      await onConfirm(data, hora);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Reagendar Suporte"
      variant="confirm"
      icon="📅"
      actions={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleConfirm}
            disabled={salvando || !data || !hora}
          >
            {salvando ? "Reagendando..." : "Reagendar"}
          </button>
        </>
      }
    >
      <p className="modal-confirm-text">Informe a data e hora para reagendar este suporte.</p>
      <div className="field">
        <label htmlFor="reagendarData">Data</label>
        <input
          id="reagendarData"
          type="date"
          value={data}
          onChange={(e) => setData(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="reagendarHora">Hora</label>
        <input
          id="reagendarHora"
          type="time"
          value={hora}
          onChange={(e) => setHora(e.target.value)}
        />
      </div>
      {erro ? <p className="modal-confirm-details">{erro}</p> : null}
    </Modal>
  );
}
