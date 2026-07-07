import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  updateDoc,
  where,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { db } from "./config/firebase.js";
import { authManager } from "./auth.js";
import { syncDocToSheet, deleteDocFromSheet } from "./services/sheets-sync.js";

const STATUS_OPTIONS = ["EM ABERTO", "EM ANDAMENTO", "FINALIZADO", "SEM RETORNO", "REAGENDADO"];
const PAGE_SIZE = 10;
const COLLECTION = "suportes_tecnicos";

const state = {
  registros: [],
  filtroStatus: "todos",
  filtroAc: "todos",
  filtroTecnico: "todos",
  filtroDataInicio: "",
  filtroDataFim: "",
  filtroCpfCnpj: "",
  filtroProtocolo: "",
  paginaAtual: 1,
  modalModo: "adicionar",
  pageCursors: [null],
  hasNextPage: false,
  statusCounts: null
};
let unsubscribePageListener = null;

const tbody = document.getElementById("tbody");
const filtroStatusEl = document.getElementById("filtroStatus");
const filtroAcEl = document.getElementById("filtroAc");
const filtroTecnicoEl = document.getElementById("filtroTecnico");
const filtroDataInicioEl = document.getElementById("filtroDataInicio");
const filtroDataFimEl = document.getElementById("filtroDataFim");
const filtroCpfCnpjEl = document.getElementById("filtroCpfCnpj");
const filtroProtocoloEl = document.getElementById("filtroProtocolo");
const paginationInfo = document.getElementById("paginationInfo");
const modal = document.getElementById("modalSuporte");
const modalTitulo = document.getElementById("modalTitulo");
const formSuporte = document.getElementById("formSuporte");

const modalProtocolo = document.getElementById("modalProtocolo");
const modalResponsavelAbertura = document.getElementById("modalResponsavelAbertura");
const modalCpfCnpj = document.getElementById("modalCpfCnpj");
const modalTipo = document.getElementById("modalTipo");
const modalAc = document.getElementById("modalAc");
const modalContato = document.getElementById("modalContato");
const modalDescricao = document.getElementById("modalDescricao");
const modalTecnico = document.getElementById("modalTecnico");
const modalStatus = document.getElementById("modalStatus");
const modalStatusAbertura = document.getElementById("modalStatusAbertura");
const modalDataAbertura = document.getElementById("modalDataAbertura");
const modalIdAtual = document.getElementById("modalIdAtual");
const modalExcluir = document.getElementById("modalExcluir");
const modalExcluirDetalhes = document.getElementById("modalExcluirDetalhes");
const btnCancelarExclusao = document.getElementById("btnCancelarExclusao");
const btnConfirmarExclusao = document.getElementById("btnConfirmarExclusao");

let excluirIdPendente = null;
let excluirTudoPendente = false;

function showNotification(message, type = "info", timeout = 2500) {
  try {
    const existing = document.getElementById("inpageNotificationModal");
    if (existing) existing.remove();

    const modalWrap = document.createElement("div");
    modalWrap.id = "inpageNotificationModal";
    modalWrap.className = "modal";
    modalWrap.setAttribute("role", "dialog");
    modalWrap.style.zIndex = "1200";

    const inner = document.createElement("div");
    inner.className = "modal-content modal-confirm";

    const icon = document.createElement("div");
    icon.className = "modal-confirm-icon";
    icon.textContent = type === "error" ? "!" : type === "success" ? "✓" : "i";

    const title = document.createElement("h2");
    title.textContent = type === "error" ? "Erro" : type === "success" ? "Pronto" : "Aviso";

    const p = document.createElement("p");
    p.className = "modal-confirm-text";
    p.style.margin = "8px 0 12px";
    p.textContent = String(message || "");

    const actions = document.createElement("div");
    actions.className = "modal-confirm-actions";

    const btnOk = document.createElement("button");
    btnOk.className = "btn btn-ghost";
    btnOk.textContent = "OK";
    btnOk.addEventListener("click", () => modalWrap.remove());

    actions.appendChild(btnOk);
    inner.appendChild(icon);
    inner.appendChild(title);
    inner.appendChild(p);
    inner.appendChild(actions);
    modalWrap.appendChild(inner);
    document.body.appendChild(modalWrap);

    modalWrap.addEventListener("click", (e) => {
      if (e.target === modalWrap) modalWrap.remove();
    });

    if (type !== "error" && timeout > 0) {
      setTimeout(() => {
        modalWrap.remove();
      }, timeout);
    }
  } catch (err) {
    try { alert(message); } catch (e) { /* ignore */ }
  }
}

const norm = (v) => String(v || "").trim().replace(/\s+/g, " ");

function involvesSoluti(...values) {
  return values.some((value) => norm(value).toLowerCase().includes("soluti"));
}

function isRegistroSoluti(record) {
  return involvesSoluti(record.ac, record.tipo, record.responsavelAbertura, record.protocolo, record.tecnico);
}

function normStatus(v) {
  const s = norm(v).toUpperCase();
  if (STATUS_OPTIONS.includes(s)) return s;
  if (/REAGEND/.test(s)) return "REAGENDADO";
  if (/TRATATIV|ANDAMENTO|ATENDIMENTO/.test(s)) return "EM ANDAMENTO";
  if (/FINALIZ|CONCLUID|RESOLVID|FECHAD/.test(s)) return "FINALIZADO";
  if (/SEM RETORNO/.test(s)) return "SEM RETORNO";
  if (/ABERTO|NOVO|BACKLOG/.test(s)) return "EM ABERTO";
  return "EM ABERTO";
}

function statusClass(status) {
  const s = normStatus(status);
  if (s === "EM ANDAMENTO") return "status-andamento";
  if (s === "FINALIZADO") return "status-finalizado";
  if (s === "REAGENDADO") return "status-reagendado";
  if (s === "SEM RETORNO") return "status-sem-retorno";
  return "status-aberto";
}

function formatDate(isoDate) {
  if (!isoDate) return "-";
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleString("pt-BR");
}

function toComparableDate(isoDate) {
  const d = new Date(isoDate || "");
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

function toDatetimeLocal(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function resolverDataAbertura(data = {}) {
  const dataWebhook = norm(data.dataAbertura || data.carimboDataHora || "");
  if (dataWebhook) return dataWebhook;
  if (typeof data.createdAt === "string") return norm(data.createdAt);
  if (data.createdAt && typeof data.createdAt.toDate === "function") {
    return data.createdAt.toDate().toISOString();
  }
  return "";
}

function configurarCamposModoEdicao(estaEditando) {
  modalProtocolo.disabled = estaEditando;
  modalResponsavelAbertura.disabled = true;
  modalCpfCnpj.disabled = estaEditando;
  modalTipo.disabled = estaEditando;
  modalAc.disabled = estaEditando;
  modalContato.disabled = estaEditando;
  modalDescricao.disabled = estaEditando;
  modalDataAbertura.disabled = true;

  modalStatus.disabled = false;
  modalTecnico.disabled = false;
  modalStatusAbertura.disabled = false;
}

async function associarTecnicoResponsavel(itemId) {
  const item = state.registros.find((registro) => registro.id === itemId);
  if (!item) throw new Error("Registro não encontrado.");

  let apiBase = window.__API_BASE_URL;
  if (!apiBase) {
    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
      apiBase = "http://localhost:3000";
    } else {
      apiBase = window.location.origin;
    }
  }

  const token = await authManager.getIdToken();
  console.log("[App] associarTecnicoResponsavel apiBase:", apiBase);
  console.log("[App] associarTecnicoResponsavel token preview:", token ? `${token.substring(0, 20)}...` : "[no token]");

  const response = await fetch(`${apiBase}/admin/supports/${itemId}/associate`, {
    method: "POST",
    mode: "cors",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    }
  });

  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Erro ao associar técnico.");
  }

  const tecnico = data.tecnico;
  const status = "EM ANDAMENTO";
  void syncToSheet(itemId, { ...item, tecnico, status, id: itemId });
  await atualizarEstatisticasDb();
  atualizarEstatisticas();
  return tecnico;
}

function mapDocToRegistro(docSnap) {
  const data = docSnap.data();
  return {
    id: docSnap.id,
    protocolo: norm(data.protocolo || data.idSuporte || ""),
    responsavelAbertura: norm(data.responsavelAbertura || data.responsavel || data.cliente || ""),
    cpfCnpj: norm(data.cpfCnpj || data.cpf_cnpj || ""),
    contato: norm(data.contato || data.telefone || ""),
    descricao: norm(data.descricao || data.description || ""),
    tipo: norm(data.tipo || ""),
    ac: norm(data.ac || data.AC || ""),
    tecnico: norm(data.tecnico || data.tecnicoResponsavel || ""),
    status: normStatus(data.status || data.situacao || data.situacaoAtendimento || "EM ABERTO"),
    statusAbertura: norm(data.statusAbertura || ""),
    dataAbertura: resolverDataAbertura(data)
  };
}

function buildQueryConstraints() {
  const buscandoProtocolo = !!state.filtroProtocolo;
  const constraints = [];

  // O Firestore exige que, quando há um filtro de intervalo (>=, <=) em um campo,
  // o primeiro orderBy() seja nesse MESMO campo. Por isso, ao buscar por protocolo,
  // trocamos a ordenação de "dataAbertura" para "protocolo".
  if (buscandoProtocolo) {
    const valor = state.filtroProtocolo.trim();
    constraints.push(where("protocolo", ">=", valor));
    constraints.push(where("protocolo", "<=", valor + "\uf8ff"));
    constraints.push(orderBy("protocolo"));
  } else {
    constraints.push(orderBy("dataAbertura", "desc"));
  }

  if (state.filtroStatus !== "todos") {
    constraints.push(where("status", "==", state.filtroStatus));
  }
  if (state.filtroAc !== "todos") {
    constraints.push(where("ac", "==", state.filtroAc));
  }
  if (state.filtroTecnico !== "todos") {
    constraints.push(where("tecnico", "==", state.filtroTecnico));
  }
  // Firestore só permite filtro de intervalo (>=, <=) em UM campo por consulta.
  // Como o protocolo já está usando esse tipo de filtro, o intervalo de datas
  // não pode ser combinado ao mesmo tempo — por isso é ignorado durante a busca por protocolo.
  if (!buscandoProtocolo) {
    if (state.filtroDataInicio) {
      const startIso = new Date(`${state.filtroDataInicio}T00:00:00Z`).toISOString();
      constraints.push(where("dataAbertura", ">=", startIso));
    }
    if (state.filtroDataFim) {
      const endIso = new Date(`${state.filtroDataFim}T23:59:59Z`).toISOString();
      constraints.push(where("dataAbertura", "<=", endIso));
    }
  }
  return constraints;
}

function buildPageQuery() {
  const collectionRef = collection(db, COLLECTION);
  const constraints = buildQueryConstraints();
  const currentPage = Math.max(1, state.paginaAtual);
  const pageConstraints = [...constraints];

  if (currentPage > 1) {
    const cursor = state.pageCursors[currentPage - 1];
    if (cursor) {
      pageConstraints.push(startAfter(cursor));
    } else {
      state.paginaAtual = 1;
    }
  }

  pageConstraints.push(limit(PAGE_SIZE + 1));
  return query(collectionRef, ...pageConstraints);
}

function startPageListener() {
  if (!db) return;
  if (unsubscribePageListener) {
    unsubscribePageListener();
    unsubscribePageListener = null;
  }

  const pageQuery = buildPageQuery();
  unsubscribePageListener = onSnapshot(
    pageQuery,
    (snap) => {
      state.hasNextPage = snap.docs.length > PAGE_SIZE;
      const docs = snap.docs.slice(0, PAGE_SIZE);
      state.registros = docs.map(mapDocToRegistro).filter((item) => !isRegistroSoluti(item));
      const currentPage = Math.max(1, state.paginaAtual);
      if (docs.length > 0) {
        state.pageCursors[currentPage] = docs[docs.length - 1];
      }
      atualizarFiltroAc();
      render();
    },
    (error) => {
      console.error("[App] Erro no listener da página:", error);
      showNotification(`Erro ao sincronizar página: ${error.message || String(error)}`, "error", 4000);
    }
  );
}

async function carregar() {
  try {
    if (!db) {
      console.error("[App] Erro crítico: Firestore não inicializado");
      showNotification("Erro: Firestore não está configurado. Verifique firebase.js", "error", 5000);
      return;
    }

    startPageListener();
    await atualizarEstatisticasDb();
    atualizarEstatisticas();
  } catch (error) {
    console.error("[App] Erro ao carregar página:", error);
    showNotification(`Erro ao carregar registros: ${error.message || String(error)}`, "error", 4000);
  }
}

function atualizarFiltroAc() {
  const acs = Array.from(new Set(state.registros.map((r) => r.ac).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
  const valorAnterior = state.filtroAc;
  filtroAcEl.innerHTML = '<option value="todos">Todos</option>';
  acs.forEach((nome) => {
    const option = document.createElement("option");
    option.value = nome;
    option.textContent = nome;
    filtroAcEl.appendChild(option);
  });
  state.filtroAc = valorAnterior === "todos" || acs.includes(valorAnterior) ? valorAnterior : "todos";
  filtroAcEl.value = state.filtroAc;
}

function getRegistrosFiltrados() {
  let dados = state.registros.filter((item) => !isRegistroSoluti(item));
  if (state.filtroCpfCnpj) dados = dados.filter((item) => item.cpfCnpj.toLowerCase().includes(state.filtroCpfCnpj.toLowerCase()));
  if (state.filtroProtocolo) dados = dados.filter((item) => item.protocolo.toLowerCase().includes(state.filtroProtocolo.toLowerCase()));
  if (state.filtroStatus !== "todos") dados = dados.filter((item) => item.status === state.filtroStatus);
  if (state.filtroAc !== "todos") dados = dados.filter((item) => item.ac === state.filtroAc);
  if (state.filtroTecnico !== "todos") dados = dados.filter((item) => item.tecnico === state.filtroTecnico);
  if (state.filtroDataInicio) {
    const inicio = new Date(`${state.filtroDataInicio}T00:00:00`).getTime();
    dados = dados.filter((item) => toComparableDate(item.dataAbertura) >= inicio);
  }
  if (state.filtroDataFim) {
    const fim = new Date(`${state.filtroDataFim}T23:59:59.999`).getTime();
    dados = dados.filter((item) => toComparableDate(item.dataAbertura) <= fim);
  }
  dados.sort((a, b) => toComparableDate(b.dataAbertura) - toComparableDate(a.dataAbertura));
  return dados;
}

function atualizarEstatisticas() {
  const total = state.statusCounts?.total ?? state.registros.length;
  const abertos = state.statusCounts?.abertos ?? state.registros.filter((r) => r.status === "EM ABERTO").length;
  const andamento = state.statusCounts?.andamento ?? state.registros.filter((r) => r.status === "EM ANDAMENTO").length;
  const finalizados = state.statusCounts?.finalizados ?? state.registros.filter((r) => r.status === "FINALIZADO").length;
  document.getElementById("statTotal").textContent = String(total);
  document.getElementById("statAbertos").textContent = String(abertos);
  document.getElementById("statAndamento").textContent = String(andamento);
  document.getElementById("statFinalizados").textContent = String(finalizados);
}

async function atualizarEstatisticasDb() {
  if (!db) return;
  try {
    const collectionRef = collection(db, COLLECTION);
    const totalSnap = await getCountFromServer(query(collectionRef));
    const abertosSnap = await getCountFromServer(query(collectionRef, where("status", "==", "EM ABERTO")));
    const andamentoSnap = await getCountFromServer(query(collectionRef, where("status", "==", "EM ANDAMENTO")));
    const finalizadosSnap = await getCountFromServer(query(collectionRef, where("status", "==", "FINALIZADO")));

    state.statusCounts = {
      total: Number(totalSnap.data().count || 0),
      abertos: Number(abertosSnap.data().count || 0),
      andamento: Number(andamentoSnap.data().count || 0),
      finalizados: Number(finalizadosSnap.data().count || 0)
    };
  } catch (error) {
    console.warn("[App] Falha ao buscar totais do Firestore:", error);
    state.statusCounts = null;
  }
}

function atualizarRodapePaginacao(totalItens = 0) {
  const pageText = `Página ${state.paginaAtual}${state.hasNextPage ? "" : " (última)"}`;
  paginationInfo.textContent = `Mostrando ${totalItens} registro(s) · ${pageText}`;
  document.getElementById("btnPrevPage").disabled = state.paginaAtual <= 1;
  document.getElementById("btnNextPage").disabled = !state.hasNextPage;
}

function render() {
  tbody.innerHTML = "";
  const dados = getRegistrosFiltrados();
  if (!dados.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = '<td colspan="12" class="empty">Nenhum suporte encontrado para os filtros selecionados.</td>';
    tbody.appendChild(tr);
    atualizarEstatisticas();
    atualizarRodapePaginacao(0);
    return;
  }
  dados.forEach((item) => {
    const tr = document.createElement("tr");
    const btnExcluir = authManager.isAdmin()
      ? `<button class="btn btn-icon btn-icon-danger" data-action="excluir" data-id="${item.id}" title="Excluir" aria-label="Excluir suporte">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 6h18"/>
            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6"/>
            <path d="M14 11v6"/>
          </svg>
        </button>`
      : "";
    tr.innerHTML = `
      <td>${formatDate(item.dataAbertura)}</td>
      <td>${item.responsavelAbertura || "-"}</td>
      <td>${item.protocolo || "-"}</td>
      <td>${item.cpfCnpj || "-"}</td>
      <td>${item.tipo || "-"}</td>
      <td>${item.ac || "-"}</td>
      <td>${item.contato || "-"}</td>
      <td>${item.descricao || "-"}</td>
      <td><span class="status-pill ${statusClass(item.status)}">${item.status}</span></td>
      <td>${item.tecnico || "-"}</td>
      <td>${item.statusAbertura || "-"}</td>
      <td class="actions-cell">
        <div class="action-buttons">
          <button class="btn btn-icon btn-icon-primary" data-action="associar" data-id="${item.id}" title="Associar técnico" aria-label="Associar técnico responsável">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <polyline points="16 11 18 13 22 9"/>
            </svg>
          </button>
          ${btnExcluir}
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
  atualizarEstatisticas();
  atualizarRodapePaginacao(dados.length);
}

function abrirModalAdicionar() {
  state.modalModo = "adicionar";
  configurarCamposModoEdicao(false);
  modalTitulo.textContent = "Novo Suporte";
  modalProtocolo.value = "";
  modalCpfCnpj.value = "";
  modalTipo.value = "SUPORTE TECNICO";
  modalAc.value = "CONSULTI";
  modalContato.value = "";
  modalDescricao.value = "";
  modalTecnico.value = "MATHEUS";
  modalStatus.value = "EM ABERTO";
  modalStatusAbertura.value = "DEVIDO";
  modalDataAbertura.value = toDatetimeLocal(new Date().toISOString());
  modalIdAtual.value = "";
  
  // Preencher responsável com fallback síncrono
  const userDisplayName = authManager.getUserDisplayName();
  const email = authManager.getCurrentUser()?.email || "";
  const responsavel = userDisplayName || (email ? email.split("@")[0] : "Responsável");
  modalResponsavelAbertura.value = responsavel;
  modalResponsavelAbertura.disabled = true;
  
  modal.classList.remove("hidden");
}

function abrirModalEditar(item) {
  state.modalModo = "editar";
  configurarCamposModoEdicao(true);
  modalTitulo.textContent = "Editar Suporte";
  modalProtocolo.value = item.protocolo;
  modalResponsavelAbertura.value = item.responsavelAbertura;
  modalCpfCnpj.value = item.cpfCnpj;
  modalTipo.value = item.tipo || "SUPORTE TECNICO";
  modalAc.value = item.ac || "CONSULTI";
  modalContato.value = item.contato;
  modalDescricao.value = item.descricao || "";
  modalTecnico.value = item.tecnico || "MATHEUS";
  modalStatus.value = item.status;
  modalStatusAbertura.value = item.statusAbertura || "DEVIDO";
  modalDataAbertura.value = toDatetimeLocal(item.dataAbertura);
  modalIdAtual.value = item.id;
  modal.classList.remove("hidden");
}

function fecharModal() {
  modal.classList.add("hidden");
}

function abrirModalExcluir(item) {
  excluirIdPendente = item.id;
  excluirTudoPendente = false;
  modalExcluirDetalhes.textContent = `Protocolo ${item.protocolo || "—"} · ${item.responsavelAbertura || "—"}`;
  document.getElementById("modalExcluirTitulo").textContent = "Excluir suporte?";
  document.querySelector(".modal-confirm-text").textContent = "Esta ação não pode ser desfeita. O registro será removido permanentemente.";
  btnConfirmarExclusao.disabled = false;
  btnConfirmarExclusao.textContent = "Excluir";
  modalExcluir.classList.remove("hidden");
}

function fecharModalExcluir() {
  excluirIdPendente = null;
  excluirTudoPendente = false;
  modalExcluir.classList.add("hidden");
}

async function excluirTodosRegistros() {
  const limite = 500;
  while (true) {
    const batchQuery = query(collection(db, COLLECTION), limit(limite));
    const snapshot = await getDocs(batchQuery);
    if (snapshot.empty) break;
    const batch = writeBatch(db);
    snapshot.docs.forEach((docSnap) => batch.delete(doc(db, COLLECTION, docSnap.id)));
    await batch.commit();
    if (snapshot.size < limite) break;
  }
}

async function syncToSheet(id, data) {
  try {
    await syncDocToSheet(id, data);
  } catch (err) {
    // Silenciosamente falha na sincronização com sheets (não mostra ao usuário)
    console.warn("Sync com sheets falhou:", err.message);
  }
}

async function confirmarExclusao() {
  if (!authManager.isAdmin()) {
    showNotification("Apenas administradores podem excluir suportes.", "error", 3500);
    return;
  }
  if (!excluirIdPendente && !excluirTudoPendente) return;
  btnConfirmarExclusao.disabled = true;
  btnConfirmarExclusao.textContent = excluirTudoPendente ? "Excluindo tudo..." : "Excluindo...";
  try {
    if (excluirTudoPendente) {
      await excluirTodosRegistros();
    } else {
      const docId = excluirIdPendente;
      await deleteDoc(doc(db, COLLECTION, docId));
      void deleteDocFromSheet(docId);
    }
    await atualizarEstatisticasDb();
    atualizarEstatisticas();
    fecharModalExcluir();
  } catch (err) {
    btnConfirmarExclusao.disabled = false;
    btnConfirmarExclusao.textContent = excluirTudoPendente ? "Excluir tudo" : "Excluir";
    showNotification(err.message || "Nao foi possivel concluir a exclusao.", "error", 3500);
  }
}

function buildPayloadFromForm(modo) {
  const put = (target, key, value) => {
    const text = norm(value);
    if (text) target[key] = text;
  };

  if (modo === "editar") {
    const payload = { updatedAt: serverTimestamp() };
    put(payload, "tecnico", modalTecnico.value);
    put(payload, "status", normStatus(modalStatus.value));
    put(payload, "statusAbertura", modalStatusAbertura.value);
    return payload;
  }

  const payload = {
    dataAbertura: new Date().toISOString(),
    updatedAt: serverTimestamp()
  };
  put(payload, "protocolo", modalProtocolo.value);
  put(payload, "responsavelAbertura", modalResponsavelAbertura.value);
  put(payload, "cpfCnpj", modalCpfCnpj.value);
  put(payload, "tipo", modalTipo.value);
  put(payload, "ac", modalAc.value);
  put(payload, "contato", modalContato.value);
  put(payload, "descricao", modalDescricao.value);
  put(payload, "tecnico", modalTecnico.value);
  put(payload, "status", normStatus(modalStatus.value));
  put(payload, "statusAbertura", modalStatusAbertura.value);

  if (!Object.keys(payload).some((k) => !["dataAbertura", "updatedAt"].includes(k))) {
    return null;
  }
  return payload;
}

formSuporte.addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = buildPayloadFromForm(state.modalModo);
  if (!payload) {
    showNotification("Preencha ao menos um campo para salvar.", "error", 2800);
    return;
  }
  try {
    if (state.modalModo === "adicionar") {
      const ref = await addDoc(collection(db, COLLECTION), {
        ...payload,
        createdAt: serverTimestamp()
      });
      const docData = {
        ...payload,
        id: ref.id,
        createdAt: payload.dataAbertura || new Date().toISOString()
      };
      void syncToSheet(ref.id, docData);
      showNotification("Suporte adicionado com sucesso.", "success", 2200);
    } else {
      const docId = modalIdAtual.value;
      const atual = state.registros.find((r) => r.id === docId) || {};
      await updateDoc(doc(db, COLLECTION, docId), payload);
      void syncToSheet(docId, {
        ...atual,
        ...payload,
        id: docId,
        dataAbertura: atual.dataAbertura || payload.dataAbertura
      });
      showNotification("Suporte atualizado com sucesso.", "success", 2200);
    }
    await atualizarEstatisticasDb();
    atualizarEstatisticas();
    fecharModal();
  } catch (err) {
    showNotification(err.message || "Nao foi possivel salvar.", "error", 3500);
  }
});

tbody.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const id = btn.dataset.id;
  try {
    if (btn.dataset.action === "associar") {
      const tecnico = await associarTecnicoResponsavel(id);
      showNotification(`Técnico associado com sucesso: ${tecnico}`, "success", 2200);
      await carregar();
    }
    if (btn.dataset.action === "excluir") {
      if (!authManager.isAdmin()) {
        throw new Error("Apenas administradores podem excluir suportes.");
      }
      const item = state.registros.find((r) => r.id === id);
      if (!item) throw new Error("Registro nao encontrado.");
      abrirModalExcluir(item);
    }
  } catch (err) {
    showNotification(err.message || "Nao foi possivel concluir a operacao.", "error", 3500);
  }
});

document.getElementById("btnAdicionar").addEventListener("click", abrirModalAdicionar);
document.getElementById("btnRecarregar").addEventListener("click", carregar);
document.getElementById("btnFecharModal").addEventListener("click", fecharModal);
btnCancelarExclusao.addEventListener("click", fecharModalExcluir);
btnConfirmarExclusao.addEventListener("click", confirmarExclusao);
modalExcluir.addEventListener("click", (e) => {
  if (e.target === modalExcluir) fecharModalExcluir();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !modalExcluir.classList.contains("hidden")) {
    fecharModalExcluir();
  }
});
document.getElementById("btnPrevPage").addEventListener("click", async () => {
  if (state.paginaAtual <= 1) return;
  state.paginaAtual -= 1;
  await carregar();
});
document.getElementById("btnNextPage").addEventListener("click", async () => {
  if (!state.hasNextPage) return;
  state.paginaAtual += 1;
  await carregar();
});
const resetPageData = () => {
  state.paginaAtual = 1;
  state.pageCursors = [null];
  state.hasNextPage = false;
};
filtroStatusEl.addEventListener("change", async (e) => {
  state.filtroStatus = e.target.value;
  resetPageData();
  await carregar();
});
filtroAcEl.addEventListener("change", async (e) => {
  state.filtroAc = e.target.value;
  resetPageData();
  await carregar();
});
filtroTecnicoEl.addEventListener("change", async (e) => {
  state.filtroTecnico = e.target.value;
  resetPageData();
  await carregar();
});
filtroDataInicioEl.addEventListener("change", async (e) => {
  state.filtroDataInicio = e.target.value;
  resetPageData();
  await carregar();
});
filtroDataFimEl.addEventListener("change", async (e) => {
  state.filtroDataFim = e.target.value;
  resetPageData();
  await carregar();
});
filtroCpfCnpjEl.addEventListener("input", (e) => { state.filtroCpfCnpj = e.target.value.trim(); resetPageData(); render(); });

let debounceProtocolo;
filtroProtocoloEl.addEventListener("input", (e) => {
  state.filtroProtocolo = e.target.value.trim();
  resetPageData();
  clearTimeout(debounceProtocolo);
  debounceProtocolo = setTimeout(async () => {
    await carregar();
  }, 400);
});

async function protegerPagina() {
  await authManager.initialize();

  if (!authManager.isAuthenticated()) {
    window.location.href = "./login.html";
    return;
  }

  const userDisplayName = authManager.getUserDisplayName();
  const isAdmin = authManager.isAdmin();
  
  const btnAdmin = document.getElementById("btnAdmin");
  const btnDashboard = document.getElementById("btnDashboard");
  
  if (btnAdmin && isAdmin) {
    btnAdmin.style.display = "inline-block";
  }
  if (btnDashboard) {
    btnDashboard.style.display = "inline-block";
  }

  const header = document.querySelector("header");
  if (header) {
    const userInfo = document.createElement("span");
    userInfo.className = "user-info";
    userInfo.innerHTML = `
      <span style="margin-right: 12px;">👤 ${userDisplayName}</span>
      <button id="btnLogout" class="btn btn-ghost btn-small" style="margin: 0;">Logout</button>
    `;
    const actions = header.querySelector(".actions");
    if (actions) {
      actions.appendChild(userInfo);
    }

    document.getElementById("btnLogout").addEventListener("click", async () => {
      await authManager.logout();
      window.location.href = "./login.html";
    });
  }
}

async function preencherResponsavelAbertura() {
  try {
    const uid = authManager.getCurrentUser()?.uid;
    if (!uid) throw new Error("Sem UID");

    // Busca do Firestore (sincronamente via await)
    const userSnap = await getDoc(doc(db, "usuarios", uid));
    const displayName = userSnap.exists() ? (userSnap.data().displayName || "") : "";
    
    // Se tiver displayName, usa
    if (displayName) {
      modalResponsavelAbertura.value = displayName;
      modalResponsavelAbertura.disabled = true;
      return;
    }

    // Fallback para email
    const email = authManager.getCurrentUser()?.email || "";
    const emailUser = email.split("@")[0] || "Responsável";
    modalResponsavelAbertura.value = emailUser;
    modalResponsavelAbertura.disabled = true;
  } catch (err) {
    // Se tudo falhar, usa email mesmo assim
    const email = authManager.getCurrentUser()?.email || "";
    const emailUser = email.split("@")[0] || "Responsável";
    modalResponsavelAbertura.value = emailUser;
    modalResponsavelAbertura.disabled = true;
  }
}

const originalAbrirModalAdicionar = abrirModalAdicionar;
abrirModalAdicionar = async function() {
  originalAbrirModalAdicionar.call(this);
  // Tenta melhorar o preenchimento com dados do Firestore
  await preencherResponsavelAbertura();
};

// Inicializar em sequência correta para evitar race conditions
(async () => {
  try {
    // 1. Aguardar inicialização do Auth
    await authManager.initialize();
    console.log("[App] ✅ Auth inicializado");
    
    // 2. Proteger página (redireciona se não autenticado)
    await protegerPagina();
    console.log("[App] ✅ Página protegida");
    
    // 3. Carregar a primeira página com filtros atuais
    await carregar();
    console.log("[App] ✅ Registros carregados");
  } catch (error) {
    console.error("[App] ❌ Erro na inicialização:", error);
    showNotification(`Erro ao inicializar: ${error.message}`, "error", 5000);
  }
})();
