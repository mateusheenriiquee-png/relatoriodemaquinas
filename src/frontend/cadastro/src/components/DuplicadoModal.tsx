import { useEffect } from "react";
import { bloqueia, type Duplicado } from "../lib/duplicidade";

interface Props {
  duplicados: Duplicado[];
  /** Só usado quando NÃO bloqueia: a pessoa escolhe cadastrar mesmo assim. */
  onCadastrarMesmoAssim: () => void;
  onFechar: () => void;
}

const formatarData = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR") : "sem data");

/**
 * Aviso de chamado já existente.
 *
 * Protocolo repetido bloqueia (só "Entendi"). CPF/CNPJ com chamado ainda aberto
 * avisa e deixa cadastrar mesmo assim — ver as regras em lib/duplicidade.ts.
 */
export default function DuplicadoModal({ duplicados, onCadastrarMesmoAssim, onFechar }: Props) {
  const travado = bloqueia(duplicados);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFechar();
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [onFechar]);

  return (
    <div
      className="modal"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="duplicado-titulo"
      onClick={(e) => {
        if (e.target === e.currentTarget) onFechar();
      }}
    >
      <div className="modal-content modal-confirm">
        <div className="modal-confirm-icon" aria-hidden="true">
          !
        </div>
        <h2 id="duplicado-titulo">{travado ? "Este suporte já está cadastrado" : "Já existe suporte aberto para este cliente"}</h2>
        <p className="modal-confirm-text">
          {travado
            ? "Já existe um chamado com este protocolo. Não é possível cadastrar de novo."
            : "Este CPF/CNPJ já tem chamado em andamento. Confira antes de abrir outro."}
        </p>

        <ul className="duplicados-lista">
          {duplicados.slice(0, 5).map((d) => (
            <li key={d.id} className="duplicados-item">
              <strong>{d.protocolo || "Sem protocolo"}</strong>
              <span className="duplicados-status">{d.status}</span>
              <small>
                {d.cpfCnpj ? `${d.cpfCnpj} · ` : ""}
                aberto em {formatarData(d.dataAbertura)}
                {d.responsavelAbertura ? ` por ${d.responsavelAbertura}` : ""}
              </small>
            </li>
          ))}
        </ul>
        {duplicados.length > 5 ? <p className="modal-confirm-text">… e mais {duplicados.length - 5}.</p> : null}

        <div className="modal-confirm-actions">
          {travado ? null : (
            <button className="btn btn-primary" type="button" onClick={onCadastrarMesmoAssim}>
              Cadastrar mesmo assim
            </button>
          )}
          <button className="btn btn-ghost" type="button" onClick={onFechar} autoFocus>
            {travado ? "Entendi" : "Cancelar"}
          </button>
        </div>
      </div>
    </div>
  );
}
