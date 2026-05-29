import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { db } from "./config/firebase.js";

const STATUS_OPTIONS = ["EM ABERTO", "EM ANDAMENTO", "FINALIZADO", "SEM RETORNO", "REAGENDADO"];
const PAGE_SIZE = 10;
const COLLECTION = "suportes_tecnicos";

const state = {
  registros: [],
  filtroStatus: "todos",
  filtroAc: "todos",
  filtroTecnico: "todos",
  filtroCpfCnpj: "",
  filtroProtocolo: "",
  paginaAtual: 1,
  modalModo: "adicionar"
};

const tbody = document.getElementById("tbody");
const filtroStatusEl = document.getElementById("filtroStatus");
const filtroAcEl = document.getElementById("filtroAc");
const filtroTecnicoEl = document.getElementById("filtroTecnico");
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

const norm = (v) => String(v || "").trim().replace(/\s+/g, " ");
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
  modalResponsavelAbertura.disabled = estaEditando;
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

function aplicarSnapshot(snap) {
  state.registros = snap.docs.map(mapDocToRegistro);
  atualizarFiltroAc();
  render();
}

let unsubscribeTempoReal = null;

function iniciarAtualizacaoTempoReal() {
  if (unsubscribeTempoReal) return;
  unsubscribeTempoReal = onSnapshot(
    collection(db, COLLECTION),
    aplicarSnapshot,
    (err) => {
      alert(`Erro ao sincronizar com o Firebase: ${String(err?.message || err || "")}`);
    }
  );
}

function carregar() {
  iniciarAtualizacaoTempoReal();
  render();
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
  let dados = [...state.registros];
  if (state.filtroCpfCnpj) dados = dados.filter((item) => item.cpfCnpj.toLowerCase().includes(state.filtroCpfCnpj.toLowerCase()));
  if (state.filtroProtocolo) dados = dados.filter((item) => item.protocolo.toLowerCase().includes(state.filtroProtocolo.toLowerCase()));
  if (state.filtroStatus !== "todos") dados = dados.filter((item) => item.status === state.filtroStatus);
  if (state.filtroAc !== "todos") dados = dados.filter((item) => item.ac === state.filtroAc);
  if (state.filtroTecnico !== "todos") dados = dados.filter((item) => item.tecnico === state.filtroTecnico);
  dados.sort((a, b) => toComparableDate(b.dataAbertura) - toComparableDate(a.dataAbertura));
  return dados;
}

function calcularPaginacao(totalItens) {
  const totalPaginas = Math.max(1, Math.ceil(totalItens / PAGE_SIZE));
  state.paginaAtual = Math.min(Math.max(state.paginaAtual, 1), totalPaginas);
  const inicio = (state.paginaAtual - 1) * PAGE_SIZE;
  return { totalPaginas, inicio, fim: inicio + PAGE_SIZE };
}

function atualizarEstatisticas() {
  const total = state.registros.length;
  const abertos = state.registros.filter((r) => r.status === "EM ABERTO").length;
  const andamento = state.registros.filter((r) => r.status === "EM ANDAMENTO").length;
  const finalizados = state.registros.filter((r) => r.status === "FINALIZADO").length;
  document.getElementById("statTotal").textContent = String(total);
  document.getElementById("statAbertos").textContent = String(abertos);
  document.getElementById("statAndamento").textContent = String(andamento);
  document.getElementById("statFinalizados").textContent = String(finalizados);
}

function atualizarRodapePaginacao(inicio, fim, totalPaginas, totalItens = 0) {
  paginationInfo.textContent = `Mostrando ${inicio} - ${fim} de ${totalItens}`;
  document.getElementById("btnPrevPage").disabled = state.paginaAtual <= 1;
  document.getElementById("btnNextPage").disabled = state.paginaAtual >= totalPaginas;
}

function render() {
  tbody.innerHTML = "";
  const dados = getRegistrosFiltrados();
  const { totalPaginas, inicio, fim } = calcularPaginacao(dados.length);
  const paginados = dados.slice(inicio, fim);
  if (!paginados.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = '<td colspan="12" class="empty">Nenhum suporte encontrado para os filtros selecionados.</td>';
    tbody.appendChild(tr);
    atualizarEstatisticas();
    atualizarRodapePaginacao(0, 0, totalPaginas);
    return;
  }
  paginados.forEach((item) => {
    const tr = document.createElement("tr");
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
          <button class="btn btn-small btn-primary" data-action="editar" data-id="${item.id}">Editar</button>
          <button class="btn btn-small btn-ghost" data-action="excluir" data-id="${item.id}">Excluir</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
  atualizarEstatisticas();
  atualizarRodapePaginacao(inicio + 1, Math.min(fim, dados.length), totalPaginas, dados.length);
}

function abrirModalAdicionar() {
  state.modalModo = "adicionar";
  configurarCamposModoEdicao(false);
  modalTitulo.textContent = "Novo Suporte";
  modalProtocolo.value = "";
  modalResponsavelAbertura.value = "";
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
  const protocolo = item.protocolo || "—";
  const responsavel = item.responsavelAbertura || "—";
  modalExcluirDetalhes.textContent = `Protocolo ${protocolo} · ${responsavel}`;
  btnConfirmarExclusao.disabled = false;
  btnConfirmarExclusao.textContent = "Excluir";
  modalExcluir.classList.remove("hidden");
}

function fecharModalExcluir() {
  excluirIdPendente = null;
  modalExcluir.classList.add("hidden");
}

async function confirmarExclusao() {
  if (!excluirIdPendente) return;
  btnConfirmarExclusao.disabled = true;
  btnConfirmarExclusao.textContent = "Excluindo...";
  try {
    await deleteDoc(doc(db, COLLECTION, excluirIdPendente));
    fecharModalExcluir();
  } catch (err) {
    btnConfirmarExclusao.disabled = false;
    btnConfirmarExclusao.textContent = "Excluir";
    alert(err.message || "Nao foi possivel excluir o suporte.");
  }
}

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
document.getElementById("btnPrevPage").addEventListener("click", () => { state.paginaAtual -= 1; render(); });
document.getElementById("btnNextPage").addEventListener("click", () => { state.paginaAtual += 1; render(); });
filtroStatusEl.addEventListener("change", (e) => { state.filtroStatus = e.target.value; state.paginaAtual = 1; render(); });
filtroAcEl.addEventListener("change", (e) => { state.filtroAc = e.target.value; state.paginaAtual = 1; render(); });
filtroTecnicoEl.addEventListener("change", (e) => { state.filtroTecnico = e.target.value; state.paginaAtual = 1; render(); });
filtroCpfCnpjEl.addEventListener("input", (e) => { state.filtroCpfCnpj = e.target.value.trim(); state.paginaAtual = 1; render(); });
filtroProtocoloEl.addEventListener("input", (e) => { state.filtroProtocolo = e.target.value.trim(); state.paginaAtual = 1; render(); });

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
    alert("Preencha ao menos um campo para salvar.");
    return;
  }
  try {
    if (state.modalModo === "adicionar") {
      await addDoc(collection(db, COLLECTION), { ...payload, createdAt: serverTimestamp() });
      alert("Suporte adicionado com sucesso.");
    } else {
      await updateDoc(doc(db, COLLECTION, modalIdAtual.value), payload);
      alert("Suporte atualizado com sucesso.");
    }
    fecharModal();
  } catch (err) {
    alert(err.message || "Nao foi possivel salvar.");
  }
});

tbody.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const id = btn.dataset.id;
  try {
    if (btn.dataset.action === "editar") {
      const item = state.registros.find((r) => r.id === id);
      if (!item) throw new Error("Registro nao encontrado.");
      abrirModalEditar(item);
    }
    if (btn.dataset.action === "excluir") {
      const item = state.registros.find((r) => r.id === id);
      if (!item) throw new Error("Registro nao encontrado.");
      abrirModalExcluir(item);
    }
  } catch (err) {
    alert(err.message || "Nao foi possivel concluir a operacao.");
  }
});

iniciarAtualizacaoTempoReal();
