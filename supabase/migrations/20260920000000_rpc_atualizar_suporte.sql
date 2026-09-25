-- =============================================================================
-- atualizar_suporte — o que o Firestore fazia com updateDoc + arrayUnion.
--
-- Uma escrita do painel muda campos E acrescenta uma linha ao histórico (e, no
-- follow-up, uma tentativa a `followups`). No Firestore isso era um único
-- updateDoc. Aqui é uma função só para continuar sendo uma operação atômica:
-- feita em dois pedidos, uma falha no meio deixaria o chamado alterado e sem
-- registro na linha do tempo — exatamente o que o painel garante que nunca
-- acontece ("nunca exista alteração sem registro correspondente").
--
-- E acrescentar ao array no servidor (`historico || nova_linha`) evita a
-- corrida de ler-o-array-inteiro-e-reescrever: dois técnicos anotando no mesmo
-- chamado ao mesmo tempo perderiam uma das linhas.
--
-- SECURITY INVOKER: roda com o papel de quem chamou, então a RLS de `suportes`
-- continua valendo. Não abre nenhuma permissão nova.
-- =============================================================================
create or replace function public.atualizar_suporte(
  p_id        text,
  p_patch     jsonb default '{}'::jsonb,
  p_historico jsonb default null,
  p_followup  jsonb default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  colunas   text;
  atribuicao text := '';
  afetadas  integer;
begin
  -- Só colunas que existem e que o cliente pode escolher. id, busca (gerada) e
  -- os carimbos são do banco: um cliente que os enviasse seria ignorado.
  select string_agg(quote_ident(k.key), ', ')
    into colunas
    from jsonb_each(coalesce(p_patch, '{}'::jsonb)) k
   where k.key in (
     select c.column_name
       from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = 'suportes'
        and c.column_name not in ('id', 'busca', 'created_at', 'updated_at')
   );

  if colunas is not null then
    atribuicao := format(
      '(%1$s) = (select %1$s from jsonb_populate_record(null::public.suportes, $1))',
      colunas
    );
  end if;
  if p_historico is not null then
    atribuicao := concat_ws(', ', nullif(atribuicao, ''), 'historico = historico || jsonb_build_array($3)');
  end if;
  if p_followup is not null then
    atribuicao := concat_ws(', ', nullif(atribuicao, ''), 'followups = followups || jsonb_build_array($4)');
  end if;

  if atribuicao = '' then
    return;
  end if;

  execute 'update public.suportes set ' || atribuicao || ' where id = $2'
    using coalesce(p_patch, '{}'::jsonb), p_id, p_historico, p_followup;

  get diagnostics afetadas = row_count;
  if afetadas = 0 then
    -- Não distingue "não existe" de "a RLS escondeu": para quem chamou dá no mesmo.
    raise exception 'Chamado % não encontrado.', p_id using errcode = 'P0002';
  end if;
end;
$$;

grant execute on function public.atualizar_suporte(text, jsonb, jsonb, jsonb) to authenticated;
revoke execute on function public.atualizar_suporte(text, jsonb, jsonb, jsonb) from anon, public;
