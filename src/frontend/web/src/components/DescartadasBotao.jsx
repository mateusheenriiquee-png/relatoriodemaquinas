import { useEffect, useState } from "react";
import Modal from "./Modal";
import PalavrasChaveEditor from "./PalavrasChaveEditor";
import { IconInbox } from "./Icons";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "./ToastProvider";
import { idadeAtendimento } from "../utils/format";
import { lerRegistro } from "../services/suportesService";
import {
  converterDescartada,
  ignorarDescartada,
  MOTIVO_DESCARTE,
  subscribeDescartadasPendentes
} from "../services/descartadasService";

/**
 * Botão (só ícone, ao lado do sino) com o número de "possíveis pedidos de
 * suporte" que o filtro do chat descartou, e a lista para revisar (09/10).
 * `onAbrirChamado(registro)` abre o chamado criado no painel lateral.
 */
export default function DescartadasBotao({ onAbrirChamado }) {
  const { displayName, isAdmin } = useAuth();
  const toast = useToast();
  const [lista, setLista] = useState([]);
  const [aberto, setAberto] = useState(false);
  const [emCurso, setEmCurso] = useState(null);

  useEffect(
    () =>
      subscribeDescartadasPendentes(setLista, (err) =>
        console.warn("[Descartadas] Falha ao carregar:", err?.message || err)
      ),
    []
  );

  async function virarChamado(item) {
    setEmCurso(item.id);
    try {
      const chamadoId = await converterDescartada(item.id, { por: displayName });
      toast.success("Chamado aberto a partir da mensagem.");
      if (chamadoId) {
        const registro = await lerRegistro(chamadoId);
        if (registro) {
          setAberto(false);
          onAbrirChamado?.(registro);
        }
      }
    } catch (err) {
      toast.error(err?.message || "Não foi possível abrir o chamado.");
    } finally {
      setEmCurso(null);
    }
  }

  async function ignorar(item) {
    setEmCurso(item.id);
    try {
      await ignorarDescartada(item.id, { por: displayName });
    } catch (err) {
      toast.error(err?.message || "Não foi possível ignorar.");
    } finally {
      setEmCurso(null);
    }
  }

  const total = lista.length;
  const titulo = total
    ? `${total} possível(is) pedido(s) de suporte que o filtro do chat descartou — clique para revisar`
    : "Nenhum possível pedido de suporte descartado";

  return (
    <>
      <button
        type="button"
        className="theme-toggle descartadas-botao"
        onClick={() => setAberto(true)}
        title={titulo}
        aria-label={titulo}
      >
        <IconInbox />
        {total ? <span className="descartadas-contador">{total > 99 ? "99+" : total}</span> : null}
      </button>

      <Modal open={aberto} onClose={() => setAberto(false)} title="Possíveis pedidos de suporte" variant="wide">
        <p className="descartadas-explica">
          Mensagens de clientes (da videoconferência em diante) que o chat não transformou em chamado: sem
          palavra-chave de suporte, ou a IA achou que não era suporte. Confira e decida.
        </p>
        {total === 0 ? (
          <p className="descartadas-vazio">Nada para revisar agora.</p>
        ) : (
          <ul className="descartadas-lista">
            {lista.map((item) => {
              const idade = idadeAtendimento(item.atualizadoEm);
              return (
                <li key={item.id} className="descartadas-item">
                  <div className="descartadas-topo">
                    <strong>{item.nome || "Cliente sem nome"}</strong>
                    <span className="descartadas-meta">
                      {MOTIVO_DESCARTE[item.motivo] || item.motivo}
                      {idade ? ` · ${idade.texto}` : ""}
                    </span>
                  </div>
                  <blockquote className="descartadas-mensagem">{item.mensagem}</blockquote>
                  {item.resumoIa ? <p className="descartadas-ia">IA: {item.resumoIa}</p> : null}
                  <div className="descartadas-acoes">
                    <button
                      type="button"
                      className="btn btn-primary btn-small"
                      disabled={emCurso === item.id}
                      onClick={() => virarChamado(item)}
                    >
                      Virar chamado
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-small"
                      disabled={emCurso === item.id}
                      onClick={() => ignorar(item)}
                    >
                      Ignorar
                    </button>
                    {item.leadId ? (
                      <a
                        className="btn btn-ghost btn-small"
                        href={`https://certifybrasil.kommo.com/leads/detail/${item.leadId}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Ver no Kommo
                      </a>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {/* Admin acrescenta a palavra que faltou ali mesmo (13/10). */}
        {isAdmin ? <PalavrasChaveEditor compacto /> : null}
      </Modal>
    </>
  );
}
