-- Não abrir um segundo chamado para quem já tem um aberto (2026-09-29).
--
-- As duas automações (chat e "Etapa de suporte") só reconheciam um chamado
-- existente pelo número do lead do Kommo. Isso duplicava em dois casos reais:
--   1. o chamado foi aberto à mão (painel ou subsite de cadastro) — não tem
--      kommo_lead_id nenhum;
--   2. o cliente voltou a escrever e o Kommo criou um LEAD NOVO para ele (é o
--      comportamento padrão quando o lead anterior já estava fechado).
--
-- Agora, quando não há chamado para o lead, procura-se um chamado AINDA ABERTO
-- (EM ABERTO / EM ANDAMENTO / REAGENDADO) do mesmo cliente — pela conversa,
-- pelo contato do Kommo, pelo telefone, pelo CPF/CNPJ ou pelo protocolo. Se
-- achar, esse chamado é atualizado e passa a apontar para o lead atual (o
-- anterior fica em extras.kommo_lead_anterior). Chamado já encerrado não é
-- reaproveitado por essas pistas: um cliente que volta depois de finalizado
-- é um atendimento novo.

-- Telefone em qualquer formato -> DDD + número com 9 dígitos, sem o 55.
-- "(24) 8131-2303", "+55 24 98131-2303" e "5524981312303" viram "24981312303".
create or replace function public.normalizar_telefone(p_texto text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  d text := regexp_replace(coalesce(p_texto, ''), '\D', '', 'g');
begin
  if length(d) >= 12 and left(d, 2) = '55' then
    d := substr(d, 3);
  end if;
  -- Celular antigo sem o 9 na frente.
  if length(d) = 10 and substr(d, 3, 1) in ('6', '7', '8', '9') then
    d := left(d, 2) || '9' || substr(d, 3);
  end if;
  return case when length(d) in (10, 11) then d end;
end;
$$;

-- Chamado aberto do mesmo cliente. Uso interno das duas funções abaixo: não é
-- liberada para anon (não é uma porta de consulta de dados de cliente).
create or replace function public.achar_chamado_aberto(
  p_kommo_talk_id    text default '',
  p_kommo_contact_id text default '',
  p_contato          text default '',
  p_cpf_cnpj         text default '',
  p_protocolo        text default ''
)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_talk    text := nullif(btrim(coalesce(p_kommo_talk_id, '')), '');
  v_contact text := nullif(btrim(coalesce(p_kommo_contact_id, '')), '');
  v_tel     text := public.normalizar_telefone(p_contato);
  v_doc     text := regexp_replace(coalesce(p_cpf_cnpj, ''), '\D', '', 'g');
  v_prot    text := regexp_replace(coalesce(p_protocolo, ''), '\D', '', 'g');
  v_id      text;
begin
  if length(v_doc) not in (11, 14) then v_doc := null; end if;
  if length(v_prot) < 6 then v_prot := null; end if;
  if v_talk is null and v_contact is null and v_tel is null and v_doc is null and v_prot is null then
    return null;
  end if;

  select s.id into v_id
    from public.suportes s
   where s.status in ('EM ABERTO', 'EM ANDAMENTO', 'REAGENDADO')
     and (
       (v_talk    is not null and s.extras->>'kommo_talk_id' = v_talk)
       or (v_contact is not null and s.extras->>'kommo_contact_id' = v_contact)
       or (v_tel     is not null and public.normalizar_telefone(s.contato) = v_tel)
       or (v_doc     is not null and regexp_replace(s.cpf_cnpj, '\D', '', 'g') = v_doc)
       or (v_prot    is not null and regexp_replace(s.protocolo, '\D', '', 'g') = v_prot)
     )
   -- Pista mais forte primeiro (mesma conversa > mesmo contato > telefone >
   -- documento > protocolo); empate, o mais recente.
   order by
     case
       when v_talk    is not null and s.extras->>'kommo_talk_id' = v_talk then 1
       when v_contact is not null and s.extras->>'kommo_contact_id' = v_contact then 2
       when v_tel     is not null and public.normalizar_telefone(s.contato) = v_tel then 3
       when v_doc     is not null and regexp_replace(s.cpf_cnpj, '\D', '', 'g') = v_doc then 4
       else 5
     end,
     s.created_at desc
   limit 1;
  return v_id;
end;
$$;

-- O Supabase dá EXECUTE a anon/authenticated direto (default privileges), não
-- só via PUBLIC — por isso o revoke nomeia os três.
revoke execute on function public.achar_chamado_aberto(text, text, text, text, text) from public, anon, authenticated;

-- Liga um chamado achado pelas pistas ao lead atual, guardando o anterior.
-- Só é chamada quando nenhum chamado tem v_lead (então o unique não quebra).
create or replace function public.vincular_chamado_ao_lead(p_id text, p_lead text, p_por text, p_motivo text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if nullif(btrim(coalesce(p_lead, '')), '') is null then return; end if;
  update public.suportes set
    extras = extras
      || case when kommo_lead_id is not null and kommo_lead_id <> p_lead
              then jsonb_build_object('kommo_lead_anterior', kommo_lead_id) else '{}'::jsonb end,
    kommo_lead_id = p_lead,
    historico = historico || jsonb_build_array(jsonb_build_object(
      'em', now(), 'por', p_por,
      'texto', 'Chamado já aberto ligado ao lead ' || p_lead || ' do Kommo (mesmo cliente: ' || p_motivo || ') — não foi aberto outro.'
    ))
  where id = p_id
    and kommo_lead_id is distinct from p_lead;
end;
$$;

revoke execute on function public.vincular_chamado_ao_lead(text, text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- registrar_pedido_suporte_chat: mesma função, com o passo 1b.
-- ---------------------------------------------------------------------------
create or replace function public.registrar_pedido_suporte_chat(
  p_mensagem         text,
  p_kommo_lead_id    text default '',
  p_kommo_talk_id    text default '',
  p_kommo_contact_id text default '',
  p_nome_cliente     text default '',
  p_motivo_cat       text default '',
  p_resumo           text default '',
  p_gatilho          text default '',
  p_descricao        text default '',
  p_contato          text default '',
  p_protocolo        text default '',
  p_cpf_cnpj         text default '',
  p_email_cliente    text default '',
  p_tipo_certificado text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_por    constant text := 'Automação Kommo (IA)';
  v_agora  constant timestamptz := now();
  v_lead   text := nullif(btrim(coalesce(p_kommo_lead_id, '')), '');
  v_talk   text := nullif(btrim(coalesce(p_kommo_talk_id, '')), '');
  v_msg    text := btrim(coalesce(p_mensagem, ''));
  v_nome   text := left(btrim(coalesce(p_nome_cliente, '')), 120);
  v_resumo text := left(btrim(coalesce(p_resumo, '')), 300);
  v_desc   text := left(btrim(coalesce(p_descricao, '')), 1000);
  v_contato text := left(btrim(coalesce(p_contato, '')), 60);
  v_protocolo text := left(btrim(coalesce(p_protocolo, '')), 80);
  v_cpf_cnpj  text := left(btrim(coalesce(p_cpf_cnpj, '')), 32);
  v_email     text := left(btrim(coalesce(p_email_cliente, '')), 160);
  v_tipo_cert text := left(btrim(coalesce(p_tipo_certificado, '')), 80);
  v_motivo text := case
    when p_motivo_cat in ('Instalação A1', 'Instalação A3', 'Exportar certificado', 'Alteração de senha', 'Outros')
      then p_motivo_cat
    else 'Outros'
  end;
  v_tipo text := case when v_motivo like 'Instalação%' then 'Instalação' else 'Suporte tecnico' end;
  v_extras  jsonb := jsonb_strip_nulls(jsonb_build_object(
    'kommo_talk_id',    v_talk,
    'kommo_contact_id', nullif(btrim(coalesce(p_kommo_contact_id, '')), ''),
    'gatilho_chat',     nullif(btrim(coalesce(p_gatilho, '')), '')
  ));
  v_entrada jsonb;
  v_linha   public.suportes%rowtype;
  v_achado  text;
begin
  if v_msg = '' then
    raise exception 'mensagem é obrigatória.' using errcode = '22023';
  end if;
  if v_lead is null and v_talk is null then
    raise exception 'informe kommo_lead_id ou kommo_talk_id.' using errcode = '22023';
  end if;

  v_entrada := jsonb_build_object(
    'em', v_agora,
    'por', v_por,
    'texto', 'Cliente pediu suporte no chat: "' || left(v_msg, 200) || '"'
             || case when v_resumo <> '' then ' · ' || v_resumo else '' end
  );

  -- 1) Já existe chamado para este lead / esta conversa?
  if v_lead is not null then
    select * into v_linha from public.suportes where kommo_lead_id = v_lead for update;
  else
    select * into v_linha from public.suportes
     where extras->>'kommo_talk_id' = v_talk
     order by created_at desc
     limit 1
     for update;
  end if;

  -- 1b) Não pelo lead: há um chamado ABERTO do mesmo cliente (aberto à mão,
  --     ou de um lead anterior)? Então é esse — liga ao lead atual.
  if not found then
    v_achado := public.achar_chamado_aberto(
      v_talk, p_kommo_contact_id, v_contato, v_cpf_cnpj, v_protocolo
    );
    if v_achado is not null then
      perform public.vincular_chamado_ao_lead(v_achado, v_lead, v_por, 'mesma conversa, contato, telefone, documento ou protocolo');
      select * into v_linha from public.suportes where id = v_achado for update;
    end if;
  end if;

  -- 2) Não existe: abre.
  if v_linha.id is null then
    insert into public.suportes (
      kommo_lead_id, nome_cliente, responsavel_abertura, status, tipo,
      motivo_cat, motivo_detalhe, descricao, contato, protocolo, cpf_cnpj,
      email_cliente, tipo_certificado,
      origem_integracao, extras, historico
    )
    values (
      v_lead, v_nome, v_por, 'EM ABERTO', v_tipo,
      v_motivo, v_resumo, v_desc, v_contato, v_protocolo, v_cpf_cnpj,
      v_email, v_tipo_cert,
      'kommo-chat', v_extras, jsonb_build_array(v_entrada)
    )
    on conflict (kommo_lead_id) do nothing
    returning * into v_linha;

    if v_linha.id is not null then
      return jsonb_build_object('acao', 'criado', 'id', v_linha.id);
    end if;

    -- Outra execução (mensagem quase simultânea do mesmo lead) criou o
    -- chamado entre o SELECT e o INSERT: segue como "já existe".
    select * into v_linha from public.suportes where kommo_lead_id = v_lead for update;
  end if;

  -- 3) Existe e está encerrado: reabre.
  if v_linha.status in ('FINALIZADO', 'SEM RETORNO') then
    update public.suportes set
      status                  = 'EM ABERTO',
      tecnico                 = '',
      data_inicio_atendimento = null,
      data_finalizacao        = null,
      tipo                    = v_tipo,
      motivo_cat              = v_motivo,
      motivo_detalhe          = v_resumo,
      descricao               = case when v_desc <> '' then v_desc else descricao end,
      contato                 = case when contato = '' then v_contato else contato end,
      protocolo               = case when protocolo = '' then v_protocolo else protocolo end,
      cpf_cnpj                = case when cpf_cnpj = '' then v_cpf_cnpj else cpf_cnpj end,
      email_cliente           = case when email_cliente = '' then v_email else email_cliente end,
      tipo_certificado        = case when tipo_certificado = '' then v_tipo_cert else tipo_certificado end,
      nome_cliente            = case when nome_cliente = '' then v_nome else nome_cliente end,
      extras                  = extras || v_extras,
      historico               = historico || jsonb_build_array(
        jsonb_build_object(
          'em', v_agora, 'por', v_por,
          'texto', 'Status: ' || v_linha.status || ' → EM ABERTO (reaberto pela automação do chat)'
        ),
        v_entrada
      )
    where id = v_linha.id;
    return jsonb_build_object('acao', 'reaberto', 'id', v_linha.id);
  end if;

  -- 4) Existe e está aberto: registra, a não ser que já tenha registrado há pouco.
  --    Chamado recém-ligado (1b) sempre registra: a entrada "ligado ao lead"
  --    que acabou de ser escrita não conta como pedido repetido.
  if v_achado is null and exists (
    select 1
      from jsonb_array_elements(v_linha.historico) h
     where case when h->>'por' = v_por then (h->>'em')::timestamptz end
           > v_agora - interval '15 minutes'
  ) then
    return jsonb_build_object('acao', 'ignorado', 'id', v_linha.id);
  end if;

  update public.suportes set
    motivo_cat     = case when motivo_cat = '' then v_motivo else motivo_cat end,
    motivo_detalhe = case when motivo_detalhe = '' then v_resumo else motivo_detalhe end,
    descricao      = case when descricao = '' then v_desc else descricao end,
    contato        = case when contato = '' then v_contato else contato end,
    protocolo      = case when protocolo = '' then v_protocolo else protocolo end,
    cpf_cnpj       = case when cpf_cnpj = '' then v_cpf_cnpj else cpf_cnpj end,
    email_cliente  = case when email_cliente = '' then v_email else email_cliente end,
    tipo_certificado = case when tipo_certificado = '' then v_tipo_cert else tipo_certificado end,
    nome_cliente   = case when nome_cliente = '' then v_nome else nome_cliente end,
    extras         = extras || v_extras,
    historico      = historico || jsonb_build_array(v_entrada)
  where id = v_linha.id;
  return jsonb_build_object(
    'acao', case when v_achado is not null then 'vinculado' else 'atualizado' end,
    'id', v_linha.id
  );
end;
$$;

grant execute on function public.registrar_pedido_suporte_chat(text, text, text, text, text, text, text, text, text, text, text, text, text, text) to anon;
revoke execute on function public.registrar_pedido_suporte_chat(text, text, text, text, text, text, text, text, text, text, text, text, text, text) from public;

-- ---------------------------------------------------------------------------
-- criar_suporte_kommo ("Etapa de suporte"): mesma regra antes do insert.
-- ---------------------------------------------------------------------------
create or replace function public.criar_suporte_kommo(
  p_kommo_lead_id     text,
  p_nome_cliente      text default '',
  p_responsavel_abertura text default '',
  p_turno             text default '',
  p_tipo_certificado  text default '',
  p_protocolo         text default '',
  p_cpf_cnpj          text default '',
  p_contato           text default '',
  p_tipo              text default '',
  p_ac                text default '',
  p_extras            jsonb default '{}'::jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id     text;
  v_achado text;
  v_nome   text := coalesce(p_nome_cliente, '');
  v_resp   text := coalesce(p_responsavel_abertura, '');
  v_turno  text := coalesce(p_turno, '');
  v_tipo_c text := coalesce(p_tipo_certificado, '');
  v_prot   text := coalesce(p_protocolo, '');
  v_doc    text := coalesce(p_cpf_cnpj, '');
  v_tel    text := coalesce(p_contato, '');
  v_extras jsonb := coalesce(p_extras, '{}'::jsonb);
begin
  if p_kommo_lead_id is null or p_kommo_lead_id = '' then
    raise exception 'kommo_lead_id é obrigatório.' using errcode = '22023';
  end if;

  -- Sem chamado para este lead: há um aberto do mesmo cliente? Liga e usa.
  if not exists (select 1 from public.suportes where kommo_lead_id = p_kommo_lead_id) then
    v_achado := public.achar_chamado_aberto(
      v_extras->>'kommo_talk_id', v_extras->>'kommo_contact_id', v_tel, v_doc, v_prot
    );
    if v_achado is not null then
      perform public.vincular_chamado_ao_lead(
        v_achado, p_kommo_lead_id, coalesce(nullif(v_resp, ''), 'Automação Kommo'),
        'mesmo contato, telefone, documento ou protocolo'
      );
    end if;
  end if;

  insert into public.suportes (
    kommo_lead_id, nome_cliente, responsavel_abertura, tecnico, turno,
    tipo_certificado, protocolo, cpf_cnpj, contato, tipo, ac,
    origem_integracao, extras, historico
  )
  values (
    p_kommo_lead_id, v_nome, v_resp, '', v_turno,
    v_tipo_c, v_prot, v_doc, v_tel, coalesce(p_tipo, ''), coalesce(p_ac, ''),
    'kommo', v_extras,
    jsonb_build_array(jsonb_build_object(
      'em', now(), 'texto', 'Chamado aberto automaticamente a partir do Kommo (Etapa de suporte)',
      'por', v_resp
    ))
  )
  on conflict (kommo_lead_id) do update set
    nome_cliente         = case when excluded.nome_cliente         <> '' and public.suportes.nome_cliente = '' then excluded.nome_cliente else public.suportes.nome_cliente end,
    responsavel_abertura = case when excluded.responsavel_abertura <> '' then excluded.responsavel_abertura else public.suportes.responsavel_abertura end,
    turno                = case when excluded.turno                <> '' then excluded.turno                else public.suportes.turno                end,
    tipo_certificado     = case when excluded.tipo_certificado     <> '' then excluded.tipo_certificado     else public.suportes.tipo_certificado     end,
    protocolo  = case when excluded.protocolo <> '' then excluded.protocolo else public.suportes.protocolo end,
    cpf_cnpj   = case when excluded.cpf_cnpj  <> '' then excluded.cpf_cnpj  else public.suportes.cpf_cnpj  end,
    contato    = case when excluded.contato   <> '' then excluded.contato   else public.suportes.contato   end,
    extras     = public.suportes.extras || excluded.extras
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.criar_suporte_kommo(text, text, text, text, text, text, text, text, text, text, jsonb) to anon;
revoke execute on function public.criar_suporte_kommo(text, text, text, text, text, text, text, text, text, text, jsonb) from public;
