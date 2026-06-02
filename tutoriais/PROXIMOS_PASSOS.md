# 🚀 PRÓXIMOS PASSOS - O Que Fazer Agora

## ⏱️ Tempo Total: ~30 minutos

---

## 📋 Checklist Pré-Implementação

- [ ] `worker/index.mjs` atualizado com todas as rotas
- [ ] `worker/criar-usuario.mjs` criado ✅
- [ ] `worker/gerenciar-usuario.mjs` criado ✅
- [ ] `worker/funcoes.mjs` criado ✅
- [ ] `worker/auth-secondary.mjs` criado ✅
- [ ] `worker/auth-admin.mjs` melhorado ✅
- [ ] Base64 do Firebase convertido
- [ ] `ADMIN_TOKEN` definido no Cloudflare

---

## ✅ FASE 1: Converter Base64 (5 min)

### **Windows PowerShell**
```powershell
# Ler arquivo e converter
$content = Get-Content "C:\path\firebase-service-account.json" -Raw
$base64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($content))

# Copiar para clipboard
$base64 | Set-Clipboard

# Ou salvar em arquivo
$base64 | Out-File "firebase-base64.txt"
```

### **Verificar se está correto**
```powershell
# Decodificar de volta (deve mostrar JSON válido)
$base64 = (Get-Content "firebase-base64.txt")
$bytes = [Convert]::FromBase64String($base64)
$json = [System.Text.Encoding]::UTF8.GetString($bytes)
$json | ConvertFrom-Json | ConvertTo-Json  # Se der erro, o Base64 está ruim
```

---

## ✅ FASE 2: Adicionar Secrets no Cloudflare (5 min)

### **Opção 1: Via CLI (Recomendado)**
```bash
# Navegue até a pasta do projeto
cd c:\Users\zeror\Desktop\suportetecnico-api

# 1. Adicionar Firebase Service Account Base64
wrangler secret put FIREBASE_SERVICE_ACCOUNT_BASE64
# Cole aqui: (ctrl+V com o Base64 copiado)
# Pressione: Ctrl+Z e depois Enter

# 2. Adicionar Token de Administrador
wrangler secret put ADMIN_TOKEN
# Digite: seu-token-super-seguro-aqui (ex: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9)
```

### **Opção 2: Via Dashboard**
1. [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Workers & Pages → seu-worker
3. **Settings** → **Variables and Secrets**
4. **Add Secret** → Nome: `FIREBASE_SERVICE_ACCOUNT_BASE64`
5. **Add Secret** → Nome: `ADMIN_TOKEN`

---

## ✅ FASE 3: Atualizar wrangler.toml (5 min)

Abra `wrangler.toml` e adicione/confirme:

```toml
# ✅ Variáveis de Ambiente
[env.production.vars]
FIREBASE_PROJECT_ID = "suportetecnico-api-9386b"
USUARIOS_COLLECTION = "usuarios"

# ❌ NÃO adicione FIREBASE_SERVICE_ACCOUNT_BASE64 ou ADMIN_TOKEN aqui!
# Use: wrangler secret put (secrets não vão no arquivo!)
```

---

## ✅ FASE 4: Deploy (5 min)

```bash
# Navegar até a pasta
cd c:\Users\zeror\Desktop\suportetecnico-api

# Deploy para produção
wrangler deploy --env production

# Ou simples (sem environment)
wrangler deploy

# Ver logs em tempo real
wrangler tail
```

**Esperado nos logs:**
```
✓ Deployed successfully
```

---

## ✅ FASE 5: Testar Criar Usuário (5 min)

### **PowerShell**
```powershell
$headers = @{
    "Content-Type" = "application/json"
    "X-Admin-Token" = "seu-token-super-seguro-aqui"
}

$body = @{
    email = "teste@empresa.com"
    password = "TesteSenha123"
    displayName = "Usuário Teste"
    cargo = "Operador"
} | ConvertTo-Json

$response = Invoke-WebRequest -Uri "https://seu-worker.dev/admin/create-user" `
    -Method POST `
    -Headers $headers `
    -Body $body

$response.Content | ConvertFrom-Json
```

### **Bash/Linux/Mac**
```bash
curl -X POST https://seu-worker.dev/admin/create-user \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: seu-token-super-seguro-aqui" \
  -d '{
    "email": "teste@empresa.com",
    "password": "TesteSenha123",
    "displayName": "Usuário Teste",
    "cargo": "Operador"
  }'
```

**Resposta esperada (201):**
```json
{
  "ok": true,
  "uid": "abc123xyz...",
  "email": "teste@empresa.com",
  "displayName": "Usuário Teste",
  "cargo": "Operador",
  "message": "Usuário teste@empresa.com criado com sucesso!"
}
```

---

## ✅ FASE 6: Verificar Firestore (5 min)

1. [Firebase Console](https://console.firebase.google.com/)
2. Selecione: **seu-projeto** → **Firestore Database**
3. Coleção: **usuarios**
4. Deve ter documento com ID = uid do usuário criado
5. Campos: email, displayName, cargo, createdAt, atualizadoEm

---

## ✅ FASE 7: Testar as Outras Rotas (5 min)

### **Editar Usuário**
```bash
curl -X PATCH https://seu-worker.dev/admin/edit-user \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: seu-token-super-seguro-aqui" \
  -d '{
    "uid": "abc123xyz",
    "emailAtual": "teste@empresa.com",
    "cargo": "Supervisor"
  }'
```

### **Alterar Cargo**
```bash
curl -X PATCH https://seu-worker.dev/admin/update-cargo \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: seu-token-super-seguro-aqui" \
  -d '{
    "uid": "abc123xyz",
    "cargo": "Administrador"
  }'
```

### **Deletar Usuário**
```bash
curl -X DELETE https://seu-worker.dev/admin/delete-user \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: seu-token-super-seguro-aqui" \
  -d '{
    "uid": "abc123xyz",
    "email": "teste@empresa.com"
  }'
```

### **Listar Cargos**
```bash
curl https://seu-worker.dev/admin/cargos \
  -H "X-Admin-Token: seu-token-super-seguro-aqui"

# Resposta:
# {
#   "ok": true,
#   "cargos": ["Operador", "Atendente", "Supervisor", "Administrador"]
# }
```

---

## 🚨 Troubleshooting Rápido

### **"Erro ao decodificar Base64"**
```bash
# Verificar se Base64 é válido
$base64 = (Get-Content "firebase-base64.txt")
[System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($base64)) | ConvertFrom-Json

# Se der erro, regenerar conforme Fase 1
```

### **"Não autorizado" (401)**
```bash
# Verificar token
wrangler secret list
# Deve mostrar: FIREBASE_SERVICE_ACCOUNT_BASE64 (set)
# Deve mostrar: ADMIN_TOKEN (set)

# Se faltar, adicionar:
wrangler secret put ADMIN_TOKEN
# Digite o token novamente
```

### **"PERMISSION_DENIED"**
Não é problema do Base64! Verificar Firestore Rules:
1. Firebase Console > Firestore > Rules
2. Deve ter permissão para collection "usuarios"
3. Exemplo:
   ```javascript
   match /usuarios/{document=**} {
     allow read, write: if true;  // Para testar
   }
   ```

### **Usuário não aparece em Firestore**
1. Verificar logs: `wrangler tail`
2. Procure por: `[UserCreation] ✓ Documento Firestore criado`
3. Se não houver, há erro de permissão ou conectividade

---

## ✅ Verificação Final

```bash
# 1. Conferir deploy
wrangler status

# 2. Testar rota de saúde
curl https://seu-worker.dev/admin/health

# 3. Ver todos os endpoints
curl https://seu-worker.dev/admin/cargos

# 4. Ver logs
wrangler tail --lines=50
```

---

## 📞 Você Está Aqui

```
[✅] Criar arquivos
[✅] Implementar rotas em index.mjs
[✅] Converter Base64
[→] Adicionar secrets no Cloudflare
[ ] Deploy
[ ] Testar
[ ] Verificar Firestore
[ ] Integrar frontend (próximo)
```

---

## 🎯 Comandos de Uma Linha

**Copie e cole cada um:**

```bash
# 1. Deploy
wrangler deploy --env production

# 2. Ver logs
wrangler tail

# 3. Testar criar usuário
curl -X POST https://seu-worker.dev/admin/create-user -H "Content-Type: application/json" -H "X-Admin-Token: seu-token" -d "{\"email\":\"teste@test.com\",\"password\":\"senha123\",\"displayName\":\"Teste\",\"cargo\":\"Operador\"}"

# 4. Testar listar cargos
curl https://seu-worker.dev/admin/cargos -H "X-Admin-Token: seu-token"
```

---

## 📚 Referências Rápidas

- [ROTAS_ADMIN_IMPLEMENTADAS.md](ROTAS_ADMIN_IMPLEMENTADAS.md) - O que foi adicionado
- [GUIA_IMPLEMENTACAO.md](GUIA_IMPLEMENTACAO.md) - Guia completo
- [FIREBASE_BASE64_GUIDE.md](FIREBASE_BASE64_GUIDE.md) - Base64 em detalhes
- [INTEGRATION_ROUTES.md](INTEGRATION_ROUTES.md) - Exemplos de requisições

---

**Status:** ✅ **PRONTO PARA DEPLOY**

Próximo passo: Execute os comandos da **FASE 1** para começar!

