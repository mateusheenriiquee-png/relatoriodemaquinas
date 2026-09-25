---
name: kommo-webhook-integration
description: Guia de referência para trabalhar na integração deste projeto (suportetecnico-api) com o Kommo CRM — o webhook /webhook/kommo, o mapeamento de leads para a tabela suportes, tokens e limites da API do Kommo. Use este skill sempre que a tarefa envolver Kommo, CRM, webhook de lead, status_id, pipeline, integração privada do Kommo, KOMMO_ACCESS_TOKEN/KOMMO_BASE_URL, ou qualquer dúvida sobre por que um dado do Kommo apareceu (ou não) na tabela `suportes` — mesmo que o usuário não diga "Kommo" explicitamente e só descreva um chamado que veio de um lead, um funil de vendas, ou um webhook que não está batendo.
---

# Integração com o Kommo (suportetecnico-api)

Este projeto recebe atendimentos vindos de um funil do Kommo (CRM) via webhook e os grava na
mesma tabela `suportes` do Supabase que o painel usa. Este skill reúne o que é preciso saber
para mexer nessa integração sem redescobrir tudo do zero — factos da API do Kommo, a arquitetura
específica deste projeto, e o que ainda falta configurar.

Para os detalhes completos da API do Kommo (todos os eventos de webhook, todos os códigos HTTP,
scopes de OAuth2 etc.), a fonte é a nota **"Kommo API - Guia de Referencia.md"** no cofre do
Obsidian do usuário — leia-a com as ferramentas `obsidian_*` quando precisar de algo além do que
está resumido aqui. Este skill só traz o que é relevante para o dia a dia deste código.

## Onde o código vive

- `src/backend/webhook-kommo.mjs` — recebe `POST /webhook/kommo`, valida o token, busca o lead
  completo de volta no Kommo e grava no Supabase.
- `src/shared/kommo-client.js` — chamada `GET /api/v4/leads/{id}?with=contacts` na API do Kommo.
- `src/shared/kommo-form-parser.js` — decodifica o payload, que pode chegar como JSON **ou** como
  `application/x-www-form-urlencoded` com notação de colchetes (formato clássico do amoCRM).
- `src/shared/kommo-mapper.js` — converte um lead do Kommo num registro de `suporte` (função
  `buildSupportRecordFromKommoLead`).
- `src/backend/supabase-rest.mjs` (`upsertRecords`) — grava com `on_conflict=id`, mesclando
  `extras` em vez de sobrescrever.

## Arquitetura: por que existe uma chamada de volta ao Kommo

A automação de mudança de estágio do Kommo ("Digital Pipeline → API: Send webhook") manda um
**payload enxuto** — só `id`/`old_status_id`/`status_id`/`pipeline_id`/`old_pipeline_id`, sem
nome, preço ou tags. Por isso o handler faz um `GET /api/v4/leads/{id}` de volta para pegar o
lead completo antes de mapear e gravar. Se um teste ou uma dúvida partir do pressuposto de que o
payload do webhook já traz tudo, está partindo de uma premissa errada — ele não traz.

## Como a duplicação é evitada

Cada lead vira o id `kommo_lead_<id-do-lead>` na tabela `suportes` (coluna `kommo_lead_id text
unique`). O upsert usa `on_conflict=id`: a segunda vez que o mesmo lead aparece (nova mudança de
estágio), a MESMA linha é atualizada, não uma nova é criada. Isso já foi testado contra o banco
real. Se aparecer um caso de duplicação, o suspeito é o id calculado, não a lógica de upsert.

## Configuração de estágios e técnicos: dado, não código

O mapa de `status_id` → status interno (`EM ABERTO`/`FINALIZADO`/...) e de tags → técnico/turno
fica na tabela `config`, linha com `chave = 'kommo'` (`statusMap`, `wonStatusIds`, `lostStatusIds`,
`tecnicoTagMap`, `turnoTagMap`). **Nunca fixar um `status_id` de etapa no código** — só os dois
universais são fixos em qualquer conta Kommo:

- `status_id 142` = Fechado – Ganho
- `status_id 143` = Fechado – Perdido

Os IDs das etapas intermediárias (ex.: "Em atendimento") são específicos da conta e têm que vir
dessa configuração, obtida por quem tem acesso à conta Kommo via
`GET /api/v4/leads/pipelines/{pipeline_id}`.

## Secrets necessários (nunca em código ou `wrangler.toml`)

| Variável | Para quê |
|---|---|
| `KOMMO_ACCESS_TOKEN` | Token de Longa Duração da integração privada no Kommo |
| `KOMMO_BASE_URL` | Subdomínio da conta, ex. `https://SEUDOMINIO.kommo.com` |
| `WEBHOOK_TOKEN` | Protege `/webhook/kommo` contra chamadas de fora |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Gravação no banco |

Configurados com `wrangler secret put <NOME>`. Se o usuário pedir para configurar isso, os
valores vêm dele — nunca invente nem reutilize um valor de outro contexto.

## Fatos da API do Kommo que mordem se esquecidos

- **O Token de Longa Duração NÃO é permanente.** A validade é escolhida na criação: de 1 dia a 5
  anos. Não tem `refresh_token` — quando vence, precisa gerar outro manualmente no painel do
  Kommo. Se o webhook começar a falhar com 401 do lado do Kommo, a primeira suspeita é o token
  vencido.
- **Rate limit: 7 requisições/segundo** por conta. Como o handler faz 1 `GET` de volta por lead
  recebido, um lote grande de mudanças de estágio de uma vez pode esbarrar nisso — é por isso que
  o projeto já limita `MAX_RECORDS_POR_REQUISICAO` no webhook genérico (ver `webhook-shared.js`);
  o webhook do Kommo herda o mesmo teto.
- **O Kommo espera resposta em até 2 segundos.** Fora disso conta como falha e ele tenta de novo
  (5 min, 15 min, 15 min, 1h). **Mais de 100 respostas inválidas em 2h desativa o webhook
  sozinho** — se o usuário disser "parou de chegar dado do Kommo", isso é a primeira coisa a
  verificar no painel de Integrações do Kommo, antes de suspeitar do código.
- **Máximo de 100 webhooks por conta** no Kommo — relevante se for preciso registrar mais de uma
  automação de "Send webhook".
- O formato do payload pode ser JSON ou `x-www-form-urlencoded` — o parser deste projeto já trata
  os dois; não presuma um formato só ao depurar um payload que não bateu.

## O que ainda não foi feito (não presumir que já está pronto)

Confirme com o usuário antes de assumir que qualquer um destes passos já ocorreu:

1. Criar a integração privada de verdade na conta Kommo e gerar o Token de Longa Duração.
2. Configurar `KOMMO_ACCESS_TOKEN`/`KOMMO_BASE_URL`/`WEBHOOK_TOKEN`/`SUPABASE_*` como secrets do
   Worker no Cloudflare (`wrangler secret put`) — o deploy do Worker em si também não foi feito
   ainda até a última verificação.
3. Preencher a linha `config` (`chave = 'kommo'`) no Supabase com os `status_id` reais do funil
   de suporte da conta e os mapas de tag → técnico/turno.
4. Configurar a automação "Send webhook" por etapa no painel do Kommo (Leads → Automate),
   apontando para `https://<domínio>/webhook/kommo?token=<WEBHOOK_TOKEN>`.

## Ao depurar um problema real

1. Peça (ou leia, se já estiver disponível) o payload cru recebido — confirme se é o formato
   enxuto esperado ou algo diferente.
2. Confirme se `config` → `kommo` existe e tem o `status_id` em questão mapeado; um `status_id`
   sem mapa vira string vazia no `status`, o que é esperado, não um bug.
3. Verifique o painel de Integrações no Kommo para respostas de webhook com falha e para a data
   de expiração do token, antes de assumir que o bug está no código deste projeto.
4. Teste a chamada de volta (`GET /api/v4/leads/{id}`) isolada com `curl`/token, para separar
   "o Kommo não me deu o dado" de "eu mapeei o dado errado".
