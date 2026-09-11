import { useTheme } from "../contexts/ThemeContext";
import { IconMoon, IconSun } from "./Icons";

export default function ThemeToggle() {
  const { escuro, alternar } = useTheme();
  const titulo = escuro ? "Mudar para o tema claro" : "Mudar para o tema escuro";

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={alternar}
      title={titulo}
      aria-label={titulo}
    >
      {escuro ? <IconSun /> : <IconMoon />}
    </button>
  );
}
