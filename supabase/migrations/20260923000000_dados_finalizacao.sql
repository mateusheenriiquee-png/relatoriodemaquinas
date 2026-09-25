-- Dados pedidos ao técnico no momento de finalizar o suporte.
--
-- Colunas próprias (e não `extras`) porque são campos de relatório: filtrar por
-- tipo de certificado, somar valor por período, contar validade estendida. Em
-- jsonb isso funcionaria, mas cada consulta precisaria saber o caminho dentro
-- do documento — e o painel sobrescreve `extras` inteiro quando o grava.
alter table public.suportes
  add column email_cliente         text not null default '',
  add column comprou_outro_produto boolean,              -- null = não informado (chamados antigos)
  add column protocolo_certificado text not null default '',
  add column data_emissao          date,
  add column data_vencimento       date,
  add column tipo_certificado      text not null default '',
  add column validade_estendida    text not null default ''
    check (validade_estendida in ('', '1 ano', '2 anos', '3 anos')),
  add column sistema               text not null default '';

-- Emissão depois do vencimento é erro de digitação, não um certificado.
alter table public.suportes
  add constraint suportes_datas_certificado_ck
  check (data_emissao is null or data_vencimento is null or data_vencimento >= data_emissao);
