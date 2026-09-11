import Modal from "../Modal";
import { useUsuarios } from "../../hooks/useUsuarios";

/**
 * Escolha do técnico responsável.
 *
 * A lista vem da coleção `usuarios` — antes eram seis nomes fixos no código,
 * que não acompanhavam quem entrava ou saía da equipe.
 */
export default function ChangeTecnicoModal({ open, onSelect, onClose }) {
  const { nomes, carregando, erro } = useUsuarios();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Alterar Técnico"
      variant="confirm"
      actions={
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Cancelar
        </button>
      }
    >
      <p className="modal-confirm-text">Selecione um técnico para associar ao suporte.</p>

      {carregando ? (
        <p className="modal-confirm-details">Carregando usuários...</p>
      ) : erro ? (
        <p className="modal-confirm-details">{erro}</p>
      ) : nomes.length === 0 ? (
        <p className="modal-confirm-details">
          Nenhum usuário cadastrado. Crie os usuários no painel de administrador.
        </p>
      ) : (
        <div className="change-tecnico-list">
          {nomes.map((nome) => (
            <button
              key={nome}
              type="button"
              className="btn btn-ghost change-tecnico-item"
              onClick={() => onSelect(nome)}
            >
              {nome}
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
