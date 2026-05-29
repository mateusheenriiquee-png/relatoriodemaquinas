# Suporte Tecnico

Painel web para gestao de suportes tecnicos com Firestore, importacao/exportacao CSV e webhook para integracoes.

## Estrutura

- `public/` — front-end (HTML, CSS, JS)
- `api/src/` — API local (Express), webhook edge (Firestore REST) e webhook Node (firebase-admin)
- `worker/` — entry-point do Cloudflare Worker (ESM + assets)
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

## Deploy — Cloudflare Worker (git push)

O projeto no painel e um **Worker** (`workers/services/suportetecnico-api`), nao Pages.
Por isso use `wrangler deploy` (com assets), nao `wrangler pages deploy`.

### Configuracao no painel

**Settings → Builds**:

| Campo | Valor |
|-------|--------|
| Build command | *(vazio)* |
| **Deploy command** | `npm run cf:deploy` |
| Root directory | `/` |

### Variables (Settings → Variables)

- `FIREBASE_SERVICE_ACCOUNT` — JSON da service account (uma linha)
- `WEBHOOK_TOKEN`
- `FIRESTORE_COLLECTION`

Nao cadastre `CLOUDFLARE_API_TOKEN` nas Variables.

O Worker usa a API REST do Firestore (`api/src/firestore-rest.js`), nao o pacote `firebase-admin`, porque o Admin SDK nao roda no runtime do Workers.

**Seguranca:** se credenciais aparecerem em logs de build, revogue a chave no Google Cloud e gere uma nova service account.

### Deploy

```bash
git push origin main
```

Site + webhook no mesmo Worker:

- Site: arquivos em `public/`
- Webhook: `POST /webhook/suportes`

### Deploy manual (opcional)

```bash
npm install
npm run cf:deploy
```

## Deploy — Netlify (opcional)

- Publish: `public`
- Variaveis de ambiente iguais ao Cloudflare
- Webhook: `/webhook/suportes` (redirect em `netlify.toml`)

## O que nao commitar

- `.env`, `.dev.vars`
- JSON de service account do Firebase
- `node_modules/`

Use `.env.example` como referencia.
