import { DIAS_SEMANA } from "../../services/dashboardService";

// Expediente do time: 7h às 22h. Fora desse intervalo é raro (autolead de
// madrugada, por exemplo) e não interessa pro "quando a equipe recebe
// suporte" que esse mapa responde — mostrar 24h só diluiria o mapa de calor
// com colunas vazias.
const HORA_INICIO = 7;
const HORA_FIM = 22;
const HORAS = Array.from({ length: HORA_FIM - HORA_INICIO + 1 }, (_, i) => HORA_INICIO + i);

/**
 * Nível de 0 a 4 pra colorir o quadrado — faixas fixas (não opacidade contínua)
 * porque olho humano distingue "mais forte" em poucos degraus melhor que num
 * gradiente liso, e é o que o pedido descreve ("cor mais forte quanto mais
 * suporte"). Raiz quadrada em vez de proporção linear: um único horário muito
 * cheio (ex.: segunda 9h) não pode apagar a diferença entre os outros.
 */
function nivel(valor, maximo) {
  if (!valor || !maximo) return 0;
  return Math.max(1, Math.min(4, Math.ceil(Math.sqrt(valor / maximo) * 4)));
}

/**
 * Mapa de calor "suporte por dia da semana × hora" — quadradinhos que ficam
 * mais escuros (mais opacos) quanto mais chamados foram abertos naquele
 * cruzamento de dia/hora, na cor de "Abertos" já usada no resto do dashboard.
 */
export default function HeatmapSuportes({ matriz, cor }) {
  const janela = matriz.map((linha) => linha.slice(HORA_INICIO, HORA_FIM + 1));
  const maximo = Math.max(1, ...janela.flat());
  const total = janela.flat().reduce((a, b) => a + b, 0);

  if (!total) {
    return (
      <p className="dashboard-empty">
        Nenhum chamado aberto entre {HORA_INICIO}h e {HORA_FIM}h no período.
      </p>
    );
  }

  return (
    <div className="heatmap-dia-hora">
      <div className="heatmap-linha heatmap-linha-horas">
        <span className="heatmap-rotulo-dia" aria-hidden="true" />
        {HORAS.map((h) => (
          <span key={h} className="heatmap-rotulo-hora">
            {h % 3 === 0 ? h : ""}
          </span>
        ))}
      </div>

      {janela.map((linha, dia) => (
        <div className="heatmap-linha" key={dia}>
          <span className="heatmap-rotulo-dia">{DIAS_SEMANA[dia]}</span>
          {linha.map((valor, i) => {
            const hora = HORA_INICIO + i;
            return (
              <span
                key={hora}
                className={`heatmap-quadrado heatmap-nivel-${nivel(valor, maximo)}`}
                style={{ "--heatmap-cor": cor }}
                title={`${DIAS_SEMANA[dia]} ${String(hora).padStart(2, "0")}h — ${valor} chamado(s)`}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
