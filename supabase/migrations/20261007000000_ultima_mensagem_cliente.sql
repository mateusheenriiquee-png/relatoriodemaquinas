-- Hora da última mensagem do cliente (pedido do usuário, 2026-10-07).
--
-- A lista "Em andamento" do painel passa a ser dinâmica: o chamado cuja
-- conversa recebeu mensagem nova do cliente sobe para o primeiro lugar. A
-- coluna é gravada no mesmo ponto que já conta a bolinha
-- (registrar_mensagem_cliente, chamada pelo n8n a cada mensagem do cliente).

alter table public.suportes
  add column if not exists ultima_mensagem_cliente_em timestamptz;

create or replace function public.registrar_mensagem_cliente(
  p_kommo_lead_id text default '',
  p_kommo_talk_id text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead text := nullif(btrim(coalesce(p_kommo_lead_id, '')), '');
  v_talk text := nullif(btrim(coalesce(p_kommo_talk_id, '')), '');
  v_id   text;
  v_novo integer;
begin
  if v_lead is null and v_talk is null then
    raise exception 'informe kommo_lead_id ou kommo_talk_id.' using errcode = '22023';
  end if;

  -- Liga a conversa ao chamado aberto do lead (só os abertos).
  if v_lead is not null and v_talk is not null then
    update public.suportes
       set extras = coalesce(extras, '{}'::jsonb) || jsonb_build_object('kommo_talk_id', v_talk)
     where (kommo_lead_id = v_lead or extras->'kommo_leads' ? v_lead)
       and status not in ('FINALIZADO', 'SEM RETORNO')
       and extras->>'kommo_talk_id' is distinct from v_talk;
  end if;

  update public.suportes
     set mensagens_nao_lidas = mensagens_nao_lidas + 1,
         ultima_mensagem_cliente_em = now()
   where id = (
     select id from public.suportes
      where status = 'EM ANDAMENTO'
        and (
          (v_lead is not null and (kommo_lead_id = v_lead or extras->'kommo_leads' ? v_lead))
          or (v_talk is not null and extras->>'kommo_talk_id' = v_talk)
        )
      order by created_at desc
      limit 1
   )
  returning id, mensagens_nao_lidas into v_id, v_novo;

  if v_id is null then
    return jsonb_build_object('acao', 'ignorado');
  end if;
  return jsonb_build_object('acao', 'contado', 'id', v_id, 'mensagens_nao_lidas', v_novo);
end;
$$;

grant execute on function public.registrar_mensagem_cliente(text, text) to anon;
revoke execute on function public.registrar_mensagem_cliente(text, text) from public;
