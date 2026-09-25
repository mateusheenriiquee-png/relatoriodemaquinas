-- data_abertura passa a ter valor padrão (agora).
--
-- O Worker gravava `dataAbertura: agora` quando o webhook não trazia data, para o
-- chamado não sumir dos filtros de período. Com o upsert do PostgREST não dá para
-- dizer "só se for INSERT" em cada linha — mas um DEFAULT faz exatamente isso: vale
-- na criação e nunca sobrescreve uma linha existente que não enviou o campo.
alter table public.suportes alter column data_abertura set default now();
