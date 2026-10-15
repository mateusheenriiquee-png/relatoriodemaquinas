# Suporte Técnico — painel (React + Vite)

Painel dos técnicos: lista de chamados em tempo real, painel lateral do chamado, finalização com preenchimento automático, dashboard de métricas e administração de usuários. Fala com o Supabase (leitura em tempo real e funções do banco) e com o Worker (`/api/admin/*`) para o que exige a chave de serviço ou o Kommo.

É um projeto npm próprio (`package.json` e `node_modules` desta pasta).

## Rodar

A partir da raiz do repositório:

```bash
npm run web:install   # instala as dependências desta pasta
npm run web:dev       # http://localhost:5173
npm run web:test      # Vitest
npm run web:build     # gera src/frontend/web/dist/ (servido pelo Worker)
```

## Configuração

`.env.local` (fora do git), no formato de `.env.example`:

- `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` — a chave `anon` é pública; quem protege os dados é a RLS do banco. **Nunca** coloque a `service_role` aqui.
- `VITE_API_BASE_URL` — opcional; em branco, usa a mesma origem (o Worker).

## Onde está o quê

- `src/services/` — acesso ao banco (`suportesService`, `suportesStore` com a escrita otimista e o tempo real, `descartadasService`, `dashboardService`, `metricasService`).
- `src/utils/` — regras puras e testadas (finalização, busca, ordem da lista, chamado parado, aviso de chamado novo, reagendamento).
- `src/components/` e `src/pages/` — telas.
- `../../shared/` — código compartilhado com o Worker (mapeamento das colunas, leitura do Kommo).
