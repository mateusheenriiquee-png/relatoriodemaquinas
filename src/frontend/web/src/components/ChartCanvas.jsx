import { useEffect, useRef } from "react";
import Chart from "chart.js/auto";
import { useTheme } from "../contexts/ThemeContext";
import { cssVar } from "../hooks/useChartColors";

/** Padrões visuais dos gráficos, lidos dos tokens do tema atual. */
function mergeOptions(custom = {}) {
  const muted = cssVar("--faint", "#8b7d72");
  const grid = cssVar("--border", "#322b26");

  const axis = {
    ticks: { color: muted, font: { size: 9, family: "Inter" } },
    grid: { color: grid },
    border: { display: false }
  };

  const defaults = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 220 },
    plugins: {
      legend: {
        display: true,
        position: "bottom",
        labels: {
          boxWidth: 10,
          padding: 10,
          color: muted,
          font: { size: 10, family: "Inter" }
        }
      }
    }
  };

  const precisaEixos = Boolean(custom.scales || custom.indexAxis !== undefined);
  const scales = precisaEixos
    ? {
        x: { ...axis, ...(custom.scales?.x || {}) },
        y: { ...axis, ...(custom.scales?.y || {}) }
      }
    : undefined;

  return {
    ...defaults,
    ...custom,
    plugins: { ...defaults.plugins, ...(custom.plugins || {}) },
    scales
  };
}

/**
 * Envolve o Chart.js: cria o gráfico ao montar e o destrói ao desmontar,
 * recriando quando os dados, as opções ou o tema mudam.
 */
export default function ChartCanvas({ type, data, options }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const { tema } = useTheme();

  const assinatura = JSON.stringify({ type, data, options, tema });

  useEffect(() => {
    if (!canvasRef.current) return undefined;

    chartRef.current = new Chart(canvasRef.current, {
      type,
      data,
      options: mergeOptions(options)
    });

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assinatura]);

  return <canvas ref={canvasRef} />;
}
