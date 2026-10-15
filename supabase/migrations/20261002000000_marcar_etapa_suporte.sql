-- Etapa de suporte automática (pedido do usuário, 2026-10-02): todo lead que
-- vira chamado vai para a "Etapa de suporte" no Kommo e, ao finalizar, volta
-- para a etapa em que estava.
--
-- O Worker guarda a etapa anterior em extras.kommo_suporte:
--   { lead_id, etapa_anterior, pipeline_anterior, em }
-- A presença da chave também é a marca de "já entrou na Etapa de suporte
-- neste ciclo" — a rotina do Worker só processa chamados abertos SEM ela, e ao
-- devolver o lead a chave é apagada (um chamado reaberto entra de novo).
--
-- Função própria porque atualizar_suporte substitui o extras inteiro: aqui só
-- a chave kommo_suporte muda, sem apagar o que o n8n e o painel gravaram ao
-- lado (kommo_talk_id, kommo_contact_id...). Uso só do Worker (service role).
create or replace function public.marcar_etapa_suporte(
  p_id        text,
  p_dados     jsonb default null,   -- null = apagar a marca
  p_historico jsonb default null    -- entrada opcional na linha do tempo
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.suportes set
    extras = case
      when p_dados is null then coalesce(extras, '{}'::jsonb) - 'kommo_suporte'
      else coalesce(extras, '{}'::jsonb) || jsonb_build_object('kommo_suporte', p_dados)
    end,
    historico = case
      when p_historico is null then historico
      else historico || jsonb_build_array(p_historico)
    end
  where id = p_id;
  if not found then
    raise exception 'Chamado % não encontrado.', p_id using errcode = 'P0002';
  end if;
end;
$$;

-- O Supabase dá EXECUTE a anon/authenticated direto (default privileges).
revoke execute on function public.marcar_etapa_suporte(text, jsonb, jsonb) from public, anon, authenticated;
