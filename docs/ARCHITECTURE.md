# Arquitetura do Projeto

## Estrutura de Pastas

```
suportetecnico-api/
├── config/                         # Configurações de deployement
│   ├── firebase.json               # Firebase config
│   ├── netlify.toml                # Netlify config
│   ├── wrangler.toml               # Cloudflare Workers config
│   └── .firebaserc                 # Firebase CLI config
│
├── credentials/                    # Credenciais (git-ignored)
│   └── *-firebase-adminsdk-*.json
│
├── data/                           # Dados e exports
│   └── *.csv
│
├── src/                            # Código fonte principal
│   ├── api/                        # Express.js Backend
│   │   ├── middleware/             # Middlewares (auth, etc)
│   │   ├── routes/                 # Rotas HTTP
│   │   ├── services/               # Lógica de negócio
│   │   ├── utils/                  # Utilidades
│   │   └── server.js               # Entrada Express
│   │
│   ├── backend/                    # Cloudflare Workers (Edge)
│   │   ├── auth/                   # Autenticação
│   │   ├── firestore/              # Acesso Firestore
│   │   ├── identity/               # Gestão de identidade
│   │   ├── webhooks/               # Processamento de webhooks
│   │   └── index.mjs               # Entrada Worker
│   │
│   ├── frontend/                   # Interface web
│   │   ├── public/                 # Dashboard principal
│   │   │   ├── js/
│   │   │   │   ├── app.js          # Aplicação principal
│   │   │   │   ├── auth.js         # Autenticação cliente
│   │   │   │   ├── pages/          # Módulos por página
│   │   │   │   ├── services/       # Serviços (API, etc)
│   │   │   │   └── config/         # Configurações
│   │   │   ├── css/
│   │   │   └── *.html              # Templates
│   │   │
│   │   └── cadastro/               # Módulo de cadastro
│   │       ├── js/
│   │       ├── css/
│   │       └── *.html
│   │
│   └── shared/                     # Código compartilhado
│       ├── normalize.js            # Normalização de dados
│       ├── support-id.js           # ID suportes
│       ├── tecnico.js              # Lógica de técnicos
│       └── funcoes.mjs             # Funções utilitárias
│
├── scripts/                        # Scripts de manutenção
│   ├── backfill-tecnicoKey.mjs    # Migração de dados
│   └── cf-pages-deploy.js          # Deploy Cloudflare
│
├── tests/                          # Testes
│   ├── unit/                       # Testes unitários
│   └── integration/                # Testes integração
│
├── docs/                           # Documentação
│   ├── ARCHITECTURE.md             # Este arquivo
│   ├── API.md                      # Documentação API
│   └── DEPLOYMENT.md               # Guia de deploy
│
├── .env.example                    # Template de variáveis
├── .env.local                      # Variáveis locais (git-ignored)
├── .env.production                 # Variáveis produção (git-ignored)
├── .gitignore
├── package.json
└── README.md
```

## Camadas da Aplicação

### 1. **API Backend (Express.js)** - `src/api/`
- RESTful API para gestão de suportes
- Roda em `localhost:3000` ou servidor próprio
- Middleware de autenticação via Firebase
- Rotas para suportes, usuários, estatísticas

### 2. **Edge Backend (Cloudflare Workers)** - `src/backend/`
- Serverless, executa no edge (mais perto do usuário)
- Processa webhooks em tempo real
- Autentica e valida requisições
- Integra com Firebase Authentication e Firestore

### 3. **Frontend (Vanilla JS + Firebase SDK)** - `src/frontend/`
- **Dashboard Principal** (`public/`): Gerenciamento e visualização
- **Módulo Cadastro** (`cadastro/`): Entrada de novos suportes
- Autenticação via Firebase
- Acesso direto ao Firestore para leituras/escritas
- Chamadas à API Express para operações administrativas

### 4. **Código Compartilhado** - `src/shared/`
- Funções e lógica usadas por múltiplos módulos
- Normalização de dados
- Geração de IDs
- Utilitários gerais

## Fluxos Principais

```
┌─────────────────────────────────────────────────────────┐
│                   Cliente Web (Browser)                 │
│  (src/frontend/public/ ou src/frontend/cadastro/)      │
└────────────────┬────────────────────────────────────────┘
                 │
        ┌────────┴────────┐
        │                 │
        ▼                 ▼
    Firebase SDK      API Express
 (Read/Write)      (Admin ops)
    Firestore       src/api/
    Auth               │
        │              │
        └─────┬────────┘
              │
    ┌─────────▼──────────┐
    │  Cloudflare Worker │
    │   (src/backend/)   │
    │  ◄─Webhooks───────┐
    │   ◄─Validação     │
    └────────┬──────────┘
             │
             ▼
    Firebase Auth & Firestore
```

## Desenvolvimento Local

### Iniciar API Express
```bash
npm run dev
# ou
node src/api/server.js
```

### Iniciar Cloudflare Pages (Frontend)
```bash
npm run pages:dev
```

### Build para produção
```bash
npm run cf:deploy
```

## Variáveis de Ambiente

Ver `.env.example` para lista completa. Copiar e customizar:
```bash
cp .env.example .env.local
```

Variáveis críticas:
- `FIREBASE_PROJECT_ID`: ID do projeto Firebase
- `FIREBASE_SERVICE_ACCOUNT`: Credencial de serviço (Base64)
- `WEBHOOK_TOKEN`: Token para validar webhooks

## Tecnologias

- **Backend API**: Node.js + Express.js
- **Edge**: Cloudflare Workers
- **Frontend**: Vanilla JavaScript + Firebase SDK
- **Banco de Dados**: Firebase Firestore
- **Autenticação**: Firebase Authentication
- **Deploy**: Firebase Hosting, Netlify, Cloudflare Pages
