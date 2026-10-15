-- Mensagem do cliente também acha o chamado pelo CONTATO (2026-10-08).
--
-- O chamado só era achado pelo lead ou pela conversa. Quando a conversa do
-- WhatsApp está presa a OUTRO lead do cliente (caso comum: um lead antigo
-- fechado), a mensagem não casava com nada, a bolinha não contava e o chamado
-- não subia na lista "Em andamento". O webhook sempre traz o contato; todo
-- chamado aberto pelo n8n guarda extras.kommo_contact_id.
--
-- Ordem de preferência: o próprio lead / um lead conhecido do chamado / a
-- conversa primeiro; o contato só serve de último recurso. Entre iguais, o
-- chamado mais recente.

drop function if exists public.registrar_mensagem_cliente(text, text);

create or replace function public.registrar_mensagem_cliente(
  p_kommo_lead_id    text default '',
  p_kommo_talk_id    text default '',
  p_kommo_contact_id text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead    text := nullif(btrim(coalesce(p_kommo_lead_id, '')), '');
  v_talk    text := nullif(btrim(coalesce(p_kommo_talk_id, '')), '');
  v_contact text := nullif(btrim(coalesce(p_kommo_contact_id, '')), '');
  v_id      text;
  v_novo    integer;
begin
  if v_lead is null and v_talk is null and v_contact is null then
    raise exception 'informe kommo_lead_id, kommo_talk_id ou kommo_contact_id.' using errcode = '22023';
  end if;

  -- Liga a conversa e o contato ao chamado aberto do lead (só os abertos).
  if v_lead is not null and (v_talk is not null or v_contact is not null) then
    update public.suportes
       set extras = coalesce(extras, '{}'::jsonb)
         || case when v_talk is not null then jsonb_build_object('kommo_talk_id', v_talk) else '{}'::jsonb end
         || case when v_contact is not null and coalesce(extras->>'kommo_contact_id', '') = ''
                 then jsonb_build_object('kommo_contact_id', v_contact) else '{}'::jsonb end
     where (kommo_lead_id = v_lead or extras->'kommo_leads' ? v_lead)
       and status not in ('FINALIZADO', 'SEM RETORNO')
       and (
         (v_talk is not null and extras->>'kommo_talk_id' is distinct from v_talk)
         or (v_contact is not null and coalesce(extras->>'kommo_contact_id', '') = '')
       );
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
          or (v_contact is not null and extras->>'kommo_contact_id' = v_contact)
        )
      -- coalesce: sem extras.kommo_leads a comparação dá NULL, e NULL vem
      -- ANTES de true na ordem decrescente.
      order by
        coalesce((v_lead is not null and (kommo_lead_id = v_lead or coalesce(extras->'kommo_leads' ? v_lead, false)))
         or (v_talk is not null and extras->>'kommo_talk_id' = v_talk), false) desc,
        created_at desc
      limit 1
   )
  returning id, mensagens_nao_lidas into v_id, v_novo;

  if v_id is null then
    return jsonb_build_object('acao', 'ignorado');
  end if;
  return jsonb_build_object('acao', 'contado', 'id', v_id, 'mensagens_nao_lidas', v_novo);
end;
$$;

grant execute on function public.registrar_mensagem_cliente(text, text, text) to anon;
revoke execute on function public.registrar_mensagem_cliente(text, text, text) from public;
