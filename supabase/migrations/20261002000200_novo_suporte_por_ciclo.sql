-- Lead que volta ao suporte abre um NOVO chamado (pedido do usuário, 2026-10-02).
--
-- Substitui a reabertura da migração 20261002000100: o chamado finalizado fica
-- como está (com a data, o técnico e os dados da finalização dele) e o retorno
-- do lead ao suporte vira OUTRO chamado, que o dashboard conta separado — dois
-- suportes. O novo nasce com os dados do cliente do anterior (nome, contato,
-- CPF/CNPJ, protocolo, email, tipo do certificado, conversa e contato do
-- Kommo); motivo, descrição, técnico, status, datas e dados da finalização
-- (valor, validade, sistema...) são deste atendimento e começam vazios.
--
-- Para isso a trava "um chamado por lead" (suportes_kommo_lead_id_key) vira
-- "um chamado ABERTO por lead": chamado encerrado deixa de ocupar o lead, e o
-- banco continua impedindo dois abertos ao mesmo tempo para o mesmo lead (duas
-- mensagens quase simultâneas não duplicam).

alter table public.suportes drop constraint suportes_kommo_lead_id_key;

create unique index suportes_lead_aberto_uk
  on public.suportes (kommo_lead_id)
  where kommo_lead_id is not null and status not in ('FINALIZADO', 'SEM RETORNO');

-- ---------------------------------------------------------------------------
-- criar_suporte_kommo ("Mudança de etapa" -> Etapa de suporte, via n8n)
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
  v_id       text;
  v_inserido boolean;
  v_achado   text;
  v_prev     public.suportes%rowtype;
  v_nome   text := coalesce(p_nome_cliente, '');
  v_resp   text := coalesce(p_responsavel_abertura, '');
  v_turno  text := coalesce(p_turno, '');
  v_tipo_c text := coalesce(p_tipo_certificado, '');
  v_prot   text := coalesce(p_protocolo, '');
  v_doc    text := coalesce(p_cpf_cnpj, '');
  v_tel    text := coalesce(p_contato, '');
  v_extras jsonb := coalesce(p_extras, '{}'::jsonb);
  v_texto  text;
begin
  if p_kommo_lead_id is null or p_kommo_lead_id = '' then
    raise exception 'kommo_lead_id é obrigatório.' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.suportes
     where kommo_lead_id = p_kommo_lead_id and status not in ('FINALIZADO', 'SEM RETORNO')
  ) then
    -- Sem chamado ABERTO para este lead: há um aberto do mesmo cliente
    -- (aberto à mão, ou de outro lead)? Liga ao lead e usa.
    v_achado := public.achar_chamado_aberto(
      v_extras->>'kommo_talk_id', v_extras->>'kommo_contact_id', v_tel, v_doc, v_prot
    );
    if v_achado is not null then
      perform public.vincular_chamado_ao_lead(
        v_achado, p_kommo_lead_id, coalesce(nullif(v_resp, ''), 'Automação Kommo'),
        'mesmo contato, telefone, documento ou protocolo'
      );
    else
      -- Nenhum aberto: o último chamado ENCERRADO deste lead (se houver) é a
      -- base do novo ciclo.
      select * into v_prev from public.suportes
       where kommo_lead_id = p_kommo_lead_id
       order by created_at desc
       limit 1;
    end if;
  end if;

  v_texto := case
    when v_prev.id is null then 'Chamado aberto automaticamente a partir do Kommo (Etapa de suporte)'
    else 'Novo suporte: o lead voltou para a Etapa de suporte no Kommo (o anterior, '
         || coalesce('protocolo ' || nullif(v_prev.protocolo, '') || ', ', '')
         || lower(v_prev.status)
         || coalesce(' em ' || to_char(v_prev.data_finalizacao at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'), '')
         || ', segue no histórico)'
  end;

  insert into public.suportes (
    kommo_lead_id, nome_cliente, responsavel_abertura, tecnico, turno,
    tipo_certificado, protocolo, cpf_cnpj, contato, email_cliente, tipo, ac,
    origem_integracao, extras, historico
  )
  values (
    p_kommo_lead_id,
    coalesce(nullif(v_nome, ''), v_prev.nome_cliente, ''),
    v_resp, '', v_turno,
    coalesce(nullif(v_tipo_c, ''), v_prev.tipo_certificado, ''),
    coalesce(nullif(v_prot, ''), v_prev.protocolo, ''),
    coalesce(nullif(v_doc, ''), v_prev.cpf_cnpj, ''),
    coalesce(nullif(v_tel, ''), v_prev.contato, ''),
    coalesce(v_prev.email_cliente, ''),
    coalesce(nullif(p_tipo, ''), v_prev.tipo, ''),
    coalesce(nullif(p_ac, ''), v_prev.ac, ''),
    'kommo',
    case
      when v_prev.id is null then v_extras
      else (coalesce(v_prev.extras, '{}'::jsonb) - 'kommo_suporte') || v_extras
           || jsonb_build_object('suporte_anterior_id', v_prev.id)
    end,
    jsonb_build_array(jsonb_build_object('em', now(), 'texto', v_texto, 'por', v_resp))
  )
  on conflict (kommo_lead_id) where kommo_lead_id is not null and status not in ('FINALIZADO', 'SEM RETORNO')
  do update set
    nome_cliente         = case when excluded.nome_cliente         <> '' and public.suportes.nome_cliente = '' then excluded.nome_cliente else public.suportes.nome_cliente end,
    responsavel_abertura = case when excluded.responsavel_abertura <> '' then excluded.responsavel_abertura else public.suportes.responsavel_abertura end,
    turno                = case when excluded.turno                <> '' then excluded.turno                else public.suportes.turno                end,
    tipo_certificado     = case when excluded.tipo_certificado     <> '' then excluded.tipo_certificado     else public.suportes.tipo_certificado     end,
    protocolo  = case when excluded.protocolo <> '' then excluded.protocolo else public.suportes.protocolo end,
    cpf_cnpj   = case when excluded.cpf_cnpj  <> '' then excluded.cpf_cnpj  else public.suportes.cpf_cnpj  end,
    contato    = case when excluded.contato   <> '' then excluded.contato   else public.suportes.contato   end,
    extras     = coalesce(public.suportes.extras, '{}'::jsonb) || excluded.extras
  returning id, (xmax = 0) into v_id, v_inserido;

  -- Novo ciclo: os chamados encerrados deste lead perdem a marca da etapa
  -- anterior (extras.kommo_suporte) — senão a rotina do Worker tiraria o lead
  -- da Etapa de suporte enquanto o chamado novo está em atendimento.
  if v_inserido and v_prev.id is not null then
    update public.suportes set extras = extras - 'kommo_suporte'
     where kommo_lead_id = p_kommo_lead_id and id <> v_id and extras ? 'kommo_suporte';
  end if;

  return v_id;
end;
$$;

grant execute on function public.criar_suporte_kommo(text, text, text, text, text, text, text, text, text, text, jsonb) to anon;
revoke execute on function public.criar_suporte_kommo(text, text, text, text, text, text, text, text, text, text, jsonb) from public;

-- ---------------------------------------------------------------------------
-- registrar_pedido_suporte_chat (IA do chat, via n8n): mesma regra.
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
  v_historico jsonb;
  v_linha   public.suportes%rowtype;
  v_prev    public.suportes%rowtype;
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

  -- 1) Já existe chamado ABERTO para este lead / esta conversa?
  if v_lead is not null then
    select * into v_linha from public.suportes
     where kommo_lead_id = v_lead and status not in ('FINALIZADO', 'SEM RETORNO')
     order by created_at desc
     limit 1
     for update;
  else
    select * into v_linha from public.suportes
     where extras->>'kommo_talk_id' = v_talk and status not in ('FINALIZADO', 'SEM RETORNO')
     order by created_at desc
     limit 1
     for update;
  end if;

  -- 1b) Não pelo lead: há um chamado ABERTO do mesmo cliente (aberto à mão,
  --     ou de um lead anterior)? Então é esse — liga ao lead atual.
  if v_linha.id is null then
    v_achado := public.achar_chamado_aberto(
      v_talk, p_kommo_contact_id, v_contato, v_cpf_cnpj, v_protocolo
    );
    if v_achado is not null then
      perform public.vincular_chamado_ao_lead(v_achado, v_lead, v_por, 'mesma conversa, contato, telefone, documento ou protocolo');
      select * into v_linha from public.suportes where id = v_achado for update;
    end if;
  end if;

  -- 2) Nenhum aberto: abre um chamado NOVO. Se o lead / a conversa já teve
  --    chamado (encerrado), é um novo suporte do mesmo cliente — copia os
  --    dados dele; o anterior continua como está.
  if v_linha.id is null then
    select * into v_prev from public.suportes
     where (v_lead is not null and kommo_lead_id = v_lead)
        or (v_lead is null and extras->>'kommo_talk_id' = v_talk)
     order by created_at desc
     limit 1;

    v_historico := case
      when v_prev.id is null then jsonb_build_array(v_entrada)
      else jsonb_build_array(
        jsonb_build_object(
          'em', v_agora, 'por', v_por,
          'texto', 'Novo suporte: o cliente voltou a pedir suporte no chat (o anterior, '
                   || coalesce('protocolo ' || nullif(v_prev.protocolo, '') || ', ', '')
                   || lower(v_prev.status)
                   || coalesce(' em ' || to_char(v_prev.data_finalizacao at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'), '')
                   || ', segue no histórico)'
        ),
        v_entrada
      )
    end;

    insert into public.suportes (
      kommo_lead_id, nome_cliente, responsavel_abertura, status, tipo,
      motivo_cat, motivo_detalhe, descricao, contato, protocolo, cpf_cnpj,
      email_cliente, tipo_certificado,
      origem_integracao, extras, historico
    )
    values (
      v_lead,
      coalesce(nullif(v_nome, ''), v_prev.nome_cliente, ''),
      v_por, 'EM ABERTO', v_tipo,
      v_motivo, v_resumo, v_desc,
      coalesce(nullif(v_contato, ''), v_prev.contato, ''),
      coalesce(nullif(v_protocolo, ''), v_prev.protocolo, ''),
      coalesce(nullif(v_cpf_cnpj, ''), v_prev.cpf_cnpj, ''),
      coalesce(nullif(v_email, ''), v_prev.email_cliente, ''),
      coalesce(nullif(v_tipo_cert, ''), v_prev.tipo_certificado, ''),
      'kommo-chat',
      case
        when v_prev.id is null then v_extras
        else (coalesce(v_prev.extras, '{}'::jsonb) - 'kommo_suporte') || v_extras
             || jsonb_build_object('suporte_anterior_id', v_prev.id)
      end,
      v_historico
    )
    on conflict (kommo_lead_id) where kommo_lead_id is not null and status not in ('FINALIZADO', 'SEM RETORNO')
    do nothing
    returning * into v_linha;

    if v_linha.id is not null then
      -- Novo ciclo: os encerrados deste lead perdem a marca da etapa anterior
      -- (ver criar_suporte_kommo).
      if v_prev.id is not null and v_lead is not null then
        update public.suportes set extras = extras - 'kommo_suporte'
         where kommo_lead_id = v_lead and id <> v_linha.id and extras ? 'kommo_suporte';
      end if;
      return jsonb_build_object('acao', 'criado', 'id', v_linha.id, 'novo_ciclo', v_prev.id is not null);
    end if;

    -- Outra execução (mensagem quase simultânea do mesmo lead) abriu o
    -- chamado entre o SELECT e o INSERT: segue como "já existe".
    select * into v_linha from public.suportes
     where kommo_lead_id = v_lead and status not in ('FINALIZADO', 'SEM RETORNO')
     order by created_at desc limit 1
     for update;
  end if;

  -- 3) Existe e está aberto: registra, a não ser que já tenha registrado há pouco.
  --    O CASE garante que só as entradas desta automação (com `em` sempre em
  --    ISO) passam pela conversão para data — entradas antigas do painel não
  --    podem derrubar a função.
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
-- registrar_mensagem_cliente (bolinha): a gravação da conversa só nos abertos.
-- ---------------------------------------------------------------------------
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

  -- Só os chamados abertos: os encerrados do mesmo lead são história e não
  -- devem ser mexidos por mensagens novas.
  if v_lead is not null and v_talk is not null then
    update public.suportes
       set extras = coalesce(extras, '{}'::jsonb) || jsonb_build_object('kommo_talk_id', v_talk)
     where kommo_lead_id = v_lead
       and status not in ('FINALIZADO', 'SEM RETORNO')
       and extras->>'kommo_talk_id' is distinct from v_talk;
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

grant execute on function public.registrar_mensagem_cliente(text, text) to anon;
revoke execute on function public.registrar_mensagem_cliente(text, text) from public;
