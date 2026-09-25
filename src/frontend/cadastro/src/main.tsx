import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AuthProvider } from "./auth/AuthContext";
import { ThemeProvider } from "./theme/ThemeContext";
// O visual é o do painel principal, importado da fonte: uma cópia divergiria na
// primeira vez que alguém ajustasse uma cor lá e esquecesse de vir aqui.
import "../../web/src/styles/main.css";
import "../../web/src/styles/login.css";
import "../../web/src/styles/app-extra.css";
import "./styles/paginas.css";

const raiz = document.getElementById("root");
if (!raiz) throw new Error("Elemento #root não encontrado no index.html.");

createRoot(raiz).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>
);
