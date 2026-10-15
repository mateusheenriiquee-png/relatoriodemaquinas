-- O CNPJ da própria Certify não identifica cliente nenhum (2026-10-06).
--
-- As mensagens-modelo que a Certify manda no chat trazem o CNPJ da empresa
-- (57.983.065/0001-11). A leitura da conversa no n8n o pegava como se fosse
-- do cliente, e a regra "não duplicar chamado" (achar_chamado_aberto) passou a
-- ligar todo cliente novo do chat ao único chamado aberto que já tinha esse
-- CNPJ — 9 clientes diferentes caíram no mesmo chamado entre 02 e 06/10, e
-- 18 chamados ficaram com o CNPJ da Certify no campo do cliente.
--
-- Aqui: (1) a busca ignora esse documento; (2) ele sai dos chamados, com uma
-- linha no histórico. O n8n também deixa de ler o CNPJ (Montar contexto).

create or replace function public.doc_da_certify(p_doc text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(coalesce(p_doc, ''), '\D', '', 'g') in ('57983065000111');
$$;

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
  if length(v_doc) not in (11, 14) or public.doc_da_certify(v_doc) then v_doc := null; end if;
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

revoke execute on function public.achar_chamado_aberto(text, text, text, text, text) from public, anon, authenticated;

-- Os chamados que ficaram com o CNPJ da Certify.
update public.suportes
   set cpf_cnpj = '',
       historico = historico || jsonb_build_array(jsonb_build_object(
         'em', now(), 'por', 'Sistema',
         'texto', 'CPF/CNPJ apagado: era o CNPJ da própria Certify (57.983.065/0001-11), lido por engano das mensagens-modelo do chat.'
       ))
 where public.doc_da_certify(cpf_cnpj);
