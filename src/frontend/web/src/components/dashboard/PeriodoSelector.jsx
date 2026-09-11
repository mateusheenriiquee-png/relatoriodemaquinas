import { PRESETS_PERIODO } from "../../services/metricasService";

/**
 * Seletor de período. Usado duas vezes: no período A (o da tela) e no B
 * (opcional, só para comparar). Os campos de data só aparecem em "custom" —
 * mostrá-los sempre desativados ocupava a barra de filtros inteira.
 */
export default function PeriodoSelector({ id, label, valor, onChange, permiteVazio = false }) {
  const set = (campo) => (e) => onChange({ ...valor, [campo]: e.target.value });

  return (
    <>
      <div className="field">
        <label htmlFor={id}>{label}</label>
        <select id={id} value={valor.preset} onChange={set("preset")}>
          {permiteVazio ? <option value="">Não comparar</option> : null}
          {PRESETS_PERIODO.map((p) => (
            <option key={p.valor} value={p.valor}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {valor.preset === "custom" ? (
        <>
          <div className="field field-data">
            <label htmlFor={`${id}De`}>De</label>
            <input id={`${id}De`} type="date" value={valor.de} onChange={set("de")} />
          </div>
          <div className="field field-data">
            <label htmlFor={`${id}Ate`}>Até</label>
            <input id={`${id}Ate`} type="date" value={valor.ate} onChange={set("ate")} />
          </div>
        </>
      ) : null}
    </>
  );
}
