-- Busca por número (pedido do usuário, 2026-10-09).
--
-- A coluna `busca` só tinha os textos como foram gravados: o telefone
-- "+5511944334807", o CNPJ com pontuação. Quem digitava o número de outro
-- jeito ("11 94433-4807", "11944334807") ou o número do lead do Kommo
-- ("55914262") não achava o chamado. Agora ela traz também o número do lead,
-- o CPF da finalização e a versão só com dígitos de protocolo, Doc. Cliente,
-- CPF e telefone (o painel manda o termo em dígitos também).
drop index if exists public.suportes_busca_trgm_idx;
alter table public.suportes drop column busca;
alter table public.suportes add column busca text generated always as (
  lower(public.sem_acento(
    protocolo || ' ' || nome_cliente || ' ' || cpf_cnpj || ' ' || contato || ' ' || responsavel_abertura
    || ' ' || coalesce(kommo_lead_id, '') || ' ' || cpf
    || ' ' || regexp_replace(protocolo, '\D', '', 'g')
    || ' ' || regexp_replace(cpf_cnpj, '\D', '', 'g')
    || ' ' || regexp_replace(cpf, '\D', '', 'g')
    || ' ' || regexp_replace(contato, '\D', '', 'g')
  ))
) stored;
create index suportes_busca_trgm_idx on public.suportes using gin (busca gin_trgm_ops);
