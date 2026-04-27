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
const PAGAMENTO_OPTIONS = ["PENDENTE", "NAO PENDENTE"];
const SITUACAO_MAQUINA_OPTIONS = ["CONFIGURADA", "CONFIGURADA FORA DO PADRÃO", "NÃO CONFIGURADA"];
const PAGE_SIZE = 8;

const state = {
  registros: [],
  filtroTexto: "",
  filtroSituacao: "todos",
  filtroPagamento: "todos",
  filtroParceiro: "todos",
  filtroUnidade: "todos",
  filtroAgr: "todos",
  filtroSituacaoMaquina: "todos",
  ordenacao: "parceiro-asc",
  paginaAtual: 1,
  modalModo: "adicionar"
};

const tbody = document.getElementById("tbody");
const filtroTextoEl = document.getElementById("filtroTexto");
const filtroSituacaoEl = document.getElementById("filtroSituacao");
const filtroPagamentoEl = document.getElementById("filtroPagamento");
const filtroParceiroEl = document.getElementById("filtroParceiro");
const filtroUnidadeEl = document.getElementById("filtroUnidade");
const filtroAgrEl = document.getElementById("filtroAgr");
const filtroSituacaoMaquinaEl = document.getElementById("filtroSituacaoMaquina");
const ordenacaoEl = document.getElementById("ordenacao");
const paginationInfo = document.getElementById("paginationInfo");
const modal = document.getElementById("modalMaquina");
const modalTitulo = document.getElementById("modalTitulo");
const modalParceiro = document.getElementById("modalParceiro");
const modalNome = document.getElementById("modalNome");
const modalSituacao = document.getElementById("modalSituacao");
const modalPagamento = document.getElementById("modalPagamento");
const modalPix = document.getElementById("modalPix");
const modalUnidade = document.getElementById("modalUnidade");
const modalAgr = document.getElementById("modalAgr");
const modalSituacaoMaquina = document.getElementById("modalSituacaoMaquina");
const modalAgrFilhos = document.getElementById("modalAgrFilhos");
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

function normalizarPagamento(value) {
  const v = String(value || "").trim().toUpperCase();
  return PAGAMENTO_OPTIONS.includes(v) ? v : "PENDENTE";
}

function normalizarSituacaoMaquina(value) {
  const v = String(value || "").trim().toUpperCase();
  return SITUACAO_MAQUINA_OPTIONS.includes(v) ? v : "NÃO CONFIGURADA";
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
      pagamentoStatus: normalizarPagamento(data.pagamentoStatus || data.fechamentoMensal),
      pixParceiro: normalizarTexto(data.pixParceiro || ""),
      unidade: normalizarTexto(data.unidade || ""),
      agr: normalizarTexto(data.agr || ""),
      situacaoMaquina: normalizarSituacaoMaquina(data.situacaoMaquina || ""),
      agrFilhos: data.agrFilhos === true || data.agrFilhos === "true"
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

  // Filtro de Unidade
  const unidades = Array.from(
    new Set(state.registros.map((item) => item.unidade).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
  const valorUnidade = state.filtroUnidade;
  filtroUnidadeEl.innerHTML = '<option value="todos">Todas</option>';
  unidades.forEach((u) => {
    const option = document.createElement("option");
    option.value = u;
    option.textContent = u;
    filtroUnidadeEl.appendChild(option);
  });
  state.filtroUnidade = (valorUnidade === "todos" || unidades.includes(valorUnidade)) ? valorUnidade : "todos";
  filtroUnidadeEl.value = state.filtroUnidade;

  // Filtro de AGR
  const agrs = Array.from(
    new Set(state.registros.map((item) => item.agr).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
  const valorAgr = state.filtroAgr;
  filtroAgrEl.innerHTML = '<option value="todos">Todos</option>';
  agrs.forEach((a) => {
    const option = document.createElement("option");
    option.value = a;
    option.textContent = a;
    filtroAgrEl.appendChild(option);
  });
  state.filtroAgr = (valorAgr === "todos" || agrs.includes(valorAgr)) ? valorAgr : "todos";
  filtroAgrEl.value = state.filtroAgr;
}

function getSituacaoClass(situacao) {
  if (situacao === "PRODUCAO") return "status-Produção";
  if (situacao === "TREINAMENTO") return "status-Treinamento";
  return "status-Pendente";
}

function getSituacaoMaquinaClass(v) {
  if (v === "CONFIGURADA") return "status-maq-configurada";
  if (v === "CONFIGURADA FORA DO PADRÃO") return "status-maq-fora";
  return "status-maq-nao";
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

  if (state.filtroPagamento !== "todos") {
    dados = dados.filter((item) => item.pagamentoStatus === state.filtroPagamento);
  }

  if (state.filtroParceiro !== "todos") {
    dados = dados.filter((item) => item.parceiro === state.filtroParceiro);
  }

  if (state.filtroUnidade !== "todos") {
    dados = dados.filter((item) => item.unidade === state.filtroUnidade);
  }

  if (state.filtroAgr !== "todos") {
    dados = dados.filter((item) => item.agr === state.filtroAgr);
  }

  if (state.filtroSituacaoMaquina !== "todos") {
    dados = dados.filter((item) => item.situacaoMaquina === state.filtroSituacaoMaquina);
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
  const pago = state.registros.filter((m) => m.pagamentoStatus === "NAO_PENDENTE").length;
  const pendente = state.registros.filter((m) => m.pagamentoStatus === "PENDENTE").length;

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
    tr.innerHTML = `<td colspan="10" class="empty">Nenhum registro encontrado para os filtros selecionados.</td>`;
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
    const pagamentoOptions = PAGAMENTO_OPTIONS.map(
      (v) => `<option value="${v}" ${v === item.pagamentoStatus ? "selected" : ""}>${v}</option>`
    ).join("");

    const situacaoMaquinaOptions = SITUACAO_MAQUINA_OPTIONS.map(
      (v) => `<option value="${v}" ${v === item.situacaoMaquina ? "selected" : ""}>${v}</option>`
    ).join("");

    tr.innerHTML = `
      <td>${item.parceiro || "-"}</td>
      <td>${item.maquina}</td>
      <td>${item.unidade || "-"}</td>
      <td>${item.agr || "-"}</td>
      <td><span class="status-pill ${getSituacaoMaquinaClass(item.situacaoMaquina)}">${item.situacaoMaquina || "-"}</span></td>
      <td>${item.agrFilhos ? "✔ Sim" : "✘ Não"}</td>
      <td><span class="status-pill ${getSituacaoClass(item.situacao)}">${item.situacao}</span></td>
      <td><span class="status-pill ${getSituacaoClass(item.pagamentoStatus === "NAO_PENDENTE" ? "PRODUCAO" : "OUTRO")}">${item.pagamentoStatus}</span></td>
      <td>${item.pixParceiro || "-"}</td>
      <td class="actions-cell">
        <div class="action-buttons">
          <button class="btn btn-small btn-warning" data-action="toggle-menu" data-id-key="${idKey}">Editar</button>
          <button class="btn btn-small btn-danger" data-action="excluir" data-id-key="${idKey}">Excluir</button>
        </div>
        
        <div class="quick-edit-menu" id="menu-${idKey}">
          <label>Situação:</label>
          <select data-id-key="${idKey}" class="situacaoSelect">${situacaoOptions}</select>
          
          <label>Pagamento:</label>
          <select data-id-key="${idKey}" class="pagamentoSelect">${pagamentoOptions}</select>

          <label>Unidade:</label>
          <input data-id-key="${idKey}" class="unidadeInput" type="text" value="${item.unidade || ""}" placeholder="Unidade">

          <label>AGR:</label>
          <input data-id-key="${idKey}" class="agrInput" type="text" value="${item.agr || ""}" placeholder="AGR">

          <label>Situação da Máquina:</label>
          <select data-id-key="${idKey}" class="situacaoMaquinaSelect">${situacaoMaquinaOptions}</select>

          <label>AGR possui filhos?</label>
          <select data-id-key="${idKey}" class="agrFilhosSelect">
            <option value="false" ${!item.agrFilhos ? "selected" : ""}>Não</option>
            <option value="true" ${item.agrFilhos ? "selected" : ""}>Sim</option>
          </select>
          
          <label>Chave PIX:</label>
          <input data-id-key="${idKey}" class="pixInput" type="text" value="${item.pixParceiro || ""}" placeholder="PIX">
          
          <div class="quick-edit-actions">
            <button class="btn btn-small btn-success" data-action="salvar" data-id-key="${idKey}">Salvar</button>
            <button class="btn btn-small btn-ghost" data-action="fechar-menu" data-id-key="${idKey}">Cancelar</button>
          </div>
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

async function atualizarRegistro(id, situacao, pagamentoStatus, pixParceiro, unidade, agr, situacaoMaquina, agrFilhos) {
  await updateDoc(doc(db, "maquinas", id), {
    situacao: normalizarSituacao(situacao),
    pagamentoStatus: normalizarPagamento(pagamentoStatus),
    pixParceiro: normalizarTexto(pixParceiro),
    unidade: normalizarTexto(unidade),
    agr: normalizarTexto(agr),
    situacaoMaquina: normalizarSituacaoMaquina(situacaoMaquina),
    agrFilhos: agrFilhos === true || agrFilhos === "true",
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
  modalPagamento.value = "PENDENTE";
  modalPix.value = "";
  modalUnidade.value = "";
  modalAgr.value = "";
  modalSituacaoMaquina.value = "NÃO CONFIGURADA";
  modalAgrFilhos.value = "false";
  modalIdAtual.value = "";
  modal.classList.remove("hidden");
}

function abrirModalEditar(item) {
  state.modalModo = "editar";
  modalTitulo.textContent = "Editar Registro";
  modalParceiro.value = item.parceiro;
  modalNome.value = item.maquina;
  modalSituacao.value = item.situacao;
  modalPagamento.value = item.pagamentoStatus;
  modalPix.value = item.pixParceiro || "";
  modalUnidade.value = item.unidade || "";
  modalAgr.value = item.agr || "";
  modalSituacaoMaquina.value = item.situacaoMaquina || "NÃO CONFIGURADA";
  modalAgrFilhos.value = item.agrFilhos ? "true" : "false";
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

filtroPagamentoEl.addEventListener("change", (e) => {
  state.filtroPagamento = e.target.value;
  state.paginaAtual = 1;
  render();
});

filtroParceiroEl.addEventListener("change", (e) => {
  state.filtroParceiro = e.target.value;
  state.paginaAtual = 1;
  render();
});

filtroUnidadeEl.addEventListener("change", (e) => {
  state.filtroUnidade = e.target.value;
  state.paginaAtual = 1;
  render();
});

filtroAgrEl.addEventListener("change", (e) => {
  state.filtroAgr = e.target.value;
  state.paginaAtual = 1;
  render();
});

filtroSituacaoMaquinaEl.addEventListener("change", (e) => {
  state.filtroSituacaoMaquina = e.target.value;
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
  const pagamentoStatus = normalizarPagamento(modalPagamento.value);
  const pixParceiro = normalizarTexto(modalPix.value);
  const unidade = normalizarTexto(modalUnidade.value);
  const agr = normalizarTexto(modalAgr.value);
  const situacaoMaquina = normalizarSituacaoMaquina(modalSituacaoMaquina.value);
  const agrFilhos = modalAgrFilhos.value === "true";
  const idAtual = modalIdAtual.value;

  try {
    validarFormulario(parceiro, maquina, idAtual);
    if (state.modalModo === "adicionar") {
      await addDoc(collection(db, "maquinas"), {
        parceiro,
        maquina,
        situacao,
        pagamentoStatus,
        pixParceiro,
        unidade,
        agr,
        situacaoMaquina,
        agrFilhos,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      alert("Registro adicionado com sucesso.");
    } else {
      await updateDoc(doc(db, "maquinas", idAtual), {
        parceiro,
        maquina,
        situacao,
        pagamentoStatus,
        pixParceiro,
        unidade,
        agr,
        situacaoMaquina,
        agrFilhos,
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
  const idKey = botao.dataset.idKey || "";
  const id = fromKey(idKey);

  try {
    // ABRE OU FECHA O MENU DE EDIÇÃO RÁPIDA
    if (action === "toggle-menu") {
      // Opcional: Fecha outros menus abertos para não poluir a tela
      document.querySelectorAll(".quick-edit-menu.active").forEach(m => {
        if (m.id !== `menu-${idKey}`) m.classList.remove("active");
      });
      
      const menu = document.getElementById(`menu-${idKey}`);
      if (menu) menu.classList.toggle("active");
      return;
    }

    // FECHA O MENU PELO BOTÃO CANCELAR
    if (action === "fechar-menu") {
      const menu = document.getElementById(`menu-${idKey}`);
      if (menu) menu.classList.remove("active");
      return;
    }

    // SALVAR DADOS DO MENU RÁPIDO
    if (action === "salvar") {
      const situacaoEl = tbody.querySelector(`select.situacaoSelect[data-id-key="${idKey}"]`);
      const pagamentoEl = tbody.querySelector(`select.pagamentoSelect[data-id-key="${idKey}"]`);
      const pixEl = tbody.querySelector(`input.pixInput[data-id-key="${idKey}"]`);
      const unidadeEl = tbody.querySelector(`input.unidadeInput[data-id-key="${idKey}"]`);
      const agrEl = tbody.querySelector(`input.agrInput[data-id-key="${idKey}"]`);
      const situacaoMaquinaEl = tbody.querySelector(`select.situacaoMaquinaSelect[data-id-key="${idKey}"]`);
      const agrFilhosEl = tbody.querySelector(`select.agrFilhosSelect[data-id-key="${idKey}"]`);
      
      if (!situacaoEl || !pagamentoEl || !pixEl) return;
      await atualizarRegistro(
        id,
        situacaoEl.value,
        pagamentoEl.value,
        pixEl.value,
        unidadeEl?.value || "",
        agrEl?.value || "",
        situacaoMaquinaEl?.value || "",
        agrFilhosEl?.value || "false"
      );
      alert("Registro atualizado com sucesso.");
      
      const menu = document.getElementById(`menu-${idKey}`);
      if (menu) menu.classList.remove("active");
      return;
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