import { authManager } from "../auth.js";

const tabs = document.querySelectorAll(".admin-tab");
const sections = document.querySelectorAll(".admin-section");
const novoUsuarioForm = document.getElementById("novoUsuarioForm");
const newUserEmail = document.getElementById("newUserEmail");
const newUserPassword = document.getElementById("newUserPassword");
const newUserName = document.getElementById("newUserName");
const newUserCargo = document.getElementById("newUserCargo");
const usuariosTableBody = document.getElementById("usuariosTableBody");
const btnAdminLogout = document.getElementById("btnAdminLogout");
const btnSaveAdminEmail = document.getElementById("btnSaveAdminEmail");
const adminEmailConfig = document.getElementById("adminEmailConfig");

function showMessage(elementId, message, type = "success") {
  const element = document.getElementById(elementId);
  element.className = `admin-message ${type}`;
  element.textContent = message;
  setTimeout(() => {
    element.className = "admin-message";
  }, 4000);
}

function formatDate(dateString) {
  if (!dateString) return "-";
  const date = new Date(dateString);
  return date.toLocaleDateString("pt-BR");
}

async function carregarUsuarios() {
  const usuarios = await authManager.getUsers();
  const tbody = document.getElementById("usuariosTableBody");

  if (!usuarios || usuarios.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-message">Nenhum usuário encontrado.</td></tr>';
    return;
  }

  tbody.innerHTML = usuarios
    .map(
      (user) => `
    <tr>
      <td>${user.email}</td>
      <td>${user.displayName || "-"}</td>
      <td>
        <span class="cargo-badge ${user.cargo || "operador"}">
          ${(user.cargo || "operador").toUpperCase()}
        </span>
      </td>
      <td>${formatDate(user.createdAt)}</td>
      <td>
        <div class="table-actions">
          <button class="btn btn-small btn-ghost" data-action="edit-cargo" data-id="${user.id}">
            Alterar Cargo
          </button>
          <button class="btn btn-small btn-ghost" data-action="delete" data-id="${user.id}">
            Excluir
          </button>
        </div>
      </td>
    </tr>
  `
    )
    .join("");

  document.querySelectorAll('[data-action="edit-cargo"]').forEach((btn) => {
    btn.addEventListener("click", () => abrirModalAlterarCargo(btn.dataset.id));
  });

  document.querySelectorAll('[data-action="delete"]').forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (confirm("Tem certeza que deseja excluir este usuário?")) {
        await excluirUsuario(btn.dataset.id);
      }
    });
  });
}

async function abrirModalAlterarCargo(userId) {
  const usuario = (await authManager.getUsers()).find((u) => u.id === userId);
  if (!usuario) return;

  const cargoAtual = usuario.cargo || "operador";
  const novoCargo = cargoAtual === "admin" ? "operador" : "admin";

  if (
    confirm(
      `Alterar cargo de ${usuario.displayName || usuario.email} para ${novoCargo.toUpperCase()}?`
    )
  ) {
    await authManager.updateUserCargo(userId, novoCargo);
    await carregarUsuarios();
    showMessage("usuariosMessage", "Cargo atualizado com sucesso!");
  }
}

async function excluirUsuario(userId) {
  const result = await authManager.deleteUser(userId);
  if (result.success) {
    await carregarUsuarios();
    showMessage("usuariosMessage", "Usuário excluído com sucesso!");
  } else {
    showMessage("usuariosMessage", "Erro ao excluir usuário.", "error");
  }
}

async function inicializar() {
  await authManager.initialize();

  if (!authManager.isAuthenticated()) {
    window.location.href = "./login.html";
    return;
  }

  if (!authManager.isAdmin()) {
    alert("Você não tem permissão para acessar esta página.");
    window.location.href = "./index.html";
    return;
  }

  const userDisplayName = authManager.getUserDisplayName();
  const adminUserInfo = document.getElementById("adminUserInfo");
  adminUserInfo.innerHTML = `👤 ${userDisplayName}`;

  btnAdminLogout.addEventListener("click", async () => {
    await authManager.logout();
    window.location.href = "./login.html";
  });

  function toCamelCase(str) {
    return str.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      sections.forEach((s) => s.classList.remove("active"));

      tab.classList.add("active");
      const tabName = tab.dataset.tab;
      const camelTabName = toCamelCase(tabName);
      const section = document.getElementById(`${camelTabName}Section`);
      if (section) section.classList.add("active");
    });
  });

  novoUsuarioForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = newUserEmail.value.trim();
    const password = newUserPassword.value;
    const displayName = newUserName.value.trim();
    const cargo = newUserCargo.value;

    if (!email || !password || !displayName) {
      showMessage("novoUsuarioMessage", "Preencha todos os campos.", "error");
      return;
    }

    const result = await authManager.createUser(email, password, displayName, cargo);

    if (result.success) {
      showMessage("novoUsuarioMessage", "Usuário criado com sucesso!");
      novoUsuarioForm.reset();
      await carregarUsuarios();
    } else {
      showMessage("novoUsuarioMessage", result.error, "error");
    }
  });

  btnSaveAdminEmail.addEventListener("click", async () => {
    const email = adminEmailConfig.value.trim();
    if (!email) {
      showMessage("configMessage", "Informe um email válido.", "error");
      return;
    }

    const result = await authManager.setAdminEmail(email);
    if (result.success) {
      showMessage("configMessage", "Email de admin salvo com sucesso!");
    } else {
      showMessage("configMessage", "Erro ao salvar email de admin.", "error");
    }
  });

  const adminEmail = await authManager.getAdminEmail();
  if (adminEmail) {
    adminEmailConfig.value = adminEmail;
  }

  await carregarUsuarios();
}

inicializar();
