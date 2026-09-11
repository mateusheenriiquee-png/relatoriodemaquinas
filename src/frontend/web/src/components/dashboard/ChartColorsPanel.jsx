import { SLOT_LABELS, STATUS_CSS_VARS } from "../../hooks/useChartColors";

const LEGENDA = [
  ["EM ABERTO", "Em aberto"],
  ["EM ANDAMENTO", "Em andamento"],
  ["FINALIZADO", "Finalizado"],
  ["REAGENDADO", "Reagendado"],
  ["SEM RETORNO", "Sem retorno"]
];

export default function ChartColorsPanel({ cores, onAlterar, onRestaurar, personalizado }) {
  return (
    <details className="chart-colors-panel">
      <summary>Cores dos gráficos</summary>

      <p className="chart-colors-hint">
        Os padrões acompanham o tema e foram escolhidos para continuarem distinguíveis com
        daltonismo. O gráfico de <strong>Status</strong> usa cores fixas por situação (abaixo).
      </p>

      <div className="chart-colors-grid">
        {Object.entries(SLOT_LABELS).map(([slot, label]) => (
          <div className="chart-color-field" key={slot}>
            <label htmlFor={`cor-${slot}`}>{label}</label>
            <input
              id={`cor-${slot}`}
              type="color"
              value={cores[slot]}
              onChange={(e) => onAlterar(slot, e.target.value)}
            />
          </div>
        ))}
      </div>

      <div className="status-legend" aria-label="Cores fixas por status">
        {LEGENDA.map(([status, label]) => (
          <span className="status-legend-item" key={status}>
            <span
              className="status-legend-swatch"
              style={{ background: STATUS_CSS_VARS[status] }}
            />{" "}
            {label}
          </span>
        ))}
      </div>

      <div className="chart-colors-actions">
        <button
          type="button"
          className="btn btn-ghost btn-small"
          onClick={onRestaurar}
          disabled={!personalizado}
        >
          Restaurar padrão do tema
        </button>
      </div>
    </details>
  );
}
