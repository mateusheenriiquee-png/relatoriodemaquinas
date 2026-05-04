/**
 * import-export.js
 * Handles CSV/XLSX import (local file + Google Sheets public URL) and CSV export.
 * Integrates with the existing Firebase Firestore setup in script.js via re-imports.
 */

import {
  collection,
  addDoc,
  deleteDoc,
  getDocs,
  serverTimestamp,
  doc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { db } from "./firebase-config.js";

// ── SheetJS (XLSX parsing) loaded from CDN ──────────────────────────────────
// We load it lazily so it doesn't slow down initial page load.
let XLSX_LIB = null;

async function getXLSX() {
  if (XLSX_LIB) return XLSX_LIB;
  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    s.onload = resolve;
    s.onerror = () => reject(new Error("Falha ao carregar a biblioteca XLSX."));
    document.head.appendChild(s);
  });
  XLSX_LIB = window.XLSX;
  return XLSX_LIB;
}

// ── Column mapping (flexible – tolerates Portuguese / English headers) ───────
const COLUMN_MAP = {
  maquina:        ["maquina", "máquina", "machine", "nome"],
  parceiro:       ["parceiro", "partner"],
  situacao:       ["situacao", "situação", "situation", "status"],
  pagamentoStatus:["pagamentostatus", "pagamento", "fechamentomensal", "payment"],
  pixParceiro:    ["pixparceiro", "pix"],
  unidade:        ["unidade", "unit"],
  agr:            ["agr"],
  situacaoMaquina:["situacaomaquina", "situacaodamaquina", "situação da maquina", "situacaodamáquina"],
  agrFilhos:      ["agrfilhos", "agr filhos", "agr_filhos"]
};

function detectField(header) {
  const h = header.toLowerCase().trim().replace(/\s+/g, "");
  for (const [field, aliases] of Object.entries(COLUMN_MAP)) {
    if (aliases.some(a => h.includes(a.replace(/\s+/g, "")))) return field;
  }
  return null;
}

// ── Normalisation helpers (mirrors script.js) ──────────────────────────────
const SITUACAO_OPTIONS       = ["TREINAMENTO", "PRODUCAO"];
const PAGAMENTO_OPTIONS      = ["PENDENTE", "NAO PENDENTE"];
const SITUACAO_MAQ_OPTIONS   = ["CONFIGURADA", "CONFIGURADA FORA DO PADRÃO", "NÃO CONFIGURADA"];

function normText(v)    { return String(v || "").trim().replace(/\s+/g, " "); }
function normSit(v)     { const u = normText(v).toUpperCase(); return SITUACAO_OPTIONS.includes(u) ? u : "TREINAMENTO"; }
function normPag(v)     { const u = normText(v).toUpperCase(); return PAGAMENTO_OPTIONS.includes(u) ? u : "PENDENTE"; }
function normSitMaq(v)  {
  const u = normText(v).toUpperCase();
  return SITUACAO_MAQ_OPTIONS.find(o => o.toUpperCase() === u) || "NÃO CONFIGURADA";
}
function normAgrFilhos(v) { return v === true || String(v).toLowerCase() === "true" || String(v) === "1" || String(v).toLowerCase() === "sim"; }

// ── Parse rows (array of objects) into normalised records ──────────────────
function parseRows(rows) {
  return rows
    .filter(r => Object.values(r).some(v => String(v || "").trim()))
    .map(raw => {
      const r = {};
      for (const [k, v] of Object.entries(raw)) {
        const field = detectField(k);
        if (field) r[field] = v;
      }
      return {
        maquina:        normText(r.maquina || ""),
        parceiro:       normText(r.parceiro || ""),
        situacao:       normSit(r.situacao),
        pagamentoStatus:normPag(r.pagamentoStatus),
        pixParceiro:    normText(r.pixParceiro || ""),
        unidade:        normText(r.unidade || ""),
        agr:            normText(r.agr || ""),
        situacaoMaquina:normSitMaq(r.situacaoMaquina || ""),
        agrFilhos:      normAgrFilhos(r.agrFilhos)
      };
    })
    .filter(r => r.maquina); // must have a machine name
}

// ── CSV parser (handles quoted fields) ─────────────────────────────────────
function parseCSVText(text) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const rows = [];

  function parseLine(line) {
    const cols = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') inQ = false;
        else cur += ch;
      } else {
        if (ch === '"') inQ = true;
        else if (ch === "," || ch === ";") { cols.push(cur); cur = ""; }
        else cur += ch;
      }
    }
    cols.push(cur);
    return cols;
  }

  const headerLine = lines.find(l => l.trim());
  if (!headerLine) return [];
  const headers = parseLine(headerLine);

  for (const line of lines.slice(lines.indexOf(headerLine) + 1)) {
    if (!line.trim()) continue;
    const cols = parseLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = cols[i] !== undefined ? cols[i] : ""; });
    rows.push(obj);
  }
  return rows;
}

// ── XLSX parsing ────────────────────────────────────────────────────────────
async function parseXLSXFile(arrayBuffer) {
  const XLSX = await getXLSX();
  const wb = XLSX.read(arrayBuffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: "" });
}

// ── Google Sheets: convert share URL → CSV export URL ───────────────────────
function sheetsUrlToCsvUrl(url) {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (!match) throw new Error("URL do Google Sheets inválida. Verifique o link.");
  const id = match[1];
  // Support /edit#gid=NNN or /pub?gid=NNN
  const gidMatch = url.match(/[?&#]gid=(\d+)/);
  const gid = gidMatch ? gidMatch[1] : "0";
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
}

async function fetchSheetsAsCSV(url) {
  const csvUrl = sheetsUrlToCsvUrl(url);
  const res = await fetch(csvUrl);
  if (!res.ok) throw new Error(`Não foi possível acessar a planilha (${res.status}). Verifique se ela está compartilhada publicamente.`);
  return await res.text();
}

// ── Preview rendering ────────────────────────────────────────────────────────
let pendingImportRecords = [];

function showPreview(records) {
  pendingImportRecords = records;

  const previewArea = document.getElementById("importPreviewArea");
  const infoEl = document.getElementById("importPreviewInfo");
  const tableEl = document.getElementById("importPreviewTable");

  infoEl.textContent = `${records.length} registro(s) encontrado(s). Pré-visualização (primeiros 5):`;

  const preview = records.slice(0, 5);
  const fields = ["maquina", "parceiro", "unidade", "agr", "situacao", "pagamentoStatus", "situacaoMaquina"];
  const labels = ["Máquina", "Parceiro", "Unidade", "AGR", "Situação", "Pagamento", "Sit. Máquina"];

  tableEl.innerHTML = `
    <thead>
      <tr>${labels.map(l => `<th>${l}</th>`).join("")}</tr>
    </thead>
    <tbody>
      ${preview.map(r => `<tr>${fields.map(f => `<td>${r[f] || "-"}</td>`).join("")}</tr>`).join("")}
    </tbody>
  `;

  previewArea.classList.remove("hidden");
  hideStatus();
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

// ── Firestore write ──────────────────────────────────────────────────────────
async function writeToFirestore(records, mode) {
  if (mode === "substituir") {
    showStatus("Excluindo registros existentes...", "loading");
    const snap = await getDocs(collection(db, "maquinas"));
    const deletes = snap.docs.map(d => deleteDoc(doc(db, "maquinas", d.id)));
    await Promise.all(deletes);
  }

  showStatus(`Salvando ${records.length} registro(s)...`, "loading");

  const adds = records.map(r =>
    addDoc(collection(db, "maquinas"), {
      ...r,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    })
  );
  await Promise.all(adds);
}

// ── CSV export ───────────────────────────────────────────────────────────────
async function exportCSV() {
  const snap = await getDocs(collection(db, "maquinas"));
  const rows = snap.docs.map(d => {
    const data = d.data();
    return {
      maquina:        data.maquina || "",
      parceiro:       data.parceiro || "",
      unidade:        data.unidade || "",
      agr:            data.agr || "",
      situacao:       data.situacao || "",
      pagamentoStatus:data.pagamentoStatus || data.fechamentoMensal || "",
      pixParceiro:    data.pixParceiro || "",
      situacaoMaquina:data.situacaoMaquina || "",
      agrFilhos:      data.agrFilhos ? "true" : "false"
    };
  });

  if (!rows.length) {
    alert("Nenhum registro para exportar.");
    return;
  }

  const headers = ["maquina", "parceiro", "unidade", "agr", "situacao", "pagamentoStatus", "pixParceiro", "situacaoMaquina", "agrFilhos"];
  const escape = v => `"${String(v).replace(/"/g, '""')}"`;

  const csv = [
    headers.join(","),
    ...rows.map(r => headers.map(h => escape(r[h])).join(","))
  ].join("\n");

  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `maquinas_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── UI wiring ────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  const modalImportar      = document.getElementById("modalImportar");
  const btnImportar        = document.getElementById("btnImportar");
  const btnFecharImportar  = document.getElementById("btnFecharModalImportar");
  const btnExportar        = document.getElementById("btnExportar");
  const btnImportarSheets  = document.getElementById("btnImportarSheets");
  const googleSheetsUrlEl  = document.getElementById("googleSheetsUrl");
  const fileInput          = document.getElementById("fileInputCsvXlsx");
  const btnEscolherArquivo = document.getElementById("btnEscolherArquivo");
  const nomeArquivo        = document.getElementById("nomeArquivoSelecionado");
  const btnConfirmar       = document.getElementById("btnConfirmarImport");
  const previewArea        = document.getElementById("importPreviewArea");

  // Open / close modal
  btnImportar.addEventListener("click", () => {
    pendingImportRecords = [];
    previewArea.classList.add("hidden");
    hideStatus();
    googleSheetsUrlEl.value = "";
    nomeArquivo.textContent = "";
    fileInput.value = "";
    modalImportar.classList.remove("hidden");
  });

  btnFecharImportar.addEventListener("click", () => {
    modalImportar.classList.add("hidden");
  });

  modalImportar.addEventListener("click", (e) => {
    if (e.target === modalImportar) modalImportar.classList.add("hidden");
  });

  // Export
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

  // Google Sheets import
  btnImportarSheets.addEventListener("click", async () => {
    const url = googleSheetsUrlEl.value.trim();
    if (!url) { showStatus("Cole a URL da planilha antes de continuar.", "error"); return; }
    try {
      btnImportarSheets.disabled = true;
      showStatus("Buscando dados do Google Sheets...", "loading");
      const csvText = await fetchSheetsAsCSV(url);
      const rows = parseCSVText(csvText);
      const records = parseRows(rows);
      if (!records.length) throw new Error("Nenhum registro válido encontrado na planilha. Verifique os cabeçalhos.");
      showPreview(records);
    } catch (err) {
      showStatus(err.message || "Erro ao buscar planilha.", "error");
    } finally {
      btnImportarSheets.disabled = false;
    }
  });

  // File chooser
  btnEscolherArquivo.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) return;
    nomeArquivo.textContent = file.name;
    try {
      showStatus("Lendo arquivo...", "loading");
      let records;
      if (file.name.toLowerCase().endsWith(".xlsx")) {
        const buf = await file.arrayBuffer();
        const rows = await parseXLSXFile(buf);
        records = parseRows(rows);
      } else {
        const text = await file.text();
        const rows = parseCSVText(text);
        records = parseRows(rows);
      }
      if (!records.length) throw new Error("Nenhum registro válido encontrado. Verifique os cabeçalhos do arquivo.");
      showPreview(records);
    } catch (err) {
      showStatus(err.message || "Erro ao ler arquivo.", "error");
    }
  });

  // Confirm import
  btnConfirmar.addEventListener("click", async () => {
    if (!pendingImportRecords.length) return;
    const mode = document.querySelector('input[name="importMode"]:checked')?.value || "substituir";
    const modeLabel = mode === "substituir" ? "substituir todos os registros" : "adicionar aos existentes";
    const ok = confirm(`Confirmar importação de ${pendingImportRecords.length} registro(s) (${modeLabel})?`);
    if (!ok) return;

    try {
      btnConfirmar.disabled = true;
      await writeToFirestore(pendingImportRecords, mode);
      showStatus(`${pendingImportRecords.length} registro(s) importado(s) com sucesso!`, "success");
      pendingImportRecords = [];
      previewArea.classList.add("hidden");
      // Reload the main list by dispatching a click on "Atualizar Lista"
      document.getElementById("btnRecarregar")?.click();
    } catch (err) {
      showStatus("Erro ao salvar: " + (err.message || err), "error");
    } finally {
      btnConfirmar.disabled = false;
    }
  });
});
