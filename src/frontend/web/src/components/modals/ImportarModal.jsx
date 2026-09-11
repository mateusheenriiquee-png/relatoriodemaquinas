import { useEffect, useRef, useState } from "react";
import Modal from "../Modal";
import {
  diagnosticarRegistros,
  importarRegistros,
  lerArquivo
} from "../../services/importExportService";

const COLUNAS_PREVIA = [
  { chave: "dataAbertura", titulo: "Abertura" },
  { chave: "protocolo", titulo: "Protocolo" },
  { chave: "nomeCliente", titulo: "Cliente" },
  { chave: "responsavelAbertura", titulo: "Responsável" },
  { chave: "cpfCnpj", titulo: "CPF/CNPJ" },
  { chave: "tipo", titulo: "Tipo" },
  { chave: "status", titulo: "Status" }
];

const LIMITE_PREVIA = 10;

const ROTULO_NIVEL = { erro: "✕", aviso: "!", ok: "✓" };

/**
 * Importação de planilha (.xlsx / .csv).
 *
 * A leitura e a gravação são passos separados de propósito: nada vai para o
 * banco antes de a pessoa ver quantas linhas foram entendidas e conferir a
 * amostra. No modo "substituir" a coleção é apagada, então essa conferência é
 * a única defesa contra importar o arquivo errado.
 */
export default function ImportarModal({ open, onClose, onConcluido }) {
  const inputRef = useRef(null);
  const [registros, setRegistros] = useState([]);
  const [arquivo, setArquivo] = useState("");
  const [modo, setModo] = useState("mesclar");
  const [status, setStatus] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  // Reabrir o modal não pode reaproveitar o arquivo da vez anterior.
  useEffect(() => {
    if (open) return;
    setRegistros([]);
    setArquivo("");
    setModo("mesclar");
    setStatus("");
    setErro("");
    setOcupado(false);
  }, [open]);

  async function handleArquivo(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setOcupado(true);
    setErro("");
    setStatus("Lendo o arquivo...");
    try {
      const lidos = await lerArquivo(file);
      setRegistros(lidos);
      setArquivo(file.name);
      setStatus(
        lidos.length
          ? `${lidos.length} registro(s) reconhecido(s).`
          : "Nenhuma linha reconhecida — confira se o cabeçalho da planilha está na primeira linha."
      );
    } catch (error) {
      setRegistros([]);
      setErro(error?.message || "Não foi possível ler o arquivo.");
      setStatus("");
    } finally {
      setOcupado(false);
    }
  }

  async function handleImportar() {
    if (!registros.length || ocupado) return;
    setOcupado(true);
    setErro("");
    try {
      const { gravados, removidos } = await importarRegistros(registros, modo, setStatus);
      onConcluido?.({ gravados, removidos, modo });
      onClose?.();
    } catch (error) {
      setErro(error?.message || "Falha ao gravar os registros.");
    } finally {
      setOcupado(false);
    }
  }

  // Recalculado a cada leitura de arquivo; barato o bastante para não memoizar
  // com a lista já em memória.
  const diagnostico = diagnosticarRegistros(registros);

  return (
    <Modal
      open={open}
      onClose={ocupado ? () => {} : onClose}
      title="Importar planilha"
      width={720}
      actions={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={ocupado}>
            Cancelar
          </button>
          <button
            type="button"
            className={`btn ${modo === "substituir" ? "btn-danger" : "btn-primary"}`}
            onClick={handleImportar}
            disabled={ocupado || !registros.length}
          >
            {ocupado
              ? "Processando..."
              : modo === "substituir"
                ? `Substituir tudo por ${registros.length} registro(s)`
                : `Importar ${registros.length} registro(s)`}
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="arquivoImport">Arquivo .xlsx ou .csv</label>
        <input
          id="arquivoImport"
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          disabled={ocupado}
          onChange={handleArquivo}
        />
      </div>

      <fieldset className="import-modos">
        <legend>Como gravar</legend>
        <label>
          <input
            type="radio"
            name="modoImport"
            value="mesclar"
            checked={modo === "mesclar"}
            disabled={ocupado}
            onChange={() => setModo("mesclar")}
          />
          <span>
            <strong>Mesclar</strong> — atualiza os registros existentes e cria os que faltam.
          </span>
        </label>
        <label>
          <input
            type="radio"
            name="modoImport"
            value="substituir"
            checked={modo === "substituir"}
            disabled={ocupado}
            onChange={() => setModo("substituir")}
          />
          <span>
            <strong>Substituir</strong> — apaga <em>todos</em> os atendimentos antes de importar.
            Não há como desfazer.
          </span>
        </label>
      </fieldset>

      {modo === "substituir" && registros.length ? (
        <p className="import-alerta">
          Isto vai apagar a coleção inteira e deixar apenas os {registros.length} registros de{" "}
          <strong>{arquivo}</strong>.
        </p>
      ) : null}

      {erro ? <p className="import-erro">{erro}</p> : null}
      {status ? <p className="import-status">{status}</p> : null}

      {diagnostico.itens.length ? (
        <>
          <h4 className="drawer-section-title">Como os dados chegaram</h4>
          <ul className="import-diagnostico">
            {diagnostico.itens.map((item) => (
              <li key={item.texto} className={`diag-${item.nivel}`}>
                <span className="diag-marca" aria-hidden="true">
                  {ROTULO_NIVEL[item.nivel]}
                </span>
                <b>{item.quantidade}</b> de {diagnostico.total} {item.texto}
              </li>
            ))}
          </ul>
          <p className="import-status">
            Nada aqui impede a importação — são os campos que vão aparecer vazios no dashboard.
          </p>
        </>
      ) : null}

      {registros.length ? (
        <>
          <h4 className="drawer-section-title">
            Amostra ({Math.min(LIMITE_PREVIA, registros.length)} de {registros.length})
          </h4>
          <div className="tabela-wrapper">
            <table className="tabela tabela-compacta">
              <thead>
                <tr>
                  {COLUNAS_PREVIA.map((coluna) => (
                    <th key={coluna.chave}>{coluna.titulo}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {registros.slice(0, LIMITE_PREVIA).map((registro) => (
                  <tr key={registro.docId}>
                    {COLUNAS_PREVIA.map((coluna) => (
                      <td key={coluna.chave}>{registro[coluna.chave] || "-"}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </Modal>
  );
}
