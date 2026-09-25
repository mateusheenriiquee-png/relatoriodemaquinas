import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/**
 * Mesma chave e mesma regra do painel principal: quem escolhe o tema claro lá
 * o vê aqui também (o cadastro roda no mesmo domínio, então o localStorage é comum).
 */
const CHAVE = "suporte-tema";
type Tema = "dark" | "light";

function temaInicial(): Tema {
  try {
    const salvo = localStorage.getItem(CHAVE);
    if (salvo === "dark" || salvo === "light") return salvo;
  } catch {
    /* storage indisponível */
  }
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

interface ValorTema {
  escuro: boolean;
  alternar: () => void;
}
const ThemeContext = createContext<ValorTema | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [tema, setTema] = useState<Tema>(temaInicial);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", tema);
    try {
      localStorage.setItem(CHAVE, tema);
    } catch {
      /* storage indisponível */
    }
  }, [tema]);

  const alternar = useCallback(() => setTema((t) => (t === "dark" ? "light" : "dark")), []);
  const valor = useMemo(() => ({ escuro: tema === "dark", alternar }), [tema, alternar]);
  return <ThemeContext.Provider value={valor}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ValorTema {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme precisa estar dentro de <ThemeProvider>.");
  return ctx;
}
