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
| **Deploy command** | `npm run cf:deploy` |
| Build output directory | `public` |
| Root directory | `/` |

### Deploy command obrigatorio (painel nao deixa vazio)

Use exatamente:

```bash
npm run cf:deploy
```

Isso executa `wrangler pages deploy public --project-name=suportetecnico-api`.

### Corrigir Authentication error [10000]

O log mostra token vindo de **variavel de ambiente** `CLOUDFLARE_API_TOKEN`:

1. **Settings → Variables and secrets** do projeto  
2. **Apague** `CLOUDFLARE_API_TOKEN` se existir (e `CLOUDFLARE_API_KEY`, se houver)  
3. Salve e faca **Retry deployment**

O build do Git ja injeta um token proprio; um token manual sem permissao de **Pages → Edit** quebra o deploy.

Se ainda falhar: **My Profile → API Tokens → Create Token** → template **Edit Cloudflare Workers** → em **Settings → Builds** troque o API token do projeto.

### Nao use

- `npx wrangler deploy` (Worker puro, sem assets configurados)
- `npx wrangler versions upload` (preview de Worker)

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
