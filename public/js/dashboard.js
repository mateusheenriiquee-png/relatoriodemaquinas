import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { db } from "./config/firebase.js";
import { authManager } from "./auth.js";

const COLLECTION = "suportes_tecnicos";
const STATUS_FINALIZADO = "FINALIZADO";
const STATUS_OPTIONS = ["EM ABERTO", "EM ANDAMENTO", "FINALIZADO", "SEM RETORNO", "REAGENDADO"];

const state = {
  registros: [],
  filtroPeriodo: "30",
  filtroAc: "todos",
  filtroTecnico: "todos"
};

const charts = {};

const filtroPeriodoEl = document.getElementById("filtroPeriodo");
const filtroAcEl = document.getElementById("filtroAcDashboard");
const filtroTecnicoEl = document.getElementById("filtroTecnicoDashboard");

const norm = (v) => String(v || "").trim().replace(/\s+/g, " ");
function normStatus(v) {
  const s = norm(v).toUpperCase();
  if (STATUS_OPTIONS.includes(s)) return s;
  if (/REAGEND/.test(s)) return "REAGENDADO";
  if (/TRATATIV|ANDAMENTO|ATENDIMENTO/.test(s)) return "EM ANDAMENTO";
  if (/FINALIZ|CONCLUID|RESOLVID/.test(s)) return "FINALIZADO";
  if (/SEM RETORNO/.test(s)) return "SEM RETORNO";
  return "EM ABERTO";
}

/** Cores fixas por situação — não personalizáveis para manter leitura consistente */
const STATUS_CHART_COLORS = {
  "EM ABERTO": "#dc2626",
  "EM ANDAMENTO": "#2563eb",
  FINALIZADO: "#16a34a",
  REAGENDADO: "#d97706",
  "SEM RETORNO": "#6b7280"
};

function statusChartColor(status) {
  const s = normStatus(status);
  return STATUS_CHART_COLORS[s] || getChartTheme().barColors[0];
}

function normStatusAbertura(v) {
  const s = norm(v).toUpperCase();
  if (s.includes("INDEV")) return "INDEVIDO";
  if (s.includes("DEVID")) return "DEVIDO";
  return s ? "OUTRO" : "NAO INFORMADO";
}

function toDate(value) {
  if (!value) return null;
  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (value && typeof value.toDate === "function") {
    return value.toDate();
  }
  return null;
}

function resolverDataAbertura(data = {}) {
  const dataWebhook = norm(data.dataAbertura || data.carimboDataHora || "");
  if (dataWebhook) {
    const d = new Date(dataWebhook);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return toDate(data.createdAt);
}

function mapDoc(id, data) {
  return {
    id,
    protocolo: norm(data.protocolo || data.idSuporte || ""),
    responsavelAbertura: norm(data.responsavelAbertura || data.responsavel || data.cliente || "") || "Não informado",
    cpfCnpj: norm(data.cpfCnpj || data.cpf_cnpj || ""),
    tipo: norm(data.tipo || "") || "Não informado",
    ac: norm(data.ac || data.AC || "") || "Não informado",
    tecnico: norm(data.tecnico || data.tecnicoResponsavel || "") || "Não atribuído",
    status: normStatus(data.status || data.situacao || data.situacaoAtendimento || "EM ABERTO"),
    statusAbertura: normStatusAbertura(data.statusAbertura || ""),
    dataAbertura: resolverDataAbertura(data),
    dataAtualizacao: toDate(data.updatedAt)
  };
}

function horasEntre(inicio, fim) {
  if (!inicio || !fim) return null;
  const diffMs = fim.getTime() - inicio.getTime();
  if (diffMs < 0) return null;
  return diffMs / (1000 * 60 * 60);
}

function formatHoras(h) {
  if (h === null || h === undefined) return "—";
  if (h < 24) return `${h.toFixed(1)} h`;
  return `${(h / 24).toFixed(1)} d`;
}

function percent(parte, total) {
  if (!total) return "0%";
  return `${Math.round((parte / total) * 100)}%`;
}

function media(arr) {
  const validos = arr.filter((n) => n !== null && n !== undefined && !Number.isNaN(n));
  if (!validos.length) return null;
  return validos.reduce((a, b) => a + b, 0) / validos.length;
}

function agruparContagem(lista, chaveFn) {
  const map = new Map();
  lista.forEach((item) => {
    const chave = chaveFn(item);
    map.set(chave, (map.get(chave) || 0) + 1);
  });
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

function getRegistrosFiltrados() {
  let dados = [...state.registros];
  const dias = Number(state.filtroPeriodo);
  if (dias && !Number.isNaN(dias)) {
    const limite = Date.now() - dias * 24 * 60 * 60 * 1000;
    dados = dados.filter((r) => r.dataAbertura && r.dataAbertura.getTime() >= limite);
  }
  if (state.filtroAc !== "todos") {
    dados = dados.filter((r) => r.ac === state.filtroAc);
  }
  if (state.filtroTecnico !== "todos") {
    dados = dados.filter((r) => r.tecnico === state.filtroTecnico);
  }
  return dados;
}

function atualizarFiltrosDinamicos() {
  const acs = [...new Set(state.registros.map((r) => r.ac).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "pt-BR", { sensitivity: "base" })
  );
  const tecnicos = [...new Set(state.registros.map((r) => r.tecnico).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "pt-BR", { sensitivity: "base" })
  );

  const acAtual = state.filtroAc;
  filtroAcEl.innerHTML = '<option value="todos">Todas</option>';
  acs.forEach((nome) => {
    const opt = document.createElement("option");
    opt.value = nome;
    opt.textContent = nome;
    filtroAcEl.appendChild(opt);
  });
  state.filtroAc = acAtual === "todos" || acs.includes(acAtual) ? acAtual : "todos";
  filtroAcEl.value = state.filtroAc;

  const tecAtual = state.filtroTecnico;
  filtroTecnicoEl.innerHTML = '<option value="todos">Todos</option>';
  tecnicos.forEach((nome) => {
    const opt = document.createElement("option");
    opt.value = nome;
    opt.textContent = nome;
    filtroTecnicoEl.appendChild(opt);
  });
  state.filtroTecnico = tecAtual === "todos" || tecnicos.includes(tecAtual) ? tecAtual : "todos";
  filtroTecnicoEl.value = state.filtroTecnico;
}

function destroyChart(id) {
  if (charts[id]) {
    charts[id].destroy();
    delete charts[id];
  }
}

const CHART_COLORS_STORAGE_KEY = "suporte-dashboard-chart-colors";

const DEFAULT_CHART_COLORS = {
  bar1: "#E7B111",
  bar2: "#f5c842",
  bar3: "#c49a0e",
  bar4: "#9a7b0a",
  devido: "#E7B111",
  indevido: "#c49a0e",
  pendente: "#f5c842"
};

let chartColorPrefs = { ...DEFAULT_CHART_COLORS };

function cssVar(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function getChartTheme() {
  return {
    barColors: [
      chartColorPrefs.bar1,
      chartColorPrefs.bar2,
      chartColorPrefs.bar3,
      chartColorPrefs.bar4
    ],
    devido: chartColorPrefs.devido,
    indevido: chartColorPrefs.indevido,
    pendente: chartColorPrefs.pendente,
    finalizado: STATUS_CHART_COLORS.FINALIZADO,
    muted: cssVar("--muted", "#5c5c5c"),
    grid: "rgba(231, 177, 17, 0.2)"
  };
}

function loadChartColorPrefs() {
  try {
    const raw = localStorage.getItem(CHART_COLORS_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    chartColorPrefs = { ...DEFAULT_CHART_COLORS, ...parsed };
  } catch {
    chartColorPrefs = { ...DEFAULT_CHART_COLORS };
  }
}

function saveChartColorPrefs() {
  localStorage.setItem(CHART_COLORS_STORAGE_KEY, JSON.stringify(chartColorPrefs));
}

function syncChartColorInputs() {
  const map = {
    chartColor1: "bar1",
    chartColor2: "bar2",
    chartColor3: "bar3",
    chartColor4: "bar4",
    chartColorDevido: "devido",
    chartColorIndevido: "indevido",
    chartColorPendente: "pendente"
  };
  Object.entries(map).forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (el) el.value = chartColorPrefs[key];
  });
}

function bindChartColorControls() {
  const map = {
    chartColor1: "bar1",
    chartColor2: "bar2",
    chartColor3: "bar3",
    chartColor4: "bar4",
    chartColorDevido: "devido",
    chartColorIndevido: "indevido",
    chartColorPendente: "pendente"
  };
  Object.entries(map).forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", () => {
      chartColorPrefs[key] = el.value;
      saveChartColorPrefs();
      render();
    });
  });
  document.getElementById("btnResetChartColors")?.addEventListener("click", () => {
    chartColorPrefs = { ...DEFAULT_CHART_COLORS };
    saveChartColorPrefs();
    syncChartColorInputs();
    render();
  });
}

function getBarColors(count) {
  const colors = getChartTheme().barColors;
  return Array.from({ length: count }, (_, index) => colors[index % colors.length]);
}

function chartDefaults() {
  const theme = getChartTheme();
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: "bottom",
        labels: {
          boxWidth: 10,
          padding: 10,
          color: theme.muted,
          font: { size: 10, family: "Segoe UI" }
        }
      }
    }
  };
}

function axisStyle() {
  const theme = getChartTheme();
  return {
    ticks: { color: theme.muted, font: { size: 9, family: "Segoe UI" } },
    grid: { color: theme.grid },
    border: { display: false }
  };
}

function mergeChartOptions(custom = {}) {
  const hasScales = custom.scales || custom.indexAxis !== undefined;
  const baseScales = hasScales
    ? {
        x: { ...axisStyle(), ...(custom.scales?.x || {}) },
        y: { ...axisStyle(), ...(custom.scales?.y || {}) }
      }
    : undefined;
  const defaults = chartDefaults();
  return {
    ...defaults,
    ...custom,
    plugins: { ...defaults.plugins, ...(custom.plugins || {}) },
    scales: custom.scales ? { ...baseScales, ...custom.scales } : baseScales
  };
}

function renderChart(id, config) {
  destroyChart(id);
  const canvas = document.getElementById(id);
  if (!canvas) return;
  charts[id] = new Chart(canvas, {
    ...config,
    options: mergeChartOptions(config.options || {})
  });
}

function renderKpis(dados) {
  const total = dados.length;
  const finalizados = dados.filter((r) => r.status === STATUS_FINALIZADO).length;
  const naoFinalizados = total - finalizados;
  const semRetorno = dados.filter((r) => r.status === "SEM RETORNO").length;

  const temposFinalizados = dados
    .filter((r) => r.status === STATUS_FINALIZADO)
    .map((r) => horasEntre(r.dataAbertura, r.dataAtualizacao))
    .filter((h) => h !== null);

  document.getElementById("kpiTotal").textContent = String(total);
  document.getElementById("kpiFinalizados").textContent = String(finalizados);
  document.getElementById("kpiNaoFinalizados").textContent = String(naoFinalizados);
  document.getElementById("kpiTaxaFinalizacao").textContent = percent(finalizados, total);
  document.getElementById("kpiTempoMedioGeral").textContent = formatHoras(media(temposFinalizados));
  document.getElementById("kpiSemRetorno").textContent = String(semRetorno);
}

function renderCharts(dados) {
  const theme = getChartTheme();
  const porTecnico = agruparContagem(dados, (r) => r.tecnico);
  renderChart("chartPorTecnico", {
    type: "bar",
    data: {
      labels: porTecnico.map(([k]) => k),
      datasets: [{
        label: "Suportes",
        data: porTecnico.map(([, v]) => v),
        backgroundColor: getBarColors(porTecnico.length),
        borderRadius: 8
      }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { maxRotation: 45, minRotation: 0 } }
      }
    }
  });

  const finalizados = dados.filter((r) => r.status === STATUS_FINALIZADO).length;
  const naoFinalizados = dados.length - finalizados;
  renderChart("chartFinalizacao", {
    type: "doughnut",
    data: {
      labels: ["Fin.", "Pend."],
      datasets: [{
        data: [finalizados, naoFinalizados],
        backgroundColor: [theme.finalizado, theme.pendente],
        borderWidth: 0
      }]
    },
    options: { cutout: "62%", plugins: { legend: { display: true, position: "bottom" } } }
  });

  const porStatus = agruparContagem(dados, (r) => r.status);
  renderChart("chartStatus", {
    type: "doughnut",
    data: {
      labels: porStatus.map(([k]) => k),
      datasets: [{
        data: porStatus.map(([, v]) => v),
        backgroundColor: porStatus.map(([k]) => statusChartColor(k)),
        borderWidth: 0
      }]
    },
    options: { cutout: "62%", plugins: { legend: { display: true, position: "bottom" } } }
  });

  const tempoPorTecnico = agruparContagem(
    dados.filter((r) => r.status === STATUS_FINALIZADO),
    (r) => r.tecnico
  ).map(([tecnico]) => {
    const tempos = dados
      .filter((r) => r.tecnico === tecnico && r.status === STATUS_FINALIZADO)
      .map((r) => horasEntre(r.dataAbertura, r.dataAtualizacao))
      .filter((h) => h !== null);
    return [tecnico, media(tempos) || 0];
  });

  renderChart("chartTempoTecnico", {
    type: "bar",
    data: {
      labels: tempoPorTecnico.map(([k]) => k),
      datasets: [{
        label: "Horas",
        data: tempoPorTecnico.map(([, v]) => Number(v.toFixed(1))),
        backgroundColor: getBarColors(tempoPorTecnico.length),
        borderRadius: 8
      }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { maxRotation: 45 } },
        y: { beginAtZero: true }
      }
    }
  });

  const responsaveis = [...new Set(dados.map((r) => r.responsavelAbertura))].slice(0, 8);
  const devidoData = responsaveis.map((nome) =>
    dados.filter((r) => r.responsavelAbertura === nome && r.statusAbertura === "DEVIDO").length
  );
  const indevidoData = responsaveis.map((nome) =>
    dados.filter((r) => r.responsavelAbertura === nome && r.statusAbertura === "INDEVIDO").length
  );

  renderChart("chartDevidoResponsavel", {
    type: "bar",
    data: {
      labels: responsaveis,
      datasets: [
        { label: "Devido", data: devidoData, backgroundColor: theme.devido, borderRadius: 6 },
        { label: "Indevido", data: indevidoData, backgroundColor: theme.indevido, borderRadius: 6 }
      ]
    },
    options: {
      plugins: { legend: { display: true, position: "bottom" } },
      scales: {
        x: { stacked: true, ticks: { maxRotation: 60 } },
        y: { stacked: true, beginAtZero: true }
      }
    }
  });

  const porAc = agruparContagem(dados, (r) => r.ac).slice(0, 6);
  renderChart("chartPorAc", {
    type: "bar",
    data: {
      labels: porAc.map(([k]) => k),
      datasets: [{ label: "Suportes", data: porAc.map(([, v]) => v), backgroundColor: getBarColors(porAc.length), borderRadius: 8 }]
    },
    options: {
      indexAxis: "y",
      plugins: { legend: { display: false } }
    }
  });

  const porTipo = agruparContagem(dados, (r) => r.tipo).slice(0, 6);
  renderChart("chartPorTipo", {
    type: "bar",
    data: {
      labels: porTipo.map(([k]) => k),
      datasets: [{ label: "Suportes", data: porTipo.map(([, v]) => v), backgroundColor: getBarColors(porTipo.length), borderRadius: 8 }]
    },
    options: {
      indexAxis: "y",
      plugins: { legend: { display: false } }
    }
  });
}

function renderTabelas(dados) {
  const tbodyRanking = document.getElementById("tbodyRanking");
  const tbodyResponsavel = document.getElementById("tbodyResponsavel");
  tbodyRanking.innerHTML = "";
  tbodyResponsavel.innerHTML = "";

  const porTecnico = agruparContagem(dados, (r) => r.tecnico);
  porTecnico.forEach(([tecnico, total]) => {
    const doTecnico = dados.filter((r) => r.tecnico === tecnico);
    const fin = doTecnico.filter((r) => r.status === STATUS_FINALIZADO).length;
    const andamento = doTecnico.filter((r) => r.status === "EM ANDAMENTO").length;
    const aberto = doTecnico.filter((r) => r.status === "EM ABERTO").length;
    const semRetorno = doTecnico.filter((r) => r.status === "SEM RETORNO").length;
    const tempos = doTecnico
      .filter((r) => r.status === STATUS_FINALIZADO)
      .map((r) => horasEntre(r.dataAbertura, r.dataAtualizacao))
      .filter((h) => h !== null);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${tecnico}</td>
      <td>${total}</td>
      <td>${fin}</td>
      <td>${andamento}</td>
      <td>${aberto}</td>
      <td>${semRetorno}</td>
      <td>${percent(fin, total)}</td>
      <td>${formatHoras(media(tempos))}</td>
    `;
    tbodyRanking.appendChild(tr);
  });

  const porResponsavel = agruparContagem(dados, (r) => r.responsavelAbertura);
  porResponsavel.forEach(([nome, total]) => {
    const doResp = dados.filter((r) => r.responsavelAbertura === nome);
    const devido = doResp.filter((r) => r.statusAbertura === "DEVIDO").length;
    const indevido = doResp.filter((r) => r.statusAbertura === "INDEVIDO").length;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${nome}</td>
      <td>${total}</td>
      <td>${devido}</td>
      <td>${indevido}</td>
      <td>${percent(indevido, total)}</td>
    `;
    tbodyResponsavel.appendChild(tr);
  });
}

function render() {
  const dados = getRegistrosFiltrados();
  const emptyEl = document.getElementById("dashboardEmpty");
  emptyEl.classList.toggle("hidden", dados.length > 0);

  if (!dados.length) {
    renderKpis([]);
    renderTabelas([]);
    Object.keys(charts).forEach(destroyChart);
    return;
  }

  renderKpis(dados);
  renderCharts(dados);
  renderTabelas(dados);
}

async function carregar() {
  const loading = document.getElementById("dashboardLoading");
  loading.classList.remove("hidden");
  try {
    const snap = await getDocs(collection(db, COLLECTION));
    state.registros = snap.docs.map((d) => mapDoc(d.id, d.data()));
    atualizarFiltrosDinamicos();
    render();
  } finally {
    loading.classList.add("hidden");
  }
}

filtroPeriodoEl.addEventListener("change", (e) => {
  state.filtroPeriodo = e.target.value;
  render();
});
filtroAcEl.addEventListener("change", (e) => {
  state.filtroAc = e.target.value;
  render();
});
filtroTecnicoEl.addEventListener("change", (e) => {
  state.filtroTecnico = e.target.value;
  render();
});
document.getElementById("btnRecarregarDashboard").addEventListener("click", () => {
  carregar().catch((err) => alert(err.message || "Erro ao recarregar."));
});

loadChartColorPrefs();
syncChartColorInputs();
bindChartColorControls();

async function protegerPaginaDashboard() {
  await authManager.initialize();

  if (!authManager.isAuthenticated()) {
    window.location.href = "./login.html";
    return;
  }

  // Apenas admins podem acessar o dashboard
  if (!authManager.isAdmin()) {
    alert("Você não tem permissão para acessar o dashboard. Apenas administradores podem visualizar este relatório.");
    window.location.href = "./index.html";
    return;
  }

  const userDisplayName = authManager.getUserDisplayName();
  const header = document.querySelector("header");
  if (header) {
    const actionsDiv = header.querySelector(".dashboard-actions");
    if (actionsDiv) {
      const userInfo = document.createElement("span");
      userInfo.className = "user-info";
      userInfo.innerHTML = `
        <span style="margin-right: 12px;">👤 ${userDisplayName}</span>
        <button id="btnLogoutDash" class="btn btn-ghost btn-small" style="margin: 0;">Logout</button>
      `;
      actionsDiv.appendChild(userInfo);

      document.getElementById("btnLogoutDash").addEventListener("click", async () => {
        await authManager.logout();
        window.location.href = "./login.html";
      });
    }
  }
}

protegerPaginaDashboard();

carregar().catch((err) => {
  alert(`Erro ao carregar dashboard: ${String(err?.message || err || "")}`);
});
