export const STATUS_OPTIONS = [
  "EM ABERTO",
  "EM ANDAMENTO",
  "FINALIZADO",
  "SEM RETORNO",
  "REAGENDADO"
];

export const norm = (v) => String(v || "").trim().replace(/\s+/g, " ");
export const normKey = (v) => norm(v).toLowerCase();

export function titleCaseName(value) {
  const s = norm(value);
  if (!s) return s;
  return s
    .split(" ")
    .map((part) =>
      part
        .split("-")
        .map((p) => (p ? p[0].toUpperCase() + p.slice(1).toLowerCase() : ""))
        .join("-")
    )
    .join(" ");
}

export function normalizeSearchText(value) {
  return norm(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export function normStatus(v) {
  const s = norm(v).toUpperCase();
  if (STATUS_OPTIONS.includes(s)) return s;
  if (/REAGEND/.test(s)) return "REAGENDADO";
  if (/TRATATIV|ANDAMENTO|ATENDIMENTO/.test(s)) return "EM ANDAMENTO";
  if (/FINALIZ|CONCLUID|RESOLVID|FECHAD/.test(s)) return "FINALIZADO";
  if (/SEM RETORNO/.test(s)) return "SEM RETORNO";
  return "EM ABERTO";
}

export function statusClass(status) {
  const s = normStatus(status);
  if (s === "EM ANDAMENTO") return "status-andamento";
  if (s === "FINALIZADO") return "status-finalizado";
  if (s === "REAGENDADO") return "status-reagendado";
  if (s === "SEM RETORNO") return "status-sem-retorno";
  return "status-aberto";
}

export function formatDate(isoDate) {
  if (!isoDate) return "-";
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return String(isoDate);
  return d.toLocaleString("pt-BR");
}

export function toComparableDate(isoDate) {
  const d = new Date(isoDate || "");
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

/* ------------------------------------------------- idade do atendimento */

/**
 * Limites de envelhecimento, em horas. Acima de `atencao` o card fica marcado;
 * acima de `critico`, marcado com mais peso. Um único lugar para calibrar.
 */
export const IDADE_LIMITES = { atencao: 24, critico: 72 };

/**
 * Idade do atendimento em texto curto ("há 2 dias", "há 40 min").
 *
 * O card mostrava só a data de abertura e quem estava triando fazia a conta de
 * cabeça. Com a idade explícita, a lista vira fila de prioridade.
 *
 * @returns {{ texto: string, horas: number, nivel: "novo"|"atencao"|"critico" }|null}
 */
export function idadeAtendimento(isoDate, agora = Date.now()) {
  const inicio = toComparableDate(isoDate);
  if (!inicio) return null;

  const ms = agora - inicio;
  // Data no futuro (fuso torto, digitação errada): não inventa "há -3 h".
  if (ms < 0) return null;

  const minutos = Math.floor(ms / 60000);
  const horas = ms / 3600000;
  const dias = Math.floor(horas / 24);

  let texto;
  if (minutos < 1) texto = "agora";
  else if (minutos < 60) texto = `há ${minutos} min`;
  else if (horas < 24) texto = `há ${Math.floor(horas)} h`;
  else if (dias < 30) texto = `há ${dias} ${dias === 1 ? "dia" : "dias"}`;
  else {
    const meses = Math.floor(dias / 30);
    texto = `há ${meses} ${meses === 1 ? "mês" : "meses"}`;
  }

  let nivel = "novo";
  if (horas >= IDADE_LIMITES.critico) nivel = "critico";
  else if (horas >= IDADE_LIMITES.atencao) nivel = "atencao";

  return { texto, horas, nivel };
}

export function toDatetimeLocal(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatProtocolo(value) {
  const v = norm(value);
  if (!v) return v;
  if (/^\d{3}-\d{3}-\d{3}$/.test(v)) return v;
  const digits = v.replace(/\D/g, "");
  if (digits.length === 9) return digits.replace(/(\d{3})(\d{3})(\d{3})/, "$1-$2-$3");
  return v;
}

export function formatCpfCnpj(value) {
  const v = norm(value);
  if (!v) return v;
  if (/^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(v) || /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(v)) {
    return v;
  }
  const digits = v.replace(/\D/g, "");
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  if (digits.length === 14) {
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  }
  return v;
}

export function formatContato(value) {
  const v = norm(value);
  if (!v) return v;
  const digits = v.replace(/\D/g, "");
  if (digits.length >= 10) {
    const ddd = digits.slice(0, 2);
    const rest = digits.slice(2);
    const last = rest.slice(-4);
    const prefix = rest.slice(0, rest.length - 4);
    return `(${ddd}) ${prefix}-${last}`;
  }
  return v;
}

/** Mensagem pré-preenchida do WhatsApp por tipo de suporte. */
export function getWhatsAppMessageForType(userDisplayName, supportType, protocolNumber) {
  const typeKey = (supportType || "").toLowerCase().trim();
  let typeMessage;
  if (typeKey.includes("instala")) {
    typeMessage = "Podemos dar inicio a instalação do seu certificado?";
  } else if (typeKey.includes("suporte") || typeKey.includes("técnico") || typeKey.includes("tecnico")) {
    typeMessage = "Podemos dar inicio a seu atendimento referente ao seu certificado digital?";
  } else if (typeKey.includes("configura")) {
    typeMessage = "Podemos dar inicio a configuração da sua máquina?";
  } else {
    typeMessage = "Poderia me ajudar com essa demanda?";
  }
  return `*[${userDisplayName} | Suporte Técnico]*\nBom dia, tudo certo?\n${typeMessage}\n\nPedido: #${protocolNumber}`;
}

export function buildWhatsAppPhone(raw) {
  let digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  digits = digits.replace(/^00+/, "").replace(/^0+/, "");
  const country = "55";
  if (!digits.startsWith(country) && digits.length >= 8 && digits.length <= 11) {
    digits = `${country}${digits}`;
  }
  return digits;
}
