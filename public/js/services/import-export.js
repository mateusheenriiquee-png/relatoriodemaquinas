import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { db } from "../config/firebase.js";

const COLLECTION = "suportes_tecnicos";
// No CSV vindo do Forms, "OBSERVAÇÃO" é a descrição do atendimento.
// Mantemos apenas os campos que não devem virar colunas principais.
const IGNORED_FIELDS = new Set(["observacao do tecnico", "observacao do técnico"]);
const BATCH_SIZE = 400;

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
  dataAbertura: ["data abertura", "data de abertura", "abertura", "created at", "data", "carimbo de data/hora", "carimbo de data hora"],
  descricao: ["descricao", "descrição", "description", "descricao do problema", "descrição do problema", "observacao", "observação"],
  observacaoTecnico: ["observacao do tecnico", "observacao do técnico"]
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

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

function looksLikeCpfCnpj(value) {
  const d = digitsOnly(value);
  return d.length === 11 || d.length === 14;
}

function sanitizeDocId(value, fallbackKey) {
  const id = String(value || "")
    .replace(/\//g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 200);
  if (id) return id;
  return `import_${fallbackKey}_${Math.random().toString(36).slice(2, 11)}`;
}

// Gera IDs determinísticos para reduzir sobrescrita quando o CSV
// tem múltiplas linhas para o mesmo protocolo.
function normalizeIdPart(value) {
  return norm(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function buildDocId(record, rowIndex) {
  const keyParts = [record.protocolo, record.cpfCnpj, record.dataAbertura]
    .map((v) => normalizeIdPart(v))
    .filter(Boolean);

  if (keyParts.length) {
    return sanitizeDocId(`support_${keyParts.join("_")}`, `row${rowIndex}`);
  }

  // Fallback raro: quando a linha não tem protocolo/cpf/data.
  return sanitizeDocId("", `row${rowIndex}`);
}

function parseRows(rows) {
  return rows
    .filter((row) => Object.values(row).some((v) => norm(v)))
    .map((row, rowIndex) => {
      const record = {
        protocolo: norm(findField(row, "protocolo")),
        responsavelAbertura: norm(findField(row, "responsavelAbertura")) || "Não informado",
        cpfCnpj: norm(findField(row, "cpfCnpj")),
        tipo: norm(findField(row, "tipo")) || "Não informado",
        ac: norm(findField(row, "ac")) || "Não informado",
        contato: norm(findField(row, "contato")),
        descricao: norm(findField(row, "descricao")),
        observacaoTecnico: norm(findField(row, "observacaoTecnico")),
        tecnico: norm(findField(row, "tecnico")) || "Não atribuído",
        status: mapStatus(findField(row, "status")),
        statusAbertura: norm(findField(row, "statusAbertura")),
        dataAbertura: normalizeDateTime(findField(row, "dataAbertura"))
      };

      // Alguns registros colocam CPF/CNPJ dentro de "OBSERVAÇÃO".
      if (!record.cpfCnpj && looksLikeCpfCnpj(record.descricao)) {
        record.cpfCnpj = digitsOnly(record.descricao);
        record.descricao = "";
      }

      return { ...record, docId: buildDocId(record, rowIndex) };
    })
    // Não filtramos por protocolo/cpf/contato para não perder registros.
    // Se não houver protocolo, o docId é gerado via fallback (único por linha).
    ;
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
      headers.forEach((h, i) => {
        obj[h] = cols[i] !== undefined ? cols[i] : "";
      });
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
  infoEl.textContent = `${records.length} registro(s) encontrados. Pré-visualização (primeiros 5):`;
  tableEl.innerHTML = `
    <thead><tr><th>Protocolo</th><th>Resp. Abertura</th><th>CPF/CNPJ</th><th>AC</th><th>Técnico</th><th>Sit. Atendimento</th></tr></thead>
    <tbody>${preview
      .map(
        (r) =>
          `<tr><td>${r.protocolo || "-"}</td><td>${r.responsavelAbertura || "-"}</td><td>${r.cpfCnpj || "-"}</td><td>${r.ac || "-"}</td><td>${r.tecnico || "-"}</td><td>${r.status}</td></tr>`
      )
      .join("")}</tbody>
  `;
  previewArea.classList.remove("hidden");
  hideStatus();
}

async function deleteAllRecords() {
  const limite = 500;
  while (true) {
    const snap = await getDocs(collection(db, COLLECTION));
    if (snap.empty) break;
    const batch = writeBatch(db);
    snap.docs.slice(0, limite).forEach((docSnap) => batch.delete(doc(db, COLLECTION, docSnap.id)));
    await batch.commit();
    if (snap.size <= limite) break;
  }
}

async function writeToFirestore(records, mode) {
  if (mode === "substituir") {
    showStatus("Excluindo registros existentes...", "loading");
    await deleteAllRecords();
  }

  showStatus(`Salvando ${records.length} registro(s)...`, "loading");
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const chunk = records.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    chunk.forEach((record, chunkIndex) => {
      const { docId: rawDocId, ...fields } = record;
      const docId = sanitizeDocId(rawDocId, `b${i + chunkIndex}`);
      if (!docId) return;
      batch.set(
        doc(db, COLLECTION, docId),
        {
          ...fields,
          origemIntegracao: "import-csv",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );
    });
    await batch.commit();
  }
}

function resolverDataExport(data = {}) {
  const dataWebhook = norm(data.dataAbertura || data.carimboDataHora || "");
  if (dataWebhook) {
    const parsed = new Date(dataWebhook);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  if (data.createdAt && typeof data.createdAt.toDate === "function") {
    return data.createdAt.toDate();
  }
  return null;
}

function parseFiltroData(dateStr, fimDoDia = false) {
  if (!dateStr) return null;
  const parsed = new Date(`${dateStr}T${fimDoDia ? "23:59:59.999" : "00:00:00"}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatarDataCsv(value) {
  if (!value) return "";
  if (value && typeof value.toDate === "function") {
    return value.toDate().toLocaleString("pt-BR");
  }
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed.toLocaleString("pt-BR");
  return String(value);
}

function filtrarPorPeriodo(docs, dataInicio, dataFim) {
  const inicio = parseFiltroData(dataInicio, false);
  const fim = parseFiltroData(dataFim, true);
  if (!inicio && !fim) return docs;

  return docs.filter((docSnap) => {
    const data = docSnap.data();
    const dataRegistro = resolverDataExport(data);
    if (!dataRegistro) return false;
    if (inicio && dataRegistro < inicio) return false;
    if (fim && dataRegistro > fim) return false;
    return true;
  });
}

async function exportCSV(dataInicio = "", dataFim = "") {
  const snap = await getDocs(collection(db, COLLECTION));
  const filtrados = filtrarPorPeriodo(snap.docs, dataInicio, dataFim);
  if (!filtrados.length) {
    alert("Nenhum registro encontrado para o período selecionado.");
    return 0;
  }

  const headers = ["dataAbertura", "responsavelAbertura", "protocolo", "tipo", "ac", "contato", "descricao", "status", "tecnico", "statusAbertura", "cpfCnpj"];
  const escape = (v) => `"${String(v || "").replace(/"/g, '""')}"`;
  const csv = [
    headers.join(","),
    ...filtrados.map((docSnap) => {
      const r = docSnap.data();
      const linha = {
        ...r,
        dataAbertura: formatarDataCsv(r.dataAbertura || r.carimboDataHora || r.createdAt)
      };
      return headers.map((h) => escape(linha[h])).join(",");
    })
  ].join("\n");

  const sufixoInicio = dataInicio || "inicio";
  const sufixoFim = dataFim || "fim";
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `suportes_tecnicos_${sufixoInicio}_a_${sufixoFim}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  return filtrados.length;
}

function abrirModalImportar() {
  pendingImportRecords = [];
  document.getElementById("importPreviewArea").classList.add("hidden");
  document.getElementById("inputImportFile").value = "";
  hideStatus();
  document.getElementById("modalImportar").classList.remove("hidden");
}

function fecharModalImportar() {
  document.getElementById("modalImportar").classList.add("hidden");
}

function abrirModalExportar() {
  const modal = document.getElementById("modalExportar");
  const inicio = document.getElementById("exportDataInicio");
  const fim = document.getElementById("exportDataFim");
  const hoje = new Date();
  const trintaDias = new Date(hoje);
  trintaDias.setDate(trintaDias.getDate() - 30);
  const pad = (n) => String(n).padStart(2, "0");
  const toInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  inicio.value = toInput(trintaDias);
  fim.value = toInput(hoje);
  document.getElementById("exportResumo").classList.add("hidden");
  modal.classList.remove("hidden");
}

function fecharModalExportar() {
  document.getElementById("modalExportar").classList.add("hidden");
}

async function processarArquivoImport(file) {
  if (!file) return;
  showStatus("Lendo arquivo...", "loading");
  try {
    const name = (file.name || "").toLowerCase();
    let rows = [];
    if (name.endsWith(".csv")) {
      const text = await file.text();
      rows = parseCSVText(text);
    } else if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
      rows = await parseXLSXFile(await file.arrayBuffer());
    } else {
      throw new Error("Formato não suportado. Use CSV ou XLSX.");
    }

    const records = parseRows(rows);
    if (!records.length) {
      showStatus("Nenhum registro válido encontrado no arquivo.", "error");
      return;
    }
    showPreview(records);
  } catch (err) {
    showStatus(err.message || "Erro ao ler o arquivo.", "error");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const btnImportar = document.getElementById("btnImportar");
  const btnExportar = document.getElementById("btnExportar");
  const btnConfirmarImportar = document.getElementById("btnConfirmarImportar");
  const btnConfirmarExportar = document.getElementById("btnConfirmarExportar");
  const btnCancelarExportar = document.getElementById("btnCancelarExportar");
  const btnFecharExportar = document.getElementById("btnFecharExportar");
  const btnFecharImportar = document.getElementById("btnFecharImportar");
  const modalExportar = document.getElementById("modalExportar");
  const modalImportar = document.getElementById("modalImportar");
  const inputImportFile = document.getElementById("inputImportFile");

  if (btnImportar) {
    btnImportar.addEventListener("click", abrirModalImportar);
    btnFecharImportar?.addEventListener("click", fecharModalImportar);
    modalImportar?.addEventListener("click", (e) => {
      if (e.target === modalImportar) fecharModalImportar();
    });
    inputImportFile?.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      processarArquivoImport(file);
    });
    btnConfirmarImportar?.addEventListener("click", async () => {
      if (!pendingImportRecords.length) {
        showStatus("Selecione um arquivo antes de importar.", "error");
        return;
      }
      const mode = document.querySelector('input[name="importMode"]:checked')?.value || "adicionar";
      try {
        btnConfirmarImportar.disabled = true;
        btnConfirmarImportar.textContent = "Importando...";
        await writeToFirestore(pendingImportRecords, mode);
        showStatus(`${pendingImportRecords.length} registro(s) importado(s) com sucesso.`, "success");
        setTimeout(() => {
          fecharModalImportar();
          window.dispatchEvent(new CustomEvent("suportes-importados"));
        }, 1200);
      } catch (err) {
        showStatus(err.message || "Erro ao importar.", "error");
      } finally {
        btnConfirmarImportar.disabled = false;
        btnConfirmarImportar.textContent = "Importar";
      }
    });
  }

  if (!btnExportar || !btnConfirmarExportar) return;

  btnExportar.addEventListener("click", abrirModalExportar);
  btnCancelarExportar?.addEventListener("click", fecharModalExportar);
  btnFecharExportar?.addEventListener("click", fecharModalExportar);
  modalExportar?.addEventListener("click", (e) => {
    if (e.target === modalExportar) fecharModalExportar();
  });

  btnConfirmarExportar.addEventListener("click", async () => {
    const dataInicio = document.getElementById("exportDataInicio").value;
    const dataFim = document.getElementById("exportDataFim").value;
    if (dataInicio && dataFim && dataInicio > dataFim) {
      alert("A data inicial não pode ser maior que a data final.");
      return;
    }
    try {
      btnConfirmarExportar.disabled = true;
      btnConfirmarExportar.textContent = "Exportando...";
      const total = await exportCSV(dataInicio, dataFim);
      if (total > 0) {
        const resumo = document.getElementById("exportResumo");
        resumo.textContent = `${total} registro(s) exportado(s) com sucesso.`;
        resumo.classList.remove("hidden");
        setTimeout(fecharModalExportar, 1200);
      }
    } catch (err) {
      alert("Erro ao exportar: " + (err.message || err));
    } finally {
      btnConfirmarExportar.disabled = false;
      btnConfirmarExportar.textContent = "Exportar";
    }
  });
});
