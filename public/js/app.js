import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
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
  openRegistros: [],
  filtroStatus: "EM ABERTO",
  filtroAc: "todos",
  filtroTecnico: "todos",
  filtroDataInicio: "",
  filtroDataFim: "",
  filtroProtocolo: "",
  filtroStatusAbertura: "todos",
  paginaAtual: 1,
  modalModo: "adicionar",
  pageCursors: [null],
  hasNextPage: false,
  statusCounts: null
};
let unsubscribePageListener = null;
let unsubscribeStatsListener = null;

const tbody = document.getElementById("tbody");
const cardsGrid = document.getElementById("cardsGrid");
const infiniteLoader = document.getElementById("infiniteLoader");
const statCards = document.querySelectorAll(".stat-card");
const filtroAcEl = document.getElementById("filtroAc");
const filtroTecnicoEl = document.getElementById("filtroTecnico");
const filtroDataInicioEl = document.getElementById("filtroDataInicio");
const filtroDataFimEl = document.getElementById("filtroDataFim");
const filtroProtocoloEl = document.getElementById("filtroProtocolo");
const filtroStatusAberturaEl = document.getElementById("filtroStatusAbertura");
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
const modalTecnico = document.getElementById("modalTecnico");
const modalStatus = document.getElementById("modalStatus");
const modalStatusAbertura = document.getElementById("modalStatusAbertura");
const modalDataAbertura = document.getElementById("modalDataAbertura");
const modalIdAtual = document.getElementById("modalIdAtual");
const fieldResponsavelAbertura = document.getElementById("fieldResponsavelAbertura");
const fieldTecnicoResponsavel = document.getElementById("fieldTecnicoResponsavel");
const fieldStatusAtendimento = document.getElementById("fieldStatusAtendimento");
const fieldStatusAbertura = document.getElementById("fieldStatusAbertura");
const fieldDataAbertura = document.getElementById("fieldDataAbertura");
const modalExcluir = document.getElementById("modalExcluir");
const modalExcluirDetalhes = document.getElementById("modalExcluirDetalhes");
const btnCancelarExclusao = document.getElementById("btnCancelarExclusao");
const btnConfirmarExclusao = document.getElementById("btnConfirmarExclusao");
const modalSemRetorno = document.getElementById("modalSemRetorno");
const modalSemRetornoTexto = document.getElementById("modalSemRetornoTexto");
const btnConfirmarSemRetorno = document.getElementById("btnConfirmarSemRetorno");
const btnCancelarSemRetorno = document.getElementById("btnCancelarSemRetorno");
const modalNotas = document.getElementById("modalNotas");
const modalNotasTexto = document.getElementById("modalNotasTexto");
const btnSalvarNotas = document.getElementById("btnSalvarNotas");
const btnFecharNotasModal = document.getElementById("btnFecharNotasModal");

let excluirIdPendente = null;
let excluirTudoPendente = false;
let semRetornoIdPendente = null;
let indevidoIdPendente = null;
let notasIdPendente = null;
const indevidoPendingMap = new Map();
// Notificações sonoras
let notifyEnabled = true;
const NOTIFY_STORAGE_KEY = "suporte_notify_enabled";
try {
  const stored = localStorage.getItem(NOTIFY_STORAGE_KEY);
  if (stored !== null) notifyEnabled = stored === "1" || stored === "true";
} catch (e) {
  /* ignore */
}

// Infinite scroll helpers (cards view)
let _lastDoc = null;
let _loadingMore = false;
let _cardsObserver = null;

async function loadInitialCards() {
  state.paginaAtual = 1;
  state.pageCursors = [null];
  _lastDoc = null;
  state.registros = [];
  showNotification('Carregando registros...', 'info', 1500);
  await loadMoreCards();
  // attach IntersectionObserver sentinel for lazy loading
  const sentinel = document.getElementById('cardsSentinel');
  if (sentinel) {
    if (_cardsObserver) {
      try { _cardsObserver.disconnect(); } catch (e) {}
    }
    _cardsObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && state.hasNextPage && !_loadingMore) {
          loadMoreCards();
        }
      });
    }, { root: null, rootMargin: '300px', threshold: 0 });
    _cardsObserver.observe(sentinel);
  }
}

async function fetchOpenSupports() {
  if (!db) return;
  try {
    const collectionRef = collection(db, COLLECTION);
    const q = query(collectionRef, where("status", "==", "EM ABERTO"), orderBy("dataAbertura", "desc"), limit(500));
    const snap = await getDocs(q);
    const docs = snap.docs || [];
    const mapped = docs.map(mapDocToRegistro).filter((item) => !isRegistroSoluti(item));
    // store as a separate list that bypasses filters
    state.openRegistros = mapped;
  } catch (err) {
    console.warn('[App] fetchOpenSupports failed', err);
    state.openRegistros = [];
  }
}

async function loadMoreCards() {
  if (_loadingMore) return;
  _loadingMore = true;
  if (infiniteLoader) infiniteLoader.classList.remove('hidden');
  try {
    if (!db) return;
    const collectionRef = collection(db, COLLECTION);
    const constraints = buildQueryConstraints();
    if (_lastDoc) constraints.push(startAfter(_lastDoc));
    const q = query(collectionRef, ...constraints, limit(PAGE_SIZE));
    console.debug('[App] loadMoreCards query constraints:', constraints);
    const snap = await getDocs(q);
    const docs = snap.docs || [];
    console.debug('[App] loadMoreCards docs returned:', docs.length, docs.map(d => d.id));
    const mapped = docs.map(mapDocToRegistro).filter((item) => !isRegistroSoluti(item));
    // append
    state.registros = state.registros.concat(mapped);
    if (docs.length > 0) {
      _lastDoc = docs[docs.length - 1];
    }
    state.hasNextPage = docs.length === PAGE_SIZE;
    atualizarFiltroAc();
    render();
    if (!state.registros.length) {
      showNotification('Nenhum registro carregado. Verifique regras do Firestore ou filtros aplicados.', 'warning', 5000);
    } else {
      showNotification(`${state.registros.length} registro(s) carregado(s).`, 'success', 1200);
    }
  } catch (err) {
    console.error('[App] loadMoreCards error', err);
    showNotification(`Erro ao carregar registros: ${err.message || String(err)}`, 'error', 6000);
  } finally {
    _loadingMore = false;
    if (infiniteLoader) infiniteLoader.classList.add('hidden');
  }
}

function showNotification(message, type = "info", timeout = 2500) {
  try {
    // For errors, keep the modal dialog behavior so the user notices important failures.
    if (type === 'error') {
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
      icon.textContent = "!";

      const title = document.createElement("h2");
      title.textContent = "Erro";

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
      return;
    }

    // Non-error notifications: show a small toast instead of a blocking modal.
    const containerId = 'inpageToastContainer';
    let container = document.getElementById(containerId);
    if (!container) {
      container = document.createElement('div');
      container.id = containerId;
      container.style.position = 'fixed';
      container.style.right = '12px';
      container.style.top = '12px';
      container.style.zIndex = 1200;
      container.style.display = 'flex';
      container.style.flexDirection = 'column';
      container.style.gap = '8px';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'inpage-toast inpage-toast-' + (type || 'info');
    toast.textContent = String(message || '');
    toast.style.minWidth = '160px';
    toast.style.background = 'rgba(255,255,255,0.98)';
    toast.style.padding = '8px 12px';
    toast.style.borderRadius = '8px';
    toast.style.boxShadow = '0 6px 18px rgba(0,0,0,0.12)';
    toast.style.color = '#0b2336';
    toast.style.fontSize = '13px';
    toast.style.borderLeft = type === 'success' ? '4px solid #18a058' : type === 'warning' ? '4px solid #e6a600' : '4px solid #1c7ed6';

    container.appendChild(toast);
    if (timeout > 0) {
      setTimeout(() => {
        try { toast.remove(); } catch (e) {}
      }, timeout);
    }
    return;
  } catch (err) {
    try { alert(message); } catch (e) { /* ignore */ }
  }
}

const norm = (v) => String(v || "").trim().replace(/\s+/g, " ");
const normKey = (v) => norm(v).toLowerCase();

function titleCaseName(value) {
  const s = String(value || "").trim().replace(/\s+/g, ' ');
  if (!s) return s;
  return s
    .split(' ')
    .map(part => part.split('-').map(p => p ? (p[0].toUpperCase() + p.slice(1).toLowerCase()) : '').join('-'))
    .join(' ');
}

function normalizeSearchText(value) {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

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
  modalProtocolo.disabled = false;
  modalResponsavelAbertura.disabled = true;
  modalCpfCnpj.disabled = false;
  modalTipo.disabled = false;
  modalAc.disabled = false;
  modalContato.disabled = false;
  modalDataAbertura.disabled = true;

  modalStatus.disabled = false;
  modalTecnico.disabled = false;
  modalStatusAbertura.disabled = true;
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

  try {
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
  } catch (err) {
    console.warn("[App] associarTecnicoResponsavel fallback (api failed):", err.message || err);
    // Fallback: atualizar diretamente no Firestore com o usuário atual
    const tecnicoFallback = authManager.getUserDisplayName() || authManager.getCurrentUserData()?.displayName || (authManager.getCurrentUser()?.email ?? "Desconhecido");
    try {
      const payload = {
        tecnico: titleCaseName(tecnicoFallback),
        tecnicoKey: normKey(titleCaseName(tecnicoFallback)),
        status: "EM ANDAMENTO",
        updatedAt: serverTimestamp()
      };
      if (!item.dataInicioAtendimento) {
        payload.dataInicioAtendimento = new Date().toISOString();
      }
      await updateDoc(doc(db, COLLECTION, itemId), payload);
      void syncToSheet(itemId, { ...item, ...payload, id: itemId });
      await fetchOpenSupports();
      await atualizarEstatisticasDb();
      atualizarEstatisticas();
      render();
      return tecnicoFallback;
    } catch (err2) {
      console.error("[App] Fallback de associar técnico falhou:", err2);
      throw err2;
    }
  }
}

function mapDocToRegistro(docSnap) {
  const data = docSnap.data();
  return {
    id: docSnap.id,
    protocolo: norm(data.protocolo || data.idSuporte || ""),
    responsavelAbertura: norm(data.responsavelAbertura || data.responsavel || data.cliente || ""),
    cpfCnpj: norm(data.cpfCnpj || data.cpf_cnpj || ""),
    contato: norm(data.contato || data.telefone || ""),
    tipo: norm(data.tipo || ""),
    ac: norm(data.ac || data.AC || ""),
    tecnico: norm(data.tecnico || data.tecnicoResponsavel || ""),
    tecnicoKey: normKey(data.tecnico || data.tecnicoResponsavel || ""),
    status: normStatus(data.status || data.situacao || data.situacaoAtendimento || "EM ABERTO"),
    statusAbertura: norm(data.statusAbertura || ""),
    motivo: norm(data.motivo || data.motivoSemRetorno || ""),
    motivoIndevido: norm(data.motivoIndevido || ""),
    dataAbertura: resolverDataAbertura(data),
    dataReagendamento: resolverDateTime(data.dataReagendamento || data.dataReag || data.reagendamento)
  };
}

function resolverDateTime(value) {
  if (!value) return "";
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  return String(value);
}

function buildQueryConstraints() {
  const constraints = [];

  // Always order by dataAbertura desc; protocolo/CPF search is done client-side.
  constraints.push(orderBy("dataAbertura", "desc"));

  if (state.filtroStatus !== "todos") {
    constraints.push(where("status", "==", state.filtroStatus));
  }
  if (state.filtroAc !== "todos") {
    constraints.push(where("ac", "==", state.filtroAc));
  }
  // If a tecnico filter is selected, apply a server-side filter.
  // Use Title Case on `tecnico` to match existing documents (fallback),
  // new writes also set `tecnicoKey` for future case-insensitive queries.
  if (state.filtroTecnico !== "todos") {
    const tecnicoTitle = titleCaseName(state.filtroTecnico);
    constraints.push(where("tecnico", "==", tecnicoTitle));
  }
  if (state.filtroDataInicio) {
    const startIso = new Date(`${state.filtroDataInicio}T00:00:00Z`).toISOString();
    constraints.push(where("dataAbertura", ">=", startIso));
  }
  if (state.filtroDataFim) {
    const endIso = new Date(`${state.filtroDataFim}T23:59:59Z`).toISOString();
    constraints.push(where("dataAbertura", "<=", endIso));
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
      docs.forEach((docSnap) => {
        if (docSnap.data()?.descricao !== undefined) {
          void updateDoc(doc(db, COLLECTION, docSnap.id), { descricao: deleteField() }).catch((err) => {
            console.warn("[App] não foi possível remover descricao do documento", docSnap.id, err);
          });
        }
      });
      atualizarFiltroAc();
      render();
    },
    (error) => {
      console.error("[App] Erro no listener da página:", error);
      showNotification(`Erro ao sincronizar página: ${error.message || String(error)}`, "error", 4000);
    }
  );
}

let _statsListenerInitialized = false;
function startStatsListener() {
  if (!db) return;
  if (unsubscribeStatsListener) {
    unsubscribeStatsListener();
    unsubscribeStatsListener = null;
  }
  _statsListenerInitialized = false;

  const collectionRef = collection(db, COLLECTION);
  unsubscribeStatsListener = onSnapshot(
    collectionRef,
    async () => {
      if (!_statsListenerInitialized) {
        _statsListenerInitialized = true;
        return;
      }
      try {
        const prevTotal = state.statusCounts?.total ?? null;
        await atualizarEstatisticasDb();
        atualizarEstatisticas();
        // refresh open supports cache so EM ABERTO stays current
        try { await fetchOpenSupports(); } catch (e) { /* ignore */ }
        const newTotal = state.statusCounts?.total ?? 0;
        if (prevTotal !== null && newTotal > prevTotal) {
          // tocar som de notificação para novos suportes
          try { playNotificationSound(); } catch (e) { /* ignore */ }
        }
      } catch (err) {
        console.warn('[App] Falha ao atualizar estatísticas no listener:', err);
      }
    },
    (error) => {
      console.error("[App] Erro no listener de estatísticas:", error);
      showNotification(`Erro ao sincronizar estatísticas: ${error.message || String(error)}`, "error", 4000);
    }
  );
}

function playNotificationSound() {
  if (!notifyEnabled) return;
  try {
    // Try to play custom audio file first (place your file at public/sounds/msn-wizz-sound.mp3)
    const customUrl = './sounds/msn-wizz-sound.mp3';
    const audio = new Audio(customUrl);
    audio.volume = 0.9;
    // attempt to play; if it fails, fallback to oscillator
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.then === 'function') {
      playPromise.catch(() => {
        // fallback to oscillator-based sound
        _playOscillatorFallback();
      });
    }
  } catch (err) {
    // não bloquear se falhar
    console.warn('[App] playNotificationSound falhou:', err);
    _playOscillatorFallback();
  }
}

function _playOscillatorFallback() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    // menos agudo (frequencia menor), timbre suave
    o.type = 'triangle';
    o.frequency.value = 320; // Hz (menos agudo)
    const volume = 0.12; // mais alto
    // curto envelope para evitar clique e controlar volume
    const now = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(volume, now + 0.01);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(now);
    const durationMs = 700; // som mais longo
    // reduzir suavemente
    g.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);
    setTimeout(() => {
      try { o.stop(); } catch (e) {}
      try { ctx.close(); } catch (e) {}
    }, durationMs + 50);
  } catch (err) {
    console.warn('[App] _playOscillatorFallback falhou:', err);
  }
}

function setNotifyEnabled(enabled) {
  notifyEnabled = Boolean(enabled);
  try { localStorage.setItem(NOTIFY_STORAGE_KEY, notifyEnabled ? "1" : "0"); } catch (e) {}
  const btn = document.getElementById("btnToggleNotify");
  if (btn) {
    btn.classList.toggle("btn-tonal", notifyEnabled);
    btn.classList.toggle("btn-ghost", !notifyEnabled);
    btn.textContent = notifyEnabled ? "🔔" : "🔕";
    btn.title = notifyEnabled ? "Notificação: Ligada (clique para desligar)" : "Notificação: Desligada (clique para ligar)";
  }
}

function ensureNotifyToggleInHeader() {
  const header = document.querySelector("header");
  if (!header) return;
  const actions = header.querySelector(".actions");
  if (!actions) return;
  if (document.getElementById("btnToggleNotify")) return;
  const btn = document.createElement("button");
  btn.id = "btnToggleNotify";
  btn.type = "button";
  btn.className = notifyEnabled ? "btn btn-tonal" : "btn btn-ghost";
  btn.style.marginLeft = "8px";
  btn.textContent = notifyEnabled ? "🔔" : "🔕";
  btn.title = notifyEnabled ? "Notificação: Ligada (clique para desligar)" : "Notificação: Desligada (clique para ligar)";
  btn.addEventListener("click", () => setNotifyEnabled(!notifyEnabled));
  actions.appendChild(btn);
}

async function carregar() {
  try {
    if (!db) {
      console.error("[App] Erro crítico: Firestore não inicializado");
      showNotification("Erro: Firestore não está configurado. Verifique firebase.js", "error", 5000);
      return;
    }

    // start stats listener
    startStatsListener();

    // Fetch open supports (EM ABERTO) which should always be shown regardless of filters
    await fetchOpenSupports();

    // If we don't have per-status counts yet, run full counts once (cheap one-time cost)
    if (!state.statusCounts || typeof state.statusCounts.abertos === 'undefined') {
      try {
        await _doAtualizarEstatisticasDbFull();
      } catch (err) {
        // fallback to lightweight counts
        await atualizarEstatisticasDb();
      }
    } else {
      // ensure at least the lightweight total is up to date
      await atualizarEstatisticasDb();
    }
    atualizarEstatisticas();

    // load initial page of cards for infinite scroll
    await loadInitialCards();
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
  // If the active status filter is EM ABERTO, return only the open supports
  // and ignore other filters (tecnico, AC, dates, etc.). This keeps
  // EM ABERTO supports only in their own card and unaffected by other filters.
  const open = (state.openRegistros || []).filter((item) => !isRegistroSoluti(item));
  if (state.filtroStatus === 'EM ABERTO') {
    return open.sort((a, b) => toComparableDate(b.dataAbertura) - toComparableDate(a.dataAbertura));
  }

  // For other status filters (or 'todos'), exclude EM ABERTO items and apply filters normally
  let dados = (state.registros || []).filter((item) => !isRegistroSoluti(item) && item.status !== 'EM ABERTO');
  if (state.filtroStatus !== "todos") dados = dados.filter((item) => item.status === state.filtroStatus);
  if (state.filtroAc !== "todos") dados = dados.filter((item) => item.ac === state.filtroAc);
  if (state.filtroTecnico !== "todos") {
    const filtroKey = normKey(state.filtroTecnico);
    dados = dados.filter((item) => normKey(item.tecnico) === filtroKey);
  }
  if (state.filtroDataInicio) {
    const inicio = new Date(`${state.filtroDataInicio}T00:00:00`).getTime();
    dados = dados.filter((item) => toComparableDate(item.dataAbertura) >= inicio);
  }
  if (state.filtroDataFim) {
    const fim = new Date(`${state.filtroDataFim}T23:59:59.999`).getTime();
    dados = dados.filter((item) => toComparableDate(item.dataAbertura) <= fim);
  }
  // Filtrar por protocolo, CPF/CNPJ ou contato no cliente
  if (state.filtroProtocolo) {
    const q = normalizeSearchText(state.filtroProtocolo);
    dados = dados.filter((item) => {
      const p = normalizeSearchText(item.protocolo);
      const c = normalizeSearchText(item.cpfCnpj);
      const contato = normalizeSearchText(item.contato);
      return p.includes(q) || c.includes(q) || contato.includes(q);
    });
  }
  // Filtrar por status da abertura (DEVIDO / INDEVIDO)
  if (state.filtroStatusAbertura && state.filtroStatusAbertura !== "todos") {
    const q = state.filtroStatusAbertura.toUpperCase();
    dados = dados.filter((item) => ((item.statusAbertura || "").toUpperCase() === q));
  }
  dados.sort((a, b) => toComparableDate(b.dataAbertura) - toComparableDate(a.dataAbertura));
  return dados;
}

function atualizarEstatisticas() {
  // Show counts strictly from DB-derived `state.statusCounts` except open supports,
  // which should reflect the visible open list without hidden/soluti items.
  const total = Number(state.statusCounts?.total ?? 0);
  const abertos = (state.openRegistros || []).filter((item) => !isRegistroSoluti(item)).length;
  const andamento = Number(state.statusCounts?.andamento ?? 0);
  const finalizados = Number(state.statusCounts?.finalizados ?? 0);
  const semRetorno = Number(state.statusCounts?.semRetorno ?? 0);
  const reagendado = Number(state.statusCounts?.reagendado ?? 0);
  document.getElementById("statTotal").textContent = String(total);
  document.getElementById("statAbertos").textContent = String(abertos);
  document.getElementById("statAndamento").textContent = String(andamento);
  document.getElementById("statFinalizados").textContent = String(finalizados);
  const elSem = document.getElementById("statSemRetorno");
  if (elSem) elSem.textContent = String(semRetorno);
  const elReagendado = document.getElementById("statReagendado");
  if (elReagendado) elReagendado.textContent = String(reagendado);
}

// Coalescing / debounce helpers to avoid multiple concurrent reads
let _estatisticasInFlight = false;
let _estatisticasPending = false;
let _estatisticasTimer = null;
const ESTATISTICAS_DEBOUNCE_MS = 700;

async function _doAtualizarEstatisticasDb() {
  if (!db) return;
  try {
    const collectionRef = collection(db, COLLECTION);
    const totalSnap = await getCountFromServer(query(collectionRef));
    // Preserve any existing per-status counts and only update `total`.
    if (!state.statusCounts) state.statusCounts = {};
    state.statusCounts.total = Number(totalSnap.data().count || 0);
  } catch (error) {
    console.warn("[App] Falha ao buscar totais do Firestore:", error);
    // Do not clear existing statusCounts on transient failures; keep previous values if any.
  }
}

// Full counts (runs the 6 status-specific counts). Use sparingly.
async function _doAtualizarEstatisticasDbFull() {
  if (!db) return;
  try {
    const collectionRef = collection(db, COLLECTION);
    const totalSnap = await getCountFromServer(query(collectionRef));
    const abertosSnap = await getCountFromServer(query(collectionRef, where("status", "==", "EM ABERTO")));
    const andamentoSnap = await getCountFromServer(query(collectionRef, where("status", "==", "EM ANDAMENTO")));
    const finalizadosSnap = await getCountFromServer(query(collectionRef, where("status", "==", "FINALIZADO")));
    const semRetornoSnap = await getCountFromServer(query(collectionRef, where("status", "==", "SEM RETORNO")));
    const reagendadoSnap = await getCountFromServer(query(collectionRef, where("status", "==", "REAGENDADO")));

    state.statusCounts = {
      total: Number(totalSnap.data().count || 0),
      abertos: Number(abertosSnap.data().count || 0),
      andamento: Number(andamentoSnap.data().count || 0),
      finalizados: Number(finalizadosSnap.data().count || 0),
      semRetorno: Number(semRetornoSnap.data().count || 0),
      reagendado: Number(reagendadoSnap.data().count || 0)
    };
  } catch (error) {
    console.warn("[App] Falha ao buscar totais completos do Firestore:", error);
    state.statusCounts = null;
  }
}

// Public wrapper: coalesce rapid calls and avoid concurrent parallel executions
function atualizarEstatisticasDb() {
  if (!db) return Promise.resolve();
  // If a run is in-flight, mark a pending request and schedule a retry
  if (_estatisticasInFlight) {
    _estatisticasPending = true;
    clearTimeout(_estatisticasTimer);
    _estatisticasTimer = setTimeout(() => {
      if (!_estatisticasInFlight) atualizarEstatisticasDb();
    }, ESTATISTICAS_DEBOUNCE_MS);
    return Promise.resolve();
  }

  _estatisticasInFlight = true;
  return (async () => {
    try {
      await _doAtualizarEstatisticasDb();
+      await fetchOpenSupports();
    } finally {
      _estatisticasInFlight = false;
      if (_estatisticasPending) {
        _estatisticasPending = false;
        clearTimeout(_estatisticasTimer);
        _estatisticasTimer = setTimeout(() => atualizarEstatisticasDb(), ESTATISTICAS_DEBOUNCE_MS);
      }
    }
  })();
}

function atualizarRodapePaginacao(totalItens = 0) {
  const pageText = `Página ${state.paginaAtual}${state.hasNextPage ? "" : " (última)"}`;
  paginationInfo.textContent = `Mostrando ${totalItens} registro(s) · ${pageText}`;
  document.getElementById("btnPrevPage").disabled = state.paginaAtual <= 1;
  document.getElementById("btnNextPage").disabled = !state.hasNextPage;
}

function render() {
  const dados = getRegistrosFiltrados();
  const isAdminLocal = authManager.isAdmin();
  // If cardsGrid exists, render cards (compact view)
  if (cardsGrid) {
    cardsGrid.innerHTML = "";
    if (!dados.length) {
      cardsGrid.innerHTML = '<div class="empty">Nenhum suporte encontrado para os filtros selecionados.</div>';
      atualizarEstatisticas();
      document.querySelector('.table-footer')?.classList.add('hidden');
      return;
    }
    dados.forEach((item) => {
      const card = document.createElement('div');
      card.className = 'card';
      card.dataset.id = item.id;
      card.innerHTML = `
        <div class="card-top">
          <div>
            <div class="card-time">${formatDate(item.dataAbertura)}</div>
            <div class="card-type">${escapeHtml(item.tipo || '-')}</div>
          </div>
          <div class="card-tech">${escapeHtml(item.tecnico || '-')}</div>
        </div>
        <div class="card-status"><span class="status-pill ${statusClass(item.status)}">${item.status}</span></div>
      `;
      cardsGrid.appendChild(card);
    });
    atualizarEstatisticas();
    // hide old pagination/footer when using infinite scroll
    document.querySelector('.table-footer')?.classList.add('hidden');
    return;
  }
  tbody.innerHTML = "";
  if (!dados.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = '<td colspan="11" class="empty">Nenhum suporte encontrado para os filtros selecionados.</td>';
    tbody.appendChild(tr);
    atualizarEstatisticas();
    atualizarRodapePaginacao(0);
    return;
  }
  dados.forEach((item) => {
    const tr = document.createElement("tr");
    tr.dataset.id = item.id;
    const btnExcluir = authManager.isAdmin()
      ? `<button class="btn btn-icon" data-action="excluir" data-id="${item.id}" title="Excluir" aria-label="Excluir suporte">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 6h18"/>
            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6"/>
            <path d="M14 11v6"/>
          </svg>
        </button>`
      : "";
    const btnEditar = isAdminLocal
      ? `<button class="btn btn-icon" data-action="editar-linha" data-id="${item.id}" title="Editar suporte" aria-label="Editar suporte">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 20h9"/>
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
          </svg>
        </button>`
      : "";

    const btnSemRetorno = item.status === "EM ANDAMENTO"
      ? `<button class="btn btn-icon" data-action="sem-retorno" data-id="${item.id}" title="Marcar como sem retorno" aria-label="Marcar como sem retorno">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 6L6 18"/>
            <path d="M6 6l12 12"/>
          </svg>
        </button>`
      : "";

    const btnVoltarEmAberto = item.status === "EM ANDAMENTO"
      ? `<button class="btn btn-icon" data-action="voltar-em-aberto" data-id="${item.id}" title="Voltar para em aberto" aria-label="Voltar para em aberto">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 14L4 9l5-5"/>
            <path d="M4 9h10a5 5 0 0 1 0 10h-2"/>
          </svg>
        </button>`
      : "";

    const btnInfo = (item.statusAbertura !== "INDEVIDO" || authManager.isAdmin())
      ? `<button class="btn btn-icon" data-action="info" data-id="${item.id}" title="Info" aria-label="Info">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
          </button>`
      : "";

    const btnConcluir = (item.status !== "FINALIZADO" && item.status !== "SEM RETORNO")
      ? `<button class="btn btn-icon" data-action="concluir" data-id="${item.id}" title="Concluir suporte" aria-label="Marcar como finalizado">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 6L9 17l-5-5"/>
          </svg>
        </button>`
      : "";

    const btnReagendar = (item.status !== "FINALIZADO" && item.status !== "SEM RETORNO")
      ? `<button class="btn btn-icon" data-action="reagendar" data-id="${item.id}" title="${item.status === "REAGENDADO" ? "Mostrar data/hora do reagendamento" : "Reagendar suporte"}" aria-label="${item.status === "REAGENDADO" ? "Mostrar data e hora do reagendamento" : "Reagendar suporte"}">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
        </button>`
      : "";
    const btnAssociar = `<button class="btn btn-icon" data-action="associar" data-id="${item.id}" title="Associar técnico" aria-label="Associar técnico responsável">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <polyline points="16 11 18 13 22 9"/>
            </svg>
          </button>`;
    // Render apenas 3 colunas: Tipo, Situação e Técnico
    tr.innerHTML = `
      <td class="cell-datahora">
        <div class="cell-inline">
          <span>${formatDate(item.dataAbertura)}</span>
        </div>
      </td>
      <td class="cell-tipo">${escapeHtml(item.tipo || "-")}</td>
      <td class="cell-status"><span class="status-pill ${statusClass(item.status)}">${item.status}</span></td>
      ${isAdminLocal ? `<td><button class="change-tecnico-btn" data-action="change-tecnico" data-id="${item.id}" type="button">${escapeHtml(item.tecnico) || "-"}</button></td>` : `<td>${escapeHtml(item.tecnico) || "-"}</td>`}
      
    `;
    tbody.appendChild(tr);
  });

  const headerRow = document.querySelector("table thead tr");
  const hasHeaderMotivo = Boolean(document.getElementById("thMotivo"));
  if (state.filtroStatus === "SEM RETORNO") {
    if (!hasHeaderMotivo && headerRow) {
      const th = document.createElement("th");
      th.id = "thMotivo";
      th.textContent = "Motivo";
      const refNode = headerRow.querySelector("th:nth-child(7)");
      if (refNode && refNode.nextSibling) {
        headerRow.insertBefore(th, refNode.nextSibling);
      } else if (headerRow) {
        headerRow.appendChild(th);
      }
    }
  } else {
    if (hasHeaderMotivo) {
      document.getElementById("thMotivo").remove();
    }
    document.querySelectorAll("td.col-motivo").forEach((cell) => cell.remove());
  }

  atualizarEstatisticas();
  atualizarRodapePaginacao(dados.length);
}

function abrirModalAdicionar() {
  state.modalModo = "adicionar";
  configurarCamposModoEdicao(false);
  modalTitulo.textContent = "Novo Suporte";
  modalProtocolo.value = "";
  modalCpfCnpj.value = "";
  modalTipo.value = "Suporte tecnico";
  modalAc.value = "CONSULTI";
  modalContato.value = "";
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

  if (fieldResponsavelAbertura) fieldResponsavelAbertura.classList.remove("hidden");
  if (fieldTecnicoResponsavel) fieldTecnicoResponsavel.classList.remove("hidden");
  if (fieldStatusAtendimento) fieldStatusAtendimento.classList.remove("hidden");
  if (fieldStatusAbertura) fieldStatusAbertura.classList.remove("hidden");
  if (fieldDataAbertura) fieldDataAbertura.classList.remove("hidden");
  
  modal.classList.remove("hidden");
}

function abrirModalEditar(item) {
  state.modalModo = "editar";
  configurarCamposModoEdicao(true);
  modalTitulo.textContent = "Editar Suporte";
  modalProtocolo.value = item.protocolo;
  modalResponsavelAbertura.value = item.responsavelAbertura;
  modalCpfCnpj.value = item.cpfCnpj;
  modalTipo.value = item.tipo || "Suporte tecnico";
  modalAc.value = item.ac || "CONSULTI";
  modalContato.value = item.contato;
  modalTecnico.value = item.tecnico || "MATHEUS";
  modalStatus.value = item.status;
  modalStatusAbertura.value = item.statusAbertura || "DEVIDO";
  modalDataAbertura.value = toDatetimeLocal(item.dataAbertura);
  modalIdAtual.value = item.id;

  if (fieldResponsavelAbertura) fieldResponsavelAbertura.classList.add("hidden");
  if (fieldTecnicoResponsavel) fieldTecnicoResponsavel.classList.add("hidden");
  if (fieldStatusAtendimento) fieldStatusAtendimento.classList.add("hidden");
  if (fieldStatusAbertura) fieldStatusAbertura.classList.add("hidden");
  if (fieldDataAbertura) fieldDataAbertura.classList.add("hidden");

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

function abrirModalNotas(item) {
  notasIdPendente = item.id;
  modalNotasTexto.value = item.anotacoes || "";
  modalNotas.classList.remove("hidden");
  setTimeout(() => modalNotasTexto.focus(), 50);
}

function fecharModalNotas() {
  notasIdPendente = null;
  modalNotas.classList.add("hidden");
}

function formatProtocolo(value) {
  const v = String(value || "").trim();
  if (!v) return v;
  if (/^\d{3}-\d{3}-\d{3}$/.test(v)) return v;
  const digits = v.replace(/\D/g, "");
  if (digits.length === 9) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})/, "$1-$2-$3");
  }
  return v;
}

function formatCpfCnpj(value) {
  const v = String(value || "").trim();
  if (!v) return v;
  if (/^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(v) || /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(v)) return v;
  const digits = v.replace(/\D/g, "");
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  if (digits.length === 14) {
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  }
  return v;
}

function formatContato(value) {
  const v = String(value || "").trim();
  if (!v) return v;
  const digits = v.replace(/\D/g, "");
  if (digits.length >= 10) {
    const ddd = digits.slice(0, 2);
    const rest = digits.slice(2);
    const last = rest.slice(-4);
    const prefix = rest.slice(0, rest.length - 4);
    return `(${ddd}) ${prefix}-${last}`;
  }
  return v;
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
    if (payload.tecnico) {
      payload.tecnico = titleCaseName(payload.tecnico);
      payload.tecnicoKey = normKey(payload.tecnico);
    }
    put(payload, "status", normStatus(modalStatus.value));
    put(payload, "statusAbertura", modalStatusAbertura.value);
    put(payload, "tipo", modalTipo.value);
    put(payload, "ac", modalAc.value);
    if (modalProtocolo.value) put(payload, "protocolo", formatProtocolo(modalProtocolo.value));
    if (modalCpfCnpj.value) put(payload, "cpfCnpj", formatCpfCnpj(modalCpfCnpj.value));
    if (modalContato.value) put(payload, "contato", formatContato(modalContato.value));
    return payload;
  }

  const payload = {
    dataAbertura: new Date().toISOString(),
    updatedAt: serverTimestamp()
  };
  put(payload, "protocolo", formatProtocolo(modalProtocolo.value));
  put(payload, "responsavelAbertura", modalResponsavelAbertura.value);
  put(payload, "cpfCnpj", formatCpfCnpj(modalCpfCnpj.value));
  put(payload, "tipo", modalTipo.value);
  put(payload, "ac", modalAc.value);
  put(payload, "contato", formatContato(modalContato.value));
  put(payload, "tecnico", modalTecnico.value);
  if (payload.tecnico) {
    payload.tecnico = titleCaseName(payload.tecnico);
    payload.tecnicoKey = normKey(payload.tecnico);
  }
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
      if (payload.status === "EM ANDAMENTO") {
        payload.dataInicioAtendimento = new Date().toISOString();
      }
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
      if (payload.status === "EM ANDAMENTO" && atual.status !== "EM ANDAMENTO" && !atual.dataInicioAtendimento) {
        payload.dataInicioAtendimento = new Date().toISOString();
      }
      await updateDoc(doc(db, COLLECTION, docId), payload);
      void syncToSheet(docId, {
        ...atual,
        ...payload,
        id: docId,
        dataAbertura: atual.dataAbertura || payload.dataAbertura
      });
      const itemIndex = state.registros.findIndex((r) => r.id === docId);
      if (itemIndex !== -1) {
        state.registros[itemIndex] = {
          ...atual,
          ...payload,
          id: docId,
          dataAbertura: atual.dataAbertura || payload.dataAbertura
        };
      }
      showNotification("Suporte atualizado com sucesso.", "success", 2200);
    }
    await atualizarEstatisticasDb();
    atualizarEstatisticas();
    fecharModal();
  } catch (err) {
    showNotification(err.message || "Nao foi possivel salvar.", "error", 3500);
  }
});

// Extrai o processamento de ações para reutilizar tanto no tbody quanto no drawer
async function handleActionButton(btn) {
  if (!btn) return;
  const id = btn.dataset.id;
  try {
    if (btn.dataset.action === "copiar") {
      const raw = btn.dataset.value ? decodeURIComponent(btn.dataset.value) : (btn.dataset.text || "");
      try {
        await navigator.clipboard.writeText(raw);
        showNotification("Copiado para a área de transferência.", "success", 1800);
      } catch (e) {
        // fallback: select temporary textarea
        const ta = document.createElement('textarea');
        ta.value = raw;
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); showNotification("Copiado para a área de transferência.", "success", 1800); } catch (err) { showNotification("Falha ao copiar.", "error", 2200); }
        ta.remove();
      }
      return;
    }
    if (btn.dataset.action === "editar-linha") {
      if (!authManager.isAdmin()) {
        showNotification("Apenas administradores podem editar suportes.", "error", 3000);
        return;
      }
      const item = state.registros.find((r) => r.id === id);
      if (!item) throw new Error("Registro não encontrado.");
      abrirModalEditar(item);
      return;
    }
    if (btn.dataset.action === "anotacoes") {
      const item = state.registros.find((r) => r.id === id);
      if (!item) throw new Error("Registro não encontrado.");
      abrirModalNotas(item);
      return;
    }
    if (btn.dataset.action === "change-tecnico") {
      openChangeTecnicoModal(id);
      return;
    }
    if (btn.dataset.action === "associar") {
      const tecnico = await associarTecnicoResponsavel(id);
      showNotification(`Técnico associado com sucesso: ${tecnico}`, "success", 2200);
      await carregar();
    }
    if (btn.dataset.action === "info") {
      const item = state.registros.find((r) => r.id === id);
      if (!item) throw new Error("Registro não encontrado.");
      if (item.statusAbertura === "INDEVIDO" && item.motivoIndevido) {
        const viewModal = document.getElementById("modalIndevidoView");
        const viewTextarea = document.getElementById("modalIndevidoViewTexto");
        const btnMudarDevido = document.getElementById("btnMudarParaDevido");
        if (viewTextarea) viewTextarea.value = item.motivoIndevido;
        if (btnMudarDevido) btnMudarDevido.dataset.id = id;
        if (viewModal) viewModal.classList.remove("hidden");
        return;
      }
      indevidoIdPendente = id;
      const indevidoModal = document.getElementById("modalIndevido");
      const textarea = document.getElementById("modalIndevidoTexto");
      if (textarea) textarea.value = indevidoPendingMap.get(id) || "";
      if (indevidoModal) indevidoModal.classList.remove("hidden");
      return;
    }
    if (btn.dataset.action === "sem-retorno") {
      semRetornoIdPendente = id;
      if (modalSemRetorno) {
        modalSemRetornoTexto.value = "";
        modalSemRetorno.classList.remove("hidden");
        setTimeout(() => modalSemRetornoTexto.focus(), 50);
      } else {
        const item = state.registros.find((r) => r.id === id);
        if (!item) throw new Error("Registro não encontrado.");
        await updateDoc(doc(db, COLLECTION, id), {
          status: "SEM RETORNO",
          updatedAt: serverTimestamp()
        });
        void syncToSheet(id, { ...item, status: "SEM RETORNO", id });
        await fetchOpenSupports();
        await atualizarEstatisticasDb();
        atualizarEstatisticas();
        render();
        showNotification("Suporte marcado como sem retorno.", "success", 2200);
      }
    }
    if (btn.dataset.action === "reagendar") {
      const item = state.registros.find((r) => r.id === id);
      if (!item) throw new Error("Registro não encontrado.");
      if (item.status === "REAGENDADO" && item.dataReagendamento) {
        showNotification(`Reagendado para ${formatDate(item.dataReagendamento)}`, "info", 5000);
        return;
      }
      reagendarIdPendente = id;
      if (modalReagendar) {
        const now = new Date();
        const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        const dataStr = tomorrow.toISOString().split('T')[0];
        const horaStr = "08:00";
        modalReagendarData.value = dataStr;
        modalReagendarHora.value = horaStr;
        modalReagendar.classList.remove("hidden");
        setTimeout(() => modalReagendarData.focus(), 50);
      } else {
        throw new Error("Modal de reagendamento não encontrado.");
      }
    }
    if (btn.dataset.action === "concluir") {
      const item = state.registros.find((r) => r.id === id);
      if (!item) throw new Error("Registro não encontrado.");
      const payload = { status: "FINALIZADO", updatedAt: serverTimestamp() };
      if (indevidoPendingMap.has(id)) {
        payload.statusAbertura = "INDEVIDO";
        payload.motivoIndevido = indevidoPendingMap.get(id);
      }
      await updateDoc(doc(db, COLLECTION, id), payload);
      void syncToSheet(id, { ...item, ...payload, id });
      if (indevidoPendingMap.has(id)) indevidoPendingMap.delete(id);
      await fetchOpenSupports();
      await atualizarEstatisticasDb();
      atualizarEstatisticas();
      render();
      showNotification("Suporte marcado como finalizado.", "success", 2200);
    }
    if (btn.dataset.action === "voltar-em-aberto") {
      const item = state.registros.find((r) => r.id === id);
      if (!item) throw new Error("Registro não encontrado.");
      const payload = { status: "EM ABERTO", tecnico: "", updatedAt: serverTimestamp() };
      await updateDoc(doc(db, COLLECTION, id), payload);
      void syncToSheet(id, { ...item, ...payload, id });
      await fetchOpenSupports();
      await atualizarEstatisticasDb();
      atualizarEstatisticas();
      render();
      showNotification("Suporte retornado para em aberto.", "success", 2200);
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
}

// Listener para cliques na tabela: se clicar em botão -> handleActionButton, se clicar na linha -> abrir drawer
if (tbody) {
  tbody.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (btn) {
      await handleActionButton(btn);
      return;
    }
    const tr = e.target.closest("tr");
    if (!tr) return;
    const id = tr.dataset.id;
    if (!id) return;
    const item = state.registros.find((r) => r.id === id);
    if (!item) return;
    openSupportDrawer(item);
  });
}

// Listener para cliques nos cards: abrir drawer ao clicar no card
if (cardsGrid) {
  cardsGrid.addEventListener('click', (e) => {
    const card = e.target.closest('.card');
    if (!card) return;
    const id = card.dataset.id;
    if (!id) return;
    const item = state.registros.find((r) => r.id === id);
    if (!item) return;
    openSupportDrawer(item);
  });
}

// Drawer (aba lateral) — abrir/fechar e popular conteúdo
const supportDrawer = document.getElementById("supportDrawer");
const supportDrawerBackdrop = document.getElementById("supportDrawerBackdrop");
const drawerContent = document.getElementById("drawerContent");
const drawerActions = document.getElementById("drawerActions");
const drawerCloseBtn = document.getElementById("drawerCloseBtn");

// Helper: retorna HTML de botão de ação com ícone (reutiliza ícones usados na tabela)
function renderActionIcon(action, id) {
  const clsMap = {
    'editar-linha': 'btn-icon-pink',
    'anotacoes': '',
    'associar': 'btn-icon-primary',
    'concluir': 'btn-icon-success',
    'reagendar': 'btn-icon-clock',
    'sem-retorno': 'btn-icon-secondary',
    'voltar-em-aberto': 'btn-icon-return',
    'excluir': 'btn-icon-danger',
    'info': 'btn-icon-info'
  };
  const titleMap = {
    'editar-linha': 'Editar',
    'anotacoes': 'Anotações',
    'associar': 'Associar técnico',
    'concluir': 'Concluir suporte',
    'reagendar': 'Reagendar suporte',
    'sem-retorno': 'Marcar como sem retorno',
    'voltar-em-aberto': 'Voltar para em aberto',
    'excluir': 'Excluir suporte',
    'info': 'Mudança para indevido',
    'copiar': 'Copiar'
  };
  const cls = clsMap[action] ? ` ${clsMap[action]}` : '';
  const title = titleMap[action] || action;
  const common = `class="btn btn-icon${cls}" data-action="${action}" data-id="${id}" title="${title}" aria-label="${title}"`;
  switch (action) {
    case 'editar-linha':
      return `<button ${common}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></button>`;
    case 'anotacoes':
      return `<button ${common}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h11a2 2 0 0 1 2 2v14"/><path d="M6 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12"/><path d="M9 7h6"/><path d="M9 11h6"/><path d="M9 15h4"/></svg></button>`;
    case 'associar':
      return `<button ${common}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/></svg></button>`;
    case 'concluir':
      return `<button ${common}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></button>`;
    case 'reagendar':
      return `<button ${common}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></button>`;
    case 'sem-retorno':
      return `<button ${common}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg></button>`;
    case 'voltar-em-aberto':
      return `<button ${common}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a5 5 0 0 1 0 10h-2"/></svg></button>`;
    case 'excluir':
      return `<button ${common}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg></button>`;
    case 'info':
      return `<button ${common}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg></button>`;
    default:
      return `<button ${common}>${action}</button>`;
  }
}

function closeSupportDrawer() {
  if (supportDrawer) {
    // start closing animation
    supportDrawer.classList.remove("visible");
    supportDrawer.classList.add("closing");
    const onEnd = (e) => {
      if (e.target !== supportDrawer) return;
      supportDrawer.classList.add("hidden");
      supportDrawer.classList.remove("closing");
      supportDrawer.removeEventListener("transitionend", onEnd);
    };
    supportDrawer.addEventListener("transitionend", onEnd);
  }
  if (supportDrawerBackdrop) {
    supportDrawerBackdrop.classList.remove("visible");
    const onEndBg = (e) => {
      if (e.target !== supportDrawerBackdrop) return;
      supportDrawerBackdrop.classList.add("hidden");
      supportDrawerBackdrop.removeEventListener("transitionend", onEndBg);
    };
    supportDrawerBackdrop.addEventListener("transitionend", onEndBg);
  }
}

function openSupportDrawer(item) {
  if (!item) return;
  if (!drawerContent || !drawerActions) return;
  const isAdminLocal = authManager.isAdmin();
  // Popular conteúdo com os campos solicitados
  drawerContent.innerHTML = `
    <div class="drawer-section">
      <h4 class="drawer-section-title">Identificação</h4>
      <div class="drawer-field"><label>Protocolo</label><div class="val">${escapeHtml(item.protocolo || "-")}${item.protocolo ? ` <button class="btn btn-ghost btn-small" data-action="copiar" data-value="${encodeURIComponent(item.protocolo)}" title="Copiar">` +
        `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>` : ''}</div></div>
      <div class="drawer-field"><label>Data/Hora</label><div class="val">${formatDate(item.dataAbertura)}</div></div>
    </div>

    <div class="drawer-section">
      <h4 class="drawer-section-title">Contato</h4>
      <div class="drawer-field"><label>Responsável pela abertura</label><div class="val">${escapeHtml(item.responsavelAbertura || "-")}</div></div>
      <div class="drawer-field"><label>CPF/CNPJ</label><div class="val">${escapeHtml(item.cpfCnpj || "-")}${item.cpfCnpj ? ` <button class="btn btn-ghost btn-small" data-action="copiar" data-value="${encodeURIComponent(item.cpfCnpj)}" title="Copiar">` +
        `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>` : ''}</div></div>
      <div class="drawer-field"><label>Contato</label><div class="val">${escapeHtml(item.contato || "-")}${item.contato ? ` <button class="btn btn-ghost btn-small" data-action="copiar" data-value="${encodeURIComponent(item.contato)}" title="Copiar">` +
        `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>` : ''}</div></div>
    </div>

    <div class="drawer-section">
      <h4 class="drawer-section-title">Atendimento</h4>
      <div class="drawer-field"><label>Tipo</label><div class="val">${escapeHtml(item.tipo || "-")}</div></div>
      <div class="drawer-field"><label>AC</label><div class="val">${escapeHtml(item.ac || "-")}</div></div>
      <div class="drawer-field"><label>Sit. Atendimento</label><div class="val"><span class="status-pill ${statusClass(item.status)}">${item.status}</span></div></div>
      <div class="drawer-field"><label>Status da abertura</label><div class="val">${escapeHtml(item.statusAbertura || "-")}${(item.statusAbertura !== "INDEVIDO" || isAdminLocal) ? ' ' + renderActionIcon('info', item.id) : ''}</div></div>
    </div>

    <div class="drawer-section">
      <h4 class="drawer-section-title">Técnico</h4>
      <div class="drawer-field"><label>Técnico</label><div class="val">${escapeHtml(item.tecnico || "-")}</div></div>
    </div>

    <div class="drawer-section">
      <h4 class="drawer-section-title">Comentários / Anotações</h4>
      <div class="drawer-field"><div class="val">${escapeHtml(item.anotacoes || item.anotacao || "-")}</div></div>
    </div>
  `;

  // Ações — inserir botões com data-action para reaproveitar handleActionButton
  const actions = [];
  if (isAdminLocal) actions.push(renderActionIcon('editar-linha', item.id));
  actions.push(renderActionIcon('anotacoes', item.id));
  actions.push(renderActionIcon('associar', item.id));
  if (item.status !== "FINALIZADO" && item.status !== "SEM RETORNO") actions.push(renderActionIcon('concluir', item.id));
  if (item.status !== "FINALIZADO" && item.status !== "SEM RETORNO") actions.push(renderActionIcon('reagendar', item.id));
  if (item.status === "EM ANDAMENTO") actions.push(renderActionIcon('sem-retorno', item.id));
  if (item.status !== "EM ABERTO" && item.status !== "FINALIZADO" && item.status !== "SEM RETORNO") {
    actions.push(renderActionIcon('voltar-em-aberto', item.id));
  }
  if (isAdminLocal) actions.push(renderActionIcon('excluir', item.id));

  drawerActions.innerHTML = `<div class="drawer-actions-row">${actions.join('')}</div>`;
  if (supportDrawer) {
    supportDrawer.classList.remove("hidden");
    // force reflow then add visible to trigger transition
    // eslint-disable-next-line no-unused-expressions
    supportDrawer.offsetWidth;
    supportDrawer.classList.add("visible");
  }
  if (supportDrawerBackdrop) {
    supportDrawerBackdrop.classList.remove("hidden");
    // force reflow
    supportDrawerBackdrop.offsetWidth;
    supportDrawerBackdrop.classList.add("visible");
  }
}

if (drawerCloseBtn) drawerCloseBtn.addEventListener("click", closeSupportDrawer);
if (supportDrawerBackdrop) supportDrawerBackdrop.addEventListener("click", closeSupportDrawer);

// Delegação de cliques dentro do drawer para reaproveitar handleActionButton
if (supportDrawer) {
  supportDrawer.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    await handleActionButton(btn);
    // Após ação que muda status ou remove item, fechar drawer
    closeSupportDrawer();
  });
}

// Modal de alteração de técnico (apenas admins)
let changeTecnicoPendingId = null;
function closeChangeTecnicoModal() {
  const m = document.getElementById("modalChangeTecnico");
  if (m) m.classList.add("hidden");
  changeTecnicoPendingId = null;
}

function openChangeTecnicoModal(itemId) {
  if (!authManager.isAdmin()) {
    showNotification("Apenas administradores podem alterar o técnico.", "error", 3000);
    return;
  }
  changeTecnicoPendingId = itemId;
  const listEl = document.getElementById("modalChangeTecnicoList");
  if (!listEl) return;
  // Lista fixa de técnicos — garante exibição consistente
  const nomes = ["Henrique", "Matheus", "Vinicius", "Victor", "Isabele", "Alexandre"];
  listEl.innerHTML = "";
  if (!nomes.length) {
    const p = document.createElement("p");
    p.textContent = "Nenhum técnico disponível.";
    listEl.appendChild(p);
  } else {
    nomes.forEach((nome) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-ghost";
      btn.style.display = "block";
      btn.style.width = "100%";
      btn.style.textAlign = "left";
      btn.style.margin = "6px 0";
      btn.dataset.tecnico = nome;
      btn.textContent = nome;
      listEl.appendChild(btn);
    });
  }
  const m = document.getElementById("modalChangeTecnico");
  if (m) m.classList.remove("hidden");
}

// Delegação de clique na lista de técnicos
const _changeListEl = document.getElementById("modalChangeTecnicoList");
if (_changeListEl) {
  _changeListEl.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-tecnico]");
    if (!btn) return;
    let tecnico = btn.dataset.tecnico;
    if (!changeTecnicoPendingId) return;
    if (!authManager.isAdmin()) {
      showNotification("Apenas administradores podem alterar o técnico.", "error", 3000);
      closeChangeTecnicoModal();
      return;
    }
    try {
      const item = state.registros.find((r) => r.id === changeTecnicoPendingId) || {};
      tecnico = titleCaseName(tecnico);
      await updateDoc(doc(db, COLLECTION, changeTecnicoPendingId), { tecnico, tecnicoKey: normKey(tecnico), updatedAt: serverTimestamp() });
      void syncToSheet(changeTecnicoPendingId, { ...item, tecnico, tecnicoKey: normKey(tecnico), id: changeTecnicoPendingId });
      await atualizarEstatisticasDb();
      atualizarEstatisticas();
      showNotification(`Técnico alterado para: ${tecnico}`, "success", 2200);
      closeChangeTecnicoModal();
      await carregar();
    } catch (err) {
      showNotification(err.message || "Não foi possível alterar o técnico.", "error", 3500);
    }
  });
}

const _btnCloseChange = document.getElementById("btnFecharChangeTecnico");
if (_btnCloseChange) _btnCloseChange.addEventListener("click", () => closeChangeTecnicoModal());

const btnAdicionar = document.getElementById("btnAdicionar");
if (btnAdicionar) {
  btnAdicionar.addEventListener("click", abrirModalAdicionar);
}
const btnRecarregarEl = document.getElementById("btnRecarregar");
if (btnRecarregarEl) btnRecarregarEl.addEventListener("click", carregar);
const btnFecharModalEl = document.getElementById("btnFecharModal");
if (btnFecharModalEl) btnFecharModalEl.addEventListener("click", fecharModal);
btnCancelarExclusao.addEventListener("click", fecharModalExcluir);
btnConfirmarExclusao.addEventListener("click", confirmarExclusao);
if (btnFecharNotasModal) btnFecharNotasModal.addEventListener("click", fecharModalNotas);
if (btnSalvarNotas) btnSalvarNotas.addEventListener("click", async () => {
  if (!notasIdPendente) return;
  const item = state.registros.find((r) => r.id === notasIdPendente);
  if (!item) {
    showNotification("Registro não encontrado.", "error", 2800);
    fecharModalNotas();
    return;
  }
  const payload = {
    anotacoes: modalNotasTexto.value.trim(),
    updatedAt: serverTimestamp()
  };
  await updateDoc(doc(db, COLLECTION, notasIdPendente), payload);
  void syncToSheet(notasIdPendente, { ...item, ...payload, id: notasIdPendente });
  await atualizarEstatisticasDb();
  atualizarEstatisticas();
  showNotification("Anotações salvas.", "success", 2200);
  fecharModalNotas();
});
modalExcluir.addEventListener("click", (e) => {
  if (e.target === modalExcluir) fecharModalExcluir();
});
// Indevido modal handlers
const btnConfirmarIndevido = document.getElementById("btnConfirmarIndevido");
const btnCancelarIndevido = document.getElementById("btnCancelarIndevido");
const btnFecharIndevidoView = document.getElementById("btnFecharIndevidoView");
if (btnConfirmarIndevido) {
  btnConfirmarIndevido.addEventListener("click", async () => {
    if (!indevidoIdPendente) return;
    const text = norm(document.getElementById("modalIndevidoTexto").value || "");
    if (!text) {
      showNotification("Informe um motivo válido.", "error", 2200);
      return;
    }
    try {
      const payload = {
        statusAbertura: "INDEVIDO",
        motivoIndevido: text,
        updatedAt: serverTimestamp()
      };
      const item = state.registros.find((r) => r.id === indevidoIdPendente) || {};
      await updateDoc(doc(db, COLLECTION, indevidoIdPendente), payload);
      void syncToSheet(indevidoIdPendente, { ...item, ...payload, id: indevidoIdPendente });
      const index = state.registros.findIndex((r) => r.id === indevidoIdPendente);
      if (index !== -1) {
        state.registros[index] = { ...item, ...payload, id: indevidoIdPendente };
      }
      indevidoPendingMap.delete(indevidoIdPendente);
      indevidoIdPendente = null;
      const m = document.getElementById("modalIndevido");
      if (m) m.classList.add("hidden");
      await atualizarEstatisticasDb();
      atualizarEstatisticas();
      showNotification("Motivo indevido salvo.", "success", 2200);
    } catch (err) {
      showNotification(err.message || "Nao foi possivel salvar o motivo indevido.", "error", 3500);
    }
  });
}
if (btnCancelarIndevido) {
  btnCancelarIndevido.addEventListener("click", () => {
    indevidoIdPendente = null;
    const m = document.getElementById("modalIndevido");
    if (m) m.classList.add("hidden");
  });
}
if (btnFecharIndevidoView) {
  btnFecharIndevidoView.addEventListener("click", () => {
    const m = document.getElementById("modalIndevidoView");
    if (m) m.classList.add("hidden");
  });
}
const btnMudarParaDevido = document.getElementById("btnMudarParaDevido");
if (btnMudarParaDevido) {
  btnMudarParaDevido.addEventListener("click", async () => {
    const id = btnMudarParaDevido.dataset.id;
    if (!id) return;
    try {
      const item = state.registros.find((r) => r.id === id) || {};
      const payload = { statusAbertura: "DEVIDO", updatedAt: serverTimestamp() };
      await updateDoc(doc(db, COLLECTION, id), payload);
      void syncToSheet(id, { ...item, ...payload, id });
      await atualizarEstatisticasDb();
      atualizarEstatisticas();
      const m = document.getElementById("modalIndevidoView");
      if (m) m.classList.add("hidden");
      showNotification("Status alterado para Devido.", "success", 2200);
    } catch (err) {
      showNotification(err.message || "Nao foi possivel alterar o status.", "error", 3500);
    }
  });
}
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !modalExcluir.classList.contains("hidden")) {
    fecharModalExcluir();
  }
});
const btnPrevPageEl = document.getElementById("btnPrevPage");
if (btnPrevPageEl) btnPrevPageEl.addEventListener("click", async () => {
  if (state.paginaAtual <= 1) return;
  state.paginaAtual -= 1;
  await carregar();
});
const btnNextPageEl = document.getElementById("btnNextPage");
if (btnNextPageEl) btnNextPageEl.addEventListener("click", async () => {
  if (!state.hasNextPage) return;
  state.paginaAtual += 1;
  await carregar();
});
const resetPageData = () => {
  state.paginaAtual = 1;
  state.pageCursors = [null];
  state.hasNextPage = false;
  state.registros = [];
  _lastDoc = null;
  if (_cardsObserver) {
    try { _cardsObserver.disconnect(); } catch (e) {}
    _cardsObserver = null;
  }
};
statCards.forEach((card) => {
  card.addEventListener("click", async () => {
    const status = card.dataset.status;
    if (status === state.filtroStatus) return;
    state.filtroStatus = status;
    statCards.forEach((c) => c.classList.toggle("active", c === card));
    resetPageData();
    await carregar();
  });
});

// Handlers for modal Sem Retorno
if (btnConfirmarSemRetorno) {
  btnConfirmarSemRetorno.addEventListener("click", async () => {
    const id = semRetornoIdPendente;
    const motivo = norm(modalSemRetornoTexto.value || "");
    if (!id) return;
    if (!motivo) {
      showNotification("Informe o motivo para marcar como Sem Retorno.", "error", 2500);
      return;
    }
    try {
      const item = state.registros.find((r) => r.id === id) || {};
      await updateDoc(doc(db, COLLECTION, id), {
        status: "SEM RETORNO",
        motivo,
        updatedAt: serverTimestamp()
      });
      void syncToSheet(id, { ...item, status: "SEM RETORNO", motivo, id });
      semRetornoIdPendente = null;
      if (modalSemRetorno) modalSemRetorno.classList.add("hidden");
      await fetchOpenSupports();
      await atualizarEstatisticasDb();
      atualizarEstatisticas();
      render();
      showNotification("Suporte marcado como sem retorno.", "success", 2200);
    } catch (err) {
      showNotification(err.message || "Nao foi possivel marcar como sem retorno.", "error", 3500);
    }
  });
}
if (btnCancelarSemRetorno) {
  btnCancelarSemRetorno.addEventListener("click", () => {
    semRetornoIdPendente = null;
    if (modalSemRetorno) modalSemRetorno.classList.add("hidden");
  });
}

// Handlers for modal Reagendamento
let reagendarIdPendente = null;
const modalReagendar = document.getElementById("modalReagendar");
const modalReagendarData = document.getElementById("modalReagendarData");
const modalReagendarHora = document.getElementById("modalReagendarHora");
const btnConfirmarReagendar = document.getElementById("btnConfirmarReagendar");
const btnCancelarReagendar = document.getElementById("btnCancelarReagendar");

if (btnConfirmarReagendar) {
  btnConfirmarReagendar.addEventListener("click", async () => {
    const id = reagendarIdPendente;
    const data = modalReagendarData.value;
    const hora = modalReagendarHora.value;
    
    if (!id) return;
    if (!data || !hora) {
      showNotification("Informe data e hora para reagendar.", "error", 2500);
      return;
    }
    
    try {
      const item = state.registros.find((r) => r.id === id) || {};
      const dataReagendamento = new Date(`${data}T${hora}`);
      
      if (dataReagendamento <= new Date()) {
        showNotification("A data/hora deve ser no futuro.", "error", 2500);
        return;
      }
      
      await updateDoc(doc(db, COLLECTION, id), {
        status: "REAGENDADO",
        dataReagendamento: dataReagendamento,
        updatedAt: serverTimestamp()
      });
      void syncToSheet(id, { ...item, status: "REAGENDADO", dataReagendamento, id });
      reagendarIdPendente = null;
      if (modalReagendar) modalReagendar.classList.add("hidden");
      await fetchOpenSupports();
      await atualizarEstatisticasDb();
      atualizarEstatisticas();
      render();
      showNotification("Suporte reagendado com sucesso.", "success", 2200);
    } catch (err) {
      showNotification(err.message || "Nao foi possivel reagendar.", "error", 3500);
    }
  });
}

if (btnCancelarReagendar) {
  btnCancelarReagendar.addEventListener("click", () => {
    reagendarIdPendente = null;
    if (modalReagendar) modalReagendar.classList.add("hidden");
  });
}

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
if (filtroStatusAberturaEl) {
  filtroStatusAberturaEl.addEventListener("change", async (e) => {
    state.filtroStatusAbertura = e.target.value;
    resetPageData();
    await carregar();
  });
}
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
        // add notify toggle button
        ensureNotifyToggleInHeader();
        setNotifyEnabled(notifyEnabled);
    }

    const btnLogoutEl = document.getElementById("btnLogout");
    if (btnLogoutEl) {
      btnLogoutEl.addEventListener("click", async () => {
        await authManager.logout();
        window.location.href = "./login.html";
      });
    }
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

// Verificar suportes reagendados que devem voltar para EM ABERTO
let checkReagendadoInterval = null;
async function verificarReagendados() {
  try {
    const reagendadosQuery = query(
      collection(db, COLLECTION),
      where("status", "==", "REAGENDADO")
    );
    const snapshot = await getDocs(reagendadosQuery);
    const agora = new Date();
    
    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      if (!data.dataReagendamento) continue;
      
      let dataReag = data.dataReagendamento;
      if (dataReag && typeof dataReag.toDate === "function") {
        dataReag = dataReag.toDate();
      } else if (typeof dataReag === "string") {
        dataReag = new Date(dataReag);
      }
      
      if (dataReag && dataReag <= agora) {
        // Retornar para EM ABERTO
        await updateDoc(doc(db, COLLECTION, docSnap.id), {
          status: "EM ABERTO",
          dataReagendamento: deleteField(),
          updatedAt: serverTimestamp()
        });
        
        // Sincronizar com Sheets
        void syncToSheet(docSnap.id, { ...data, status: "EM ABERTO", id: docSnap.id });
        
        // Notificações
        playNotificationSound();
        showNotification(
          `Suporte ${data.protocolo || "S/N"} retornou para Em Aberto!`,
          "success",
          4000
        );
      }
    }
    
    // Atualizar lista se necessário
    const hasReagendados = state.registros.some((r) => r.status === "REAGENDADO");
    if (hasReagendados) {
      await atualizarEstatisticasDb();
      atualizarEstatisticas();
    }
  } catch (err) {
    console.error("Erro ao verificar reagendados:", err);
  }
}

function iniciarVerificacaoReagendados() {
  if (checkReagendadoInterval) clearInterval(checkReagendadoInterval);
  // Verificar a cada 5 minutos em vez de 30 segundos para reduzir leituras repetidas.
  checkReagendadoInterval = setInterval(verificarReagendados, 5 * 60 * 1000);
  // Fazer a primeira verificação imediatamente
  verificarReagendados();
}

function pararVerificacaoReagendados() {
  if (checkReagendadoInterval) {
    clearInterval(checkReagendadoInterval);
    checkReagendadoInterval = null;
  }
}

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
    
    // 4. Iniciar verificação de suportes reagendados
    iniciarVerificacaoReagendados();
    console.log("[App] ✅ Verificação de reagendados iniciada");
  } catch (error) {
    console.error("[App] ❌ Erro na inicialização:", error);
    showNotification(`Erro ao inicializar: ${error.message}`, "error", 5000);
  }
})();

// debug panel removed
