-- Bolinha de mensagens: acha o chamado pelo lead OU pela conversa (2026-10-02).
--
-- Um cliente pode ter dois leads (um antigo, fechado, e um atual) e a conversa
-- do WhatsApp fica presa ao antigo — caso Larissa: conversa 1583 no lead
-- 18033773 enquanto o chamado estava ligado ao 53279909. A função só procurava
-- por lead, então a mensagem do cliente não contava na bolinha. Agora procura
-- pelos dois, e atualiza UM só chamado (o mais recente) para o UPDATE ...
-- RETURNING INTO nunca encontrar duas linhas.
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

  -- Liga a conversa ao chamado aberto do lead (só os abertos: os encerrados
  -- são história e não devem ser mexidos por mensagens novas).
  if v_lead is not null and v_talk is not null then
    update public.suportes
       set extras = coalesce(extras, '{}'::jsonb) || jsonb_build_object('kommo_talk_id', v_talk)
     where kommo_lead_id = v_lead
       and status not in ('FINALIZADO', 'SEM RETORNO')
       and extras->>'kommo_talk_id' is distinct from v_talk;
  end if;

  update public.suportes
     set mensagens_nao_lidas = mensagens_nao_lidas + 1
   where id = (
     select id from public.suportes
      where status = 'EM ANDAMENTO'
        and (
          (v_lead is not null and kommo_lead_id = v_lead)
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
