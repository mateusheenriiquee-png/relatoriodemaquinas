# 🎯 Suporte Técnico API

**Painel web + API webhook** para gestão de suportes técnicos com Firestore, importação/exportação CSV e integrações em tempo real.

---

## 📦 Requisitos

- **Node.js** >= 18
- **Conta Firebase** com Firestore habilitado
- **Git** para versionamento

### Deploy Platforms (escolher uma)
- 🌐 **Cloudflare Pages** (recomendado - edge computing)
- 🚀 **Netlify** (alternativa)
- 🔥 **Firebase Hosting** (frontend apenas)

---

## 🚀 Quick Start

### 1. Setup Local

```bash
git clone <repo-url>
cd suportetecnico-api
npm install
```

### 2. Configurar Variáveis de Ambiente

```bash
cp .env.example .env.local
# Editar .env.local com credenciais Firebase
```

Copie seus arquivos de credencial para `credentials/`:
```bash
mkdir -p credentials
cp ~/Downloads/*firebase-adminsdk-*.json credentials/
```

### 3. Rodar Localmente

**API Backend (Express)**
```bash
npm run dev
# Acesso em http://localhost:3000
```

**Frontend (Cloudflare Pages)**
```bash
npm run pages:dev
# Acesso em http://localhost:8788
```

---

## 📁 Estrutura do Projeto

Veja documentação completa em [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

```
suportetecnico-api/
├── src/                            # Código fonte principal
│   ├── api/                        # Express.js Backend
│   │   ├── middleware/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── utils/
│   │   └── server.js
│   ├── backend/                    # Cloudflare Workers (Edge)
│   │   ├── auth/
│   │   ├── firestore/
│   │   ├── identity/
│   │   ├── webhooks/
│   │   └── index.mjs
│   ├── frontend/                   # Frontend Web UI
│   │   ├── public/                 # Dashboard principal
│   │   └── cadastro/               # Formulário de cadastro
│   └── shared/                     # Código compartilhado
│
├── config/                         # Configurações (firebase.json, wrangler.toml, etc)
├── credentials/                    # Chaves de serviço (git-ignored)
├── data/                           # Dados/exports (git-ignored)
├── docs/                           # Documentação
├── scripts/                        # Scripts de manutenção
├── tests/                          # Testes
├── .env.example                    # Template de variáveis
└── package.json
```

---

## 🔧 Configuração Avançada

### Variáveis de Ambiente

Copie o template:
```bash
cp .env.example .env.local
```

**Variáveis essenciais:**
- `FIREBASE_PROJECT_ID` — ID do projeto Firebase
- `FIREBASE_SERVICE_ACCOUNT_BASE64` — Credencial codificada em Base64
- `FIREBASE_WEB_API_KEY` — Chave web pública Firebase
- `WEBHOOK_TOKEN` — Token para validar webhooks
- `USUARIOS_COLLECTION` — Nome da collection de usuários (padrão: `usuarios`)

### Credenciais de Serviço

1. Acesse [Google Cloud Console](https://console.cloud.google.com)
2. Projeto → Service Accounts → Create Key (JSON)
3. Mova para `credentials/`:
   ```bash
   mv ~/Downloads/suportetecnico-*.json credentials/
   ```
4. Codifique em Base64 (para Cloudflare):
   ```bash
   cat credentials/suportetecnico-*.json | base64 > .env.local
   # Copie o valor para FIREBASE_SERVICE_ACCOUNT_BASE64 em .env.local
   ```

---

## 📡 Deployment

### Cloudflare Pages (Recomendado)

```bash
npm run cf:deploy
# Frontend + Workers + Webhooks
```

Ou via Git:
1. Conecte repo ao Cloudflare Pages
2. Configure build command: `npm run cf:deploy`
3. Pushes automáticos disparam deploys

[Guia completo →](docs/DEPLOYMENT.md)

### Firebase Hosting

```bash
firebase deploy --only hosting
```

### Netlify

```bash
netlify deploy --prod
```

---

## 🧪 Testes

```bash
npm test
```

Testes unitários em `tests/unit/`

---

## 📚 Documentação

- **[ARCHITECTURE.md](docs/ARCHITECTURE.md)** — Estrutura, camadas e fluxos
- **[DEPLOYMENT.md](docs/DEPLOYMENT.md)** — Guias de deploy para cada plataforma
- **[MIGRATION.md](docs/MIGRATION.md)** — Atualização de imports após refatoração

---

## 🔐 Segurança

- ✅ Credenciais em `credentials/` (git-ignored)
- ✅ `.env.local` nunca é commitado
- ✅ Tokens em variáveis de ambiente, não em código
- ✅ Firestore com regras de autenticação
- ✅ Webhooks validados com token

**Ao expor credenciais:**
1. Revogue a chave no Google Cloud
2. Gere nova service account
3. Atualize em todas plataformas

---

## 🛠️ Troubleshooting

### API não conecta ao Firestore
- Verificar `FIREBASE_SERVICE_ACCOUNT` em `.env.local`
- Credencial expirou? Gere nova
- Rules Firestore bloqueando? Ver `config/firebase.json`

### Frontend não carrega
- Rodar `npm run pages:dev` para dev local
- Verificar console do browser (F12)
- CORS habilitado na API? Verificar `src/api/server.js`

### Deploy falha
- `npm install` funciona localmente?
- Git push antes de deploy
- Verificar logs no Cloudflare/Netlify/Firebase

---

## 📄 Licença

ISC

## 👤 Autores

Veja [CONTRIBUTING.md](docs/CONTRIBUTING.md) para contribuições

