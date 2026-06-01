import { getSheetsAccessToken } from "./sheets-auth.mjs";

function mapDocToRow(doc) {
  return [
    String(doc.id || ""),
    String(doc.dataAbertura || doc.carimboDataHora || ""),
    String(doc.responsavelAbertura || ""),
    String(doc.protocolo || ""),
    String(doc.cpfCnpj || ""),
    String(doc.tipo || ""),
    String(doc.ac || ""),
    String(doc.contato || ""),
    String(doc.descricao || ""),
    String(doc.tecnico || ""),
    String(doc.status || ""),
    String(doc.statusAbertura || ""),
    String(doc.createdAt || ""),
    String(doc.updatedAt || "")
  ];
}

async function sheetsFetch(url, accessToken, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || response.statusText);
  }
  if (response.status === 204) return null;
  return response.json();
}

export async function upsertSheetRow({ serviceAccountRaw, spreadsheetId, sheetName, doc }) {
  const accessToken = await getSheetsAccessToken(serviceAccountRaw);
  const idRange = encodeURIComponent(`${sheetName}!A:A`);
  const getUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${idRange}`;
  const existing = await sheetsFetch(getUrl, accessToken);
  const values = existing.values || [];
  const rowIndex = values.findIndex((r) => r[0] === String(doc.id));
  const rowValues = mapDocToRow(doc);

  if (rowIndex !== -1) {
    const rowNum = rowIndex + 1;
    const range = encodeURIComponent(`${sheetName}!A${rowNum}:N${rowNum}`);
    const putUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=RAW`;
    await sheetsFetch(putUrl, accessToken, {
      method: "PUT",
      body: JSON.stringify({ values: [rowValues] })
    });
    return { updated: true };
  }

  const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`${sheetName}!A1`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
  await sheetsFetch(appendUrl, accessToken, {
    method: "POST",
    body: JSON.stringify({ values: [rowValues] })
  });
  return { appended: true };
}

export async function deleteSheetRow({ serviceAccountRaw, spreadsheetId, sheetName, docId }) {
  const accessToken = await getSheetsAccessToken(serviceAccountRaw);
  const idRange = encodeURIComponent(`${sheetName}!A:A`);
  const getUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${idRange}`;
  const existing = await sheetsFetch(getUrl, accessToken);
  const values = existing.values || [];
  const rowIndex = values.findIndex((r) => r[0] === String(docId));
  if (rowIndex === -1) return { deleted: false };

  const rowNum = rowIndex + 1;
  const clearRange = encodeURIComponent(`${sheetName}!A${rowNum}:N${rowNum}`);
  const clearUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${clearRange}:clear`;
  await sheetsFetch(clearUrl, accessToken, { method: "POST", body: "{}" });
  return { deleted: true };
}
