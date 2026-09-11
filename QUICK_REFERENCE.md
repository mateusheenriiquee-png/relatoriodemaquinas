# Quick Reference - Comandos Úteis

## 🚀 Development

```bash
# Backend Express
npm run dev                    # http://localhost:3000

# Frontend (Cloudflare Pages)
npm run pages:dev              # http://localhost:8788

# Ambos simultaneamente (rodar em 2 terminais)
# Terminal 1:
npm run dev
# Terminal 2:
npm run pages:dev
```

## 🐛 Debug

```bash
# Verificar erros
npm run lint                   # ESLint

# Formatar código
npm run format                 # Prettier

# Testar
npm test                       # Rodar testes
```

## 📤 Deploy

```bash
# Cloudflare Pages (recomendado)
npm run cf:deploy              # Deploy do projeto todo

# Firebase Hosting (frontend apenas)
firebase deploy --only hosting

# Netlify
netlify deploy --prod
```

## 📁 Estrutura de Diretórios

```
Código Fonte:
  src/api/       → Express Backend (Node.js)
  src/backend/   → Cloudflare Workers (Edge)
  src/frontend/  → Web UI (HTML/CSS/JS)
  src/shared/    → Código compartilhado

Configuração:
  config/        → firebase.json, wrangler.toml
  .env.local     → Variáveis de ambiente

Segurança:
  credentials/   → Chaves Firebase (git-ignored)

Dados:
  data/          → CSVs, exports (git-ignored)

Documentação:
  docs/          → ARCHITECTURE.md, DEPLOYMENT.md
  README.md      → Guia principal

Testes:
  tests/         → Testes do projeto
```

## 🔧 Configuração Comum

### Setup Inicial
```bash
git clone <repo>
cd suportetecnico-api
npm install
cp .env.example .env.local
# Editar .env.local com suas credenciais
```

### Adicionar Credencial Firebase
```bash
cp ~/Downloads/suportetecnico-*-adminsdk-*.json credentials/
```

### Testar Conexão API
```bash
curl http://localhost:3000/health
# Deve retornar: { "status": "ok" }
```

## 📝 Variáveis de Ambiente

**Obrigatórias:**
- `FIREBASE_PROJECT_ID` - ID do projeto Firebase
- `FIREBASE_SERVICE_ACCOUNT_BASE64` - Credencial em Base64
- `FIREBASE_WEB_API_KEY` - Chave web pública

**Opcionais:**
- `WEBHOOK_TOKEN` - Token para validar webhooks
- `USUARIOS_COLLECTION` - Nome da collection (padrão: usuarios)
- `SUPORTES_COLLECTION` - Nome da collection (padrão: suportes_tecnicos)

Ver [.env.example](.env.example) para template completo.

## 🐛 Troubleshooting Rápido

| Problema | Solução |
|----------|---------|
| "Cannot find module X" | Verificar import path em novo local (veja MIGRATION.md) |
| API não conecta | `npm run dev` iniciou? Verificar porta 3000 |
| Frontend não carrega | `npm run pages:dev` iniciado? Verificar porta 8788 |
| CORS error | Configurar CORS em `src/api/server.js` |
| Credenciais expiradas | Gerar nova chave em Google Cloud Console |

## 📚 Documentação Completa

- [README.md](README.md) - Guia principal
- [ARCHITECTURE.md](docs/ARCHITECTURE.md) - Arquitetura técnica
- [DEPLOYMENT.md](docs/DEPLOYMENT.md) - Guias de deploy
- [MIGRATION.md](docs/MIGRATION.md) - Mudanças de imports
- [REFACTORING_CHECKLIST.md](REFACTORING_CHECKLIST.md) - Checklist de pós-refatoring

## 🎯 Fluxo Padrão de Desenvolvimento

```bash
1. Fazer mudanças em src/

2. Testar localmente
   npm run dev          # Terminal 1
   npm run pages:dev    # Terminal 2

3. Verificar qualidade
   npm run lint
   npm run format

4. Versionar e fazer push
   git add .
   git commit -m "descrição"
   git push origin main

5. Deploy automático via Cloudflare (ou manual)
   npm run cf:deploy
```

## 🔑 Chaves de Produção

**NUNCA commitar:**
- `.env`, `.env.local`
- Arquivos JSON de credenciais
- Tokens ou chaves de API
- `node_modules/`

Usar arquivo `.gitignore` (já configurado) para ignorar automaticamente.
