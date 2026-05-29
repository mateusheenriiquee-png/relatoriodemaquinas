# Suporte Tecnico

Painel web para gestao de suportes tecnicos com Firestore, importacao/exportacao CSV e webhook para integracoes.

## Estrutura

- `public/` — front-end (HTML, CSS, JS)
- `api/src/` — API local (Express) e logica compartilhada do webhook
- `functions/webhook/` — webhook no Cloudflare Pages
- `netlify/` — webhook no Netlify (opcional)

## Requisitos

- Node.js 18+
- Conta Firebase (Firestore)
- Cloudflare Pages (deploy recomendado) ou Netlify

## Configuracao local

```bash
npm install
cp .env.example .env
# Edite .env com FIREBASE_SERVICE_ACCOUNT, WEBHOOK_TOKEN, etc.
```

### Painel (somente front)

Abra `public/index.html` via servidor estatico ou use:

```bash
npx wrangler pages dev public
```

### API + webhook local (Express)

```bash
npm start
```

Webhook: `POST http://localhost:3000/webhook/suportes`

## Deploy — Cloudflare Pages (git push)

1. Conecte o repositorio em **Workers & Pages → Create → Pages → Connect to Git**
2. Build:
   - **Build command:** (vazio)
   - **Build output directory:** `public`
3. Variaveis em **Settings → Environment variables**:
   - `FIREBASE_SERVICE_ACCOUNT`
   - `WEBHOOK_TOKEN` (recomendado)
   - `FIRESTORE_COLLECTION` (opcional)
4. `git push` na branch configurada dispara o deploy automatico

Webhook em producao: `https://seu-dominio.com/webhook/suportes`

## Deploy — Netlify (opcional)

- Publish: `public`
- Variaveis de ambiente iguais ao Cloudflare
- Webhook: `/webhook/suportes` (redirect em `netlify.toml`)

## O que nao commitar

- `.env`, `.dev.vars`
- JSON de service account do Firebase
- `node_modules/`

Use `.env.example` como referencia.
