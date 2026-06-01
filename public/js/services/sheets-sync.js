import { APP_CONFIG } from "../config/app-config.js";

function norm(value) {
  return String(value || "").trim();
}

function serializeTimestamp(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (value && typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

export function buildSheetDoc(id, data = {}) {
  return {
    id,
    dataAbertura: norm(data.dataAbertura || data.carimboDataHora || ""),
    responsavelAbertura: norm(data.responsavelAbertura || data.responsavel || data.cliente || ""),
    protocolo: norm(data.protocolo || ""),
    cpfCnpj: norm(data.cpfCnpj || ""),
    tipo: norm(data.tipo || ""),
    ac: norm(data.ac || ""),
    contato: norm(data.contato || ""),
    descricao: norm(data.descricao || ""),
    tecnico: norm(data.tecnico || ""),
    status: norm(data.status || ""),
    statusAbertura: norm(data.statusAbertura || ""),
    createdAt: serializeTimestamp(data.createdAt),
    updatedAt: serializeTimestamp(data.updatedAt || new Date().toISOString())
  };
}

async function postSheet(path, body) {
  if (!APP_CONFIG.sheetsSyncEnabled) return null;

  const headers = { "Content-Type": "application/json" };
  if (APP_CONFIG.sheetsSyncToken) {
    headers["x-sync-token"] = APP_CONFIG.sheetsSyncToken;
  }

  const response = await fetch(path, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || payload.details || "Falha ao sincronizar com a planilha.");
  }
  return payload;
}

export async function syncDocToSheet(id, data) {
  if (!id) return;
  return postSheet("/sheets/upsert", { doc: buildSheetDoc(id, data) });
}

export async function deleteDocFromSheet(docId) {
  if (!docId) return;
  return postSheet("/sheets/delete", { docId });
}
