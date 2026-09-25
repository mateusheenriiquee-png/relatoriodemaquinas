import { createClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase do painel.
 *
 * A chave "anon" é pública por desenho: quem manda no acesso é a RLS do banco
 * (supabase/migrations), não o sigilo da chave. A service_role, essa sim
 * secreta, NUNCA pode aparecer neste arquivo nem em qualquer VITE_*.
 */
const env = import.meta.env;

const URL_PADRAO = "https://mhuawoaglnlzbrgpooog.supabase.co";
const url = env.VITE_SUPABASE_URL || URL_PADRAO;
const chave = env.VITE_SUPABASE_ANON_KEY;

if (!chave) {
  console.warn("[Supabase] VITE_SUPABASE_ANON_KEY ausente — defina em src/frontend/web/.env.local.");
}

export const supabase = createClient(url, chave || "chave-ausente", {
  auth: {
    // A sessão vale só para a aba (some ao fechar) — decisão de LGPD/computador
    // compartilhado que já existia com o Firebase (browserSessionPersistence).
    storage: typeof window !== "undefined" ? window.sessionStorage : undefined,
    persistSession: typeof window !== "undefined",
    autoRefreshToken: typeof window !== "undefined",
    detectSessionInUrl: false
  },
  realtime: { params: { eventsPerSecond: 10 } }
});

/** Base da API auxiliar do Worker (criar usuário / associar técnico). */
export function getApiBaseUrl() {
  const fromEnv = env.VITE_API_BASE_URL;
  if (fromEnv) return fromEnv;
  const { hostname, origin } = window.location;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "http://localhost:3000";
  }
  return origin;
}
