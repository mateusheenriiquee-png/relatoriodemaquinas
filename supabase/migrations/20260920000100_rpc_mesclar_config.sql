-- =============================================================================
-- mesclar_config — o `setDoc(..., { merge: true })` do Firestore.
--
-- Grava só as chaves enviadas dentro de `valor` e preserva as demais. Sem isso
-- o painel teria de ler, mesclar e regravar: dois administradores mexendo em
-- coisas diferentes (expediente e feriados) se sobrescreveriam.
--
-- SECURITY INVOKER: a RLS de `config` continua valendo (só administrador grava).
-- =============================================================================
create or replace function public.mesclar_config(p_chave text, p_valor jsonb)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.config (chave, valor)
  values (p_chave, coalesce(p_valor, '{}'::jsonb))
  on conflict (chave) do update
    set valor = public.config.valor || excluded.valor;
$$;

grant execute on function public.mesclar_config(text, jsonb) to authenticated;
revoke execute on function public.mesclar_config(text, jsonb) from anon, public;
