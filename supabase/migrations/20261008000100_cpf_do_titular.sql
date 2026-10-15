-- CPF próprio na finalização (pedido do usuário, 2026-10-08).
--
-- "Doc. Cliente" (cpf_cnpj) guarda o documento do certificado — num
-- certificado PJ é o CNPJ. O Kommo tem também um campo "CPF" (no lead,
-- numérico; no contato, texto) para o CPF da pessoa, que a tela de finalizar
-- não tinha. Vem do Kommo, da conversa ou da leitura de documentos (RG/CNH).
alter table public.suportes
  add column if not exists cpf text not null default '';
