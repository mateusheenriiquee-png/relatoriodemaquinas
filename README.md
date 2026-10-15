# Suporte Técnico — Certify

Painel web que centraliza, acompanha e mede os chamados de suporte técnico de certificado digital, integrado ao Kommo CRM.

## Como as partes se encaixam

| Parte | Onde | O que faz |
|---|---|---|
| Banco | Supabase (Postgres + Auth + Realtime) — `supabase/migrations/` | Tabela `suportes`, `usuarios`, `config`, `mensagens_descartadas`; RLS; funções (RPC) chamadas pelo n8n e pelo painel |
| Worker (API) | Cloudflare Worker — `src/backend/` + `src/shared/` | Rotas admin (usuários, associar técnico, finalizar no Kommo, preenchimento automático), webhooks, cron dos reagendados. Serve também o painel |
| Painel | React + Vite — `src/frontend/web/` | Lista de chamados, painel lateral, finalização, dashboard, admin |
| Cadastro | React + TypeScript — `src/frontend/cadastro/` | Sub-site de abertura de chamado |
| Automação | n8n (fora deste repositório) | Lê o chat do Kommo, detecta pedido de suporte com IA (Gemini), abre o chamado, conta a bolinha, guarda os "possíveis pedidos" |

O n8n grava direto no banco pelas funções `registrar_pedido_suporte_chat`, `criar_suporte_kommo`, `registrar_mensagem_cliente` e `registrar_mensagem_descartada` (chave `anon`). O Worker usa a `service_role` e nunca a entrega ao painel.

## Rodar e testar

```bash
npm install
npm run web:install
npm run web:dev        # painel em http://localhost:5173
npm test               # backend (node:test) + painel e cadastro (Vitest)
```

## Banco

```bash
node scripts/supabase-migrar.mjs        # aplica as migrações novas, uma transação por arquivo
node scripts/supabase-verificar-rls.mjs # confere as permissões (RLS)
```

Credenciais locais dos scripts ficam em `credentials/supabase.env` (fora do git).

## Publicar

```bash
npm run web:build
npm run cf:deploy      # wrangler deploy com config/wrangler.toml (--keep-vars)
```

Segredos do Worker (nunca no git), com `wrangler secret put`: `SUPABASE_SERVICE_ROLE_KEY`, `KOMMO_ACCESS_TOKEN`, `WEBHOOK_TOKEN`, `N8N_PREFILL_TOKEN`. Endereços não secretos ficam em `[vars]` no `config/wrangler.toml`.
