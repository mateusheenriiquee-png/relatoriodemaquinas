import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { configSupabase, conectarPostgres } from './lib/supabase.mjs';

/**
 * Recria no Supabase Auth os usuários que existiam no Firebase.
 *
 * As senhas do Firebase não podem ser copiadas (ficam em hash proprietário),
 * então cada usuário nasce com uma senha temporária aleatória, gravada em
 * credentials/ (fora do git) — quem entrar deve trocá-la em seguida.
 *
 * Repetível: usuário que já existe é pulado e NÃO tem a senha alterada.
 * Usa a service_role só aqui, nunca no front.
 */
const USUARIOS = [
  { email: 'dayranrosendo@certify.com', displayName: 'Dayran', cargo: 'Administrador' },
  { email: 'henrique@certify.com', displayName: 'Henrique', cargo: 'Administrador' }
];

const cfg = configSupabase();
const base = cfg.SUPABASE_URL;
const chave = cfg.SUPABASE_SERVICE_ROLE_KEY;
if (!base || !chave) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes em credentials/supabase.env.');
  process.exit(1);
}

const cab = { apikey: chave, Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' };
const senhaAleatoria = () => crypto.randomBytes(12).toString('base64url') + '!9a';

const db = await conectarPostgres();
const novas = [];

try {
  for (const u of USUARIOS) {
    const existe = await db.query('select id from auth.users where lower(email) = lower($1)', [u.email]);
    let id = existe.rows[0]?.id;

    if (id) {
      console.log(`= ${u.email} já existe no Auth (senha não alterada)`);
    } else {
      const senha = senhaAleatoria();
      const r = await fetch(`${base}/auth/v1/admin/users`, {
        method: 'POST',
        headers: cab,
        body: JSON.stringify({
          email: u.email,
          password: senha,
          email_confirm: true,
          user_metadata: { display_name: u.displayName }
        })
      });
      const corpo = await r.json();
      if (!r.ok) throw new Error(`${u.email}: ${corpo.msg || corpo.message || r.status}`);
      id = corpo.id;
      novas.push({ email: u.email, senha });
      console.log(`+ ${u.email} criado no Auth`);
    }

    await db.query(
      `insert into public.usuarios (id, email, display_name, cargo, status)
       values ($1, $2, $3, $4, 'ativo')
       on conflict (id) do update set email = excluded.email, display_name = excluded.display_name, cargo = excluded.cargo`,
      [id, u.email, u.displayName, u.cargo]
    );
  }
} finally {
  await db.end();
}

if (novas.length) {
  const arquivo = path.resolve(process.cwd(), 'credentials', 'supabase-senhas-temporarias.txt');
  const linhas = novas.map((n) => `${n.email}  ${n.senha}`).join('\n');
  fs.appendFileSync(arquivo, `# gerado em ${new Date().toISOString()} — trocar após o primeiro login\n${linhas}\n`);
  console.log(`\nSenhas temporárias gravadas em ${arquivo} (fora do git).`);
}
