import fs from 'fs';
import path from 'path';
import { conectarPostgres } from './lib/supabase.mjs';

/**
 * Aplica supabase/migrations/*.sql em ordem, uma transação por arquivo.
 *
 * Guarda o que já rodou em public.migracoes_aplicadas: rodar de novo pula o que
 * já foi aplicado, então é seguro repetir. Um arquivo que falha desfaz só ele
 * (rollback) e o script para — nunca deixa uma migração pela metade.
 */
const PASTA = path.resolve(process.cwd(), 'supabase', 'migrations');

const c = await conectarPostgres();
try {
  await c.query(`
    create table if not exists public.migracoes_aplicadas (
      arquivo text primary key,
      aplicada_em timestamptz not null default now()
    )`);
  // Só o service_role/postgres enxergam: sem RLS a tabela ficaria legível pela API pública.
  await c.query('alter table public.migracoes_aplicadas enable row level security');

  const feitas = new Set((await c.query('select arquivo from public.migracoes_aplicadas')).rows.map((r) => r.arquivo));
  const arquivos = fs.readdirSync(PASTA).filter((f) => f.endsWith('.sql')).sort();

  let aplicadas = 0;
  for (const arquivo of arquivos) {
    if (feitas.has(arquivo)) {
      console.log(`= ${arquivo} (já aplicada)`);
      continue;
    }
    const sql = fs.readFileSync(path.join(PASTA, arquivo), 'utf8');
    try {
      await c.query('begin');
      await c.query(sql);
      await c.query('insert into public.migracoes_aplicadas (arquivo) values ($1)', [arquivo]);
      await c.query('commit');
      console.log(`+ ${arquivo}`);
      aplicadas += 1;
    } catch (erro) {
      await c.query('rollback');
      console.error(`✖ ${arquivo} falhou e foi desfeita: ${erro.message}`);
      if (erro.position) console.error(`  posição no arquivo: ${erro.position}`);
      process.exitCode = 1;
      break;
    }
  }
  if (!process.exitCode) console.log(`\nConcluído: ${aplicadas} aplicada(s), ${arquivos.length - aplicadas} já existente(s).`);
} finally {
  await c.end();
}
