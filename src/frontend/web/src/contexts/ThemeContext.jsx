import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "suporte-tema";
const ThemeContext = createContext(null);

function temaInicial() {
  try {
    const salvo = localStorage.getItem(STORAGE_KEY);
    if (salvo === "dark" || salvo === "light") return salvo;
  } catch {
    /* storage indisponível */
  }
  // Sem preferência salva: acompanha o sistema, com o escuro como padrão.
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  return "dark";
}

export function ThemeProvider({ children }) {
  const [tema, setTema] = useState(temaInicial);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", tema);
    try {
      localStorage.setItem(STORAGE_KEY, tema);
    } catch {
      /* storage indisponível */
    }
  }, [tema]);

  const alternar = useCallback(() => {
    setTema((atual) => (atual === "dark" ? "light" : "dark"));
  }, []);

  const value = useMemo(() => ({ tema, alternar, escuro: tema === "dark" }), [tema, alternar]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme precisa estar dentro de <ThemeProvider>.");
  return ctx;
}
