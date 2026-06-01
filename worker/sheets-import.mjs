import { upsertRecords } from "./firestore-rest.mjs";

function normalizeKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function norm(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function mapStatus(value) {
  const v = norm(value).toUpperCase();
  if (v === "EM ABERTO" || v === "ABERTO") return "EM ABERTO";
  if (v === "FINALIZADO" || v === "CONCLUIDO" || v === "CONCLUÍDO") return "FINALIZADO";
  if (v === "EM ANDAMENTO" || v === "EM_ATENDIMENTO" || v.includes("TRATATIV")) return "EM ANDAMENTO";
  if (v === "SEM RETORNO") return "SEM RETORNO";
  if (v === "REAGENDADO" || v.includes("REAGEND")) return "REAGENDADO";
  return "EM ABERTO";
}

const FIELD_ALIASES = {
  protocolo: ["protocolo", "id", "id suporte", "numero chamado", "n chamado", "ticket"],
  responsavelAbertura: ["responsavel da abertura", "responsavel", "abertura por", "cliente", "nome cliente", "razao social", "nome", "parceiro"],
  cpfCnpj: ["cpf/cnpj", "cpf cnpj", "cpfcnpj", "cpf", "cnpj", "documento"],
  contato: ["contato", "contato ou grupo", "telefone", "celular", "whatsapp", "email"],
  tipo: ["tipo"],
  ac: ["ac"],
  tecnico: ["tecnico", "tecnico responsavel", "responsavel tecnico", "analista"],
  status: ["status", "sit. atendimento", "situacao atendimento", "situacao", "situação"],
  statusAbertura: ["status da abertura", "status abertura"],
  dataAbertura: ["data abertura", "data de abertura", "abertura", "created at", "data"]
};

function findField(row, key) {
  const aliases = FIELD_ALIASES[key];
  for (const [header, value] of Object.entries(row)) {
    const normalizedHeader = normalizeKey(header);
    if (aliases.includes(normalizedHeader)) return value;
  }
  return "";
}

function normalizeDateTime(value) {
  if (value === null || value === undefined || value === "") return "";
  const text = norm(value);
  if (!text) return "";
  const date = new Date(text);
  if (!Number.isNaN(date.getTime())) return date.toISOString();
  return text;
}

function generateDocId(row) {
  const proto = norm(findField(row, "protocolo"));
  if (proto) return proto.replace(/\s+/g, "-").toLowerCase();
  return "import-" + Date.now() + "-" + Math.random().toString(36).substr(2, 9);
}

export async function fetchSheetsData(spreadsheetId, sheetName, accessToken) {
  const range = encodeURIComponent(`${sheetName}!A:Z`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?key=${accessToken}`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch sheets: ${response.statusText}`);
  }

  const data = await response.json();
  const values = data.values || [];
  
  if (!values.length) return [];

  const headers = values[0] || [];
  const rows = values.slice(1)
    .filter(row => row && row.some(cell => cell))
    .map(row => {
      const obj = {};
      headers.forEach((header, idx) => {
        obj[header] = row[idx] || "";
      });
      return obj;
    });

  return rows;
}

export function parseRowsForImport(rows) {
  return rows
    .filter((row) => Object.values(row).some((v) => norm(v)))
    .map((row) => ({
      docId: generateDocId(row),
      fields: {
        protocolo: norm(findField(row, "protocolo")),
        responsavelAbertura: norm(findField(row, "responsavelAbertura")) || "Não informado",
        cpfCnpj: norm(findField(row, "cpfCnpj")),
        tipo: norm(findField(row, "tipo")) || "Não informado",
        ac: norm(findField(row, "ac")) || "Não informado",
        contato: norm(findField(row, "contato")),
        tecnico: norm(findField(row, "tecnico")) || "Não atribuído",
        status: mapStatus(findField(row, "status")),
        statusAbertura: norm(findField(row, "statusAbertura")),
        dataAbertura: normalizeDateTime(findField(row, "dataAbertura"))
      }
    }))
    .filter((row) => row.fields.protocolo || row.fields.cpfCnpj || row.fields.contato);
}

export async function importFromSheetsWorker({ spreadsheetId, sheetName, accessToken, serviceAccountRaw, collection }) {
  const rows = await fetchSheetsData(spreadsheetId, sheetName, accessToken);
  const records = parseRowsForImport(rows);
  
  if (!records.length) return { imported: 0 };

  const upserted = await upsertRecords({
    serviceAccountRaw,
    collection,
    records
  });

  return { imported: upserted };
}
