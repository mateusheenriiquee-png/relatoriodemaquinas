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

function mapStatus(value) {
  const v = norm(value).toUpperCase();
  if (v === "FINALIZADO" || v === "CONCLUIDO" || v === "CONCLUÍDO") return "FINALIZADO";
  if (v === "EM ANDAMENTO" || v === "EM_ATENDIMENTO") return "EM ANDAMENTO";
  return "ABERTO";
}

function mapCanal(value) {
  const v = norm(value).toUpperCase();
  if (["WHATSAPP", "EMAIL", "TELEFONE", "WEBHOOK"].includes(v)) return v;
  return "WEBHOOK";
}

const FIELD_ALIASES = {
  protocolo: ["protocolo", "id", "id suporte", "numero chamado", "n chamado", "ticket"],
  cliente: ["cliente", "nome cliente", "razao social", "nome", "parceiro"],
  cpfCnpj: ["cpf/cnpj", "cpf cnpj", "cpfcnpj", "cpf", "cnpj", "documento"],
  contato: ["contato", "telefone", "celular", "whatsapp", "email"],
  tecnico: ["tecnico", "tecnico responsavel", "responsavel tecnico", "analista"],
  canal: ["canal", "origem", "source"],
  status: ["status", "situacao", "situação"],
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
      cliente: norm(findField(row, "cliente")),
      cpfCnpj: norm(findField(row, "cpfCnpj")),
      contato: norm(findField(row, "contato")),
      tecnico: norm(findField(row, "tecnico")),
      canal: mapCanal(findField(row, "canal")),
      status: mapStatus(findField(row, "status")),
      dataAbertura: norm(findField(row, "dataAbertura"))
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
    <thead><tr><th>Protocolo</th><th>Cliente</th><th>CPF/CNPJ</th><th>Tecnico</th><th>Canal</th><th>Status</th></tr></thead>
    <tbody>${preview.map((r) => `<tr><td>${r.protocolo || "-"}</td><td>${r.cliente || "-"}</td><td>${r.cpfCnpj || "-"}</td><td>${r.tecnico || "-"}</td><td>${r.canal}</td><td>${r.status}</td></tr>`).join("")}</tbody>
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
  const headers = ["protocolo", "cliente", "cpfCnpj", "contato", "tecnico", "canal", "status", "dataAbertura"];
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
  const modalImportar = document.getElementById("modalImportar");
  const btnImportar = document.getElementById("btnImportar");
  const btnFecharImportar = document.getElementById("btnFecharModalImportar");
  const btnExportar = document.getElementById("btnExportar");
  const fileInput = document.getElementById("fileInputCsvXlsx");
  const btnEscolherArquivo = document.getElementById("btnEscolherArquivo");
  const nomeArquivo = document.getElementById("nomeArquivoSelecionado");
  const btnConfirmar = document.getElementById("btnConfirmarImport");
  const previewArea = document.getElementById("importPreviewArea");

  btnImportar.addEventListener("click", () => {
    pendingImportRecords = [];
    previewArea.classList.add("hidden");
    hideStatus();
    nomeArquivo.textContent = "";
    fileInput.value = "";
    modalImportar.classList.remove("hidden");
  });
  btnFecharImportar.addEventListener("click", () => modalImportar.classList.add("hidden"));
  btnEscolherArquivo.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) return;
    nomeArquivo.textContent = file.name;
    try {
      showStatus("Lendo arquivo...", "loading");
      const rows = file.name.toLowerCase().endsWith(".xlsx")
        ? await parseXLSXFile(await file.arrayBuffer())
        : parseCSVText(await file.text());
      const records = parseRows(rows);
      if (!records.length) throw new Error("Nenhum registro valido encontrado.");
      showPreview(records);
    } catch (err) {
      showStatus(err.message || "Erro ao ler arquivo.", "error");
    }
  });

  btnConfirmar.addEventListener("click", async () => {
    if (!pendingImportRecords.length) return;
    const mode = document.querySelector('input[name="importMode"]:checked')?.value || "substituir";
    const ok = confirm(`Confirmar importacao de ${pendingImportRecords.length} registro(s)?`);
    if (!ok) return;
    try {
      btnConfirmar.disabled = true;
      await writeToFirestore(pendingImportRecords, mode);
      showStatus(`${pendingImportRecords.length} registro(s) importado(s) com sucesso!`, "success");
      pendingImportRecords = [];
      previewArea.classList.add("hidden");
      document.getElementById("btnRecarregar")?.click();
    } catch (err) {
      showStatus("Erro ao salvar: " + (err.message || err), "error");
    } finally {
      btnConfirmar.disabled = false;
    }
  });

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
