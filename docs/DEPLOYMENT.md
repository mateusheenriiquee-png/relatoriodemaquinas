# Guia de Deployment

## Pré-requisitos

1. Node.js >= 18
2. Conta Firebase (projeto criado)
3. CLI tools:
   - `npm install -g firebase-tools`
   - `npm install -g wrangler` (Cloudflare)

## Setup Local

1. Clone o repositório
```bash
git clone <repo-url>
cd suportetecnico-api
```

2. Instale dependências
```bash
npm install
```

3. Configure variáveis de ambiente
```bash
cp .env.example .env.local
# Editar .env.local com suas credenciais
```

4. Mova credenciais de serviço para `credentials/`
```bash
# Copie seu arquivo JSON do Firebase para:
# credentials/suportetecnico-api2-firebase-adminsdk-*.json
```

## Deployment Express API

### Localmente
```bash
npm run dev
# Acessa em http://localhost:3000
```

### Em servidor (Heroku, Railway, etc)
```bash
# Configurar variáveis no servidor
# Deploy conforme plataforma
```

## Deployment Cloudflare Pages + Workers

### 1. Prepare o projeto
```bash
npm install
npm run build  # se houver build step
```

### 2. Deploy via CLI
```bash
npm run cf:deploy
# ou diretamente via wrangler
wrangler deploy
```

### 3. Ou use GitHub Actions (recomendado)
- Conecte seu repo ao Cloudflare Pages
- Pushes automáticos disparam deploys

## Deployment Firebase Hosting

### 1. Configure Firebase
```bash
firebase login
firebase use suportetecnico-api2
```

### 2. Deploy
```bash
firebase deploy
# Faz deploy de Firestore rules, functions, etc
```

## Variáveis em Produção

### Cloudflare Pages/Workers
Via console ou `wrangler`:
```bash
wrangler secret put FIREBASE_SERVICE_ACCOUNT
```

### Express API (Heroku/Railway/etc)
Via interface web da plataforma ou CLI:
```bash
heroku config:set FIREBASE_SERVICE_ACCOUNT=...
```

### Firebase
Via console Firebase (não usa .env)

## Verificação Pós-Deploy

1. Verifique logs
```bash
wrangler tail  # Cloudflare Workers
firebase functions:log  # Firebase Functions
```

2. Teste endpoints
```bash
curl http://localhost:3000/health
curl https://seu-dominio/health
```

3. Teste autenticação Firebase
```bash
# Tente fazer login na interface web
# Verifique que Firestore está acessível
```

## Troubleshooting

### Erro: "FIREBASE_SERVICE_ACCOUNT not configured"
- Verificar .env.local ou variáveis de servidor
- Encoding Base64 correto?
- Credenciais desatualiza? Gere nova em Firebase Console

### Erro: "Unauthorized" em API
- Token JWT correto?
- Header `Authorization: Bearer <token>` presente?
- Token não expirou?

### Erro: "Firestore rules" 
- Revisar `config/firebase.json`
- Autenticado com Firebase CLI? `firebase login`
- Regras Firestore permitem acesso?

## Checklist de Deploy

- [ ] `.env.local` com todas variáveis
- [ ] Credenciais em `credentials/`
- [ ] `npm install` executado
- [ ] Testes passando: `npm test`
- [ ] Build sem erros
- [ ] Logs verificados pós-deploy
- [ ] Endpoints respondendo
- [ ] Autenticação funcionando
- [ ] Firestore acessível

## Rollback

### Cloudflare Pages
```bash
# Via console Cloudflare ou histórico de deployment
wrangler rollback
```

### Firebase
```bash
firebase deploy --only functions:NOME
# ou fazer revert no console
```
