import { authManager } from "../auth.js";

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
  dataAbertura: document.getElementById("modalDataAbertura")
};

// helper to add/remove visual error state
function setRequiredError(show) {
  const pField = fields.protocolo.closest('.field');
  const cField = fields.cpfCnpj.closest('.field');
  if (pField) pField.classList.toggle('required-error', show);
  if (cField) cField.classList.toggle('required-error', show);
}

// remove error when user types
if (fields.protocolo) {
  fields.protocolo.addEventListener('input', () => setRequiredError(false));
}
if (fields.cpfCnpj) {
  fields.cpfCnpj.addEventListener('input', () => setRequiredError(false));
}

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

function resolveApiBaseURL() {
  if (typeof window !== "undefined") {
    const configured = window.__API_BASE_URL__ || "";
    if (configured) return configured.replace(/\/$/, "");
    const { hostname } = window.location;
    if (hostname === "127.0.0.1" || hostname === "localhost") {
      return "http://localhost:3000";
    }
    return "";
  }
  return "http://localhost:3000";
}

async function createSupportViaApi(payload) {
  const token = await authManager.getIdToken();
  const response = await fetch(`${resolveApiBaseURL()}/api/suportes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  let parsed = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = {};
  }

  if (!response.ok) {
    throw new Error(parsed.error || parsed.message || "Não foi possível salvar o suporte.");
  }

  return parsed.data;
}

function buildPayload() {
  const put = (target, key, value) => {
    const text = norm(value);
    if (text) target[key] = text;
  };

  const payload = {
    dataAbertura: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "EM ABERTO"
  };

  put(payload, "protocolo", formatProtocolo(fields.protocolo.value));
  put(payload, "responsavelAbertura", fields.responsavelAbertura.value);
  put(payload, "cpfCnpj", formatCpfCnpj(fields.cpfCnpj.value));
  put(payload, "tipo", fields.tipo.value);
  put(payload, "ac", fields.ac.value);
  put(payload, "contato", formatContato(fields.contato.value));
  payload.statusAbertura = "DEVIDO";
  // tecnico intentionally omitted from quick-create payload

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
  fields.dataAbertura.value = toDatetimeLocal(new Date().toISOString());
  preencherResponsavelAberturaSync();
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

function preencherResponsavelAberturaSync() {
  const userDisplayName = authManager.getUserDisplayName();
  const email = authManager.getCurrentUser()?.email || "";
  fields.responsavelAbertura.value = userDisplayName || (email ? email.split("@")[0] : "Responsavel");
}

async function preencherResponsavelAbertura() {
  const displayName = authManager.getUserDisplayName();
  if (displayName) {
    fields.responsavelAbertura.value = displayName;
    return;
  }

  const email = authManager.getCurrentUser()?.email || "";
  fields.responsavelAbertura.value = email ? email.split("@")[0] : "Responsavel";
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

  renderHeader();
  resetForm();
  await preencherResponsavelAbertura();
  return true;
}

formSuporte.addEventListener("submit", async (e) => {
  e.preventDefault();
  // Exigir que pelo menos Protocolo OU CPF/CNPJ esteja preenchido
  const protocoloVal = norm(fields.protocolo.value);
  const cpfVal = norm(fields.cpfCnpj.value);
  if (!protocoloVal && !cpfVal) {
    showNotification("Informe o Protocolo ou o CPF/CNPJ antes de salvar.", "error", 3000);
    // marca visualmente ambos os campos
    setRequiredError(true);
    fields.protocolo.focus();
    return;
  }

  const payload = buildPayload();
  if (!payload) {
    showNotification("Preencha ao menos um campo para salvar.", "error", 2800);
    return;
  }

  btnSalvar.disabled = true;
  btnSalvar.textContent = "Salvando...";

  try {
    await createSupportViaApi(payload);

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
