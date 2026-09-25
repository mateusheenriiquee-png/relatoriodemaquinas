import fs from 'fs';
import path from 'path';
import pg from 'pg';

/**
 * Acesso ao Supabase para os scripts de migração.
 *
 * Lê credentials/supabase.env (fora do git) ou as variáveis de ambiente — as
 * de ambiente vencem, para o CI poder injetar sem arquivo. Mesma ideia de
 * scripts/lib/firebase-admin.mjs: a chave é resolvida num lugar só.
 */

function lerEnv() {
  const arquivo = path.resolve(process.cwd(), 'credentials', 'supabase.env');
  const valores = {};
  if (fs.existsSync(arquivo)) {
    for (const linha of fs.readFileSync(arquivo, 'utf8').split(/\r?\n/)) {
      const m = linha.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
      if (m && !linha.trim().startsWith('#')) valores[m[1]] = m[2];
    }
  }
  return { ...valores, ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith('SUPABASE_'))) };
}

export function configSupabase() {
  const cfg = lerEnv();
  if (!cfg.SUPABASE_DB_URL) {
    console.error(
      'SUPABASE_DB_URL não encontrada. Ela fica em credentials/supabase.env\n' +
        '(Project Settings → Database → Connection string).'
    );
    process.exit(1);
  }
  return cfg;
}

/**
 * Cliente Postgres conectado. O certificado do Supabase é assinado por uma CA
 * própria que o Node não conhece, então a verificação é desligada — a conexão
 * continua criptografada, só não valida a cadeia. Aceitável para um script
 * local rodado por quem já tem a senha do banco.
 */
export async function conectarPostgres() {
  const { SUPABASE_DB_URL } = configSupabase();
  const cliente = new pg.Client({ connectionString: SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await cliente.connect();
  return cliente;
}
