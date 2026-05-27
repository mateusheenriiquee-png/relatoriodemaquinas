import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { db } from "../config/firebase.js";

const COLLECTION = "suportes_tecnicos";
const IGNORED_FIELDS = new Set(["observacao", "observacao do tecnico", "observacao do técnico"]);

let XLSX_LIB = null;
let pendingImportRecords = [];

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

function mapStatus(value) {
  const v = norm(value).toUpperCase();
  if (v === "EM ABERTO" || v === "ABERTO") return "EM ABERTO";
  if (v === "FINALIZADO" || v === "CONCLUIDO" || v === "CONCLUÍDO") return "FINALIZADO";
  if (v === "EM ANDAMENTO" || v === "EM_ATENDIMENTO") return "EM ANDAMENTO";
  if (v === "SEM RETORNO") return "SEM RETORNO";
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
    if (IGNORED_FIELDS.has(normalizedHeader)) continue;
    if (aliases.includes(normalizedHeader)) return value;
  }
  return "";
}

function parseRows(rows) {
  return rows
    .filter((row) => Object.values(row).some((v) => norm(v)))
    .map((row) => ({
      protocolo: norm(findField(row, "protocolo")),
      responsavelAbertura: norm(findField(row, "responsavelAbertura")),
      cpfCnpj: norm(findField(row, "cpfCnpj")),
      tipo: norm(findField(row, "tipo")),
      ac: norm(findField(row, "ac")),
      contato: norm(findField(row, "contato")),
      tecnico: norm(findField(row, "tecnico")),
      status: mapStatus(findField(row, "status")),
      statusAbertura: norm(findField(row, "statusAbertura")),
      dataAbertura: normalizeDateTime(findField(row, "dataAbertura"))
    }))
    .filter((row) => row.protocolo || row.cliente || row.cpfCnpj);
}

function parseCSVText(text) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  function parseLine(line) {
    const cols = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else if (ch === '"') {
          inQ = false;
        } else {
          cur += ch;
        }
      } else if (ch === '"') {
        inQ = true;
      } else if (ch === "," || ch === ";") {
        cols.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    cols.push(cur);
    return cols;
  }
  const headerLine = lines.find((line) => line.trim());
  if (!headerLine) return [];
  const headers = parseLine(headerLine);
  return lines
    .slice(lines.indexOf(headerLine) + 1)
    .filter((line) => line.trim())
    .map((line) => {
      const cols = parseLine(line);
      const obj = {};
      headers.forEach((h, i) => { obj[h] = cols[i] !== undefined ? cols[i] : ""; });
      return obj;
    });
}

async function getXLSX() {
  if (XLSX_LIB) return XLSX_LIB;
  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    script.onload = resolve;
    script.onerror = () => reject(new Error("Falha ao carregar biblioteca XLSX."));
    document.head.appendChild(script);
  });
  XLSX_LIB = window.XLSX;
  return XLSX_LIB;
}

async function parseXLSXFile(arrayBuffer) {
  const XLSX = await getXLSX();
  const wb = XLSX.read(arrayBuffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: "" });
}

function showStatus(msg, type = "loading") {
  const el = document.getElementById("importStatusMsg");
  el.textContent = msg;
  el.className = `import-status ${type}`;
  el.classList.remove("hidden");
}

function hideStatus() {
  document.getElementById("importStatusMsg").classList.add("hidden");
}

function showPreview(records) {
  pendingImportRecords = records;
  const previewArea = document.getElementById("importPreviewArea");
  const infoEl = document.getElementById("importPreviewInfo");
  const tableEl = document.getElementById("importPreviewTable");
  const preview = records.slice(0, 5);
  infoEl.textContent = `${records.length} registro(s) encontrados. Pre-visualizacao (primeiros 5):`;
  tableEl.innerHTML = `
    <thead><tr><th>Protocolo</th><th>Resp. Abertura</th><th>CPF/CNPJ</th><th>AC</th><th>Tecnico</th><th>Sit. Atendimento</th></tr></thead>
    <tbody>${preview.map((r) => `<tr><td>${r.protocolo || "-"}</td><td>${r.responsavelAbertura || "-"}</td><td>${r.cpfCnpj || "-"}</td><td>${r.ac || "-"}</td><td>${r.tecnico || "-"}</td><td>${r.status}</td></tr>`).join("")}</tbody>
  `;
  previewArea.classList.remove("hidden");
  hideStatus();
}

async function writeToFirestore(records, mode) {
  if (mode === "substituir") {
    showStatus("Excluindo registros existentes...", "loading");
    const snap = await getDocs(collection(db, COLLECTION));
    await Promise.all(snap.docs.map((d) => deleteDoc(doc(db, COLLECTION, d.id))));
  }
  showStatus(`Salvando ${records.length} registro(s)...`, "loading");
  await Promise.all(records.map((r) => addDoc(collection(db, COLLECTION), {
    ...r,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  })));
}

async function exportCSV() {
  const snap = await getDocs(collection(db, COLLECTION));
  const rows = snap.docs.map((d) => d.data());
  if (!rows.length) {
    alert("Nenhum registro para exportar.");
    return;
  }
  const headers = ["dataAbertura", "responsavelAbertura", "protocolo", "tipo", "ac", "contato", "status", "tecnico", "statusAbertura", "cpfCnpj"];
  const escape = (v) => `"${String(v || "").replace(/"/g, '""')}"`;
  const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `suportes_tecnicos_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

document.addEventListener("DOMContentLoaded", () => {
  const btnExportar = document.getElementById("btnExportar");
  if (!btnExportar) return;
  btnExportar.addEventListener("click", async () => {
    try {
      btnExportar.disabled = true;
      btnExportar.textContent = "Exportando...";
      await exportCSV();
    } catch (err) {
      alert("Erro ao exportar: " + (err.message || err));
    } finally {
      btnExportar.disabled = false;
      btnExportar.textContent = "⬇ Exportar CSV";
    }
  });
});
