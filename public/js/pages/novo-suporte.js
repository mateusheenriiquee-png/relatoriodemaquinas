import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { db } from "../config/firebase.js";
import { authManager } from "../auth.js";
import { syncDocToSheet } from "../services/sheets-sync.js";

const COLLECTION = "suportes_tecnicos";
const STATUS_OPTIONS = ["EM ABERTO", "EM ANDAMENTO", "FINALIZADO", "SEM RETORNO", "REAGENDADO"];
const LOGIN_NEXT = "novo-suporte.html";

const formSuporte = document.getElementById("formSuporte");
const btnSalvar = document.getElementById("btnSalvar");
const btnLimpar = document.getElementById("btnLimpar");
const headerActions = document.getElementById("headerActions");

const fields = {
  protocolo: document.getElementById("modalProtocolo"),
  responsavelAbertura: document.getElementById("modalResponsavelAbertura"),
  cpfCnpj: document.getElementById("modalCpfCnpj"),
  tipo: document.getElementById("modalTipo"),
  ac: document.getElementById("modalAc"),
  contato: document.getElementById("modalContato"),
  tecnico: document.getElementById("modalTecnico"),
  status: document.getElementById("modalStatus"),
  statusAbertura: document.getElementById("modalStatusAbertura"),
  dataAbertura: document.getElementById("modalDataAbertura")
};

const norm = (v) => String(v || "").trim().replace(/\s+/g, " ");

function normStatus(v) {
  const s = norm(v).toUpperCase();
  if (STATUS_OPTIONS.includes(s)) return s;
  if (/REAGEND/.test(s)) return "REAGENDADO";
  if (/TRATATIV|ANDAMENTO|ATENDIMENTO/.test(s)) return "EM ANDAMENTO";
  if (/FINALIZ|CONCLUID|RESOLVID|FECHAD/.test(s)) return "FINALIZADO";
  if (/SEM RETORNO/.test(s)) return "SEM RETORNO";
  return "EM ABERTO";
}

function toDatetimeLocal(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function showNotification(message, type = "info", timeout = 2500) {
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
  btnOk.type = "button";
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
    setTimeout(() => modalWrap.remove(), timeout);
  }
}

function buildPayload() {
  const put = (target, key, value) => {
    const text = norm(value);
    if (text) target[key] = text;
  };

  const payload = {
    dataAbertura: new Date().toISOString(),
    updatedAt: serverTimestamp()
  };

  put(payload, "protocolo", fields.protocolo.value);
  put(payload, "responsavelAbertura", fields.responsavelAbertura.value);
  put(payload, "cpfCnpj", fields.cpfCnpj.value);
  put(payload, "tipo", fields.tipo.value);
  put(payload, "ac", fields.ac.value);
  put(payload, "contato", fields.contato.value);
  put(payload, "tecnico", fields.tecnico.value);
  put(payload, "status", normStatus(fields.status.value));
  put(payload, "statusAbertura", fields.statusAbertura.value);

  if (!Object.keys(payload).some((k) => !["dataAbertura", "updatedAt"].includes(k))) {
    return null;
  }
  return payload;
}

function resetForm() {
  fields.protocolo.value = "";
  fields.cpfCnpj.value = "";
  fields.tipo.value = "Suporte tecnico";
  fields.ac.value = "CONSULTI";
  fields.contato.value = "";
  fields.tecnico.value = "MATHEUS";
  fields.status.value = "EM ABERTO";
  fields.statusAbertura.value = "DEVIDO";
  fields.dataAbertura.value = toDatetimeLocal(new Date().toISOString());
  preencherResponsavelAberturaSync();
}

function preencherResponsavelAberturaSync() {
  const userDisplayName = authManager.getUserDisplayName();
  const email = authManager.getCurrentUser()?.email || "";
  fields.responsavelAbertura.value = userDisplayName || (email ? email.split("@")[0] : "Responsavel");
}

async function preencherResponsavelAbertura() {
  try {
    const uid = authManager.getCurrentUser()?.uid;
    if (!uid) throw new Error("Sem UID");

    const userSnap = await getDoc(doc(db, "usuarios", uid));
    const displayName = userSnap.exists() ? (userSnap.data().displayName || "") : "";
    if (displayName) {
      fields.responsavelAbertura.value = displayName;
      return;
    }
  } catch {
    // fallback abaixo
  }
  preencherResponsavelAberturaSync();
}

function renderHeader() {
  const userDisplayName = authManager.getUserDisplayName();
  headerActions.innerHTML = `
    <span class="user-info">👤 ${userDisplayName}</span>
    <button id="btnLogout" class="btn btn-ghost btn-small" type="button">Logout</button>
  `;
  document.getElementById("btnLogout").addEventListener("click", async () => {
    await authManager.logout();
    window.location.href = `./login.html?next=${LOGIN_NEXT}`;
  });
}

async function protegerPagina() {
  await authManager.initialize();

  if (!authManager.isAuthenticated()) {
    window.location.href = `./login.html?next=${LOGIN_NEXT}`;
    return false;
  }

  if (!db) {
    showNotification("Firestore nao configurado. Verifique js/config/firebase.js", "error", 5000);
    return false;
  }

  renderHeader();
  resetForm();
  await preencherResponsavelAbertura();
  return true;
}

formSuporte.addEventListener("submit", async (e) => {
  e.preventDefault();

  const payload = buildPayload();
  if (!payload) {
    showNotification("Preencha ao menos um campo para salvar.", "error", 2800);
    return;
  }

  btnSalvar.disabled = true;
  btnSalvar.textContent = "Salvando...";

  try {
    const ref = await addDoc(collection(db, COLLECTION), {
      ...payload,
      createdAt: serverTimestamp()
    });

    const docData = {
      ...payload,
      id: ref.id,
      createdAt: payload.dataAbertura || new Date().toISOString()
    };

    try {
      await syncDocToSheet(ref.id, docData);
    } catch (err) {
      console.warn("[NovoSuporte] Sync com sheets falhou:", err.message);
    }

    showNotification("Suporte adicionado com sucesso.", "success", 2200);
    resetForm();
    await preencherResponsavelAbertura();
    fields.protocolo.focus();
  } catch (err) {
    showNotification(err.message || "Nao foi possivel salvar.", "error", 3500);
  } finally {
    btnSalvar.disabled = false;
    btnSalvar.textContent = "Salvar suporte";
  }
});

btnLimpar.addEventListener("click", () => {
  resetForm();
  fields.protocolo.focus();
});

(async () => {
  try {
    const ok = await protegerPagina();
    if (ok) fields.protocolo.focus();
  } catch (error) {
    console.error("[NovoSuporte] Erro na inicializacao:", error);
    showNotification(`Erro ao inicializar: ${error.message}`, "error", 5000);
  }
})();
