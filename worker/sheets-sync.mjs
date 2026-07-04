import { getSheetsAccessToken } from "./sheets-auth.mjs";

// Cache de sheet metadata para evitar múltiplas chamadas
let sheetMetadataCache = {};

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

/**
 * Obter Sheet ID pelo nome da aba
 * Cache por 1 minuto para evitar múltiplas chamadas
 */
async function getSheetId(spreadsheetId, sheetName, accessToken) {
  const cacheKey = `${spreadsheetId}:${sheetName}`;
  if (sheetMetadataCache[cacheKey]?.expiresAt > Date.now()) {
    return sheetMetadataCache[cacheKey].sheetId;
  }

  const metadataUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
  const metadata = await sheetsFetch(metadataUrl, accessToken);
  
  const sheet = metadata.sheets?.find((s) => s.properties.title === sheetName);
  if (!sheet) {
    throw new Error(`Sheet "${sheetName}" não encontrada`);
  }

  sheetMetadataCache[cacheKey] = {
    sheetId: sheet.properties.sheetId,
    expiresAt: Date.now() + 60_000 // Cache por 1 minuto
  };

  return sheet.properties.sheetId;
}

/**
 * Procurar index da linha pelo ID (na coluna A)
 * Retorna rowIndex (0-based) ou -1 se não encontrado
 */
async function findRowByDocId(spreadsheetId, sheetName, docId, accessToken) {
  const idRange = encodeURIComponent(`${sheetName}!A:A`);
  const getUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${idRange}`;
  const existing = await sheetsFetch(getUrl, accessToken);
  const values = existing.values || [];
  return values.findIndex((r) => r[0] === String(docId));
}

/**
 * Upsert usando batchUpdate (mais eficiente)
 * - Se existe: atualiza a linha com updateCells
 * - Se não existe: append no final
 */
export async function upsertSheetRow({ serviceAccountRaw, spreadsheetId, sheetName, doc }) {
  const accessToken = await getSheetsAccessToken(serviceAccountRaw);
  const rowIndex = await findRowByDocId(spreadsheetId, sheetName, doc.id, accessToken);
  const rowValues = mapDocToRow(doc);
  const sheetId = await getSheetId(spreadsheetId, sheetName, accessToken);

  if (rowIndex !== -1) {
    // UPDATE: usar batchUpdate com updateCells
    const requests = [
      {
        updateCells: {
          range: {
            sheetId: sheetId,
            startRowIndex: rowIndex,
            endRowIndex: rowIndex + 1,
            startColumnIndex: 0,
            endColumnIndex: rowValues.length
          },
          rows: [
            {
              values: rowValues.map((v) => ({
                userEnteredValue: { stringValue: v }
              }))
            }
          ],
          fields: "userEnteredValue"
        }
      }
    ];

    const batchUpdateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
    await sheetsFetch(batchUpdateUrl, accessToken, {
      method: "POST",
      body: JSON.stringify({ requests })
    });

    return { updated: true, rowIndex };
  }

  // APPEND: adicionar nova linha no final
  const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`${sheetName}!A1`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
  await sheetsFetch(appendUrl, accessToken, {
    method: "POST",
    body: JSON.stringify({ values: [rowValues] })
  });

  return { appended: true };
}

/**
 * Delete usando batchUpdate (deleta a linha de verdade, não apenas limpa)
 */
export async function deleteSheetRow({ serviceAccountRaw, spreadsheetId, sheetName, docId }) {
  const accessToken = await getSheetsAccessToken(serviceAccountRaw);
  const rowIndex = await findRowByDocId(spreadsheetId, sheetName, docId, accessToken);

  if (rowIndex === -1) {
    return { deleted: false, reason: "Documento não encontrado na planilha" };
  }

  const sheetId = await getSheetId(spreadsheetId, sheetName, accessToken);

  // Deletar a linha usando batchUpdate com deleteRows
  const requests = [
    {
      deleteRange: {
        range: {
          sheetId: sheetId,
          startRowIndex: rowIndex,
          endRowIndex: rowIndex + 1
        },
        shiftDimension: "ROWS"
      }
    }
  ];

  const batchUpdateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
  await sheetsFetch(batchUpdateUrl, accessToken, {
    method: "POST",
    body: JSON.stringify({ requests })
  });

  return { deleted: true, rowIndex };
}
