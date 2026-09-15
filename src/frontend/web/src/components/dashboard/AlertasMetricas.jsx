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

  /*
   * Chip em vez de link solto na frase corrida: com 18-40 protocolos numa
   * mesma linha (o caso real que motivou isto), o texto virava uma parede
   * ilegível — pior ainda no celular, onde cada vírgula obrigava a achar o
   * próximo link no meio do parágrafo. Em grade, cada chamado é um alvo de
   * toque isolado, do tamanho de um dedo.
   */
  const Chip = ({ registro, sufixo }) => (
    <button
      type="button"
      className="alerta-chip"
      title={descricaoCompleta(registro)}
      onClick={() => onAbrir?.(registro)}
    >
      {rotuloChamado(registro)}
      {sufixo ? <span className="alerta-chip-sufixo">{sufixo}</span> : null}
    </button>
  );

  const Grade = ({ registros, comData = false }) => (
    <div className="alerta-grade">
      {registros.slice(0, LIMITE_LISTA).map((r) => (
        <Chip key={r.id} registro={r} sufixo={comData ? formatDate(r.dataAbertura) : null} />
      ))}
      {registros.length > LIMITE_LISTA ? (
        <span className="alerta-mais">+{registros.length - LIMITE_LISTA}</span>
      ) : null}
    </div>
  );

  return (
    <div className="metricas-alertas">
      {futuros.length ? (
        <div className="alerta-box alerta-box-atencao">
          <strong>
            🕒 {futuros.length} chamado(s) com data de abertura no futuro.
          </strong>{" "}
          Provável erro de digitação na abertura retroativa — eles distorcem a ordenação e o
          tempo médio. Confira:
          <Grade registros={futuros} comData />
        </div>
      ) : null}

      {inconsistentes.length ? (
        <div className="alerta-box alerta-box-atencao">
          <strong>
            ⛔ {inconsistentes.length} chamado(s) encerrados antes da data de abertura.
          </strong>{" "}
          As datas se contradizem, então eles ficam fora das médias de tempo — mas continuam
          contando como encerrados. Corrija a abertura:
          <Grade registros={inconsistentes} />
        </div>
      ) : null}

      {outliers.length ? (
        <div className="alerta-box">
          <strong>⚠ {outliers.length} chamado(s) com duração fora do padrão</strong> (acima de 2
          desvios-padrão da média de {humanDur(stats.media)}). Abra e justifique para excluir da
          média:
          <Grade registros={outliers} />
        </div>
      ) : null}
    </div>
  );
}
