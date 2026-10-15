-- =============================================================================
-- Contador de mensagens do cliente num chamado EM ANDAMENTO ("a bolinha" do
-- card na listagem). Chamado pelo n8n a cada mensagem recebida no chat do
-- Kommo — SEM passar pela IA/palavra-chave: é só uma contagem, não decide se é
-- suporte. Por isso é uma função separada de registrar_pedido_suporte_chat.
--
-- Só conta quando o chamado já está EM ANDAMENTO (um técnico assumiu e está
-- atendendo) — é o aviso de "o cliente respondeu enquanto eu não estava
-- olhando". Nos outros status não faz sentido: EM ABERTO ninguém assumiu ainda,
-- FINALIZADO/SEM RETORNO já fecharam o ciclo.
-- =============================================================================
alter table public.suportes
  add column mensagens_nao_lidas integer not null default 0
    check (mensagens_nao_lidas >= 0);

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

  update public.suportes
     set mensagens_nao_lidas = mensagens_nao_lidas + 1
   where status = 'EM ANDAMENTO'
     and (
       (v_lead is not null and kommo_lead_id = v_lead)
       or (v_lead is null and extras->>'kommo_talk_id' = v_talk)
     )
  returning id, mensagens_nao_lidas into v_id, v_novo;

  if v_id is null then
    return jsonb_build_object('acao', 'ignorado');
  end if;
  return jsonb_build_object('acao', 'contado', 'id', v_id, 'mensagens_nao_lidas', v_novo);
end;
$$;

comment on function public.registrar_mensagem_cliente is
  'Chamada pelo n8n (chave anon) a cada mensagem do cliente no chat do Kommo. Incrementa mensagens_nao_lidas só quando o chamado já está EM ANDAMENTO — vira a bolinha de aviso no card. O painel zera ao abrir o chamado, via atualizar_suporte (não precisa de função nova para isso).';

grant execute on function public.registrar_mensagem_cliente(text, text) to anon;
revoke execute on function public.registrar_mensagem_cliente(text, text) from public;
