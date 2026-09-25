-- =============================================================================
-- criar_suporte_kommo — porta de entrada para o n8n gravar direto no banco
-- quando um lead do Kommo chega em "Etapa de suporte".
--
-- Por que uma função, e não deixar o n8n mandar um INSERT/UPSERT genérico via
-- PostgREST com a chave anon: a chave anon é pública por desenho, e a RLS de
-- `suportes` hoje só libera leitura/escrita para quem está AUTENTICADO — o n8n
-- não tem (nem deveria ter) uma sessão de usuário. Dar a ele a service_role
-- abriria a conta Supabase inteira (usuários, config, tudo) para qualquer
-- vazamento do lado do n8n Cloud, que é um serviço de terceiro. Esta função é
-- SECURITY DEFINER com uma superfície mínima e fixa: só grava exatamente estes
-- campos, só nesta tabela, e é o único uso liberado para `anon`.
--
-- Upsert por `kommo_lead_id` (coluna já é `unique`): o mesmo lead nunca cria
-- um segundo chamado, só atualiza o que já existe — igual ao webhook do Kommo
-- que já roda no Worker. `tecnico` só é preenchido na criação: se um técnico já
-- foi atribuído manualmente no painel depois, uma nova chamada da automação
-- (por exemplo, o lead voltando para "Etapa de suporte") não apaga essa
-- atribuição.
-- =============================================================================
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
  v_id text;
begin
  if p_kommo_lead_id is null or p_kommo_lead_id = '' then
    raise exception 'kommo_lead_id é obrigatório.' using errcode = '22023';
  end if;

  insert into public.suportes (
    kommo_lead_id, nome_cliente, responsavel_abertura, tecnico, turno,
    tipo_certificado, protocolo, cpf_cnpj, contato, tipo, ac,
    origem_integracao, extras, historico
  )
  values (
    p_kommo_lead_id, p_nome_cliente, p_responsavel_abertura, '', p_turno,
    p_tipo_certificado, p_protocolo, p_cpf_cnpj, p_contato, p_tipo, p_ac,
    'kommo', p_extras,
    jsonb_build_array(jsonb_build_object(
      'em', now(), 'texto', 'Chamado aberto automaticamente a partir do Kommo (Etapa de suporte)',
      'por', p_responsavel_abertura
    ))
  )
  on conflict (kommo_lead_id) do update set
    nome_cliente         = excluded.nome_cliente,
    responsavel_abertura = excluded.responsavel_abertura,
    turno                = excluded.turno,
    tipo_certificado     = excluded.tipo_certificado,
    -- Protocolo/CPF/contato só são sobrescritos se vier algo novo — uma
    -- reentrada na etapa sem esses dados não pode apagar o que já foi
    -- preenchido antes (pelo Kommo ou por um técnico no painel).
    protocolo  = case when excluded.protocolo <> '' then excluded.protocolo else public.suportes.protocolo end,
    cpf_cnpj   = case when excluded.cpf_cnpj  <> '' then excluded.cpf_cnpj  else public.suportes.cpf_cnpj  end,
    contato    = case when excluded.contato   <> '' then excluded.contato   else public.suportes.contato   end,
    extras     = public.suportes.extras || excluded.extras
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.criar_suporte_kommo is
  'Chamada pelo n8n (chave anon) quando um lead do Kommo entra em "Etapa de suporte". Superfície fixa e mínima — não expor mais colunas aqui sem necessidade real.';

grant execute on function public.criar_suporte_kommo(text, text, text, text, text, text, text, text, text, text, jsonb) to anon;
revoke execute on function public.criar_suporte_kommo(text, text, text, text, text, text, text, text, text, text, jsonb) from public;
