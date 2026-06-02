# 🔧 Configuração do Cloudflare Workers

## O que Mudou

A criação de usuários agora funciona automaticamente:
- **Em desenvolvimento (localhost)**: Usa `http://localhost:3000` (Express local)
- **Em produção (Cloudflare Pages)**: Usa a mesma origem do site (Cloudflare Workers)

## 📋 Pré-requisitos

- Cloudflare Workers deployado com `wrangler deploy`
- Arquivo `firebase-service-account.json` com credenciais do Firebase

## 🚀 Passos para Configurar

### 1️⃣ Criar Variável de Ambiente no Cloudflare

1. Acesse [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Vá para **Workers & Pages** → Seu projeto (suportetecnico-api)
3. Clique em **Settings** → **Environment variables**
4. Clique em **Add variable**

### 2️⃣ Adicionar Variáveis Necessárias

Crie as seguintes variáveis de ambiente (todas as variáveis devem ser "Secret" ou "Standard"):

#### Variáveis Obrigatórias:

| Nome | Valor | Tipo |
|------|-------|------|
| `FIREBASE_SERVICE_ACCOUNT` | Copie o conteúdo completo do `firebase-service-account.json` | **Secret** |
| `FIREBASE_PROJECT_ID` | `suportetecnico-api` | Standard |
| `USUARIOS_COLLECTION` | `usuarios` | Standard |

**Como copiar o FIREBASE_SERVICE_ACCOUNT:**
```bash
# No Windows PowerShell:
Get-Content firebase-service-account.json | Set-Clipboard

# Ou no terminal:
cat firebase-service-account.json
```

Copie TODO o conteúdo JSON (incluindo `{` e `}`) e cole na variável `FIREBASE_SERVICE_ACCOUNT`.

#### Variáveis Opcionais:

| Nome | Valor | Descrição |
|------|-------|-----------|
| `SHEETS_SPREADSHEET_ID` | Seu ID da planilha | Para sincronizar com Google Sheets |
| `SHEETS_SERVICE_ACCOUNT` | JSON do Google Sheets | Credenciais do Google |
| `SHEETS_SHEET_NAME` | `Sheet1` | Nome da aba na planilha |
| `SHEETS_SYNC_TOKEN` | `seu-token-aleatorio` | Token de segurança |

### 3️⃣ Deployar o Worker

```bash
# Na raiz do projeto
wrangler deploy
```

Você verá uma saída como:
```
✓ Uploaded suportetecnico-api (1.23 sec)
✓ Deployed to https://suportetecnico-api.pages.dev/
```

### 4️⃣ Testar a Criação de Usuários

1. Acesse sua aplicação em produção: `https://seu-dominio.pages.dev`
2. Faça login como admin
3. Vá para **Admin → Novo Usuário**
4. Preencha os dados e clique **Criar Usuário**
5. ✅ Deve funcionar agora!

## 🔍 Verificar Logs

Para ver logs do Cloudflare Worker:

1. Acesse [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Vá para **Workers & Pages** → Seu projeto
3. Clique em **Logs** ou **Real-time analytics**
4. Procure por erros com `[Cloudflare]`

## 🛠️ Troubleshooting

### Erro: "FIREBASE_SERVICE_ACCOUNT is not defined"
→ Você não configurou a variável de ambiente no Cloudflare
→ Vá para **Settings → Environment variables** e adicione a variável

### Erro: "Erro ao criar usuário" 
→ Verifique se o `FIREBASE_SERVICE_ACCOUNT` está correto (deve ser JSON válido)
→ Verifique os logs do Cloudflare para mais detalhes

### Erro: "Email já cadastrado" ou "Senha fraca"
→ Mensagem normal do Firebase, escolha outro email ou senha mais forte

### Ainda não funciona?
→ Tente fazer um teste local primeiro com `npm start` para confirmar que funciona
→ Depois envie um novo deploy: `wrangler deploy`

## 📝 Desenvolvimento Local

Para testar localmente sem precisar fazer deploy:

```bash
# Terminal 1: Inicie o servidor local da API
cd api
npm start

# Terminal 2: Inicie o servidor da aplicação
# Você pode usar Live Server ou similar para a pasta public/
```

O sistema automaticamente detectará que está em localhost e usará `http://localhost:3000`.

## 🚢 Workflow de Produção

1. **Desenvolva localmente** com `npm start` (usa Express em localhost:3000)
2. **Faça os testes** na interface local
3. **Quando tudo funcionar:**
   ```bash
   wrangler deploy
   ```
4. **A aplicação em produção** automaticamente usará o Cloudflare Worker

## 📚 Arquivos Modificados

- `worker/index.mjs` - Adicionado endpoint `/admin/create-user`
- `worker/auth-admin.mjs` - Novo arquivo com lógica de criação de usuários
- `public/js/auth.js` - Detecta automaticamente qual API usar

## ✅ Checklist de Configuração

- [ ] `firebase-service-account.json` está na raiz do projeto
- [ ] Variável `FIREBASE_SERVICE_ACCOUNT` configurada no Cloudflare
- [ ] Variável `FIREBASE_PROJECT_ID` = `suportetecnico-api`
- [ ] Variável `USUARIOS_COLLECTION` = `usuarios`
- [ ] Executou `wrangler deploy`
- [ ] Testou criação de usuário em produção
- [ ] Verificou logs do Cloudflare

---

**Pronto!** 🎉 Seu sistema de criação de usuários agora funciona em produção no Cloudflare!
