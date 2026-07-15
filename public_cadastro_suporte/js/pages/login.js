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

function getLoginRedirect() {
  const params = new URLSearchParams(window.location.search);
  const next = params.get("next");
  if (!next || next.includes("..") || next.startsWith("//") || /^https?:/i.test(next)) {
    return "./index.html";
  }
  return next.startsWith("./") ? next : `./${next}`;
}

async function initialize() {
  await authManager.initialize();

  if (authManager.isAuthenticated()) {
    window.location.href = getLoginRedirect();
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
    window.location.href = getLoginRedirect();
  } else {
    showError(result.error);
    setButtonLoading(false);
  }
});

initialize();
