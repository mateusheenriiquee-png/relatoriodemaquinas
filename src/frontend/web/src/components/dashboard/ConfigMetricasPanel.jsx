import { useEffect, useState } from "react";
import { useToast } from "../ToastProvider";

const NOMES_DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function formatarDia(date) {
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

/**
 * Configuração que governa o "tempo útil" e o "tempo ajustado".
 *
 * Fica no dashboard, junto dos números que ela muda, e não numa aba de
 * administração distante: quem estranha a média é quem precisa informar o
 * feriado. Só admin edita — para os demais o painel é leitura, para que
 * qualquer um possa conferir com que expediente a conta foi feita.
 */
export default function ConfigMetricasPanel({ config, isAdmin, onSalvarHorario, onAdicionarDia, onRemoverDia }) {
  const toast = useToast();
  const [horario, setHorario] = useState({
    bhStart: config.bhStart,
    bhEnd: config.bhEnd,
    workDays: config.workDays
  });
  const [novoDia, setNovoDia] = useState({ date: "", nota: "" });
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    setHorario({ bhStart: config.bhStart, bhEnd: config.bhEnd, workDays: config.workDays });
  }, [config.bhStart, config.bhEnd, config.workDays]);

  const alternarDia = (indice) => {
    if (!isAdmin) return;
    setHorario((atual) => ({
      ...atual,
      workDays: atual.workDays.includes(indice)
        ? atual.workDays.filter((d) => d !== indice)
        : [...atual.workDays, indice].sort()
    }));
  };

  async function salvar() {
    if (horario.bhEnd <= horario.bhStart) {
      toast.error("O fim do expediente precisa ser depois do início.");
      return;
    }
    if (!horario.workDays.length) {
      toast.error("Selecione ao menos um dia de trabalho.");
      return;
    }
    setSalvando(true);
    try {
      await onSalvarHorario(horario);
      toast.success("Horário comercial atualizado.");
    } catch (err) {
      toast.error(err?.message || "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function adicionar() {
    if (!novoDia.date) {
      toast.error("Informe a data.");
      return;
    }
    try {
      await onAdicionarDia(novoDia.date, novoDia.nota);
      setNovoDia({ date: "", nota: "" });
      toast.success("Dia registrado. As médias já consideram a mudança.");
    } catch (err) {
      toast.error(err?.message || "Não foi possível registrar o dia.");
    }
  }

  async function remover(date) {
    try {
      await onRemoverDia(date);
      toast.success("Dia removido.");
    } catch (err) {
      toast.error(err?.message || "Não foi possível remover o dia.");
    }
  }

  const log = [...(config.diasLog || [])].reverse().slice(0, 30);

  return (
    <details className="config-metricas-panel">
      <summary>Configuração das métricas</summary>

      <p className="chart-colors-hint">
        Estes valores definem o <strong>tempo útil</strong> (só horas de expediente) e o{" "}
        <strong>tempo ajustado</strong> (relógio de parede menos os dias não trabalhados).
        {isAdmin ? "" : " Somente administradores podem alterar."}
      </p>

      <div className="config-metricas-grid">
        <div className="field">
          <label htmlFor="cfgInicio">Início do expediente</label>
          <input
            id="cfgInicio"
            type="time"
            value={horario.bhStart}
            disabled={!isAdmin}
            onChange={(e) => setHorario((a) => ({ ...a, bhStart: e.target.value }))}
          />
        </div>
        <div className="field">
          <label htmlFor="cfgFim">Fim do expediente</label>
          <input
            id="cfgFim"
            type="time"
            value={horario.bhEnd}
            disabled={!isAdmin}
            onChange={(e) => setHorario((a) => ({ ...a, bhEnd: e.target.value }))}
          />
        </div>
        <div className="field field-dias">
          <label>Dias de trabalho</label>
          <div className="config-chips">
            {NOMES_DIAS.map((nome, indice) => (
              <button
                key={nome}
                type="button"
                className={`config-chip ${horario.workDays.includes(indice) ? "on" : ""}`}
                onClick={() => alternarDia(indice)}
                disabled={!isAdmin}
              >
                {nome}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isAdmin ? (
        <div className="config-metricas-acoes">
          <button type="button" className="btn btn-primary btn-small" onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando..." : "Salvar horário"}
          </button>
        </div>
      ) : null}

      <h4 className="config-subtitulo">Dias não trabalhados</h4>
      <p className="chart-colors-hint">
        Feriados, pontos facultativos e paradas de sistema. O tempo desses dias sai da duração de
        todo chamado que estiver aberto neles.
      </p>

      {isAdmin ? (
        <div className="config-metricas-grid">
          <div className="field">
            <label htmlFor="cfgNovoDia">Data</label>
            <input
              id="cfgNovoDia"
              type="date"
              value={novoDia.date}
              onChange={(e) => setNovoDia((a) => ({ ...a, date: e.target.value }))}
            />
          </div>
          <div className="field field-dias">
            <label htmlFor="cfgNovoDiaNota">Motivo (opcional)</label>
            <input
              id="cfgNovoDiaNota"
              maxLength={120}
              placeholder="Feriado municipal, queda da AC…"
              value={novoDia.nota}
              onChange={(e) => setNovoDia((a) => ({ ...a, nota: e.target.value }))}
            />
          </div>
          <div className="config-metricas-acoes">
            <button type="button" className="btn btn-ghost btn-small" onClick={adicionar}>
              Registrar dia
            </button>
          </div>
        </div>
      ) : null}

      <div className="breakdown">
        {config.diasNaoTrab.length ? (
          config.diasNaoTrab.map((dia) => (
            <div className="breakdown-row" key={dia.date}>
              <span className="breakdown-label">
                <b>{formatarDia(dia.date)}</b>
                {dia.nota ? <span className="config-nota"> · {dia.nota}</span> : null}
              </span>
              {isAdmin ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-small"
                  onClick={() => remover(dia.date)}
                >
                  Remover
                </button>
              ) : null}
            </div>
          ))
        ) : (
          <p className="chart-colors-hint">Nenhum dia informado.</p>
        )}
      </div>

      {log.length ? (
        <>
          <h4 className="config-subtitulo">Alterações</h4>
          <ul className="config-log">
            {log.map((entrada, i) => (
              <li key={`${entrada.date}-${entrada.em}-${i}`}>
                <span className="config-log-quando">
                  {entrada.em ? new Date(entrada.em).toLocaleString("pt-BR") : "—"}
                  {entrada.por ? ` · ${entrada.por}` : ""}
                </span>{" "}
                Dia {entrada.acao}: <b>{formatarDia(entrada.date)}</b>
                {entrada.nota ? ` · ${entrada.nota}` : ""}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </details>
  );
}
