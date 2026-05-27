import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { db } from "./config/firebase.js";

const STATUS_OPTIONS = ["ABERTO", "EM ANDAMENTO", "FINALIZADO"];
const CANAL_OPTIONS = ["WEBHOOK", "WHATSAPP", "TELEFONE", "EMAIL"];
const PAGE_SIZE = 10;
const COLLECTION = "suportes_tecnicos";

const state = {
  registros: [],
  filtroTexto: "",
  filtroStatus: "todos",
  filtroCanal: "todos",
  filtroTecnico: "todos",
  ordenacao: "data-desc",
  paginaAtual: 1,
  modalModo: "adicionar"
};

const tbody = document.getElementById("tbody");
const filtroTextoEl = document.getElementById("filtroTexto");
const filtroStatusEl = document.getElementById("filtroStatus");
const filtroCanalEl = document.getElementById("filtroCanal");
const filtroTecnicoEl = document.getElementById("filtroTecnico");
const ordenacaoEl = document.getElementById("ordenacao");
const paginationInfo = document.getElementById("paginationInfo");
const modal = document.getElementById("modalSuporte");
const modalTitulo = document.getElementById("modalTitulo");
const formSuporte = document.getElementById("formSuporte");

const modalProtocolo = document.getElementById("modalProtocolo");
const modalCliente = document.getElementById("modalCliente");
const modalCpfCnpj = document.getElementById("modalCpfCnpj");
const modalContato = document.getElementById("modalContato");
const modalTecnico = document.getElementById("modalTecnico");
const modalCanal = document.getElementById("modalCanal");
const modalStatus = document.getElementById("modalStatus");
const modalDataAbertura = document.getElementById("modalDataAbertura");
const modalIdAtual = document.getElementById("modalIdAtual");

const norm = (v) => String(v || "").trim().replace(/\s+/g, " ");
const normStatus = (v) => STATUS_OPTIONS.includes(norm(v).toUpperCase()) ? norm(v).toUpperCase() : "ABERTO";
const normCanal = (v) => CANAL_OPTIONS.includes(norm(v).toUpperCase()) ? norm(v).toUpperCase() : "WEBHOOK";

function statusClass(status) {
  if (status === "EM ANDAMENTO") return "status-andamento";
  if (status === "FINALIZADO") return "status-finalizado";
  return "status-aberto";
}

function formatDate(isoDate) {
  if (!isoDate) return "-";
  const d = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString("pt-BR");
}

function toComparableDate(isoDate) {
  const d = new Date(`${isoDate || ""}T00:00:00`);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

async function carregar() {
  const snap = await getDocs(collection(db, COLLECTION));
  state.registros = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      protocolo: norm(data.protocolo || data.idSuporte || ""),
      cliente: norm(data.cliente || data.nomeCliente || data.parceiro || ""),
      cpfCnpj: norm(data.cpfCnpj || data.cpf_cnpj || ""),
      contato: norm(data.contato || data.telefone || ""),
      tecnico: norm(data.tecnico || data.tecnicoResponsavel || ""),
      canal: normCanal(data.canal || data.origem || "WEBHOOK"),
      status: normStatus(data.status || data.situacao || "ABERTO"),
      dataAbertura: norm(data.dataAbertura || "")
    };
  });
  atualizarFiltroTecnicos();
  render();
}

function atualizarFiltroTecnicos() {
  const tecnicos = Array.from(new Set(state.registros.map((r) => r.tecnico).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
  const valorAnterior = state.filtroTecnico;
  filtroTecnicoEl.innerHTML = '<option value="todos">Todos</option>';
  tecnicos.forEach((nome) => {
    const option = document.createElement("option");
    option.value = nome;
    option.textContent = nome;
    filtroTecnicoEl.appendChild(option);
  });
  state.filtroTecnico = valorAnterior === "todos" || tecnicos.includes(valorAnterior) ? valorAnterior : "todos";
  filtroTecnicoEl.value = state.filtroTecnico;
}

function getRegistrosFiltrados() {
  let dados = [...state.registros];
  if (state.filtroTexto) {
    const termo = state.filtroTexto.toLowerCase();
    dados = dados.filter((item) =>
      item.cliente.toLowerCase().includes(termo) ||
      item.protocolo.toLowerCase().includes(termo) ||
      item.cpfCnpj.toLowerCase().includes(termo)
    );
  }
  if (state.filtroStatus !== "todos") dados = dados.filter((item) => item.status === state.filtroStatus);
  if (state.filtroCanal !== "todos") dados = dados.filter((item) => item.canal === state.filtroCanal);
  if (state.filtroTecnico !== "todos") dados = dados.filter((item) => item.tecnico === state.filtroTecnico);

  if (state.ordenacao === "data-desc") dados.sort((a, b) => toComparableDate(b.dataAbertura) - toComparableDate(a.dataAbertura));
  if (state.ordenacao === "data-asc") dados.sort((a, b) => toComparableDate(a.dataAbertura) - toComparableDate(b.dataAbertura));
  if (state.ordenacao === "cliente-asc") dados.sort((a, b) => a.cliente.localeCompare(b.cliente, "pt-BR"));
  if (state.ordenacao === "protocolo-asc") dados.sort((a, b) => a.protocolo.localeCompare(b.protocolo, "pt-BR"));
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
  const abertos = state.registros.filter((r) => r.status === "ABERTO").length;
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
    tr.innerHTML = '<td colspan="9" class="empty">Nenhum suporte encontrado para os filtros selecionados.</td>';
    tbody.appendChild(tr);
    atualizarEstatisticas();
    atualizarRodapePaginacao(0, 0, totalPaginas);
    return;
  }
  paginados.forEach((item) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${formatDate(item.dataAbertura)}</td>
      <td>${item.protocolo || "-"}</td>
      <td>${item.cliente || "-"}</td>
      <td>${item.cpfCnpj || "-"}</td>
      <td>${item.contato || "-"}</td>
      <td>${item.tecnico || "-"}</td>
      <td>${item.canal}</td>
      <td><span class="status-pill ${statusClass(item.status)}">${item.status}</span></td>
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
  modalTitulo.textContent = "Novo Suporte";
  modalProtocolo.value = "";
  modalCliente.value = "";
  modalCpfCnpj.value = "";
  modalContato.value = "";
  modalTecnico.value = "";
  modalCanal.value = "WEBHOOK";
  modalStatus.value = "ABERTO";
  modalDataAbertura.value = "";
  modalIdAtual.value = "";
  modal.classList.remove("hidden");
}

function abrirModalEditar(item) {
  state.modalModo = "editar";
  modalTitulo.textContent = "Editar Suporte";
  modalProtocolo.value = item.protocolo;
  modalCliente.value = item.cliente;
  modalCpfCnpj.value = item.cpfCnpj;
  modalContato.value = item.contato;
  modalTecnico.value = item.tecnico;
  modalCanal.value = item.canal;
  modalStatus.value = item.status;
  modalDataAbertura.value = item.dataAbertura || "";
  modalIdAtual.value = item.id;
  modal.classList.remove("hidden");
}

function fecharModal() {
  modal.classList.add("hidden");
}

document.getElementById("btnAdicionar").addEventListener("click", abrirModalAdicionar);
document.getElementById("btnRecarregar").addEventListener("click", carregar);
document.getElementById("btnFecharModal").addEventListener("click", fecharModal);
document.getElementById("btnPrevPage").addEventListener("click", () => { state.paginaAtual -= 1; render(); });
document.getElementById("btnNextPage").addEventListener("click", () => { state.paginaAtual += 1; render(); });
filtroTextoEl.addEventListener("input", (e) => { state.filtroTexto = e.target.value.trim(); state.paginaAtual = 1; render(); });
filtroStatusEl.addEventListener("change", (e) => { state.filtroStatus = e.target.value; state.paginaAtual = 1; render(); });
filtroCanalEl.addEventListener("change", (e) => { state.filtroCanal = e.target.value; state.paginaAtual = 1; render(); });
filtroTecnicoEl.addEventListener("change", (e) => { state.filtroTecnico = e.target.value; state.paginaAtual = 1; render(); });
ordenacaoEl.addEventListener("change", (e) => { state.ordenacao = e.target.value; state.paginaAtual = 1; render(); });

formSuporte.addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    protocolo: norm(modalProtocolo.value),
    cliente: norm(modalCliente.value),
    cpfCnpj: norm(modalCpfCnpj.value),
    contato: norm(modalContato.value),
    tecnico: norm(modalTecnico.value),
    canal: normCanal(modalCanal.value),
    status: normStatus(modalStatus.value),
    dataAbertura: norm(modalDataAbertura.value),
    updatedAt: serverTimestamp()
  };
  try {
    if (state.modalModo === "adicionar") {
      await addDoc(collection(db, COLLECTION), { ...payload, createdAt: serverTimestamp() });
      alert("Suporte adicionado com sucesso.");
    } else {
      await updateDoc(doc(db, COLLECTION, modalIdAtual.value), payload);
      alert("Suporte atualizado com sucesso.");
    }
    fecharModal();
    await carregar();
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
      const ok = confirm("Deseja excluir este suporte?");
      if (!ok) return;
      await deleteDoc(doc(db, COLLECTION, id));
      await carregar();
      alert("Suporte excluido com sucesso.");
    }
  } catch (err) {
    alert(err.message || "Nao foi possivel concluir a operacao.");
  }
});

carregar().catch((err) => {
  alert(`Erro ao carregar dados do Firebase: ${String(err?.message || err || "")}`);
});
