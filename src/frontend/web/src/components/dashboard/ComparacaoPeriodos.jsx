import { humanDur, rotuloIntervalo } from "../../services/metricasService";

/**
 * Tabela de comparação entre dois períodos escolhidos à mão.
 *
 * A coluna de variação é sempre "B em relação a A". Nos tempos, o sinal é
 * invertido na cor de propósito: cair é bom. Sem isso, a mesma cor verde
 * significaria coisas opostas em duas linhas vizinhas da tabela.
 */

function Numero({ a, b }) {
  const delta = b - a;
  const pct = a ? Math.round((delta / a) * 100) : null;
  const classe = delta > 0 ? "delta-bom" : delta < 0 ? "delta-ruim" : "delta-neutro";
  return (
    <span className={`cmp-delta ${classe}`}>
      {delta > 0 ? "+" : ""}
      {delta}
      {pct !== null ? ` (${pct > 0 ? "+" : ""}${pct}%)` : ""}
    </span>
  );
}

function Tempo({ a, b }) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return <span className="cmp-delta">—</span>;
  const delta = b - a;
  if (delta === 0) return <span className="cmp-delta delta-neutro">0</span>;
  return (
    <span className={`cmp-delta ${delta < 0 ? "delta-bom" : "delta-ruim"}`}>
      {delta > 0 ? "+" : "−"}
      {humanDur(Math.abs(delta))}
    </span>
  );
}

function PontosPercentuais({ a, b }) {
  const delta = b - a;
  const classe = delta > 0 ? "delta-bom" : delta < 0 ? "delta-ruim" : "delta-neutro";
  return (
    <span className={`cmp-delta ${classe}`}>
      {delta > 0 ? "+" : ""}
      {delta} p.p.
    </span>
  );
}

const dur = (ms) => (Number.isFinite(ms) ? humanDur(ms) : "—");

export default function ComparacaoPeriodos({ intervaloA, intervaloB, a, b }) {
  const linhas = [
    ["Abertos", a.abertos, b.abertos, <Numero key="ab" a={a.abertos} b={b.abertos} />],
    [
      "Encerrados",
      a.encerrados,
      b.encerrados,
      <Numero key="en" a={a.encerrados} b={b.encerrados} />
    ],
    [
      "Encerrados com sucesso",
      a.sucesso,
      b.sucesso,
      <Numero key="su" a={a.sucesso} b={b.sucesso} />
    ],
    [
      "Tempo médio ajustado",
      dur(a.tempoAjustado),
      dur(b.tempoAjustado),
      <Tempo key="ta" a={a.tempoAjustado} b={b.tempoAjustado} />
    ],
    [
      "Tempo médio útil",
      dur(a.tempoUtil),
      dur(b.tempoUtil),
      <Tempo key="tu" a={a.tempoUtil} b={b.tempoUtil} />
    ],
    [
      "Taxa de sucesso",
      `${a.taxa}%`,
      `${b.taxa}%`,
      <PontosPercentuais key="tx" a={a.taxa} b={b.taxa} />
    ]
  ];

  return (
    <section className="comparacao-periodos">
      <h3>Comparação de períodos</h3>
      <div className="table-wrapper table-compact">
        <table>
          <thead>
            <tr>
              <th>Métrica</th>
              <th>
                Período A<br />
                <span className="cmp-sub">{rotuloIntervalo(intervaloA)}</span>
              </th>
              <th>
                Período B<br />
                <span className="cmp-sub">{rotuloIntervalo(intervaloB)}</span>
              </th>
              <th>Variação (B vs. A)</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map(([rotulo, valorA, valorB, variacao]) => (
              <tr key={rotulo}>
                <td>{rotulo}</td>
                <td className="td-num">{valorA}</td>
                <td className="td-num">{valorB}</td>
                <td className="td-num">{variacao}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="chart-nota">Nos tempos, verde significa mais rápido no período B.</p>
    </section>
  );
}
