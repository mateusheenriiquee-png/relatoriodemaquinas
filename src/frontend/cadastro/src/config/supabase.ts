import { createClient } from "@supabase/supabase-js";

/**
 * Mesmo projeto Supabase do painel principal. A chave "anon" é pública por
 * desenho: quem protege os dados é a RLS do banco (supabase/migrations). A
 * service_role NUNCA pode aparecer aqui.
 */
const env = import.meta.env;
const chave = env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!chave) {
  console.warn("[Cadastro] VITE_SUPABASE_ANON_KEY ausente — defina em src/frontend/cadastro/.env.local.");
}

export const supabase = createClient(
  (env.VITE_SUPABASE_URL as string | undefined) || "https://mhuawoaglnlzbrgpooog.supabase.co",
  chave || "chave-ausente",
  {
    auth: {
      // Sessão por aba (some ao fechar), como no painel: pensado para computador compartilhado.
      storage: window.sessionStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false
    }
  }
);
