# 🔧 Configuração do Cloudflare Workers

## O que Mudou

A criação de usuários agora funciona automaticamente:
- **Em desenvolvimento (localhost)**: Usa `http://localhost:3000` (Express local)
- **Em produção (Cloudflare Pages)**: Usa a mesma origem do site (Cloudflare Workers)

## 📋 Pré-requisitos

- Cloudflare Workers deployado com `wrangler deploy`
- Arquivo `firebase-service-account.json` com credenciais do Firebase

## 🚀 Passos para Configurar

### 1️⃣ Acessar Cloudflare Dashboard

1. Acesse [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Vá para **Workers & Pages**
3. Selecione seu projeto **suportetecnico-api**
4. Clique na aba **Settings**

### 2️⃣ Configurar Variáveis de Ambiente (IMPORTANTE!)

#### Opção A: Via UI do Cloudflare (RECOMENDADO)

1. Clique em **Environment variables**
2. Clique em **Add variable**

Para cada variável abaixo, clique em **Add variable** novamente:

**Variável 1: FIREBASE_SERVICE_ACCOUNT**
- Nome: `FIREBASE_SERVICE_ACCOUNT`
- Tipo: **Secret** (muito importante!)
- Valor: 
  1. Abra o arquivo `firebase-service-account.json` em um editor de texto
  2. **Copie TODO o conteúdo** (do `{` inicial ao `}` final)
  3. Cole na caixa de texto
  4. Clique **Add**

**Variável 2: FIREBASE_PROJECT_ID**
- Nome: `FIREBASE_PROJECT_ID`
- Tipo: **Standard**
- Valor: `suportetecnico-api`
- Clique **Add**

**Variável 3: USUARIOS_COLLECTION**
- Nome: `USUARIOS_COLLECTION`
- Tipo: **Standard**
- Valor: `usuarios`
- Clique **Add**

#### Variáveis Opcionais (se usar Google Sheets):

| Nome | Tipo | Valor |
|------|------|-------|
| `SHEETS_SPREADSHEET_ID` | Standard | ID da sua planilha |
| `SHEETS_SHEET_NAME` | Standard | `Sheet1` |
| `SHEETS_SYNC_TOKEN` | Secret | Token aleatório |

### 3️⃣ Fazer Deploy

```bash
# Na raiz do projeto
wrangler deploy
```

Se pedir confirmação sobre override da configuração remota, confirme com **yes**.

### 4️⃣ Verificar Logs

Se o deploy falhar com erro sobre `project_id`:

1. Volte ao **Environment variables** no Cloudflare Dashboard
2. Clique no lápis de edição da variável `FIREBASE_SERVICE_ACCOUNT`
3. Verifique se o JSON está correto (deve começar com `{` e terminar com `}`)
4. Se houver problemas de formatação, recopie o arquivo `firebase-service-account.json`

### 5️⃣ Testar em Produção

1. Acesse seu site em produção: `https://seu-dominio.pages.dev`
2. Faça login como admin
3. Vá para **Admin → Novo Usuário**
4. Preencha: email, senha, nome, cargo
5. Clique **Criar Usuário**
6. ✅ Deve funcionar agora!

## 🔍 Verificar Logs em Tempo Real

Se algo der errado:

1. No Cloudflare Dashboard, vá para seu projeto
2. Clique em **Deployments** → Versão atual
3. Clique em **Logs** para ver mensagens do Worker
4. Procure por mensagens com `[Firebase]` para entender o que aconteceu

## 🛠️ Troubleshooting

### Erro: "Service account object must contain a string 'project_id' property"

**Causa**: A variável `FIREBASE_SERVICE_ACCOUNT` não está correta.

**Solução**:
1. Abra `firebase-service-account.json` em um editor
2. Verifique se o JSON é válido (use [jsonlint.com](https://jsonlint.com))
3. Copie o conteúdo EXATAMENTE como está (sem modificações)
4. No Cloudflare, delete a variável e crie uma nova
5. Cole o JSON novamente
6. Execute `wrangler deploy` novamente

### Erro: "FIREBASE_SERVICE_ACCOUNT não está configurada"

**Solução**: 
1. Verifique se a variável foi criada no Cloudflare Dashboard
2. Confirme que a variável é do tipo **Secret**
3. Execute deploy novamente: `wrangler deploy`

### Erro: "Email já cadastrado" ou "Senha fraca"

**Solução**: Escolha outro email ou uma senha mais forte. Esses são erros normais do Firebase.

### Ainda não funciona?

1. **Tente localmente primeiro**:
   ```bash
   cd api
   npm start
   ```
   - Acesse http://localhost:5500 (ou sua porta local)
   - Vá para Admin → Novo Usuário
   - Se funcionou localmente, o problema é na configuração do Cloudflare

2. **Verificar logs do Cloudflare**:
   - Dashboard → Workers & Pages → Seu projeto → Deployments
   - Clique em **View logs** para a versão atual

3. **Reconstruir do zero**:
   ```bash
   # Limpar e redeploy
   wrangler publish --force
   ```

## 📝 Desenvolvimento Local

Para testes locais sem precisar fazer deploy:

```bash
# Terminal 1: Inicie o servidor local da API
cd api
npm start

# Terminal 2: Inicie o live server para o frontend
# Use uma extensão do VS Code ou:
npx http-server public -p 5500
```

O sistema automaticamente detectará que está em localhost e usará `http://localhost:3000`.

## 🚢 Workflow de Produção

1. **Desenvolva e teste localmente**: `npm start` na pasta `api/`
2. **Faça commit**: `git add . && git commit -m "sua mensagem"`
3. **Quando pronto**:
   ```bash
   wrangler deploy
   ```
4. **Cloudflare Pages detectará a mudança e deployará automaticamente**

## 📊 Arquivos Modificados

- `worker/auth-admin.mjs` - Criação de usuários com melhor tratamento de erros
- `worker/index.mjs` - Endpoint `/admin/create-user` 
- `public/js/auth.js` - Auto-detecção de ambiente (localhost vs Cloudflare)
- `wrangler.toml` - Configuração do ambiente de produção

## ✅ Checklist Final

- [ ] `firebase-service-account.json` está na raiz do projeto
- [ ] Variável `FIREBASE_SERVICE_ACCOUNT` configurada no Cloudflare (tipo: **Secret**)
- [ ] Variável `FIREBASE_PROJECT_ID` = `suportetecnico-api` (tipo: Standard)
- [ ] Variável `USUARIOS_COLLECTION` = `usuarios` (tipo: Standard)
- [ ] Executou `wrangler deploy` com sucesso
- [ ] Testou criação de usuário em produção (não falhou)
- [ ] Verificou que usuário foi criado no Firebase Auth + Firestore
- [ ] Testou login com novo usuário

---

**Pronto!** 🎉 Seu sistema de criação de usuários agora funciona em produção no Cloudflare!
