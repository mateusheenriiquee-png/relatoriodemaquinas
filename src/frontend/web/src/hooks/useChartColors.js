import { useCallback, useEffect, useMemo, useState } from "react";
import { useTheme } from "../contexts/ThemeContext";

/* v3: os padrões deixaram de ser hex fixos e passaram a vir dos tokens do tema,
   então o armazenamento guarda apenas o que o usuário personalizou. */
export const CHART_COLORS_STORAGE_KEY = "suporte-dashboard-chart-colors-v3";

/** Lê um token do tema atual — assim os gráficos acompanham claro/escuro. */
export function cssVar(nome, fallback) {
  if (typeof window === "undefined") return fallback;
  const valor = getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
  return valor || fallback;
}

const STATUS_VARS = {
  "EM ABERTO": ["--st-aberto", "#f87171"],
  "EM ANDAMENTO": ["--st-andamento", "#60a5fa"],
  FINALIZADO: ["--st-finalizado", "#34d399"],
  REAGENDADO: ["--st-reagendado", "#facc15"],
  "SEM RETORNO": ["--st-sem-retorno", "#a8a29e"]
};

/** Cores fixas por situação, resolvidas a partir dos tokens do tema atual. */
export function resolverCoresDeStatus() {
  return Object.fromEntries(
    Object.entries(STATUS_VARS).map(([status, [nome, fallback]]) => [
      status,
      cssVar(nome, fallback)
    ])
  );
}

export const STATUS_CSS_VARS = Object.fromEntries(
  Object.entries(STATUS_VARS).map(([status, [nome]]) => [status, `var(${nome})`])
);

/* Slots de série. Os padrões saem dos tokens --viz-*, que têm passos próprios
   para cada tema (paleta validada para daltonismo e contraste em ambos). */
const SLOTS = {
  barras: ["--viz-1", "#f97316"],
  devido: ["--viz-1", "#f97316"],
  indevido: ["--viz-2", "#3987e5"],
  pendente: ["--viz-neutral", "#4a4038"]
};

export const SLOT_LABELS = {
  barras: "Barras",
  devido: "Devido",
  indevido: "Indevido",
  pendente: "Pendente"
};

function carregarPersonalizadas() {
  try {
    const raw = localStorage.getItem(CHART_COLORS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function useChartColors() {
  const { tema } = useTheme();
  const [personalizadas, setPersonalizadas] = useState(carregarPersonalizadas);

  useEffect(() => {
    try {
      localStorage.setItem(CHART_COLORS_STORAGE_KEY, JSON.stringify(personalizadas));
    } catch {
      /* storage indisponível — segue com as cores em memória */
    }
  }, [personalizadas]);

  // Padrão do tema + o que o usuário tiver trocado.
  const cores = useMemo(() => {
    const base = Object.fromEntries(
      Object.entries(SLOTS).map(([slot, [nome, fallback]]) => [slot, cssVar(nome, fallback)])
    );
    return { ...base, ...personalizadas };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tema, personalizadas]);

  const alterarCor = useCallback((slot, valor) => {
    setPersonalizadas((atual) => ({ ...atual, [slot]: valor }));
  }, []);

  const restaurarPadrao = useCallback(() => setPersonalizadas({}), []);

  const personalizado = Object.keys(personalizadas).length > 0;

  return { cores, alterarCor, restaurarPadrao, personalizado };
}
