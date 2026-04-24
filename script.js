import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { db } from "./firebase-config.js";

const SITUACAO_OPTIONS = ["TREINAMENTO", "PRODUCAO"];
const FECHAMENTO_OPTIONS = ["PENDENTE", "PAGO"];
const PAGE_SIZE = 8;

const state = {
  registros: [],
  filtroTexto: "",
  filtroSituacao: "todos",
  filtroFechamento: "todos",
  filtroParceiro: "todos",
  ordenacao: "parceiro-asc",
  paginaAtual: 1,
  modalModo: "adicionar"
};

const tbody = document.getElementById("tbody");
const filtroTextoEl = document.getElementById("filtroTexto");
const filtroSituacaoEl = document.getElementById("filtroSituacao");
const filtroFechamentoEl = document.getElementById("filtroFechamento");
const filtroParceiroEl = document.getElementById("filtroParceiro");
const ordenacaoEl = document.getElementById("ordenacao");
const paginationInfo = document.getElementById("paginationInfo");
const modal = document.getElementById("modalMaquina");
const modalTitulo = document.getElementById("modalTitulo");
const modalParceiro = document.getElementById("modalParceiro");
const modalNome = document.getElementById("modalNome");
const modalSituacao = document.getElementById("modalSituacao");
const modalFechamento = document.getElementById("modalFechamento");
const modalIdAtual = document.getElementById("modalIdAtual");
const formMaquina = document.getElementById("formMaquina");

function toKey(id) {
  return encodeURIComponent(id);
}

function fromKey(value) {
  return decodeURIComponent(value);
}

function normalizarTexto(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizarSituacao(value) {
  const v = String(value || "").trim().toUpperCase();
  return SITUACAO_OPTIONS.includes(v) ? v : "TREINAMENTO";
}

function normalizarFechamento(value) {
  const v = String(value || "").trim().toUpperCase();
  return FECHAMENTO_OPTIONS.includes(v) ? v : "PENDENTE";
}

function compararNomeNatural(a, b) {
  const pattern = /^(.*?)-(\d+)$/i;
  const matchA = String(a || "").trim().match(pattern);
  const matchB = String(b || "").trim().match(pattern);

  if (matchA && matchB) {
    const baseA = matchA[1].toLowerCase();
    const baseB = matchB[1].toLowerCase();
    if (baseA !== baseB) {
      return baseA.localeCompare(baseB, "pt-BR");
    }
    return Number(matchA[2]) - Number(matchB[2]);
  }

  return String(a || "").localeCompare(String(b || ""), "pt-BR", {
    numeric: true,
    sensitivity: "base"
  });
}

async function carregar() {
  const snap = await getDocs(collection(db, "maquinas"));
  state.registros = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      parceiro: normalizarTexto(data.parceiro),
      maquina: normalizarTexto(data.maquina),
      situacao: normalizarSituacao(data.situacao),
      fechamentoMensal: normalizarFechamento(data.fechamentoMensal)
    };
  });
  atualizarFiltroParceiros();
  render();
}

function atualizarFiltroParceiros() {
  const parceiros = Array.from(
    new Set(
      state.registros
        .map((item) => normalizarTexto(item.parceiro))
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));

  const valorAnterior = state.filtroParceiro;
  filtroParceiroEl.innerHTML = '<option value="todos">Todos</option>';
  parceiros.forEach((parceiro) => {
    const option = document.createElement("option");
    option.value = parceiro;
    option.textContent = parceiro;
    filtroParceiroEl.appendChild(option);
  });

  const aindaExiste = valorAnterior === "todos" || parceiros.includes(valorAnterior);
  state.filtroParceiro = aindaExiste ? valorAnterior : "todos";
  filtroParceiroEl.value = state.filtroParceiro;
}

function getSituacaoClass(situacao) {
  if (situacao === "PRODUCAO") return "status-Produção";
  if (situacao === "TREINAMENTO") return "status-Treinamento";
  return "status-Pendente";
}

function getRegistrosFiltrados() {
  let dados = [...state.registros];

  if (state.filtroTexto) {
    const termo = state.filtroTexto.toLowerCase();
    dados = dados.filter((item) => item.maquina.toLowerCase().includes(termo));
  }

  if (state.filtroSituacao !== "todos") {
    dados = dados.filter((item) => item.situacao === state.filtroSituacao);
  }

  if (state.filtroFechamento !== "todos") {
    dados = dados.filter((item) => item.fechamentoMensal === state.filtroFechamento);
  }

  if (state.filtroParceiro !== "todos") {
    dados = dados.filter((item) => item.parceiro === state.filtroParceiro);
  }

  if (state.ordenacao === "parceiro-asc") {
    dados.sort((a, b) => a.parceiro.localeCompare(b.parceiro, "pt-BR", { sensitivity: "base" }));
  } else if (state.ordenacao === "maquina-asc") {
    dados.sort((a, b) => compararNomeNatural(a.maquina, b.maquina));
  } else if (state.ordenacao === "maquina-desc") {
    dados.sort((a, b) => compararNomeNatural(b.maquina, a.maquina));
  }

  return dados;
}

function calcularPaginacao(totalItens) {
  const totalPaginas = Math.max(1, Math.ceil(totalItens / PAGE_SIZE));
  if (state.paginaAtual > totalPaginas) {
    state.paginaAtual = totalPaginas;
  }
  if (state.paginaAtual < 1) {
    state.paginaAtual = 1;
  }
  const inicio = (state.paginaAtual - 1) * PAGE_SIZE;
  const fim = inicio + PAGE_SIZE;
  return { totalPaginas, inicio, fim };
}

function atualizarEstatisticas() {
  const total = state.registros.length;
  const treinamento = state.registros.filter((m) => m.situacao === "TREINAMENTO").length;
  const producao = state.registros.filter((m) => m.situacao === "PRODUCAO").length;
  const pago = state.registros.filter((m) => m.fechamentoMensal === "PAGO").length;
  const pendente = state.registros.filter((m) => m.fechamentoMensal === "PENDENTE").length;

  document.getElementById("statTotal").textContent = String(total);
  document.getElementById("statTreinamento").textContent = String(treinamento);
  document.getElementById("statProducao").textContent = String(producao);
  document.getElementById("statPago").textContent = String(pago);
  document.getElementById("statPendente").textContent = String(pendente);
}

function render() {
  tbody.innerHTML = "";
  const dados = getRegistrosFiltrados();
  const { totalPaginas, inicio, fim } = calcularPaginacao(dados.length);
  const dadosPaginados = dados.slice(inicio, fim);

  if (!dadosPaginados.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="5" class="empty">Nenhum registro encontrado para os filtros selecionados.</td>`;
    tbody.appendChild(tr);
    atualizarEstatisticas();
    atualizarRodapePaginacao(0, 0, totalPaginas);
    return;
  }

  dadosPaginados.forEach((item) => {
    const tr = document.createElement("tr");
    const idKey = toKey(item.id);
    const situacaoOptions = SITUACAO_OPTIONS.map(
      (v) => `<option value="${v}" ${v === item.situacao ? "selected" : ""}>${v}</option>`
    ).join("");
    const fechamentoOptions = FECHAMENTO_OPTIONS.map(
      (v) => `<option value="${v}" ${v === item.fechamentoMensal ? "selected" : ""}>${v}</option>`
    ).join("");

    tr.innerHTML = `
      <td>${item.parceiro || "-"}</td>
      <td>${item.maquina}</td>
      <td><span class="status-pill ${getSituacaoClass(item.situacao)}">${item.situacao}</span></td>
      <td><span class="status-pill ${getSituacaoClass(item.fechamentoMensal === "PAGO" ? "PRODUCAO" : "OUTRO")}">${item.fechamentoMensal}</span></td>
      <td>
        <div class="table-actions">
          <select data-id-key="${idKey}" class="situacaoSelect">${situacaoOptions}</select>
          <select data-id-key="${idKey}" class="fechamentoSelect">${fechamentoOptions}</select>
          <button class="btn btn-small btn-success" data-action="salvar" data-id-key="${idKey}">Salvar</button>
          <button class="btn btn-small btn-warning" data-action="editar" data-id-key="${idKey}">Editar</button>
          <button class="btn btn-small btn-danger" data-action="excluir" data-id-key="${idKey}">Excluir</button>
        </div>
      </td>
    `;

    tbody.appendChild(tr);
  });

  atualizarEstatisticas();
  atualizarRodapePaginacao(inicio + 1, Math.min(fim, dados.length), totalPaginas, dados.length);
}

function atualizarRodapePaginacao(inicio, fim, totalPaginas, totalItens = 0) {
  paginationInfo.textContent = `Mostrando ${inicio} - ${fim} de ${totalItens}`;
  document.getElementById("btnPrevPage").disabled = state.paginaAtual <= 1;
  document.getElementById("btnNextPage").disabled = state.paginaAtual >= totalPaginas;
}

async function atualizarRegistro(id, situacao, fechamentoMensal) {
  await updateDoc(doc(db, "maquinas", id), {
    situacao: normalizarSituacao(situacao),
    fechamentoMensal: normalizarFechamento(fechamentoMensal),
    updatedAt: serverTimestamp()
  });
  await carregar();
}

async function excluirRegistro(id) {
  await deleteDoc(doc(db, "maquinas", id));
  await carregar();
}

function abrirModalAdicionar() {
  state.modalModo = "adicionar";
  modalTitulo.textContent = "Novo Registro";
  modalParceiro.value = "";
  modalNome.value = "";
  modalSituacao.value = "TREINAMENTO";
  modalFechamento.value = "PENDENTE";
  modalIdAtual.value = "";
  modal.classList.remove("hidden");
}

function abrirModalEditar(item) {
  state.modalModo = "editar";
  modalTitulo.textContent = "Editar Registro";
  modalParceiro.value = item.parceiro;
  modalNome.value = item.maquina;
  modalSituacao.value = item.situacao;
  modalFechamento.value = item.fechamentoMensal;
  modalIdAtual.value = item.id;
  modal.classList.remove("hidden");
}

function fecharModal() {
  modal.classList.add("hidden");
}

function validarFormulario(parceiro, maquina, idAtual) {
  if (!parceiro || parceiro.length < 2) {
    throw new Error("Informe um parceiro com pelo menos 2 caracteres.");
  }
  if (!maquina || maquina.length < 2) {
    throw new Error("Informe uma máquina com pelo menos 2 caracteres.");
  }

  const nomeNormalizado = normalizarTexto(maquina).toLowerCase();
  const parceiroNormalizado = normalizarTexto(parceiro).toLowerCase();

  const existeLocal = state.registros.some((m) => {
    if (state.modalModo === "editar" && m.id === idAtual) {
      return false;
    }
    return (
      normalizarTexto(m.maquina).toLowerCase() === nomeNormalizado &&
      normalizarTexto(m.parceiro).toLowerCase() === parceiroNormalizado
    );
  });
  if (existeLocal) {
    throw new Error("Já existe esse parceiro com essa máquina.");
  }
}

document.getElementById("btnAdicionar").addEventListener("click", async () => {
  abrirModalAdicionar();
});

document.getElementById("btnRecarregar").addEventListener("click", carregar);
document.getElementById("btnFecharModal").addEventListener("click", fecharModal);
document.getElementById("btnPrevPage").addEventListener("click", () => {
  state.paginaAtual -= 1;
  render();
});
document.getElementById("btnNextPage").addEventListener("click", () => {
  state.paginaAtual += 1;
  render();
});

filtroTextoEl.addEventListener("input", (e) => {
  state.filtroTexto = e.target.value.trim();
  state.paginaAtual = 1;
  render();
});

filtroSituacaoEl.addEventListener("change", (e) => {
  state.filtroSituacao = e.target.value;
  state.paginaAtual = 1;
  render();
});

filtroFechamentoEl.addEventListener("change", (e) => {
  state.filtroFechamento = e.target.value;
  state.paginaAtual = 1;
  render();
});

filtroParceiroEl.addEventListener("change", (e) => {
  state.filtroParceiro = e.target.value;
  state.paginaAtual = 1;
  render();
});

ordenacaoEl.addEventListener("change", (e) => {
  state.ordenacao = e.target.value;
  state.paginaAtual = 1;
  render();
});

formMaquina.addEventListener("submit", async (e) => {
  e.preventDefault();
  const parceiro = normalizarTexto(modalParceiro.value);
  const maquina = normalizarTexto(modalNome.value);
  const situacao = normalizarSituacao(modalSituacao.value);
  const fechamentoMensal = normalizarFechamento(modalFechamento.value);
  const idAtual = modalIdAtual.value;

  try {
    validarFormulario(parceiro, maquina, idAtual);
    if (state.modalModo === "adicionar") {
      await addDoc(collection(db, "maquinas"), {
        parceiro,
        maquina,
        situacao,
        fechamentoMensal,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      alert("Registro adicionado com sucesso.");
    } else {
      await updateDoc(doc(db, "maquinas", idAtual), {
        parceiro,
        maquina,
        situacao,
        fechamentoMensal,
        updatedAt: serverTimestamp()
      });
      alert("Registro editado com sucesso.");
    }
    fecharModal();
    await carregar();
  } catch (err) {
    alert(err.message || "Não foi possível salvar.");
  }
});

tbody.addEventListener("click", async (e) => {
  const botao = e.target.closest("button[data-action]");
  if (!botao) return;

  const action = botao.dataset.action;
  const id = fromKey(botao.dataset.idKey || "");

  try {
    if (action === "salvar") {
      const idKey = botao.dataset.idKey || "";
      const situacaoEl = tbody.querySelector(`select.situacaoSelect[data-id-key="${idKey}"]`);
      const fechamentoEl = tbody.querySelector(`select.fechamentoSelect[data-id-key="${idKey}"]`);
      if (!situacaoEl || !fechamentoEl) return;
      await atualizarRegistro(id, situacaoEl.value, fechamentoEl.value);
      alert("Registro atualizado com sucesso.");
    }

    if (action === "editar") {
      const item = state.registros.find((r) => r.id === id);
      if (!item) throw new Error("Registro não encontrado.");
      abrirModalEditar(item);
    }

    if (action === "excluir") {
      const item = state.registros.find((r) => r.id === id);
      const ok = confirm(`Deseja excluir o registro "${item?.parceiro || "-"} / ${item?.maquina || "-"}"?`);
      if (!ok) return;
      await excluirRegistro(id);
      alert("Registro excluído com sucesso.");
    }
  } catch (err) {
    alert(err.message || "Não foi possível concluir a operação.");
  }
});

carregar().catch((err) => {
  const msg = String(err?.message || err || "");
  if (msg.includes("Missing or insufficient permissions")) {
    alert("Erro no Firebase: sem permissão para ler o Firestore. Publique regras permitindo acesso à coleção 'maquinas'.");
    return;
  }
  if (msg.toLowerCase().includes("index")) {
    alert("Erro no Firebase: índice ausente no Firestore. Crie o índice sugerido no link do erro do console.");
    return;
  }
  alert(`Erro ao carregar dados do Firebase: ${msg}`);
});
