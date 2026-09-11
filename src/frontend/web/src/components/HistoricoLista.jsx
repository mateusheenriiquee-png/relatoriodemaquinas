import { formatDate } from "../utils/format";

function paraMs(valor) {
  if (!valor) return 0;
  if (typeof valor?.toDate === "function") return valor.toDate().getTime();
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

/**
 * Linha do tempo do chamado, no painel lateral.
 *
 * As entradas são gravadas junto com cada alteração (ver suportesService), o
 * que responde a pergunta que o painel não respondia: quem mexeu, quando e o
 * que mudou. Mais recente primeiro.
 */
export default function HistoricoLista({ entradas = [], vazioTexto = "Sem histórico." }) {
  const ordenadas = [...entradas]
    .filter((entrada) => entrada && entrada.texto)
    .sort((a, b) => paraMs(b.em) - paraMs(a.em));

  if (!ordenadas.length) {
    return <div className="val empty">{vazioTexto}</div>;
  }

  return (
    <ol className="historico">
      {ordenadas.map((entrada, indice) => (
        <li className="historico-item" key={`${paraMs(entrada.em)}-${indice}`}>
          <div className="historico-quando">
            {formatDate(entrada.em)}
            {entrada.por ? <span className="historico-por"> · {entrada.por}</span> : null}
          </div>
          <div className="historico-texto">{entrada.texto}</div>
        </li>
      ))}
    </ol>
  );
}
