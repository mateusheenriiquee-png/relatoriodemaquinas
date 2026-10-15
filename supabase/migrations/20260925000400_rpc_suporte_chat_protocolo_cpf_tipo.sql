-- Acrescenta p_protocolo e p_cpf_cnpj (o n8n já busca isso em duas fontes: nos
-- custom_fields do LEAD, e — quando o lead não tem o campo — pede pra IA achar
-- na própria conversa, só se o cliente tiver digitado; nunca inventado).
-- `tipo` não veio como parâmetro novo: é derivado aqui mesmo a partir do
-- motivo já classificado, então o n8n não precisa saber a regra.
--
-- Mesma proteção de sempre: só grava se vier preenchido, nunca sobrescreve o
-- que já estiver lá (preenchido à mão ou por outra automação).
drop function if exists public.registrar_pedido_suporte_chat(text, text, text, text, text, text, text, text, text, text);

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
  p_cpf_cnpj         text default ''
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
  -- Só as categorias do painel (src/frontend/web/src/utils/catalogos.js);
  -- qualquer outra coisa que a IA devolver vira "Outros", nunca vazio.
  v_motivo text := case
    when p_motivo_cat in ('Instalação A1', 'Instalação A3', 'Exportar certificado', 'Alteração de senha', 'Outros')
      then p_motivo_cat
    else 'Outros'
  end;
  -- Só duas opções no painel (SuporteFormModal.jsx): "Instalação" ou "Suporte
  -- tecnico". Instalação A1/A3 vira Instalação; o resto é suporte comum.
  v_tipo text := case when v_motivo like 'Instalação%' then 'Instalação' else 'Suporte tecnico' end;
  v_extras  jsonb := jsonb_strip_nulls(jsonb_build_object(
    'kommo_talk_id',    v_talk,
    'kommo_contact_id', nullif(btrim(coalesce(p_kommo_contact_id, '')), ''),
    'gatilho_chat',     nullif(btrim(coalesce(p_gatilho, '')), '')
  ));
  v_entrada jsonb;
  v_linha   public.suportes%rowtype;
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

  -- 2) Não existe: abre.
  if not found then
    insert into public.suportes (
      kommo_lead_id, nome_cliente, responsavel_abertura, status, tipo,
      motivo_cat, motivo_detalhe, descricao, contato, protocolo, cpf_cnpj,
      origem_integracao, extras, historico
    )
    values (
      v_lead, v_nome, v_por, 'EM ABERTO', v_tipo,
      v_motivo, v_resumo, v_desc, v_contato, v_protocolo, v_cpf_cnpj,
      'kommo-chat', v_extras, jsonb_build_array(v_entrada)
    )
    on conflict (kommo_lead_id) do nothing
    returning * into v_linha;

    if found then
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
  --    O CASE garante que só as entradas desta automação (com `em` sempre em
  --    ISO) passam pela conversão para data — entradas antigas do painel não
  --    podem derrubar a função.
  if exists (
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
    nome_cliente   = case when nome_cliente = '' then v_nome else nome_cliente end,
    extras         = extras || v_extras,
    historico      = historico || jsonb_build_array(v_entrada)
  where id = v_linha.id;
  return jsonb_build_object('acao', 'atualizado', 'id', v_linha.id);
end;
$$;

comment on function public.registrar_pedido_suporte_chat is
  'Chamada pelo n8n (chave anon) quando a IA detecta pedido de suporte no chat do Kommo. Abre, atualiza ou reabre o chamado do lead.';

grant execute on function public.registrar_pedido_suporte_chat(text, text, text, text, text, text, text, text, text, text, text, text) to anon;
revoke execute on function public.registrar_pedido_suporte_chat(text, text, text, text, text, text, text, text, text, text, text, text) from public;
