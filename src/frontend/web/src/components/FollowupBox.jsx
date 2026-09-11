import { useEffect, useMemo, useState } from "react";
import { ESPERA_MINUTOS, estadoFollowups, faltaTexto, TOTAL_FOLLOWUPS } from "../utils/followup";
import { formatDate } from "../utils/format";

/**
 * Bloco de follow-up por ligação do painel lateral.
 *
 * São três tentativas de contato com janela mínima entre elas; depois da
 * terceira o chamado sai da média de tempo do dashboard. A regra de quando
 * cada etapa libera vive em utils/followup.js — aqui só desenhamos o estado e
 * disparamos a gravação.
 */
export default function FollowupBox({ item, onRegistrar, desabilitado }) {
  const [observacao, setObservacao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [agora, setAgora] = useState(() => Date.now());

  const estado = useMemo(() => estadoFollowups(item, agora), [item, agora]);
  const proximaEtapa = estado.etapas.find((e) => e.ordem === estado.proximo) || null;
  const aguardandoJanela = Boolean(proximaEtapa && proximaEtapa.faltaMs > 0);

  // O relógio só corre enquanto há uma contagem regressiva na tela. Sem isso,
  // ou o botão nunca destrava sozinho, ou o painel fica renderizando à toa.
  useEffect(() => {
    if (!aguardandoJanela) return undefined;
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [aguardandoJanela]);

  // Trocar de chamado tem que limpar o rascunho da observação — senão a nota
  // digitada em um chamado vaza para o próximo que for aberto.
  useEffect(() => {
    setObservacao("");
  }, [item.id]);

  const legenda = `1º→2º: ${ESPERA_MINUTOS[1]} min · 2º→3º: ${ESPERA_MINUTOS[2]} min · após o ${TOTAL_FOLLOWUPS}º sai da média`;

  async function registrar() {
    if (!proximaEtapa || !proximaEtapa.liberado || salvando) return;
    setSalvando(true);
    try {
      const ok = await onRegistrar(item, proximaEtapa.ordem, observacao.trim());
      if (ok) setObservacao("");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="followup-box">
      <div className="followup-head">
        <h4 className="drawer-section-title">Follow-up por ligação</h4>
        <span className="followup-legenda">{legenda}</span>
      </div>

      <ul className="followup-etapas">
        {estado.etapas.map((etapa) => (
          <li
            key={etapa.ordem}
            className={`followup-etapa ${etapa.registrado ? "feito" : ""} ${
              etapa.ordem === estado.proximo ? "atual" : ""
            }`}
          >
            <span className="followup-marca" aria-hidden="true">
              {etapa.registrado ? "✓" : "○"}
            </span>
            <span className="followup-rotulo">
              {etapa.ordem}º follow-up
              {etapa.registrado ? (
                <>
                  {" — "}
                  <strong>{formatDate(etapa.em)}</strong>
                  {etapa.por ? <span className="followup-por"> por {etapa.por}</span> : null}
                  {etapa.observacao ? (
                    <span className="followup-obs">{etapa.observacao}</span>
                  ) : null}
                </>
              ) : etapa.ordem === estado.proximo && etapa.faltaMs > 0 ? (
                <> — liberado {faltaTexto(etapa.faltaMs)}</>
              ) : (
                <> — pendente</>
              )}
            </span>
          </li>
        ))}
      </ul>

      {estado.concluido ? (
        <p className="followup-final">
          As {TOTAL_FOLLOWUPS} tentativas foram registradas. Este chamado está fora da média de
          tempo do dashboard.
        </p>
      ) : (
        <>
          <label className="followup-label" htmlFor={`followup-obs-${item.id}`}>
            Observação do {proximaEtapa?.ordem}º follow-up (opcional)
          </label>
          <input
            id={`followup-obs-${item.id}`}
            type="text"
            className="followup-input"
            placeholder="Ex.: sem resposta, caixa postal"
            maxLength={300}
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") registrar();
            }}
            disabled={desabilitado || !proximaEtapa?.liberado}
          />
          <button
            type="button"
            className="btn btn-primary followup-btn"
            onClick={registrar}
            disabled={desabilitado || salvando || !proximaEtapa?.liberado}
            title={
              proximaEtapa?.liberado
                ? undefined
                : `Disponível ${faltaTexto(proximaEtapa?.faltaMs || 0)}`
            }
          >
            <span aria-hidden="true">📞</span>{" "}
            {salvando
              ? "Registrando..."
              : proximaEtapa?.liberado
                ? `Registrar ${proximaEtapa.ordem}º follow-up`
                : `Aguarde ${faltaTexto(proximaEtapa?.faltaMs || 0)}`}
          </button>
        </>
      )}
    </div>
  );
}
