const { google } = require("googleapis");

function parseServiceAccount(raw) {
  if (!raw) throw new Error("SHEETS_SERVICE_ACCOUNT not configured.");
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

function getAuth(serviceAccountRaw) {
  const sa = parseServiceAccount(serviceAccountRaw);
  const jwt = new google.auth.JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });
  return jwt;
}

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
  status: ["status", "sit. atendimento", "situacao atendimento", "situacao", "situação", "coluna 8"],
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

function excelSerialToIsoDateTime(serial) {
  const base = new Date(Date.UTC(1899, 11, 30));
  const ms = Math.round(Number(serial) * 24 * 60 * 60 * 1000);
  const date = new Date(base.getTime() + ms);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function normalizeDateTime(value) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number" && Number.isFinite(value)) return excelSerialToIsoDateTime(value);
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

async function fetchSheetsData({ serviceAccountRaw, spreadsheetId, sheetName }) {
  const auth = getAuth(serviceAccountRaw);
  await auth.authorize();
  const sheets = google.sheets({ version: "v4", auth });
  
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A:Z`
  });

  const values = res.data.values || [];
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

function parseRowsForImport(rows) {
  return rows
    .filter((row) => Object.values(row).some((v) => norm(v)))
    .map((row) => ({
      id: generateDocId(row),
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
    }))
    .filter((row) => row.protocolo || row.cpfCnpj || row.contato);
}

async function importFromSheets({ serviceAccountRaw, spreadsheetId, sheetName, db, admin }) {
  const rows = await fetchSheetsData({ serviceAccountRaw, spreadsheetId, sheetName });
  const records = parseRowsForImport(rows);
  
  if (!records.length) return { imported: 0 };

  const batch = db.batch();
  const collection = db.collection("suportes_tecnicos");

  for (const record of records) {
    const ref = collection.doc(record.id);
    batch.set(
      ref,
      {
        ...record,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      },
      { merge: false }
    );
  }

  await batch.commit();
  return { imported: records.length };
}

module.exports = {
  fetchSheetsData,
  parseRowsForImport,
  importFromSheets
};
