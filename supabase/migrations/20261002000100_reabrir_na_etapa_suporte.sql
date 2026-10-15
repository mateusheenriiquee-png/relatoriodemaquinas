-- Lead que volta para a "Etapa de suporte" reabre o chamado encerrado (2026-10-02).
--
-- criar_suporte_kommo (webhook "Mudança de etapa" -> n8n) só atualizava os dados
-- do chamado do lead; se ele estava FINALIZADO / SEM RETORNO continuava assim,
-- e o cliente voltava ao suporte sem aparecer na fila. Agora, como o chat
-- (registrar_pedido_suporte_chat) já fazia, o chamado é REABERTO: volta para
-- EM ABERTO, sem técnico e sem as datas do atendimento anterior, e o histórico
-- registra o motivo. Chamado que já está aberto não muda de status.
--
-- Também apaga extras.kommo_suporte (a etapa anterior do ciclo passado): o
-- lead acabou de entrar na Etapa de suporte de novo e a rotina do Worker grava
-- a marca nova, com a etapa de onde ele veio agora (kommo_etapa_anterior, que
-- chega em p_extras e sobrescreve o antigo).
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
    -- Reabertura: encerrado volta para EM ABERTO, sem técnico nem datas do
    -- atendimento anterior. Aberto continua como está.
    status                  = case when public.suportes.status in ('FINALIZADO', 'SEM RETORNO') then 'EM ABERTO' else public.suportes.status end,
    tecnico                 = case when public.suportes.status in ('FINALIZADO', 'SEM RETORNO') then '' else public.suportes.tecnico end,
    data_inicio_atendimento = case when public.suportes.status in ('FINALIZADO', 'SEM RETORNO') then null else public.suportes.data_inicio_atendimento end,
    data_finalizacao        = case when public.suportes.status in ('FINALIZADO', 'SEM RETORNO') then null else public.suportes.data_finalizacao end,
    extras = case
      when public.suportes.status in ('FINALIZADO', 'SEM RETORNO')
        then (coalesce(public.suportes.extras, '{}'::jsonb) - 'kommo_suporte') || excluded.extras
      else coalesce(public.suportes.extras, '{}'::jsonb) || excluded.extras
    end,
    historico = case
      when public.suportes.status in ('FINALIZADO', 'SEM RETORNO')
        then public.suportes.historico || jsonb_build_array(jsonb_build_object(
          'em', now(),
          'por', coalesce(nullif(excluded.responsavel_abertura, ''), 'Automação Kommo'),
          'texto', 'Status: ' || public.suportes.status || ' → EM ABERTO (lead voltou para a Etapa de suporte no Kommo)'
        ))
      else public.suportes.historico
    end
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.criar_suporte_kommo(text, text, text, text, text, text, text, text, text, text, jsonb) to anon;
revoke execute on function public.criar_suporte_kommo(text, text, text, text, text, text, text, text, text, text, jsonb) from public;
