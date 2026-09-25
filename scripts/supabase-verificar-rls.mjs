import { conectarPostgres } from './lib/supabase.mjs';

/**
 * Prova que as permissões (RLS) do banco fazem o que as regras do Firestore
 * faziam. Roda TUDO dentro de uma transação e a desfaz no fim: os usuários de
 * teste nunca existem de verdade e nenhum dado real é tocado.
 *
 * Simula cada papel como o Supabase faz: troca o role do Postgres e preenche
 * o JWT que auth.uid() lê.
 */
const ADMIN = '00000000-0000-4000-8000-00000000aaaa';
const OPER = '00000000-0000-4000-8000-00000000bbbb';

const c = await conectarPostgres();
let falhas = 0;
const conferir = (nome, ok, detalhe = '') => {
  if (!ok) falhas += 1;
  console.log(`${ok ? '✔' : '✖'} ${nome}${detalhe ? ` — ${detalhe}` : ''}`);
};

async function como(uid, fn) {
  await c.query(uid ? 'set local role authenticated' : 'set local role anon');
  await c.query("select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)", [
    JSON.stringify(uid ? { sub: uid, role: 'authenticated' } : { role: 'anon' }),
    uid || ''
  ]);
  try {
    return await fn();
  } finally {
    await c.query('reset role');
  }
}

/** Devolve { ok, linhas } ou { erro } — política que nega INSERT/WITH CHECK levanta erro. */
async function tentar(sql, params = []) {
  await c.query('savepoint t');
  try {
    const r = await c.query(sql, params);
    await c.query('release savepoint t');
    return { ok: true, linhas: r.rowCount };
  } catch (e) {
    await c.query('rollback to savepoint t');
    return { erro: e.message };
  }
}

try {
  await c.query('begin');

  for (const [id, email] of [[ADMIN, 'admin.teste@exemplo.com'], [OPER, 'oper.teste@exemplo.com']]) {
    await c.query("insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')", [id, email]);
  }
  await c.query("insert into public.usuarios (id, email, display_name, cargo) values ($1, 'admin.teste@exemplo.com', 'Admin', 'Administrador'), ($2, 'oper.teste@exemplo.com', 'Oper', 'Operador')", [ADMIN, OPER]);
  await c.query("insert into public.audit_logs (dados) values ('{\"x\":1}')");
  await c.query("insert into public.suportes (id, protocolo, nome_cliente, cpf_cnpj) values ('base', '102-005-389', 'Délia Cristina Cardoso', '123.456.789-01')");

  console.log('\n— Operador —');
  await como(OPER, async () => {
    conferir('lê chamados', (await tentar('select 1 from public.suportes')).linhas >= 1);
    conferir('cria chamado', (await tentar("insert into public.suportes (id, protocolo) values ('op1', 'X')")).ok === true);
    conferir('edita chamado', (await tentar("update public.suportes set tecnico = 'Ana' where id = 'base'")).linhas === 1);
    conferir('NÃO exclui chamado', (await tentar("delete from public.suportes where id = 'op1'")).linhas === 0);
    conferir('NÃO cria usuário', !!(await tentar("insert into public.usuarios (id, email) values (gen_random_uuid(), 'x@x.com')")).erro);
    conferir('edita o próprio nome', (await tentar("update public.usuarios set display_name = 'Novo' where id = $1", [OPER])).linhas === 1);
    conferir('NÃO se promove a admin', !!(await tentar("update public.usuarios set cargo = 'Administrador' where id = $1", [OPER])).erro);
    conferir('NÃO edita outro usuário', (await tentar("update public.usuarios set display_name = 'Hack' where id = $1", [ADMIN])).linhas === 0);
    conferir('NÃO exclui usuário', (await tentar('delete from public.usuarios where id = $1', [ADMIN])).linhas === 0);
    conferir('lê config', (await tentar('select 1 from public.config')).ok === true);
    conferir('NÃO grava config', !!(await tentar("insert into public.config (chave) values ('k')")).erro);
    conferir('NÃO lê audit_logs', (await tentar('select 1 from public.audit_logs')).linhas === 0);
  });

  console.log('\n— Administrador —');
  await como(ADMIN, async () => {
    conferir('exclui chamado', (await tentar("delete from public.suportes where id = 'op1'")).linhas === 1);
    conferir('altera o cargo de outro usuário', (await tentar("update public.usuarios set cargo = 'Supervisor' where id = $1", [OPER])).linhas === 1);
    conferir('grava config', (await tentar("insert into public.config (chave, valor) values ('k', '{}')")).ok === true);
    conferir('lê audit_logs', (await tentar('select 1 from public.audit_logs')).linhas === 1);
    conferir('NÃO escreve em audit_logs pelo cliente', !!(await tentar("insert into public.audit_logs (dados) values ('{}')")).erro);
  });

  console.log('\n— Sem login (anon) —');
  await como(null, async () => {
    const r = await tentar('select 1 from public.suportes');
    conferir('NÃO lê chamados', !!r.erro || r.linhas === 0, r.erro ? 'acesso negado' : `${r.linhas} linha(s)`);
    const w = await tentar("insert into public.suportes (id) values ('anon')");
    conferir('NÃO cria chamado', !!w.erro);
  });

  console.log('\n— Funções do painel (atualizar_suporte / mesclar_config) —');
  await c.query("insert into public.suportes (id, protocolo, tecnico, historico) values ('rpc1', 'R1', 'Ana', '[]')");
  await como(OPER, async () => {
    const um = await tentar("select public.atualizar_suporte('rpc1', '{\"tecnico\":\"Bia\"}')");
    conferir('RPC: patch de uma coluna só', um.ok === true, um.erro || '');
    const varios = await tentar(
      "select public.atualizar_suporte('rpc1', '{\"status\":\"FINALIZADO\",\"data_finalizacao\":\"2026-09-01T10:00:00Z\",\"motivo\":\"x\"}', '{\"em\":\"2026-09-01T10:00:00Z\",\"texto\":\"t\",\"por\":\"p\"}', '{\"ordem\":1}')"
    );
    conferir('RPC: várias colunas + histórico + follow-up na mesma chamada', varios.ok === true, varios.erro || '');
    const inexistente = await tentar("select public.atualizar_suporte('nao-existe', '{\"tecnico\":\"Z\"}')");
    conferir('RPC: chamado inexistente dá erro', !!inexistente.erro);
    const invasao = await tentar("select public.atualizar_suporte('rpc1', '{\"id\":\"outro\",\"created_at\":\"2000-01-01\"}')");
    conferir('RPC: id e created_at enviados são ignorados', invasao.ok === true);
    conferir('NÃO grava config via RPC (não é admin)', !!(await tentar("select public.mesclar_config('m', '{\"a\":1}')")).erro);
  });
  const r1 = (await c.query("select tecnico, status, motivo, data_finalizacao, historico, followups, id, created_at > '2001-01-01' as criada_ok from public.suportes where id = 'rpc1'")).rows[0];
  conferir('RPC: valores gravados certos', r1 && r1.tecnico === 'Bia' && r1.status === 'FINALIZADO' && r1.motivo === 'x' && r1.data_finalizacao instanceof Date);
  conferir('RPC: histórico e follow-up acrescentados (não substituídos)', r1.historico.length === 1 && r1.followups.length === 1);
  conferir('RPC: id/created_at intocados', r1.id === 'rpc1' && r1.criada_ok === true);
  await como(ADMIN, async () => {
    await tentar("select public.mesclar_config('m', '{\"a\":1}')");
    await tentar("select public.mesclar_config('m', '{\"b\":2}')");
  });
  const cfg = (await c.query("select valor from public.config where chave = 'm'")).rows[0]?.valor;
  conferir('mesclar_config junta as chaves em vez de sobrescrever', cfg && cfg.a === 1 && cfg.b === 2, JSON.stringify(cfg));
  await como(null, async () => {
    conferir('anon NÃO executa atualizar_suporte', !!(await tentar("select public.atualizar_suporte('rpc1', '{}')")).erro);
  });

  console.log('\n— Busca e gatilhos —');
  const busca = (await c.query("select busca from public.suportes where id = 'base'")).rows[0].busca;
  conferir('busca sem acento e minúscula', busca.includes('delia cristina') && !busca.includes('é'), busca);
  conferir('acha por trecho do meio', (await c.query("select 1 from public.suportes where busca like '%cristina%'")).rowCount === 1);
  conferir('acha sem digitar o acento', (await c.query("select 1 from public.suportes where busca like '%' || public.sem_acento('délia') || '%'")).rowCount === 1);
  // Não dá para comparar "antes e depois": dentro de uma transação o now() fica
  // congelado no instante em que ela começou. Então tenta-se FORÇAR uma data
  // velha — se o gatilho funciona, ele sobrescreve com a atual.
  await c.query("update public.suportes set updated_at = '2000-01-01', tecnico = 'Z' where id = 'base'");
  const forcada = (await c.query("select updated_at > now() - interval '1 minute' as recente from public.suportes where id = 'base'")).rows[0].recente;
  conferir('updated_at é mantido pelo banco (ignora valor enviado)', forcada === true);
  conferir('status inválido é recusado', !!(await tentar("update public.suportes set status = 'INVENTADO' where id = 'base'")).erro);
} finally {
  await c.query('rollback');
  const sobra = (await c.query("select count(*)::int n from auth.users where email like '%.teste@exemplo.com'")).rows[0].n;
  console.log(`\nTransação desfeita. Usuários de teste remanescentes: ${sobra}`);
  await c.end();
}

console.log(falhas ? `\n✖ ${falhas} verificação(ões) falharam.` : '\n✔ Todas as permissões conferem.');
process.exit(falhas ? 1 : 0);
