import { useEffect, useState } from "react";
import Modal from "../Modal";
import { exportarCSV } from "../../services/importExportService";

function paraInput(data) {
  return data.toISOString().slice(0, 10);
}

/**
 * Exportação CSV por período.
 *
 * Abre com os últimos 30 dias preenchidos, como no painel antigo — é o recorte
 * que a equipe pede quase sempre, e deixar em branco exportaria a base inteira
 * sem querer. Os dois campos vazios continuam válidos para quem quer tudo.
 */
export default function ExportarModal({ open, onClose, onConcluido }) {
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (!open) return;
    const hoje = new Date();
    const trintaDias = new Date(hoje);
    trintaDias.setDate(trintaDias.getDate() - 30);
    setDataInicio(paraInput(trintaDias));
    setDataFim(paraInput(hoje));
    setErro("");
    setOcupado(false);
  }, [open]);

  async function handleExportar() {
    if (ocupado) return;
    if (dataInicio && dataFim && dataInicio > dataFim) {
      setErro("A data inicial não pode ser depois da final.");
      return;
    }

    setOcupado(true);
    setErro("");
    try {
      const total = await exportarCSV({ dataInicio, dataFim });
      if (!total) {
        setErro("Nenhum registro encontrado para o período selecionado.");
        return;
      }
      onConcluido?.(total);
      onClose?.();
    } catch (error) {
      setErro(error?.message || "Falha ao exportar.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Exportar CSV"
      width={480}
      actions={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={ocupado}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleExportar}
            disabled={ocupado}
          >
            {ocupado ? "Gerando..." : "Baixar CSV"}
          </button>
        </>
      }
    >
      <div className="admin-form-grid">
        <div className="field">
          <label htmlFor="exportInicio">Data início</label>
          <input
            id="exportInicio"
            type="date"
            value={dataInicio}
            disabled={ocupado}
            onChange={(e) => setDataInicio(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="exportFim">Data limite</label>
          <input
            id="exportFim"
            type="date"
            value={dataFim}
            disabled={ocupado}
            onChange={(e) => setDataFim(e.target.value)}
          />
        </div>
      </div>

      <p className="import-status">Deixe os dois campos vazios para exportar a base inteira.</p>
      {erro ? <p className="import-erro">{erro}</p> : null}
    </Modal>
  );
}
