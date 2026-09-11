/**
 * catalogos.js — vocabulário controlado das métricas.
 *
 * Vem do painel HTML "Central de Chamados": lá o chamado é classificado em
 * MOTIVO (o que o cliente precisava resolver) e, quando faz sentido, em MOTIVO
 * DA UTILIZAÇÃO (para que ele usa o certificado) + PLATAFORMA.
 *
 * O texto livre continua sendo gravado (`motivoDetalhe`) — a categoria é o que
 * entra nas contagens do dashboard. Sem categoria fechada, "Instalação Safeid",
 * "Safeid" e "Instalação SAFEID" viram três barras diferentes no gráfico.
 */

export const MOTIVOS = [
  "Instalação A1",
  "Instalação A3",
  "Exportar certificado",
  "Alteração de senha",
  "Outros"
];

export const USOS = [
  "Emitir nota fiscal",
  "Assinar documentos",
  "Enviar para contabilidade",
  "Acessar plataformas",
  "Outros"
];

/** Usos em que a plataforma é a informação que interessa (qual portal, qual emissor). */
export const USOS_COM_PLATAFORMA = ["Emitir nota fiscal", "Acessar plataformas"];

function chave(valor) {
  return String(valor || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Enquadra um motivo escrito à mão numa das categorias acima.
 *
 * A ordem dos testes importa: "instalação do A3" tem "instala" e "a3", e é o A3
 * que decide. Nada reconhecido cai em "Outros" — nunca em vazio, senão o
 * chamado some das contagens por motivo.
 */
export function classificarMotivo(valor) {
  const k = chave(valor);
  if (!k) return "";
  if (MOTIVOS.some((m) => chave(m) === k)) return MOTIVOS.find((m) => chave(m) === k);
  if (/\ba1\b/.test(k)) return "Instalação A1";
  if (/\ba3\b/.test(k)) return "Instalação A3";
  if (k.includes("export")) return "Exportar certificado";
  if (k.includes("senha")) return "Alteração de senha";
  return "Outros";
}

export function classificarUso(valor) {
  const k = chave(valor);
  if (!k) return "";
  const exato = USOS.find((u) => chave(u) === k);
  if (exato) return exato;
  if (k.includes("nota") || k.includes("nfe") || k.includes("nfs")) return "Emitir nota fiscal";
  if (k.includes("assin")) return "Assinar documentos";
  if (k.includes("contabil")) return "Enviar para contabilidade";
  if (k.includes("acess") || k.includes("plataforma")) return "Acessar plataformas";
  return "Outros";
}

export function usoPedePlataforma(uso) {
  return USOS_COM_PLATAFORMA.includes(uso);
}
