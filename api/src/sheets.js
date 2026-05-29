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

function mapDocToRow(doc) {
  // Define columns: docId, dataAbertura, responsavelAbertura, protocolo, cpfCnpj, tipo, ac, contato, descricao, tecnico, status, statusAbertura, createdAt, updatedAt
  return [
    doc.id || "",
    doc.dataAbertura || "",
    doc.responsavelAbertura || "",
    doc.protocolo || "",
    doc.cpfCnpj || "",
    doc.tipo || "",
    doc.ac || "",
    doc.contato || "",
    doc.descricao || "",
    doc.tecnico || "",
    doc.status || "",
    doc.statusAbertura || "",
    doc.createdAt || "",
    doc.updatedAt || ""
  ];
}

async function upsertSheetRow({ serviceAccountRaw, spreadsheetId, sheetName, doc }) {
  const auth = getAuth(serviceAccountRaw);
  await auth.authorize();
  const sheets = google.sheets({ version: "v4", auth });
  const idColumn = `${sheetName}!A:A`;
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: idColumn });
  const values = res.data.values || [];
  const rowIndex = values.findIndex((r) => r[0] === String(doc.id));
  const rowValues = mapDocToRow(doc);
  if (rowIndex !== -1) {
    const rowNum = rowIndex + 1;
    const range = `${sheetName}!A${rowNum}:N${rowNum}`;
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: "RAW",
      requestBody: { values: [rowValues] }
    });
    return { updated: true };
  }
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A1`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [rowValues] }
  });
  return { appended: true };
}

async function deleteSheetRow({ serviceAccountRaw, spreadsheetId, sheetName, docId }) {
  const auth = getAuth(serviceAccountRaw);
  await auth.authorize();
  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${sheetName}!A:A` });
  const values = res.data.values || [];
  const rowIndex = values.findIndex((r) => r[0] === String(docId));
  if (rowIndex === -1) return { deleted: false };
  const rowNum = rowIndex + 1;
  const range = `${sheetName}!A${rowNum}:N${rowNum}`;
  await sheets.spreadsheets.values.clear({ spreadsheetId, range });
  return { deleted: true };
}

async function clearSheet({ serviceAccountRaw, spreadsheetId, sheetName }) {
  const auth = getAuth(serviceAccountRaw);
  await auth.authorize();
  const sheets = google.sheets({ version: "v4", auth });
  const range = `${sheetName}`;
  await sheets.spreadsheets.values.clear({ spreadsheetId, range: `${sheetName}!A:Z` });
  return { cleared: true };
}

module.exports = {
  upsertSheetRow,
  deleteSheetRow,
  clearSheet
};
