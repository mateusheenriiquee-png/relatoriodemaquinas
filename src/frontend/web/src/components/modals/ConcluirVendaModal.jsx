import { useEffect, useState } from "react";
import Modal from "../Modal";

/**
 * Confirmação ao concluir um suporte: pergunta se a venda ligada ao chamado
 * foi ganha ou perdida (alimenta a métrica do dashboard). Nem todo chamado
 * envolve venda, por isso "Concluir sem informar" fica sempre disponível.
 */
export default function ConcluirVendaModal({ open, item, onClose, onConfirm }) {
  const [valor, setValor] = useState("");
  const [salvando, setSalvando] = useState("");

  useEffect(() => {
    if (open) {
      setValor(item?.valorVenda ? String(item.valorVenda) : "");
      setSalvando("");
    }
  }, [open, item]);

  async function concluir(vendaStatus) {
    setSalvando(vendaStatus || "sem-informar");
    try {
      const valorNumero = Number(String(valor).replace(",", "."));
      const valorVenda = vendaStatus && valorNumero > 0 ? valorNumero : undefined;
      await onConfirm(vendaStatus, valorVenda);
    } finally {
      setSalvando("");
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Concluir suporte"
      variant="confirm"
      icon="✓"
      width="480px"
      actions={
        <>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
            disabled={Boolean(salvando)}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => concluir("")}
            disabled={Boolean(salvando)}
          >
            {salvando === "sem-informar" ? "Concluindo..." : "Concluir sem informar"}
          </button>
        </>
      }
    >
      <p className="modal-confirm-text">A venda ligada a este chamado foi ganha ou perdida?</p>

      <div className="field">
        <label htmlFor="concluir-venda-valor">Valor da venda (R$) — opcional</label>
        <input
          id="concluir-venda-valor"
          type="number"
          min="0"
          step="0.01"
          placeholder="0,00"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
        />
      </div>

      <div className="modal-confirm-actions" style={{ marginTop: "12px" }}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => concluir("GANHO")}
          disabled={Boolean(salvando)}
        >
          {salvando === "GANHO" ? "Salvando..." : "Venda Ganha"}
        </button>
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => concluir("PERDIDO")}
          disabled={Boolean(salvando)}
        >
          {salvando === "PERDIDO" ? "Salvando..." : "Venda Perdida"}
        </button>
      </div>
    </Modal>
  );
}
