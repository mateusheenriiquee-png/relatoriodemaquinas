import { useCallback, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import ChartCanvas from "../components/ChartCanvas";
import AlertasMetricas from "../components/dashboard/AlertasMetricas";
import BreakdownList from "../components/dashboard/BreakdownList";
import ChartColorsPanel from "../components/dashboard/ChartColorsPanel";
import ComparacaoPeriodos from "../components/dashboard/ComparacaoPeriodos";
import ConfigMetricasPanel from "../components/dashboard/ConfigMetricasPanel";
import HeatmapSuportes from "../components/dashboard/HeatmapSuportes";
import PeriodoSelector from "../components/dashboard/PeriodoSelector";
import ThemeToggle from "../components/ThemeToggle";
import { useToast } from "../components/ToastProvider";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import { cssVar, resolverCoresDeStatus, useChartColors } from "../hooks/useChartColors";
import { useDashboard } from "../hooks/useDashboard";
import { useMetricasConfig } from "../hooks/useMetricasConfig";
import {
  agruparContagem,
  agruparPorTecnico,
  duracaoAtendimento,
  duracaoEhPrecisa,
  formatarDuracao,
  matrizDiaHora,
  media,
  percent,
  percentil,
  serieTemporal,
  tempoDeAtendimento,
  tempoDeFila,
  variacao
} from "../services/dashboardService";
import {
  ehDataFutura,
  ehOutlier,
  emAbertoAgora,
  estatisticasDuracao,
  filtrarPorAbertura,
  humanDur,
  metricasDoPeriodo,
  rotuloIntervalo,
  temDatasInconsistentes
} from "../services/metricasService";
import { MOTIVOS, USOS } from "../utils/catalogos";
import { STATUS_OPTIONS, normKey } from "../utils/format";

/** Cabeçalho padrão de um card de gráfico: título à esquerda, contexto à direita. */
function ChartCard({ titulo, meta, largura = "", children }) {
  return (
    <article className={`chart-card ${largura}`}>
      <div className="chart-card-head">
        <h3>{titulo}</h3>
        {meta ? <span className="chart-card-meta">{meta}</span> : null}
      </div>
      {children}
    </article>
  );
}

/**
 * Variação contra o período anterior. `inverso` marca métricas em que subir é
 * ruim (tempo), para que a cor não diga o contrário do que o número significa.
 */
function Delta({ valor, inverso = false }) {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return null;

  const arredondado = Math.round(valor);
  if (arredondado === 0) return <small className="delta delta-neutro">estável</small>;

  const subiu = arredondado > 0;
  const bom = inverso ? !subiu : subiu;

  return (
    <small className={`delta ${bom ? "delta-bom" : "delta-ruim"}`}>
      {subiu ? "▲" : "▼"} {Math.abs(arredondado)}% vs. período anterior
    </small>
  );
}

function Meter({ valor, texto }) {
  return (
    <div className="meter">
      <span className="meter-track">
        <span className="meter-fill" style={{ width: `${Math.min(100, Math.max(0, valor))}%` }} />
      </span>
      <span className="meter-value">{texto}</span>
    </div>
  );
}

export default function DashboardPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const { tema } = useTheme();
  const { isAdmin, displayName, logout } = useAuth();
  const { cores, alterarCor, restaurarPadrao, personalizado } = useChartColors();
  const { config, salvarHorario, adicionarDia, removerDia } = useMetricasConfig();
  const {
    periodoA,
    setPeriodoA,
    periodoB,
    setPeriodoB,
    intervaloA,
    intervaloB,
    ac,
    setAc,
    tecnico,
    setTecnico,
    opcoesAc,
    opcoesTecnico,
    todos,
    dados,
    dadosAnteriores,
    carregando,
    erro,
    truncado
  } = useDashboard();

  useEffect(() => {
    if (erro) toast.error(erro);
  }, [erro, toast]);

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  /** Drill-down: abre a lista já filtrada, herdando os filtros do dashboard. */
  const abrirLista = useCallback(
    (extra = {}) => {
      const params = new URLSearchParams({ status: "todos" });
      if (ac !== "todos") params.set("ac", ac);
      if (tecnico !== "todos") params.set("tecnico", tecnico);
      Object.entries(extra).forEach(([chave, valor]) => {
        if (valor) params.set(chave, valor);
      });
      navigate(`/?${params.toString()}`);
    },
    [ac, tecnico, navigate]
  );

  /** Clique numa barra/fatia abre a lista filtrada por aquele valor. */
  const cliqueNoGrafico = useCallback(
    (campo, labels) => (_evento, elementos) => {
      const indice = elementos?.[0]?.index;
      if (indice === undefined) return;
      const valor = labels[indice];
      if (valor) abrirLista({ [campo]: valor });
    },
    [abrirLista]
  );

  // Tokens relidos quando o tema muda — cores de status e o vão entre segmentos.
  const coresStatus = useMemo(() => resolverCoresDeStatus(), [tema]);
  const superficie = useMemo(() => cssVar("--surface-2", "#221e1b"), [tema]);

  /* ---------------------------------------------------------------- KPIs */

  /** Resumo numérico de uma janela — usado no período atual e no anterior. */
  const resumir = useCallback((lista) => {
    const total = lista.length;
    const finalizados = lista.filter((r) => r.status === "FINALIZADO").length;
    const duracoes = lista.map(duracaoAtendimento).filter((h) => h !== null);

    return {
      total,
      finalizados,
      pendentes: total - finalizados,
      semRetorno: lista.filter((r) => r.status === "SEM RETORNO").length,
      taxaNum: total ? (finalizados / total) * 100 : 0,
      mediaHoras: media(duracoes),
      medianaHoras: percentil(duracoes, 50),
      p90Horas: percentil(duracoes, 90),
      medidos: duracoes.length,
      precisos: lista.filter((r) => duracaoAtendimento(r) !== null && duracaoEhPrecisa(r)).length
    };
  }, []);

  const atual = useMemo(() => resumir(dados), [dados, resumir]);
  const anterior = useMemo(() => resumir(dadosAnteriores), [dadosAnteriores, resumir]);
  const temComparacao = dadosAnteriores.length > 0;

  const kpis = useMemo(
    () => ({
      ...atual,
      taxa: percent(atual.finalizados, atual.total),
      tempoMedio: formatarDuracao(atual.mediaHoras),
      mediana: formatarDuracao(atual.medianaHoras),
      p90: formatarDuracao(atual.p90Horas),
      emAberto: atual.total - atual.medidos
    }),
    [atual]
  );

  /* ------------------------------- métricas de período (A, B e alertas) */

  /*
   * Estas contas rodam sobre `todos` — a lista inteira que o listener trouxe —,
   * e não sobre `dados`, que já vem recortado pela data de ABERTURA. Um chamado
   * aberto em julho e encerrado em agosto conta como encerramento de agosto, e
   * ele simplesmente não estaria em `dados` de agosto.
   */
  const metricasA = useMemo(
    () => metricasDoPeriodo(todos, intervaloA, config),
    [todos, intervaloA, config]
  );

  const metricasB = useMemo(
    () => (intervaloB ? metricasDoPeriodo(todos, intervaloB, config) : null),
    [todos, intervaloB, config]
  );

  const statsDuracao = useMemo(() => estatisticasDuracao(todos, config), [todos, config]);

  const futuros = useMemo(() => dados.filter((r) => ehDataFutura(r)), [dados]);

  const inconsistentes = useMemo(() => dados.filter(temDatasInconsistentes), [dados]);

  const outliers = useMemo(
    () => dados.filter((r) => ehOutlier(r, statsDuracao, config)),
    [dados, statsDuracao, config]
  );

  const abertosAgora = useMemo(() => emAbertoAgora(todos), [todos]);

  const breakdownStatus = useMemo(
    () => STATUS_OPTIONS.map((s) => [s, metricasA.porStatus[s] || 0]),
    [metricasA]
  );

  const breakdownMotivo = useMemo(
    () => MOTIVOS.map((m) => [m, metricasA.porMotivo[m] || 0]),
    [metricasA]
  );

  // Ordenado por volume: em uso, a pergunta é "para que mais usam", não a ordem
  // em que as opções foram cadastradas.
  const breakdownUso = useMemo(
    () => USOS.map((u) => [u, metricasA.porUso[u] || 0]).sort((a, b) => b[1] - a[1]),
    [metricasA]
  );

  const breakdownVenda = useMemo(
    () => [
      ["GANHO", metricasA.porVenda.GANHO],
      ["PERDIDO", metricasA.porVenda.PERDIDO],
      ["NAO INFORMADO", metricasA.porVenda["NAO INFORMADO"]]
    ],
    [metricasA]
  );

  /* --------------------------------------------- onde o tempo é gasto */

  const reparticaoDoTempo = useMemo(() => {
    const filas = dados.map(tempoDeFila).filter((h) => h !== null);
    const atendimentos = dados.map(tempoDeAtendimento).filter((h) => h !== null);
    return {
      fila: percentil(filas, 50),
      atendimento: percentil(atendimentos, 50),
      amostra: Math.min(filas.length, atendimentos.length)
    };
  }, [dados]);

  const serie = useMemo(() => serieTemporal(dados, intervaloA), [dados, intervaloA]);

  const matrizHeatmap = useMemo(
    () => matrizDiaHora(filtrarPorAbertura(dados, intervaloA)),
    [dados, intervaloA]
  );

  /* ------------------------------------------------------------ agregados */

  const porTecnico = useMemo(() => agruparPorTecnico(dados), [dados]);
  const porStatus = useMemo(() => agruparContagem(dados, (r) => r.status), [dados]);
  const porAc = useMemo(() => agruparContagem(dados, (r) => r.ac).slice(0, 6), [dados]);
  const porTipo = useMemo(() => agruparContagem(dados, (r) => r.tipo).slice(0, 6), [dados]);

  /** Média de duração por técnico, só sobre atendimentos mensuráveis. */
  const tempoPorTecnico = useMemo(() => {
    const mensuraveis = dados.filter((r) => duracaoAtendimento(r) !== null);
    return agruparPorTecnico(mensuraveis)
      .map(([nome]) => {
        const chave = normKey(nome);
        const tempos = mensuraveis
          .filter((r) => normKey(r.tecnico) === chave)
          .map(duracaoAtendimento);
        return [nome, Number((media(tempos) || 0).toFixed(1)), tempos.length];
      })
      .sort((a, b) => a[1] - b[1]);
  }, [dados]);

  /**
   * Tempo médio até o técnico se associar ao chamado (EM ABERTO → EM ANDAMENTO),
   * por técnico. Usa tempoDeFila (dataAbertura → dataInicioAtendimento) e só
   * entram atendimentos com os dois carimbos — os mesmos que o gráfico
   * "Onde o tempo é gasto" já usa, só que aqui quebrado por técnico.
   */
  const tempoAssociacaoPorTecnico = useMemo(() => {
    const mensuraveis = dados.filter((r) => tempoDeFila(r) !== null);
    return agruparPorTecnico(mensuraveis)
      .map(([nome]) => {
        const chave = normKey(nome);
        const tempos = mensuraveis
          .filter((r) => normKey(r.tecnico) === chave)
          .map(tempoDeFila);
        return [nome, Number((media(tempos) || 0).toFixed(1)), tempos.length];
      })
      .sort((a, b) => a[1] - b[1]);
  }, [dados]);

  const devidoIndevido = useMemo(() => {
    const responsaveis = [...new Set(dados.map((r) => r.responsavelAbertura))].slice(0, 8);
    return {
      responsaveis,
      devido: responsaveis.map(
        (nome) =>
          dados.filter((r) => r.responsavelAbertura === nome && r.statusAbertura === "DEVIDO")
            .length
      ),
      indevido: responsaveis.map(
        (nome) =>
          dados.filter((r) => r.responsavelAbertura === nome && r.statusAbertura === "INDEVIDO")
            .length
      )
    };
  }, [dados]);

  /* -------------------------------------------------------------- tabelas */

  const rankingTecnicos = useMemo(
    () =>
      porTecnico.map(([nome, total]) => {
        const chave = normKey(nome);
        const doTecnico = dados.filter((r) => normKey(r.tecnico) === chave);
        const fin = doTecnico.filter((r) => r.status === "FINALIZADO").length;
        const duracoes = doTecnico.map(duracaoAtendimento).filter((h) => h !== null);
        const temposAssociacao = doTecnico.map(tempoDeFila).filter((h) => h !== null);
        return {
          nome,
          total,
          fin,
          tempo: formatarDuracao(media(duracoes)),
          tempoAssociacao: formatarDuracao(media(temposAssociacao)),
          andamento: doTecnico.filter((r) => r.status === "EM ANDAMENTO").length,
          aberto: doTecnico.filter((r) => r.status === "EM ABERTO").length,
          semRetorno: doTecnico.filter((r) => r.status === "SEM RETORNO").length,
          taxaNum: total ? Math.round((fin / total) * 100) : 0,
          taxa: percent(fin, total)
        };
      }),
    [porTecnico, dados]
  );

  const rankingResponsaveis = useMemo(
    () =>
      agruparContagem(dados, (r) => r.responsavelAbertura).map(([nome, total]) => {
        const doResp = dados.filter((r) => r.responsavelAbertura === nome);
        const indevido = doResp.filter((r) => r.statusAbertura === "INDEVIDO").length;
        return {
          nome,
          total,
          devido: doResp.filter((r) => r.statusAbertura === "DEVIDO").length,
          indevido,
          percentualNum: total ? Math.round((indevido / total) * 100) : 0,
          percentual: percent(indevido, total)
        };
      }),
    [dados]
  );

  /* -------------------------------------------------------- opções comuns */

  // Uma série só: barra de hue única. Cor por barra não codificaria nada.
  const barraUnica = (valores) => ({
    data: valores,
    backgroundColor: cores.barras,
    borderRadius: 4,
    borderSkipped: false,
    maxBarThickness: 34
  });

  const semLegenda = { plugins: { legend: { display: false } } };

  const vazio = !carregando && dados.length === 0;
  const periodoLabel = rotuloIntervalo(intervaloA);

  /**
   * Abre a lista no chamado apontado por um alerta.
   *
   * Vai pelos dois caminhos de propósito: `id` abre o painel do chamado direto
   * quando ele está entre os carregados, e `protocolo` deixa a lista filtrada —
   * que é o único caminho possível para os 185 chamados importados sem
   * protocolo, cujo `id` a busca do Firestore não indexa.
   */
  const abrirChamado = useCallback(
    (registro) => {
      const params = new URLSearchParams({ status: "todos", id: registro.id });
      if (registro.protocolo) params.set("protocolo", registro.protocolo);
      navigate(`/?${params.toString()}`);
    },
    [navigate]
  );

  return (
    <div className="dashboard-page">
      <div className="container dashboard-container">
        <header className="header dashboard-header">
          <Link to="/" className="dashboard-home" title="Voltar à lista">
            ⌂
          </Link>

          <div className="dashboard-title-wrap">
            <h1>
              {isAdmin ? "dashboard " : "minhas métricas "}
              <span className="dash-pipe">{isAdmin ? "|" : "•"}</span>{" "}
              <strong>{isAdmin ? "Suporte Técnico" : displayName || "Operador"}</strong>
            </h1>
          </div>

          <div className="actions dashboard-actions">
            <ThemeToggle />
            <span className="user-info">
              <span>
                {isAdmin ? "Admin" : "Operador"} · {displayName}
              </span>
              <button type="button" className="btn btn-ghost btn-small" onClick={handleLogout}>
                Sair
              </button>
            </span>
          </div>
        </header>

        <section className="dashboard-filters">
          <PeriodoSelector
            id="periodoA"
            label="Período A"
            valor={periodoA}
            onChange={setPeriodoA}
          />

          <PeriodoSelector
            id="periodoB"
            label="Comparar com"
            valor={periodoB}
            onChange={setPeriodoB}
            permiteVazio
          />

          <div className="field">
            <label htmlFor="filtroAcDashboard">AC</label>
            <select id="filtroAcDashboard" value={ac} onChange={(e) => setAc(e.target.value)}>
              <option value="todos">Todas</option>
              {opcoesAc.map((nome) => (
                <option key={nome} value={nome}>
                  {nome}
                </option>
              ))}
            </select>
          </div>

          {isAdmin ? (
            <div className="field">
              <label htmlFor="filtroTecnicoDashboard">Técnico</label>
              <select
                id="filtroTecnicoDashboard"
                value={tecnico}
                onChange={(e) => setTecnico(e.target.value)}
              >
                <option value="todos">Todos</option>
                {opcoesTecnico.map((nome) => (
                  <option key={nome} value={nome}>
                    {nome}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </section>

        {truncado ? (
          <p className="aviso-truncado">
            O período selecionado tem mais de {truncado} atendimentos. Os números abaixo
            consideram só os {truncado} mais recentes — escolha um período menor para uma
            leitura completa.
          </p>
        ) : null}

        <h2 className="section-title">Visão geral · {periodoLabel}</h2>

        <AlertasMetricas
          futuros={futuros}
          outliers={outliers}
          inconsistentes={inconsistentes}
          stats={statsDuracao}
          onAbrir={abrirChamado}
        />

        <section className="stats dashboard-kpis">
          <div
            className="stat-card"
            title="Chamados abertos dentro do período A."
          >
            <span>Abertos no período</span>
            <strong>{metricasA.abertos}</strong>
          </div>

          <div
            className="stat-card"
            title="Chamados ENCERRADOS dentro do período — inclusive os que foram abertos antes dele."
          >
            <span>Encerrados no período</span>
            <strong>{metricasA.encerrados}</strong>
          </div>

          <div
            className="stat-card"
            title={`Relógio de parede menos os dias não trabalhados. Média de ${metricasA.medidos} atendimento(s) encerrado(s); os chamados fora da média não entram.`}
          >
            <span>Tempo médio ajustado</span>
            <strong>{humanDur(metricasA.tempoAjustado)}</strong>
            <small>abertura → encerramento</small>
          </div>

          <div
            className="stat-card"
            title={`Só as horas dentro do expediente (${config.bhStart}–${config.bhEnd}), nos dias de trabalho configurados.`}
          >
            <span>Tempo médio útil</span>
            <strong>{humanDur(metricasA.tempoUtil)}</strong>
            <small>
              {config.bhStart}–{config.bhEnd}
            </small>
          </div>

          <div
            className="stat-card"
            title="Encerrados com sucesso ÷ total de encerrados no período."
          >
            <span>Taxa de sucesso</span>
            <strong>{metricasA.taxa}%</strong>
            <small>{metricasA.sucesso} de {metricasA.encerrados}</small>
          </div>

          <div
            className="stat-card"
            title="Entre os FINALIZADOS no período com CPF/CNPJ identificado, quantos tiveram o mesmo cliente abrindo outro chamado nos 7 dias seguintes — sinal de que a resolução não durou."
          >
            <span>Reincidência (7d)</span>
            <strong>{metricasA.reincidencia.taxa}%</strong>
            <small>{metricasA.reincidencia.reincidentes} de {metricasA.reincidencia.total}</small>
          </div>

          <div className="stat-card" title="Chamados não encerrados agora, independentemente do período.">
            <span>Em aberto agora</span>
            <strong>{abertosAgora}</strong>
          </div>
        </section>

        <section className="stats dashboard-kpis">
          <button
            type="button"
            className="stat-card kpi-highlight"
            onClick={() => abrirLista({})}
            title="Ver estes atendimentos na lista"
          >
            <span>Total</span>
            <strong>{kpis.total}</strong>
            {temComparacao ? <Delta valor={variacao(atual.total, anterior.total)} /> : null}
          </button>

          <button
            type="button"
            className="stat-card"
            onClick={() => abrirLista({ status: "FINALIZADO" })}
            title="Ver os finalizados na lista"
          >
            <span>Finalizados</span>
            <strong>{kpis.finalizados}</strong>
            {temComparacao ? (
              <Delta valor={variacao(atual.finalizados, anterior.finalizados)} />
            ) : null}
          </button>

          <div className="stat-card">
            <span>Pendentes</span>
            <strong>{kpis.pendentes}</strong>
            {temComparacao ? (
              <Delta valor={variacao(atual.pendentes, anterior.pendentes)} inverso />
            ) : null}
          </div>

          <div className="stat-card">
            <span>Taxa</span>
            <strong>{kpis.taxa}</strong>
            {temComparacao ? <Delta valor={variacao(atual.taxaNum, anterior.taxaNum)} /> : null}
          </div>

          <button
            type="button"
            className="stat-card"
            onClick={() => abrirLista({ status: "SEM RETORNO" })}
            title="Ver os sem retorno na lista"
          >
            <span>S/ retorno</span>
            <strong>{kpis.semRetorno}</strong>
            {temComparacao ? (
              <Delta valor={variacao(atual.semRetorno, anterior.semRetorno)} inverso />
            ) : null}
          </button>

          <div
            className="stat-card"
            title={`Da associação do técnico (ou da abertura, nos registros antigos) até o encerramento. ${kpis.medidos} de ${kpis.total} medidos, ${kpis.precisos} com carimbo exato; ${kpis.emAberto} ainda não encerrados.`}
          >
            <span>Tempo de resolução</span>
            <strong>{kpis.mediana}</strong>
            <small>
              mediana · p90 {kpis.p90} · média {kpis.tempoMedio}
            </small>
            {temComparacao ? (
              <Delta valor={variacao(atual.medianaHoras, anterior.medianaHoras)} inverso />
            ) : null}
          </div>
        </section>

        {metricasB ? (
          <ComparacaoPeriodos
            intervaloA={intervaloA}
            intervaloB={intervaloB}
            a={metricasA}
            b={metricasB}
          />
        ) : null}

        {carregando ? <p className="dashboard-loading">Carregando...</p> : null}
        {vazio ? <p className="dashboard-empty">Nenhum dado para os filtros.</p> : null}

        {!vazio && !carregando ? (
          <>
            <h2 className="section-title">Distribuição</h2>

            <div className="dashboard-grid">
              {serie.labels.length ? (
                <ChartCard
                  titulo="Evolução do volume"
                  meta="por dia"
                  largura="span-full"
                >
                  <div className="chart-wrap chart-wrap-linha">
                    <ChartCanvas
                      type="line"
                      data={{
                        labels: serie.labels,
                        datasets: [
                          {
                            label: "Abertos",
                            data: serie.abertos,
                            borderColor: cores.devido,
                            backgroundColor: cores.devido,
                            borderWidth: 2,
                            pointRadius: 0,
                            pointHoverRadius: 5,
                            tension: 0.25
                          },
                          {
                            label: "Encerrados",
                            data: serie.encerrados,
                            borderColor: coresStatus.FINALIZADO,
                            backgroundColor: coresStatus.FINALIZADO,
                            borderWidth: 2,
                            pointRadius: 0,
                            pointHoverRadius: 5,
                            tension: 0.25
                          }
                        ]
                      }}
                      options={{
                        interaction: { mode: "index", intersect: false },
                        scales: { y: { beginAtZero: true }, x: { ticks: { maxRotation: 0 } } }
                      }}
                    />
                  </div>
                </ChartCard>
              ) : null}

              <ChartCard
                titulo="Suporte por dia e hora"
                meta="picos de abertura no período"
                largura="span-full"
              >
                <HeatmapSuportes matriz={matrizHeatmap} cor={cores.devido} />
              </ChartCard>

              <ChartCard
                titulo="Por técnico"
                meta={`${porTecnico.length} técnico(s)`}
                largura="span-2"
              >
                <div className="chart-wrap chart-wrap-bar">
                  <ChartCanvas
                    type="bar"
                    data={{
                      labels: porTecnico.map(([k]) => k),
                      datasets: [{ label: "Suportes", ...barraUnica(porTecnico.map(([, v]) => v)) }]
                    }}
                    options={{
                      ...semLegenda,
                      onClick: cliqueNoGrafico("tecnico", porTecnico.map(([k]) => k)),
                      scales: { y: { beginAtZero: true }, x: { ticks: { maxRotation: 45 } } }
                    }}
                  />
                </div>
              </ChartCard>

              <ChartCard titulo="Finalização" meta={kpis.taxa}>
                <div className="chart-wrap chart-wrap-donut">
                  <ChartCanvas
                    type="doughnut"
                    data={{
                      labels: ["Finalizados", "Pendentes"],
                      datasets: [
                        {
                          data: [kpis.finalizados, kpis.pendentes],
                          backgroundColor: [coresStatus.FINALIZADO, cores.pendente],
                          borderColor: superficie,
                          borderWidth: 2
                        }
                      ]
                    }}
                    options={{ cutout: "64%" }}
                  />
                </div>
              </ChartCard>

              <ChartCard titulo="Status" meta={`${porStatus.length} situações`}>
                <div className="chart-wrap chart-wrap-donut">
                  <ChartCanvas
                    type="doughnut"
                    data={{
                      labels: porStatus.map(([k]) => k),
                      datasets: [
                        {
                          data: porStatus.map(([, v]) => v),
                          backgroundColor: porStatus.map(([k]) => coresStatus[k] || cores.pendente),
                          borderColor: superficie,
                          borderWidth: 2
                        }
                      ]
                    }}
                    options={{
                      cutout: "64%",
                      onClick: cliqueNoGrafico(
                        "status",
                        porStatus.map(([k]) => k)
                      )
                    }}
                  />
                </div>
              </ChartCard>

              <ChartCard
                titulo="Tempo médio por técnico"
                meta={`horas · ${kpis.medidos} de ${kpis.total}`}
                largura="span-2"
              >
                <div className="chart-wrap chart-wrap-bar">
                  <ChartCanvas
                    type="bar"
                    data={{
                      labels: tempoPorTecnico.map(([k]) => k),
                      datasets: [
                        { label: "Horas", ...barraUnica(tempoPorTecnico.map(([, v]) => v)) }
                      ]
                    }}
                    options={{
                      ...semLegenda,
                      scales: { y: { beginAtZero: true }, x: { ticks: { maxRotation: 45 } } },
                      plugins: {
                        legend: { display: false },
                        tooltip: {
                          callbacks: {
                            label: (ctx) => {
                              const n = tempoPorTecnico[ctx.dataIndex]?.[2] ?? 0;
                              return `${formatarDuracao(ctx.parsed.y)} · ${n} atendimento(s)`;
                            }
                          }
                        }
                      }
                    }}
                  />
                </div>
              </ChartCard>

              <ChartCard
                titulo="Tempo médio para assumir por técnico"
                meta="horas · abertura → associação"
                largura="span-2"
              >
                <div className="chart-wrap chart-wrap-bar">
                  <ChartCanvas
                    type="bar"
                    data={{
                      labels: tempoAssociacaoPorTecnico.map(([k]) => k),
                      datasets: [
                        {
                          label: "Horas",
                          ...barraUnica(tempoAssociacaoPorTecnico.map(([, v]) => v))
                        }
                      ]
                    }}
                    options={{
                      ...semLegenda,
                      scales: { y: { beginAtZero: true }, x: { ticks: { maxRotation: 45 } } },
                      plugins: {
                        legend: { display: false },
                        tooltip: {
                          callbacks: {
                            label: (ctx) => {
                              const n = tempoAssociacaoPorTecnico[ctx.dataIndex]?.[2] ?? 0;
                              return `${formatarDuracao(ctx.parsed.y)} · ${n} atendimento(s)`;
                            }
                          }
                        }
                      }
                    }}
                  />
                </div>
                <p className="chart-nota">
                  Tempo entre a abertura do chamado e o técnico se associar a ele. Só entram
                  atendimentos com os dois carimbos registrados.
                </p>
              </ChartCard>

              <ChartCard titulo="Por AC" meta={`top ${porAc.length}`}>
                <div className="chart-wrap chart-wrap-bar-h">
                  <ChartCanvas
                    type="bar"
                    data={{
                      labels: porAc.map(([k]) => k),
                      datasets: [{ label: "Suportes", ...barraUnica(porAc.map(([, v]) => v)) }]
                    }}
                    options={{
                      ...semLegenda,
                      indexAxis: "y",
                      onClick: cliqueNoGrafico("ac", porAc.map(([k]) => k)),
                      scales: { x: { beginAtZero: true } }
                    }}
                  />
                </div>
              </ChartCard>

              {reparticaoDoTempo.amostra > 0 ? (
                <ChartCard
                  titulo="Onde o tempo é gasto"
                  meta={`mediana · ${reparticaoDoTempo.amostra} atendimento(s)`}
                >
                  <div className="chart-wrap chart-wrap-bar-h">
                    <ChartCanvas
                      type="bar"
                      data={{
                        labels: ["Mediana"],
                        datasets: [
                          {
                            label: "Na fila",
                            data: [Number((reparticaoDoTempo.fila || 0).toFixed(1))],
                            backgroundColor: cores.indevido,
                            borderColor: superficie,
                            borderWidth: { right: 2 },
                            borderRadius: 4,
                            borderSkipped: false
                          },
                          {
                            label: "Em atendimento",
                            data: [Number((reparticaoDoTempo.atendimento || 0).toFixed(1))],
                            backgroundColor: cores.devido,
                            borderRadius: 4,
                            borderSkipped: false
                          }
                        ]
                      }}
                      options={{
                        indexAxis: "y",
                        scales: {
                          x: { stacked: true, beginAtZero: true },
                          y: { stacked: true }
                        },
                        plugins: {
                          tooltip: {
                            callbacks: {
                              label: (ctx) =>
                                `${ctx.dataset.label}: ${formatarDuracao(ctx.parsed.x)}`
                            }
                          }
                        }
                      }}
                    />
                  </div>
                  <p className="chart-nota">
                    Tempo até alguém assumir o chamado versus tempo trabalhando nele. Conta só
                    atendimentos com carimbo de associação.
                  </p>
                </ChartCard>
              ) : null}

              <ChartCard titulo="Por tipo" meta={`top ${porTipo.length}`}>
                <div className="chart-wrap chart-wrap-bar-h">
                  <ChartCanvas
                    type="bar"
                    data={{
                      labels: porTipo.map(([k]) => k),
                      datasets: [{ label: "Suportes", ...barraUnica(porTipo.map(([, v]) => v)) }]
                    }}
                    options={{
                      ...semLegenda,
                      indexAxis: "y",
                      scales: { x: { beginAtZero: true } }
                    }}
                  />
                </div>
              </ChartCard>

              <ChartCard
                titulo="Devido / Indevido por responsável"
                meta={`top ${devidoIndevido.responsaveis.length}`}
                largura="span-full"
              >
                <div className="chart-wrap chart-wrap-bar">
                  <ChartCanvas
                    type="bar"
                    data={{
                      labels: devidoIndevido.responsaveis,
                      datasets: [
                        {
                          label: "Devido",
                          data: devidoIndevido.devido,
                          backgroundColor: cores.devido,
                          borderColor: superficie,
                          borderWidth: { top: 2 },
                          borderRadius: 4,
                          borderSkipped: false,
                          maxBarThickness: 40
                        },
                        {
                          label: "Indevido",
                          data: devidoIndevido.indevido,
                          backgroundColor: cores.indevido,
                          borderColor: superficie,
                          borderWidth: { top: 2 },
                          borderRadius: 4,
                          borderSkipped: false,
                          maxBarThickness: 40
                        }
                      ]
                    }}
                    options={{
                      scales: {
                        x: { stacked: true, ticks: { maxRotation: 45 } },
                        y: { stacked: true, beginAtZero: true }
                      }
                    }}
                  />
                </div>
              </ChartCard>
            </div>

            <h2 className="section-title">Classificação dos chamados</h2>

            <div className="dashboard-grid">
              <ChartCard titulo="Por situação" meta="abertos no período">
                <BreakdownList
                  itens={breakdownStatus}
                  aoClicar={(status) => abrirLista({ status })}
                />
              </ChartCard>

              <ChartCard titulo="Por motivo" meta={`${metricasA.abertos} chamado(s)`}>
                <BreakdownList itens={breakdownMotivo} />
                <p className="chart-nota">
                  Motivos escritos à mão são enquadrados na categoria mais próxima; o texto
                  original fica no chamado.
                </p>
              </ChartCard>

              <ChartCard titulo="Motivo da utilização" meta="e plataforma">
                <BreakdownList itens={breakdownUso} subItens={metricasA.plataformas} />
              </ChartCard>

              <ChartCard titulo="Venda ganha/perdida" meta={`${metricasA.taxaVenda}% de taxa de ganho`}>
                <BreakdownList itens={breakdownVenda} />
                <p className="chart-nota">
                  {metricasA.valorGanho.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}{" "}
                  ganhos · {metricasA.valorPerdido.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}{" "}
                  perdidos
                </p>
              </ChartCard>
            </div>

            <ChartColorsPanel
              cores={cores}
              onAlterar={alterarCor}
              onRestaurar={restaurarPadrao}
              personalizado={personalizado}
            />

            <ConfigMetricasPanel
              config={config}
              isAdmin={isAdmin}
              onSalvarHorario={salvarHorario}
              onAdicionarDia={adicionarDia}
              onRemoverDia={removerDia}
            />

            <h2 className="section-title">Rankings</h2>

            <div className="dashboard-tables">
              <section className="dashboard-table-section">
                <h2>Técnicos</h2>
                <div className="table-wrapper table-compact">
                  <table>
                    <thead>
                      <tr>
                        <th>Técnico</th>
                        <th className="td-num-head">Total</th>
                        <th className="td-num-head">Fin.</th>
                        <th className="td-num-head">And.</th>
                        <th className="td-num-head">Ab.</th>
                        <th className="td-num-head">S/R</th>
                        <th className="td-num-head">Tempo</th>
                        <th className="td-num-head">T. p/ assumir</th>
                        <th className="td-num-head">Taxa</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rankingTecnicos.map((linha, i) => (
                        <tr key={linha.nome}>
                          <td>
                            <span className="rank-cell">
                              <span className="rank-pos">{i + 1}</span>
                              {linha.nome}
                            </span>
                          </td>
                          <td className="td-num">{linha.total}</td>
                          <td className="td-num">{linha.fin}</td>
                          <td className="td-num">{linha.andamento}</td>
                          <td className="td-num">{linha.aberto}</td>
                          <td className="td-num">{linha.semRetorno}</td>
                          <td className="td-num">{linha.tempo}</td>
                          <td className="td-num">{linha.tempoAssociacao}</td>
                          <td className="td-num">
                            <Meter valor={linha.taxaNum} texto={linha.taxa} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="dashboard-table-section">
                <h2>Responsável pela abertura</h2>
                <div className="table-wrapper table-compact">
                  <table>
                    <thead>
                      <tr>
                        <th>Nome</th>
                        <th className="td-num-head">Total</th>
                        <th className="td-num-head">Dev.</th>
                        <th className="td-num-head">Indev.</th>
                        <th className="td-num-head">% Ind.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rankingResponsaveis.map((linha, i) => (
                        <tr key={linha.nome}>
                          <td>
                            <span className="rank-cell">
                              <span className="rank-pos">{i + 1}</span>
                              {linha.nome}
                            </span>
                          </td>
                          <td className="td-num">{linha.total}</td>
                          <td className="td-num">{linha.devido}</td>
                          <td className="td-num">{linha.indevido}</td>
                          <td className="td-num">
                            <Meter valor={linha.percentualNum} texto={linha.percentual} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
