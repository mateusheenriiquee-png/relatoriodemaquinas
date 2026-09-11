# ✅ Próximos Passos - Refatoração

## 1. Verificar Imports (Crítico)

Alguns arquivos podem ter imports com paths antigos. Execute:

```bash
# Verificar se há imports de "api/src" ou "worker/"
grep -r "from.*['\"]\.\.\/.*api\/src" src/
grep -r "from.*['\"]\.\.\/.*worker" src/
grep -r "require.*api\/src" src/
grep -r "require.*worker" src/

# Se houver resultados, atualizar os paths
```

## 2. Testar Localmente

```bash
# Terminal 1: API Backend
npm run dev
# Deve iniciar sem erros em http://localhost:3000

# Terminal 2: Frontend (em outra pasta)
npm run pages:dev
# Deve iniciar em http://localhost:8788
```

### Checklist de Teste
- [ ] API responde a GET /health
- [ ] Frontend carrega sem erros (F12 → Console)
- [ ] Fazer login funciona
- [ ] Criar suporte funciona
- [ ] Dashboard carrega dados

## 3. Arquivos para Revisar

### Críticos - Podem ter imports errados:
- [ ] `src/api/server.js` - imports de rotas
- [ ] `src/backend/index.mjs` - imports de módulos
- [ ] `scripts/cf-pages-deploy.js` - paths hardcoded
- [ ] `scripts/backfill-tecnicoKey.mjs` - paths para credenciais

### Verificar:
- [ ] Todos os imports relativos resolvem corretamente
- [ ] Nenhuma referência para `../api/src/`, `../../worker/`, etc
- [ ] `config/firebase.json`, `config/wrangler.toml`, `package.json` com paths corretos

## 4. Atualizar Git

```bash
# Ver status
git status

# Adicionar mudanças
git add .

# Commit
git commit -m "refactor: reorganizar estrutura de pastas

- Mover /api para /src/api
- Mover /worker para /src/backend
- Mover /public para /src/frontend/public
- Mover /public_cadastro_suporte para /src/frontend/cadastro
- Centralizar configs em /config
- Organizar credenciais em /credentials (git-ignored)
- Remover /functions, /netlify
- Adicionar documentação completa"

# Push
git push origin main
```

## 5. Deploy (Escolher um)

### Cloudflare Pages
```bash
npm run cf:deploy
```

### Firebase Hosting
```bash
firebase deploy --only hosting
```

### Netlify
```bash
netlify deploy --prod
```

---

## 📋 Checklist Completo

- [ ] Todos os imports testados localmente
- [ ] `npm run dev` funciona
- [ ] `npm run pages:dev` funciona
- [ ] Frontend carrega sem erros
- [ ] API responde
- [ ] `.env.local` tem todas variáveis
- [ ] Credenciais em `credentials/` (não na raiz)
- [ ] Git commit com mudanças
- [ ] Deploy em produção
- [ ] Testar endpoints em produção
- [ ] Verificar logs

---

## 🆘 Se Houver Problemas

1. **"Cannot find module"**
   - Verificar se o arquivo existe no novo local
   - Atualizar import path
   - Executar `npm install` novamente

2. **"ENOENT: no such file or directory"**
   - Path errado em script ou config
   - Usar `pwd` para verificar diretório atual
   - Paths devem ser relativos ao root do projeto

3. **Deploy falha**
   - Verificar logs no painel Cloudflare/Netlify/Firebase
   - `.env` local vs variáveis no servidor
   - Credenciais Base64 corretas?

4. **Frontend não conecta à API**
   - Verificar CORS em `src/api/server.js`
   - URLs corretas em `src/frontend/public/js/config/`
   - API rodando em http://localhost:3000?

---

## 📚 Referências

- [ARCHITECTURE.md](ARCHITECTURE.md) - Estrutura completa
- [DEPLOYMENT.md](DEPLOYMENT.md) - Guias de deploy
- [MIGRATION.md](MIGRATION.md) - Detalhes de imports
