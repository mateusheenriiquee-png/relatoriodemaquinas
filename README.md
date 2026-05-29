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

### Configuracao correta no painel

Em **Workers & Pages → seu projeto → Settings → Builds**:

| Campo | Valor |
|-------|--------|
| Framework preset | **None** |
| Build command | *(vazio)* |
| **Deploy command** | ***(vazio — apague `npx wrangler deploy`)*** |
| Build output directory | `public` |
| Root directory | `/` |

> **Erro comum 1:** `npx wrangler deploy` e para **Workers**, nao para Pages.  
> **Erro comum 2:** `npx wrangler pages deploy public` com *Authentication error [10000]* — o token de build nao tem permissao de Pages.  
> **Solucao:** deixe **Deploy command vazio**. O Cloudflare publica `public/` e `functions/` sozinho apos o `npm install`.

Opcional: marque **Use wrangler.toml** se aparecer na tela de build.

### Se o painel obrigar Deploy command

1. Em **Settings → Builds**, apague o comando e salve; ou  
2. Regenerar o token: **My Profile → API Tokens → Create Token** → template **Edit Cloudflare Workers** (inclui Pages) → substituir o token do projeto em **Settings → Builds → API token**.

O nome em `wrangler.toml` (`name`) deve ser igual ao nome do projeto no Cloudflare (`suportetecnico-api`).

### Variaveis de ambiente

**Settings → Environment variables** (Production):

- `FIREBASE_SERVICE_ACCOUNT`
- `WEBHOOK_TOKEN` (recomendado)
- `FIRESTORE_COLLECTION` (opcional)

### Deploy

```bash
git push origin main
```

Webhook em producao: `https://seu-dominio.com/webhook/suportes`

### Deploy manual (opcional, pelo PC)

```bash
npm install
npx wrangler pages deploy public
```

Use `wrangler pages deploy`, **nunca** `wrangler deploy`.

## Deploy — Netlify (opcional)

- Publish: `public`
- Variaveis de ambiente iguais ao Cloudflare
- Webhook: `/webhook/suportes` (redirect em `netlify.toml`)

## O que nao commitar

- `.env`, `.dev.vars`
- JSON de service account do Firebase
- `node_modules/`

Use `.env.example` como referencia.
