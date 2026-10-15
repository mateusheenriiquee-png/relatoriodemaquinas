-- Tempo em que o chamado ficou REAGENDADO (pedido do usuário, 2026-10-05).
--
-- O dashboard desconta esse tempo da fila, do atendimento e da conclusão: o
-- cliente pediu para ser atendido depois, então a espera não é demora da
-- equipe. Cada ida para REAGENDADO abre um período {de, ate}; a saída (pelo
-- painel, pela edição ou pelo Cron do Worker que reabre os vencidos) fecha.
--
-- Quem grava é um gatilho no banco, e não o painel: o status muda por vários
-- caminhos (inclusive o PATCH do Cron, que não escreve histórico), e o gatilho
-- pega todos. Pelo mesmo motivo a coluna não aceita escrita de fora: num UPDATE
-- ela sempre parte do valor antigo.

alter table public.suportes
  add column if not exists periodos_reagendado jsonb not null default '[]'::jsonb;

create or replace function public.registrar_periodo_reagendado()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_n integer;
begin
  if tg_op = 'INSERT' then
    new.periodos_reagendado := case
      when new.status = 'REAGENDADO' then jsonb_build_array(jsonb_build_object('de', now(), 'ate', null))
      else '[]'::jsonb
    end;
    return new;
  end if;

  new.periodos_reagendado := coalesce(old.periodos_reagendado, '[]'::jsonb);
  if new.status is not distinct from old.status then
    return new;
  end if;

  if new.status = 'REAGENDADO' then
    new.periodos_reagendado := new.periodos_reagendado
      || jsonb_build_array(jsonb_build_object('de', now(), 'ate', null));
  elsif old.status = 'REAGENDADO' then
    v_n := jsonb_array_length(new.periodos_reagendado);
    if v_n > 0 and new.periodos_reagendado -> (v_n - 1) ->> 'ate' is null then
      new.periodos_reagendado := jsonb_set(
        new.periodos_reagendado, array[(v_n - 1)::text, 'ate'], to_jsonb(now())
      );
    end if;
  end if;
  return new;
end;
$$;

-- Chamados que já passaram por REAGENDADO: reconstrói pelo histórico.
-- Início = a linha "… → REAGENDADO". Fim = a próxima linha "Status: …" ou o
-- horário marcado ("· para 06/10/2026, 09:00:00", hora de Brasília — é quando o
-- Cron reabre, e ele não escreve histórico), o que vier primeiro. O último
-- período de quem ainda está REAGENDADO fica aberto.
with idas as (
  select s.id, s.status, (h.e->>'em')::timestamptz as de, h.ord,
         to_timestamp(substring(h.e->>'texto' from 'para (\d{2}/\d{2}/\d{4}, \d{2}:\d{2})'), 'DD/MM/YYYY, HH24:MI')::timestamp
           at time zone 'America/Sao_Paulo' as marcado
    from public.suportes s,
         jsonb_array_elements(s.historico) with ordinality as h(e, ord)
   where h.e->>'texto' ~ '→ REAGENDADO'
     and h.e->>'em' ~ '^\d{4}-\d{2}-\d{2}T'
),
periodos as (
  select i.id, i.de, i.status,
         (select (p.e->>'em')::timestamptz
            from public.suportes s2, jsonb_array_elements(s2.historico) with ordinality as p(e, ord)
           where s2.id = i.id and p.ord > i.ord
             and p.e->>'texto' like 'Status:%'
             and p.e->>'em' ~ '^\d{4}-\d{2}-\d{2}T'
           order by p.ord limit 1) as proxima,
         i.marcado,
         row_number() over (partition by i.id order by i.ord desc) as de_tras
    from idas i
),
fechados as (
  select id,
         jsonb_agg(jsonb_build_object(
           'de', de,
           'ate', case
             when status = 'REAGENDADO' and de_tras = 1 then null
             else to_jsonb(least(proxima, greatest(marcado, de)))
           end
         ) order by de) as lista
    from periodos
   group by id
)
update public.suportes s
   set periodos_reagendado = f.lista
  from fechados f
 where s.id = f.id;

-- Só depois do preenchimento acima: o gatilho não deixa o UPDATE de fora mudar a coluna.
drop trigger if exists suportes_periodo_reagendado on public.suportes;
create trigger suportes_periodo_reagendado
  before insert or update on public.suportes
  for each row execute function public.registrar_periodo_reagendado();
