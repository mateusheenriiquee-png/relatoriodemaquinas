-- Finalização do suporte espelhando o card do lead no Kommo (2026-09-28).
--
-- 1) Valor V.E — valor da validade estendida, campo novo da tela de finalizar.
--    Opcional (nem toda venda tem V.E): null = não informado.
alter table public.suportes
  add column if not exists valor_ve numeric(12, 2)
    check (valor_ve is null or valor_ve >= 0);

-- 2) "Validade estendida" deixa de ter lista fixa no banco: as opções agora vêm
--    do próprio campo de lista do Kommo (a tela de finalizar lê de lá), e o
--    valor precisa bater com a opção do Kommo para ser gravado no lead. Uma
--    lista fixa aqui travaria a finalização no dia em que alguém criasse uma
--    opção nova no Kommo. O nome do check foi gerado pelo Postgres — por isso
--    procura pela definição em vez de assumir o nome.
do $$
declare
  v_nome text;
begin
  for v_nome in
    select conname
      from pg_constraint
     where conrelid = 'public.suportes'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) like '%validade_estendida%'
  loop
    execute format('alter table public.suportes drop constraint %I', v_nome);
  end loop;
end;
$$;

-- 3) criar_suporte_kommo: reentrada na "Etapa de suporte" não pode apagar nada.
--    Agora o próprio painel move o lead para essa etapa ao vincular o técnico,
--    o que dispara de novo o workflow "Etapa de suporte" do n8n — e o upsert
--    antigo sobrescrevia nome, responsável, turno e tipo do certificado mesmo
--    quando vinham vazios. Mesma regra que protocolo/CPF/contato já tinham:
--    só troca se vier preenchido.
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
    p_kommo_lead_id, coalesce(p_nome_cliente, ''), coalesce(p_responsavel_abertura, ''), '', coalesce(p_turno, ''),
    coalesce(p_tipo_certificado, ''), coalesce(p_protocolo, ''), coalesce(p_cpf_cnpj, ''), coalesce(p_contato, ''),
    coalesce(p_tipo, ''), coalesce(p_ac, ''),
    'kommo', coalesce(p_extras, '{}'::jsonb),
    jsonb_build_array(jsonb_build_object(
      'em', now(), 'texto', 'Chamado aberto automaticamente a partir do Kommo (Etapa de suporte)',
      'por', coalesce(p_responsavel_abertura, '')
    ))
  )
  on conflict (kommo_lead_id) do update set
    nome_cliente         = case when excluded.nome_cliente         <> '' then excluded.nome_cliente         else public.suportes.nome_cliente         end,
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
