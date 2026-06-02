import { authManager } from "../auth.js";

const loginForm = document.getElementById("loginForm");
const loginEmail = document.getElementById("loginEmail");
const loginPassword = document.getElementById("loginPassword");
const loginButton = document.getElementById("loginButton");
const loginError = document.getElementById("loginError");

function showError(message) {
  loginError.textContent = message;
  loginError.classList.add("show");
  setTimeout(() => {
    loginError.classList.remove("show");
  }, 4000);
}

function setButtonLoading(loading) {
  loginButton.disabled = loading;
  if (loading) {
    loginButton.innerHTML = '<span class="loading"></span>Entrando...';
  } else {
    loginButton.textContent = "Entrar";
  }
}

async function initialize() {
  await authManager.initialize();

  if (authManager.isAuthenticated()) {
    window.location.href = "./index.html";
  }
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = loginEmail.value.trim();
  const password = loginPassword.value;

  if (!email || !password) {
    showError("Por favor, preencha todos os campos.");
    return;
  }

  setButtonLoading(true);
  const result = await authManager.login(email, password);

  if (result.success) {
    window.location.href = "./index.html";
  } else {
    showError(result.error);
    setButtonLoading(false);
  }
});

initialize();
