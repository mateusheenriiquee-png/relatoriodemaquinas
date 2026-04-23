const apiURL = "/.netlify/functions/api";
const STATUS_OPTIONS = ["PENDENTE", "CONCLUIDO", "Cadastrado"];
const PAGE_SIZE = 8;

const state = {
  maquinas: [],
  filtroTexto: "",
  filtroStatus: "todos",
  ordenacao: "nome-asc",
  paginaAtual: 1,
  modalModo: "adicionar"
};

const tbody = document.getElementById("tbody");
const filtroTextoEl = document.getElementById("filtroTexto");
const filtroStatusEl = document.getElementById("filtroStatus");
const ordenacaoEl = document.getElementById("ordenacao");
const paginationInfo = document.getElementById("paginationInfo");
const modal = document.getElementById("modalMaquina");
const modalTitulo = document.getElementById("modalTitulo");
const modalNome = document.getElementById("modalNome");
const modalStatus = document.getElementById("modalStatus");
const modalMaquinaAtual = document.getElementById("modalMaquinaAtual");
const formMaquina = document.getElementById("formMaquina");

function toKey(value) {
  return encodeURIComponent(value);
}

function fromKey(value) {
  return decodeURIComponent(value);
}

function normalizarNome(nome) {
  return (nome || "").trim().toLowerCase();
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
  const res = await fetch(`${apiURL}?acao=listar`);
  if (!res.ok) throw new Error("Falha ao carregar dados.");
  const data = await res.json();
  if (!data.ok) throw new Error(data.message || "Erro ao carregar dados.");
  state.maquinas = (data.data || []).filter((item) => item.maquina);

  render();
}

function getStatusClass(status) {
  if (status === "CONCLUIDO") return "status-Produção";
  if (status === "Cadastrado") return "status-Treinamento";
  return "status-Pendente";
}

function getMaquinasFiltradas() {
  let dados = [...state.maquinas];

  if (state.filtroTexto) {
    const termo = state.filtroTexto.toLowerCase();
    dados = dados.filter((item) => item.maquina.toLowerCase().includes(termo));
  }

  if (state.filtroStatus !== "todos") {
    dados = dados.filter((item) => item.status === state.filtroStatus);
  }

  if (state.ordenacao === "nome-asc") {
    dados.sort((a, b) => compararNomeNatural(a.maquina, b.maquina));
  } else if (state.ordenacao === "nome-desc") {
    dados.sort((a, b) => compararNomeNatural(b.maquina, a.maquina));
  } else if (state.ordenacao === "status") {
    dados.sort((a, b) => a.status.localeCompare(b.status, "pt-BR"));
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
  const total = state.maquinas.length;
  const treinamento = state.maquinas.filter((m) => m.status === "Cadastrado").length;
  const pendente = state.maquinas.filter((m) => m.status === "PENDENTE").length;
  const producao = state.maquinas.filter((m) => m.status === "CONCLUIDO").length;

  document.getElementById("statTotal").textContent = String(total);
  document.getElementById("statTreinamento").textContent = String(treinamento);
  document.getElementById("statPendente").textContent = String(pendente);
  document.getElementById("statProducao").textContent = String(producao);
}

function render() {
  tbody.innerHTML = "";
  const dados = getMaquinasFiltradas();
  const { totalPaginas, inicio, fim } = calcularPaginacao(dados.length);
  const dadosPaginados = dados.slice(inicio, fim);

  if (!dadosPaginados.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="3" class="empty">Nenhum registro encontrado para os filtros selecionados.</td>`;
    tbody.appendChild(tr);
    atualizarEstatisticas();
    atualizarRodapePaginacao(0, 0, totalPaginas);
    return;
  }

  dadosPaginados.forEach((item) => {
    const tr = document.createElement("tr");
    const maquinaKey = toKey(item.maquina);
    const options = STATUS_OPTIONS.map(
      (status) => `<option value="${status}" ${status === item.status ? "selected" : ""}>${status}</option>`
    ).join("");

    tr.innerHTML = `
      <td>${item.maquina}</td>
      <td><span class="status-pill ${getStatusClass(item.status)}">${item.status}</span></td>
      <td>
        <div class="table-actions">
          <select data-maquina-key="${maquinaKey}" class="statusSelect">${options}</select>
          <button class="btn btn-small btn-success" data-action="salvar" data-maquina-key="${maquinaKey}">Salvar</button>
          <button class="btn btn-small btn-warning" data-action="editar" data-maquina-key="${maquinaKey}" data-status="${item.status}">Editar</button>
          <button class="btn btn-small btn-danger" data-action="excluir" data-maquina-key="${maquinaKey}">Excluir</button>
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

async function chamarAPI(payload) {
  const res = await fetch(apiURL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) throw new Error("Falha ao processar a solicitação.");
  const data = await res.json();
  if (!data.ok) {
    throw new Error(data.message || "Não foi possível concluir a operação.");
  }
  return data;
}

async function atualizar(maquina, status) {
  await chamarAPI({ acao: "atualizarStatus", maquina, status });
  await carregar();
}

async function excluirMaquina(maquina) {
  await chamarAPI({ acao: "excluir", maquina });
  await carregar();
}

function abrirModalAdicionar() {
  state.modalModo = "adicionar";
  modalTitulo.textContent = "Nova Máquina";
  modalNome.value = "";
  modalStatus.value = "PENDENTE";
  modalMaquinaAtual.value = "";
  modal.classList.remove("hidden");
}

function abrirModalEditar(maquinaAtual, statusAtual) {
  state.modalModo = "editar";
  modalTitulo.textContent = "Editar Máquina";
  modalNome.value = maquinaAtual;
  modalStatus.value = statusAtual;
  modalMaquinaAtual.value = maquinaAtual;
  modal.classList.remove("hidden");
}

function fecharModal() {
  modal.classList.add("hidden");
}

function validarFormulario(nome, maquinaAtual) {
  if (!nome || nome.length < 2) {
    throw new Error("Informe um nome com pelo menos 2 caracteres.");
  }

  const nomeNormalizado = normalizarNome(nome);
  const atualNormalizado = normalizarNome(maquinaAtual);
  const existeLocal = state.maquinas.some((m) => {
    const atual = normalizarNome(m.maquina);
    if (state.modalModo === "editar" && atual === atualNormalizado) {
      return false;
    }
    return atual === nomeNormalizado;
  });
  if (existeLocal) {
    throw new Error("Já existe uma máquina com esse nome.");
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

filtroStatusEl.addEventListener("change", (e) => {
  state.filtroStatus = e.target.value;
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
  const nome = modalNome.value.trim();
  const status = modalStatus.value;
  const maquinaAtual = modalMaquinaAtual.value;

  try {
    validarFormulario(nome, maquinaAtual);
    if (state.modalModo === "adicionar") {
      await chamarAPI({ acao: "adicionar", maquina: nome, status });
      alert("Máquina adicionada com sucesso.");
    } else {
      await chamarAPI({
        acao: "editar",
        maquinaAtual,
        novaMaquina: nome,
        novoStatus: status
      });
      alert("Máquina editada com sucesso.");
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
  const maquina = fromKey(botao.dataset.maquinaKey || "");

  try {
    if (action === "salvar") {
      const maquinaKey = botao.dataset.maquinaKey || "";
      const select = tbody.querySelector(`select.statusSelect[data-maquina-key="${maquinaKey}"]`);
      if (!select) return;
      await atualizar(maquina, select.value);
      alert("Status atualizado com sucesso.");
    }

    if (action === "editar") {
      abrirModalEditar(maquina, botao.dataset.status || "PENDENTE");
    }

    if (action === "excluir") {
      const ok = confirm(`Deseja excluir a máquina "${maquina}"?`);
      if (!ok) return;
      await excluirMaquina(maquina);
      alert("Máquina excluída com sucesso.");
    }
  } catch (err) {
    alert(err.message || "Não foi possível concluir a operação.");
  }
});

carregar().catch(() => alert("Erro ao carregar dados da planilha."));
