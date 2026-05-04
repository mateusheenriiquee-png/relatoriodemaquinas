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

// ── New comprehensive field analyzer for complete data scanning ──────────────
const DYNAMIC_FIELD_CATEGORIES = {
  "Identificação": ["id", "código", "code", "numero", "number", "matricula", "registration"],
  "Contato": ["email", "telefone", "phone", "celular", "whatsapp", "telegram", "contact", "endereço", "address"],
  "Financeiro": ["valor", "value", "preço", "price", "custo", "cost", "taxa", "fee", "desconto", "discount"],
  "Data": ["data", "date", "criado", "created", "modificado", "modified", "atualizado", "updated", "vencimento", "expiry"],
  "Status": ["ativo", "active", "inativo", "inactive", "habilitado", "enabled", "desabilitado", "disabled"],
  "Localização": ["cidade", "city", "estado", "state", "país", "country", "região", "region", "filial", "branch"],
  "Observação": ["nota", "note", "comentário", "comment", "descrição", "description", "observação", "remarks"]
};

function detectField(header) {
  const h = header.toLowerCase().trim().replace(/\s+/g, "");
  for (const [field, aliases] of Object.entries(COLUMN_MAP)) {
    if (aliases.some(a => h.includes(a.replace(/\s+/g, "")))) return field;
  }
  return null;
}

// ── Analyze field value type and relevance ─────────────────────────────────
function analyzeFieldRelevance(values) {
  const nonEmpty = values.filter(v => String(v || "").trim());
  const fillRate = nonEmpty.length / Math.max(values.length, 1);
  
  if (fillRate < 0.1) return { type: "sparse", category: "other", relevance: 0.2 };
  if (fillRate < 0.5) return { type: "partial", category: "other", relevance: 0.5 };
  
  const uniqueCount = new Set(nonEmpty.map(v => String(v).toLowerCase())).size;
  const uniqueRatio = uniqueCount / nonEmpty.length;
  
  let type = "text";
  if (/^\d+$/.test(nonEmpty[0])) type = "number";
  else if (/^\d{1,2}\/\d{1,2}\/\d{2,4}|^\d{4}-\d{2}-\d{2}/.test(nonEmpty[0])) type = "date";
  else if (/^(true|false|sim|não|yes|no|1|0)$/i.test(nonEmpty[0])) type = "boolean";
  else if (/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(nonEmpty[0])) type = "email";
  
  return {
    type,
    fillRate: Math.round(fillRate * 100),
    uniqueRatio: Math.round(uniqueRatio * 100),
    relevance: fillRate * (1 - uniqueRatio / 2), // high if common & non-unique
    category: "other"
  };
}

// ── Detect field category from header and values ──────────────────────────────
function detectFieldCategory(header, values) {
  const h = header.toLowerCase();
  for (const [category, keywords] of Object.entries(DYNAMIC_FIELD_CATEGORIES)) {
    if (keywords.some(k => h.includes(k))) return category;
  }
  return "Outro";
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

// ── Parse rows with standard fields AND capture additional dynamic fields ────
function parseRows(rows, includeExtra = false, selectedExtraFields = []) {
  const filtered = rows.filter(r => Object.values(r).some(v => String(v || "").trim()));
  
  return filtered
    .map(raw => {
      const r = {};
      const extra = {}; // capture additional fields
      
      for (const [k, v] of Object.entries(raw)) {
        const field = detectField(k);
        if (field) {
          r[field] = v;
        } else if (includeExtra && String(v || "").trim() && selectedExtraFields.includes(k)) {
          // Only store selected additional fields
          extra[k] = v;
        }
      }
      
      const normalized = {
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
      
      // Include extra fields if requested and available
      if (includeExtra && Object.keys(extra).length > 0) {
        normalized.dadosAdicionais = extra;
      }
      
      return normalized;
    })
    .filter(r => r.maquina); // must have a machine name
}

// ── Comprehensive scan: extract ALL potentially useful data ──────────────────
function scanAllFieldsFromRows(rows) {
  if (!rows.length) return [];
  
  const fieldMap = new Map(); // header -> { values: [], category, analysis }
  
  // Collect all unique headers and their values
  for (const row of rows) {
    for (const [header, value] of Object.entries(row)) {
      if (!fieldMap.has(header)) {
        fieldMap.set(header, { values: [], category: null, standardField: detectField(header) });
      }
      fieldMap.get(header).values.push(value);
    }
  }
  
  // Analyze each field
  const allFields = Array.from(fieldMap.entries()).map(([header, data]) => {
    if (data.standardField) return null; // skip standard fields
    
    const analysis = analyzeFieldRelevance(data.values);
    const category = detectFieldCategory(header, data.values);
    
    return {
      header,
      category,
      ...analysis,
      sampleValues: data.values.filter(v => String(v || "").trim()).slice(0, 3)
    };
  }).filter(Boolean);
  
  // Sort by relevance
  return allFields.sort((a, b) => b.relevance - a.relevance);
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

// ── Preview rendering with dynamic field selection ──────────────────────────
let pendingImportRecords = [];
let discoveredExtraFields = [];
let rawImportData = []; // Store raw data for re-parsing with extra fields

function showPreview(records, allFields = []) {
  pendingImportRecords = records;
  discoveredExtraFields = allFields;

  const previewArea = document.getElementById("importPreviewArea");
  const infoEl = document.getElementById("importPreviewInfo");
  const tableEl = document.getElementById("importPreviewTable");
  const extraFieldsEl = document.getElementById("importExtraFieldsContainer");

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

  // Show discovered additional fields
  if (allFields && allFields.length > 0) {
    let html = `
      <div class="extra-fields-section">
        <h4>📊 Campos Adicionais Descobertos (${allFields.length})</h4>
        <p class="extra-fields-info">O sistema identificou informações úteis adicionais. Selecione quais deseja importar:</p>
        <div class="extra-fields-grid">
    `;
    
    allFields.forEach(field => {
      const checked = field.relevance > 0.7 ? 'checked' : ''; // auto-select high relevance
      html += `
        <label class="field-checkbox">
          <input type="checkbox" name="extraField" value="${field.header}" ${checked} data-category="${field.category}">
          <span class="field-info">
            <strong>${field.header}</strong>
            <span class="field-category">${field.category}</span>
            <span class="field-stats">${field.fillRate}% preenchido | ${field.type}</span>
            <span class="field-samples">Ex: ${field.sampleValues.join(", ")}</span>
          </span>
        </label>
      `;
    });
    
    html += `</div></div>`;
    extraFieldsEl.innerHTML = html;
    extraFieldsEl.classList.remove("hidden");
  } else {
    extraFieldsEl.classList.add("hidden");
  }

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
    discoveredExtraFields = [];
    rawImportData = [];
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
      rawImportData = rows; // Store raw data for later re-processing
      
      // First pass: identify ALL fields
      const allFields = scanAllFieldsFromRows(rows);
      
      // Parse records with standard fields only for now
      const records = parseRows(rows, false);
      
      if (!records.length) throw new Error("Nenhum registro válido encontrado na planilha. Verifique os cabeçalhos.");
      
      // Show preview with extra fields
      showPreview(records, allFields);
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
      let rows;
      if (file.name.toLowerCase().endsWith(".xlsx")) {
        const buf = await file.arrayBuffer();
        rows = await parseXLSXFile(buf);
      } else {
        const text = await file.text();
        rows = parseCSVText(text);
      }
      rawImportData = rows; // Store raw data for later re-processing
      
      // First pass: identify ALL fields
      const allFields = scanAllFieldsFromRows(rows);
      
      // Parse records with standard fields only for now
      const records = parseRows(rows, false);
      
      if (!records.length) throw new Error("Nenhum registro válido encontrado. Verifique os cabeçalhos do arquivo.");
      
      // Show preview with extra fields
      showPreview(records, allFields);
    } catch (err) {
      showStatus(err.message || "Erro ao ler arquivo.", "error");
    }
  });

  // Confirm import
  btnConfirmar.addEventListener("click", async () => {
    if (!pendingImportRecords.length) return;
    
    // Get selected extra fields
    const selectedExtras = Array.from(document.querySelectorAll('input[name="extraField"]:checked'))
      .map(el => el.value);
    
    // Re-parse records with selected extra fields
    let finalRecords = pendingImportRecords;
    if (selectedExtras.length > 0 && rawImportData.length > 0) {
      // Re-parse with extra fields
      finalRecords = parseRows(rawImportData, true, selectedExtras);
    }
    
    const mode = document.querySelector('input[name="importMode"]:checked')?.value || "substituir";
    const modeLabel = mode === "substituir" ? "substituir todos os registros" : "adicionar aos existentes";
    const extraInfo = selectedExtras.length > 0 ? ` + ${selectedExtras.length} campo(s) adicional(is)` : "";
    const ok = confirm(`Confirmar importação de ${finalRecords.length} registro(s)${extraInfo} (${modeLabel})?`);
    if (!ok) return;

    try {
      btnConfirmar.disabled = true;
      await writeToFirestore(finalRecords, mode);
      showStatus(`${finalRecords.length} registro(s) importado(s) com sucesso! ${selectedExtras.length > 0 ? `+ ${selectedExtras.length} campo(s) adicional(is)` : ""}`, "success");
      pendingImportRecords = [];
      discoveredExtraFields = [];
      rawImportData = [];
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
