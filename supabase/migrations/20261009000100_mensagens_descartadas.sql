-- Possíveis pedidos de suporte que o filtro do chat descartou (2026-10-09).
--
-- Casos reais (Rogerio, Cantinho, Valdemar): o cliente pediu ajuda com palavras
-- que não estavam na lista, ou a IA achou que não era suporte, e ninguém ficou
-- sabendo. O n8n agora guarda essas mensagens aqui — só de cliente já em
-- "Videoconferência realizada" em diante, para não encher de conversa de venda —
-- e o painel mostra a lista com "Virar chamado" e "Ignorar".

create table public.mensagens_descartadas (
  id               uuid primary key default gen_random_uuid(),
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  kommo_lead_id    text,
  kommo_talk_id    text,
  kommo_contact_id text,
  nome             text not null default '',
  mensagem         text not null,
  motivo           text not null check (motivo in ('sem_palavra_chave', 'ia_nao_suporte')),
  resumo_ia        text not null default '',
  status           text not null default 'pendente' check (status in ('pendente', 'virou_chamado', 'ignorada')),
  chamado_id       text,
  revisado_por     text not null default '',
  revisado_em      timestamptz
);

create index mensagens_descartadas_pendentes_idx on public.mensagens_descartadas (status, atualizado_em desc);

alter table public.mensagens_descartadas enable row level security;
-- Leitura para quem está logado no painel; escrita só pelas funções abaixo.
create policy "mensagens_descartadas: leitura autenticada"
  on public.mensagens_descartadas for select to authenticated using (true);
revoke insert, update, delete on public.mensagens_descartadas from anon, authenticated;

alter publication supabase_realtime add table public.mensagens_descartadas;

-- ---------------------------------------------------------------------------
-- n8n -> guarda (ou atualiza) a mensagem descartada.
-- ---------------------------------------------------------------------------
create or replace function public.registrar_mensagem_descartada(
  p_mensagem         text,
  p_motivo           text,
  p_kommo_lead_id    text default '',
  p_kommo_talk_id    text default '',
  p_kommo_contact_id text default '',
  p_nome             text default '',
  p_resumo_ia        text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead text := nullif(btrim(coalesce(p_kommo_lead_id, '')), '');
  v_talk text := nullif(btrim(coalesce(p_kommo_talk_id, '')), '');
  v_msg  text := left(btrim(coalesce(p_mensagem, '')), 2000);
  v_id   uuid;
begin
  if v_msg = '' then
    raise exception 'mensagem é obrigatória.' using errcode = '22023';
  end if;
  if p_motivo not in ('sem_palavra_chave', 'ia_nao_suporte') then
    raise exception 'motivo inválido: %', p_motivo using errcode = '22023';
  end if;
  if v_lead is null and v_talk is null then
    raise exception 'informe kommo_lead_id ou kommo_talk_id.' using errcode = '22023';
  end if;

  -- Limpeza: pendentes esquecidas há mais de 30 dias saem da lista.
  delete from public.mensagens_descartadas
   where status = 'pendente' and atualizado_em < now() - interval '30 days';

  -- Cliente que já tem chamado aberto: a mensagem já é vista lá (bolinha).
  if exists (
    select 1 from public.suportes
     where status not in ('FINALIZADO', 'SEM RETORNO')
       and (
         (v_lead is not null and (kommo_lead_id = v_lead or coalesce(extras->'kommo_leads' ? v_lead, false)))
         or (v_talk is not null and extras->>'kommo_talk_id' = v_talk)
       )
  ) then
    return jsonb_build_object('acao', 'ignorado', 'motivo', 'cliente já tem chamado aberto');
  end if;

  -- Mesmo cliente nas últimas 24 h: atualiza a linha pendente em vez de criar outra.
  select id into v_id from public.mensagens_descartadas
   where status = 'pendente'
     and atualizado_em > now() - interval '24 hours'
     and ((v_lead is not null and kommo_lead_id = v_lead) or (v_talk is not null and kommo_talk_id = v_talk))
   order by atualizado_em desc
   limit 1;

  if v_id is not null then
    update public.mensagens_descartadas set
      mensagem         = v_msg,
      motivo           = p_motivo,
      resumo_ia        = left(coalesce(p_resumo_ia, ''), 300),
      nome             = case when nome = '' then left(coalesce(p_nome, ''), 120) else nome end,
      kommo_talk_id    = coalesce(kommo_talk_id, v_talk),
      kommo_contact_id = coalesce(kommo_contact_id, nullif(btrim(coalesce(p_kommo_contact_id, '')), '')),
      atualizado_em    = now()
    where id = v_id;
    return jsonb_build_object('acao', 'atualizado', 'id', v_id);
  end if;

  insert into public.mensagens_descartadas (kommo_lead_id, kommo_talk_id, kommo_contact_id, nome, mensagem, motivo, resumo_ia)
  values (v_lead, v_talk, nullif(btrim(coalesce(p_kommo_contact_id, '')), ''), left(coalesce(p_nome, ''), 120), v_msg, p_motivo, left(coalesce(p_resumo_ia, ''), 300))
  returning id into v_id;
  return jsonb_build_object('acao', 'criado', 'id', v_id);
end;
$$;

grant execute on function public.registrar_mensagem_descartada(text, text, text, text, text, text, text) to anon;
revoke execute on function public.registrar_mensagem_descartada(text, text, text, text, text, text, text) from public, authenticated;

-- ---------------------------------------------------------------------------
-- Painel -> "Virar chamado": abre (ou atualiza) o chamado como a IA faria.
-- ---------------------------------------------------------------------------
create or replace function public.converter_mensagem_descartada(p_id uuid, p_por text default '')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_linha public.mensagens_descartadas%rowtype;
  v_r     jsonb;
  v_chamado text;
begin
  select * into v_linha from public.mensagens_descartadas where id = p_id for update;
  if v_linha.id is null then
    raise exception 'Mensagem não encontrada.' using errcode = 'P0002';
  end if;
  if v_linha.status <> 'pendente' then
    return jsonb_build_object('acao', 'ja-revisada', 'status', v_linha.status, 'chamado_id', v_linha.chamado_id);
  end if;

  v_r := public.registrar_pedido_suporte_chat(
    p_mensagem         => v_linha.mensagem,
    p_kommo_lead_id    => coalesce(v_linha.kommo_lead_id, ''),
    p_kommo_talk_id    => coalesce(v_linha.kommo_talk_id, ''),
    p_kommo_contact_id => coalesce(v_linha.kommo_contact_id, ''),
    p_nome_cliente     => v_linha.nome,
    p_motivo_cat       => 'Outros',
    p_resumo           => 'Aberto pelo painel a partir de uma mensagem que o filtro do chat tinha descartado.',
    p_gatilho          => 'painel'
  );
  v_chamado := v_r->>'id';

  if v_chamado is not null then
    update public.suportes
       set historico = historico || jsonb_build_array(jsonb_build_object(
             'em', now(), 'por', coalesce(nullif(p_por, ''), 'Painel'),
             'texto', 'Chamado aberto a partir de "Possíveis pedidos de suporte" (o filtro do chat tinha descartado: '
                      || case v_linha.motivo when 'ia_nao_suporte' then 'a IA disse que não era suporte' else 'sem palavra-chave' end || ').'
           ))
     where id = v_chamado;
  end if;

  update public.mensagens_descartadas
     set status = 'virou_chamado', chamado_id = v_chamado, revisado_por = coalesce(p_por, ''), revisado_em = now()
   where id = p_id;
  return jsonb_build_object('acao', 'convertido', 'chamado_id', v_chamado);
end;
$$;

grant execute on function public.converter_mensagem_descartada(uuid, text) to authenticated;
revoke execute on function public.converter_mensagem_descartada(uuid, text) from public, anon;

create or replace function public.ignorar_mensagem_descartada(p_id uuid, p_por text default '')
returns void
language sql
security definer
set search_path = ''
as $$
  update public.mensagens_descartadas
     set status = 'ignorada', revisado_por = coalesce(p_por, ''), revisado_em = now()
   where id = p_id and status = 'pendente';
$$;

grant execute on function public.ignorar_mensagem_descartada(uuid, text) to authenticated;
revoke execute on function public.ignorar_mensagem_descartada(uuid, text) from public, anon;
