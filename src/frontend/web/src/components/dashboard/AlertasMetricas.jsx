import { formatDate } from "../../utils/format";
import { humanDur } from "../../services/metricasService";

const LIMITE_LISTA = 40;
const MAX_NOME = 26;

/**
 * Como o chamado aparece no alerta.
 *
 * O protocolo é a identificação natural, mas 185 dos chamados importados não
 * têm um. Antes esses caíam no id do documento e viravam uma fileira de
 * "#support_" — todos iguais, nenhum clicável com convicção. O nome do cliente
 * é o que a pessoa reconhece; a data desempata quem abriu vários e aparece no
 * `title`, para não poluir a frase.
 */
function rotuloChamado(registro) {
  if (registro.protocolo) return `#${registro.protocolo}`;

  const nome = registro.responsavelAbertura;
  if (nome && nome !== "Não informado") {
    return nome.length > MAX_NOME ? `${nome.slice(0, MAX_NOME - 1)}…` : nome;
  }
  return `#${registro.id.slice(0, 8)}`;
}

function descricaoCompleta(registro) {
  const partes = [];
  if (registro.protocolo) partes.push(`Protocolo ${registro.protocolo}`);
  if (registro.responsavelAbertura && registro.responsavelAbertura !== "Não informado") {
    partes.push(registro.responsavelAbertura);
  }
  if (registro.dataAbertura) partes.push(`aberto em ${formatDate(registro.dataAbertura)}`);
  if (registro.tecnico && registro.tecnico !== "Não atribuído") partes.push(registro.tecnico);
  return partes.join(" · ") || "Abrir na lista";
}

/**
 * Dois avisos que explicam números estranhos antes que alguém os conteste:
 *
 * 1. Abertura no futuro — digitação errada na abertura retroativa. Além de
 *    bagunçar a ordenação, produz duração negativa e derruba a média.
 * 2. Encerramento anterior à abertura — o chamado se contradiz. Não dá para
 *    medir quanto tempo levou, então ele sai das médias (mas continua contando
 *    como encerrado, porque foi).
 * 3. Duração fora do padrão — acima de 2 desvios-padrão. Não é erro: é o
 *    chamado que ficou uma semana esquecido e sozinho puxa a média da equipe.
 *    A saída é abrir e justificar a exclusão, não apagar.
 *
 * A lista é cortada em 40 links porque o objetivo é dar o que conferir hoje —
 * uma parede com 300 protocolos não é acionável.
 */
export default function AlertasMetricas({ futuros, outliers, inconsistentes = [], stats, onAbrir }) {
  if (!futuros.length && !outliers.length && !inconsistentes.length) return null;

  const Link = ({ registro }) => (
    <button
      type="button"
      className="alerta-link"
      title={descricaoCompleta(registro)}
      onClick={() => onAbrir?.(registro)}
    >
      {rotuloChamado(registro)}
    </button>
  );

  return (
    <div className="metricas-alertas">
      {futuros.length ? (
        <div className="alerta-box alerta-box-atencao">
          <strong>
            🕒 {futuros.length} chamado(s) com data de abertura no futuro.
          </strong>{" "}
          Provável erro de digitação na abertura retroativa — eles distorcem a ordenação e o
          tempo médio. Confira:{" "}
          {futuros.slice(0, LIMITE_LISTA).map((r, i) => (
            <span key={r.id}>
              {i > 0 ? ", " : ""}
              <Link registro={r} /> ({formatDate(r.dataAbertura)})
            </span>
          ))}
          {futuros.length > LIMITE_LISTA ? " …" : ""}
        </div>
      ) : null}

      {inconsistentes.length ? (
        <div className="alerta-box alerta-box-atencao">
          <strong>
            ⛔ {inconsistentes.length} chamado(s) encerrados antes da data de abertura.
          </strong>{" "}
          As datas se contradizem, então eles ficam fora das médias de tempo — mas continuam
          contando como encerrados. Corrija a abertura:{" "}
          {inconsistentes.slice(0, LIMITE_LISTA).map((r, i) => (
            <span key={r.id}>
              {i > 0 ? ", " : ""}
              <Link registro={r} />
            </span>
          ))}
          {inconsistentes.length > LIMITE_LISTA ? " …" : ""}
        </div>
      ) : null}

      {outliers.length ? (
        <div className="alerta-box">
          <strong>⚠ {outliers.length} chamado(s) com duração fora do padrão</strong> (acima de 2
          desvios-padrão da média de {humanDur(stats.media)}). Abra e justifique para excluir da
          média:{" "}
          {outliers.slice(0, LIMITE_LISTA).map((r, i) => (
            <span key={r.id}>
              {i > 0 ? ", " : ""}
              <Link registro={r} />
            </span>
          ))}
          {outliers.length > LIMITE_LISTA ? " …" : ""}
        </div>
      ) : null}
    </div>
  );
}
