import { useEffect, useState } from "react";
import Modal from "../Modal";
import { gerarSuportePorLead } from "../../services/suportesService";

/**
 * "Novo suporte" — pede só o lead do Kommo (pedido do usuário, 2026-10-01).
 *
 * O Worker lê o lead, o contato e a conversa (classificada pela IA do n8n) e
 * devolve o formulário preenchido; quem confere e salva é o técnico, no
 * SuporteFormModal de sempre (`onPreenchido`). Se o cliente já tem chamado,
 * mostra qual e oferece abrir (`onAbrirExistente`) — não abre outro.
 */
export default function NovoPorLeadModal({ open, onClose, onPreenchido, onAbrirExistente, getIdToken }) {
  const [lead, setLead] = useState("");
  const [lendo, setLendo] = useState(false);
  const [erro, setErro] = useState("");
  const [existente, setExistente] = useState(null);

  useEffect(() => {
    if (open) {
      setLead("");
      setLendo(false);
      setErro("");
      setExistente(null);
    }
  }, [open]);

  async function ler(e) {
    e?.preventDefault();
    if (!lead.trim()) {
      setErro("Informe o número do lead ou cole o link do lead no Kommo.");
      return;
    }
    setLendo(true);
    setErro("");
    setExistente(null);
    try {
      const resultado = await gerarSuportePorLead(lead.trim(), { getIdToken });
      if (resultado.existente) setExistente(resultado.existente);
      else onPreenchido(resultado);
    } catch (err) {
      setErro(err?.message || "Não foi possível ler o lead no Kommo.");
    } finally {
      setLendo(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={lendo ? undefined : onClose}
      title="Novo suporte"
      actions={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={lendo}>
            Cancelar
          </button>
          {existente ? (
            <button type="button" className="btn btn-primary" onClick={() => onAbrirExistente(existente)}>
              Abrir chamado existente
            </button>
          ) : (
            <button type="submit" form="form-novo-lead" className="btn btn-primary" disabled={lendo}>
              {lendo ? "Lendo a conversa..." : "Ler conversa"}
            </button>
          )}
        </>
      }
    >
      <form id="form-novo-lead" onSubmit={ler} noValidate>
        <div className={`field${erro ? " field-erro" : ""}`}>
          <label htmlFor="novo-lead">Lead do Kommo</label>
          <input
            id="novo-lead"
            value={lead}
            onChange={(e) => {
              setLead(e.target.value);
              setErro("");
              setExistente(null);
            }}
            placeholder="55312356 ou o link do lead"
            autoFocus
            disabled={lendo}
            aria-invalid={erro ? true : undefined}
          />
          {erro ? <small className="field-erro-texto">{erro}</small> : null}
        </div>

        {lendo ? (
          <p className="prefill-aviso" role="status">
            Lendo o lead e a conversa no Kommo (a IA também olha os prints)… pode levar alguns segundos.
          </p>
        ) : (
          <p className="prefill-aviso">
            O sistema lê o lead e a conversa e abre o formulário já preenchido para você conferir e salvar.
          </p>
        )}

        {existente ? (
          <div className="novo-lead-existente" role="alert">
            <strong>Este cliente já tem um chamado</strong>
            <span>
              {existente.nomeCliente || "Sem nome"}
              {existente.protocolo ? ` · protocolo ${existente.protocolo}` : ""} · {existente.status}
              {existente.tecnico ? ` · ${existente.tecnico}` : ""}
            </span>
            <small>
              {existente.motivo === "mesmo lead"
                ? "O lead informado já tem esse chamado aberto. Atenda por ele em vez de abrir outro."
                : "Achado pelo mesmo cliente (conversa, contato, telefone, documento ou protocolo). Use esse chamado em vez de abrir outro."}
            </small>
          </div>
        ) : null}
      </form>
    </Modal>
  );
}
