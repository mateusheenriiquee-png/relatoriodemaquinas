import { useEffect, useState } from "react";
import { formatDate, idadeAtendimento, statusClass } from "../utils/format";

/** Atendimentos encerrados não envelhecem — a idade só interessa na fila. */
const STATUS_ENCERRADOS = new Set(["FINALIZADO", "SEM RETORNO"]);

export default function SupportCard({ item, onClick }) {
  // Um relógio por minuto mantém o "há X" honesto num painel que fica aberto o
  // dia todo, sem depender de o Firestore mandar alguma atualização.
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  const idade = STATUS_ENCERRADOS.has(item.status)
    ? null
    : idadeAtendimento(item.dataAbertura, agora);

  return (
    <div
      className="card"
      role="button"
      tabIndex={0}
      onClick={() => onClick(item)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick(item);
        }
      }}
    >
      <div className="card-top">
        <div>
          <div className="card-time">
            {formatDate(item.dataAbertura)}
            {idade ? (
              <span
                className={`card-idade card-idade-${idade.nivel}`}
                title={`Aberto ${idade.texto} — ${formatDate(item.dataAbertura)}`}
              >
                {idade.texto}
              </span>
            ) : null}
          </div>
          {/* Quem varre a lista procura o cliente, não o tipo — o nome vai na
              linha em destaque e o tipo desce para a linha discreta, sem o
              card crescer. Sem nome (registros antigos), fica como era. */}
          {item.nomeCliente ? (
            <>
              <div className="card-type" title={item.nomeCliente}>
                {item.nomeCliente}
              </div>
              <div className="card-protocolo card-protocolo-linha">
                <span className="card-tipo-discreto">{item.tipo || "-"}</span>
                {item.protocolo ? <span className="card-protocolo-numero">· #{item.protocolo}</span> : null}
              </div>
            </>
          ) : (
            <>
              <div className="card-type">{item.tipo || "-"}</div>
              {item.protocolo ? <div className="card-protocolo">#{item.protocolo}</div> : null}
            </>
          )}
        </div>
        <div className="card-tech">{item.tecnico || "-"}</div>
      </div>
      <div className="card-status">
        <span className={`status-pill ${statusClass(item.status)}`}>{item.status}</span>
      </div>
    </div>
  );
}
