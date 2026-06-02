# 📝 GUIA DE IMPLEMENTAÇÃO - O Que Fazer

## 🎯 Próximos Passos em Ordem de Prioridade

### **FASE 1: Preparação (30 min)**

#### 1️⃣ Converter Firebase Service Account para Base64
```bash
# Linux/Mac
cat firebase-service-account.json | base64 -w0 > firebase-base64.txt

# Windows PowerShell
$content = Get-Content "firebase-service-account.json" -Raw
$base64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($content))
$base64 | Set-Clipboard
```

**Verificar:**
```bash
cat firebase-base64.txt | base64 -d | jq . | head
# Deve mostrar um JSON válido com "type", "project_id", etc
```

#### 2️⃣ Adicionar no Cloudflare Dashboard
1. Acesse [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Selecione seu Worker
3. **Settings** → **Variables and Secrets**
4. **Add Secret**
   - Nome: `FIREBASE_SERVICE_ACCOUNT_BASE64`
   - Valor: (Cole o conteúdo de firebase-base64.txt)
5. **Save**

**Ou via CLI:**
```bash
wrangler secret put FIREBASE_SERVICE_ACCOUNT_BASE64
# Cole o base64, pressione Ctrl+D (Mac/Linux) ou Ctrl+Z+Enter (Windows)
```

---

### **FASE 2: Adicionar Novos Arquivos (15 min)**

Já foram criados em seu projeto:
- ✅ `worker/auth-secondary.mjs`
- ✅ `worker/criar-usuario.mjs`
- ✅ `worker/gerenciar-usuario.mjs`
- ✅ `worker/funcoes.mjs`

**Verificar:**
```bash
ls -la worker/*.mjs
# Devem mostrar os 4 arquivos acima
```

---

### **FASE 3: Atualizar index.mjs (45 min)**

#### 3️⃣ Adicionar Imports no Topo
Abra `worker/index.mjs` e procure pelos imports já existentes. Adicione:

```javascript
// Adicionar DEPOIS dos imports existentes:
import { criarUsuarioFirebase } from "./criar-usuario.mjs";
import {
  editarUsuario,
  atualizarCargo,
  excluirUsuario,
  liberarEmailUsuario
} from "./gerenciar-usuario.mjs";
import { CARGOS, normalizarCargo } from "./funcoes.mjs";
```

**Localização:** Antes da função `jsonResponse()` ou antes de `export default`

#### 4️⃣ Adicionar Função de Autorização
Adicione (antes do `export default`):

```javascript
/**
 * Verificar se request está autorizado para operações admin
 * Usar header X-Admin-Token ou Authorization Bearer
 */
function isAdminAuthorized(request, env) {
  // Permitir sem token se não configurado (para desenvolvimento)
  const expectedToken = env.ADMIN_TOKEN;
  if (!expectedToken) return true;

  const headerToken = request.headers.get("x-admin-token") ||
                      request.headers.get("authorization")?.replace("Bearer ", "");
  
  return headerToken && headerToken === expectedToken;
}
```

#### 5️⃣ Adicionar Proteção para Rotas Admin
Dentro do `export default { async fetch(request, env) { ... } }`:

```javascript
// ADICIONAR NO INÍCIO da função fetch, antes de processar outras rotas
if (url.pathname.startsWith("/admin/")) {
  if (!isAdminAuthorized(request, env)) {
    return jsonResponse(401, {
      ok: false,
      error: "Não autorizado. Forneça um token válido."
    });
  }
}
```

#### 6️⃣ Adicionar as 5 Rotas Admin
Adicione ANTES do `return jsonResponse(404, ...)` final:

```javascript
// ============================================
// 👤 ROTAS DE GERENCIAMENTO DE USUÁRIOS
// ============================================

// 1. CREATE USER
if (url.pathname === "/admin/create-user" && request.method === "POST") {
  try {
    const body = await request.json();
    const { email, password, displayName, cargo } = body;

    if (!email || !password || !displayName) {
      return jsonResponse(400, {
        ok: false,
        error: "Email, senha e displayName são obrigatórios."
      });
    }

    const result = await criarUsuarioFirebase({
      email,
      password,
      displayName,
      cargo: normalizarCargo(cargo || "Operador"),
      env
    });

    return result.ok 
      ? jsonResponse(201, { ok: true, ...result })
      : jsonResponse(400, result);
  } catch (error) {
    return jsonResponse(500, {
      ok: false,
      error: "Erro ao criar usuário.",
      details: error.message
    });
  }
}

// 2. EDIT USER
if (url.pathname === "/admin/edit-user" && request.method === "PATCH") {
  try {
    const body = await request.json();
    const result = await editarUsuario({
      ...body,
      cargo: body.cargo ? normalizarCargo(body.cargo) : undefined,
      env
    });

    return result.ok 
      ? jsonResponse(200, result)
      : jsonResponse(400, result);
  } catch (error) {
    return jsonResponse(500, {
      ok: false,
      error: "Erro ao editar usuário.",
      details: error.message
    });
  }
}

// 3. UPDATE CARGO
if (url.pathname === "/admin/update-cargo" && request.method === "PATCH") {
  try {
    const body = await request.json();
    const { uid, cargo } = body;

    if (!uid || !cargo) {
      return jsonResponse(400, {
        ok: false,
        error: "uid e cargo são obrigatórios."
      });
    }

    const result = await atualizarCargo(uid, normalizarCargo(cargo), env);
    return result.ok 
      ? jsonResponse(200, result)
      : jsonResponse(400, result);
  } catch (error) {
    return jsonResponse(500, {
      ok: false,
      error: "Erro ao atualizar cargo.",
      details: error.message
    });
  }
}

// 4. DELETE USER
if (url.pathname === "/admin/delete-user" && request.method === "DELETE") {
  try {
    const body = await request.json();
    const result = await excluirUsuario({
      ...body,
      env
    });

    return result.ok 
      ? jsonResponse(200, result)
      : jsonResponse(400, result);
  } catch (error) {
    return jsonResponse(500, {
      ok: false,
      error: "Erro ao excluir usuário.",
      details: error.message
    });
  }
}

// 5. LIST CARGOS
if (url.pathname === "/admin/cargos" && request.method === "GET") {
  return jsonResponse(200, {
    ok: true,
    cargos: CARGOS
  });
}
```

---

### **FASE 4: Configurar wrangler.toml (10 min)**

#### 7️⃣ Atualizar Variáveis de Ambiente

Abra `wrangler.toml` e adicione (se não existir):

```toml
[env.production.vars]
FIREBASE_PROJECT_ID = "suportetecnico-api-9386b"  # Seu project ID
USUARIOS_COLLECTION = "usuarios"
ADMIN_TOKEN = "seu-token-secreto-aqui"  # Usar para proteger rotas

# Não adicione FIREBASE_SERVICE_ACCOUNT_BASE64 aqui!
# Usar: wrangler secret put FIREBASE_SERVICE_ACCOUNT_BASE64
```

**Via CLI (mais seguro):**
```bash
wrangler secret put ADMIN_TOKEN
# Digite um token seguro, ex: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

### **FASE 5: Testar (30 min)**

#### 8️⃣ Deploy para Produção
```bash
wrangler deploy

# Ou com ambiente específico:
wrangler deploy --env production
```

#### 9️⃣ Testar Criar Usuário
```bash
curl -X POST https://seu-worker.dev/admin/create-user \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: seu-token-secreto-aqui" \
  -d '{
    "email": "teste@empresa.com",
    "password": "SenhaSegura123",
    "displayName": "Teste User",
    "cargo": "Operador"
  }'

# Resposta esperada:
# {
#   "ok": true,
#   "uid": "abc123...",
#   "email": "teste@empresa.com",
#   "displayName": "Teste User",
#   "cargo": "Operador",
#   "message": "Usuário teste@empresa.com criado com sucesso!"
# }
```

#### 🔟 Ver Logs
```bash
wrangler tail

# Procure por:
# [Firebase] ✓ Base64 decodificado com sucesso
# [Firebase] ✓ Service account parseado com sucesso
# [UserCreation] ✓ Auth user criado. UID: ...
# [UserCreation] ✓ Documento Firestore criado para ...
```

#### 1️⃣1️⃣ Verificar Firestore
1. Acesse [Firebase Console](https://console.firebase.google.com/)
2. Selecione seu projeto
3. **Firestore Database** → **usuarios**
4. Deve ver documento com o UID do usuário criado

#### 1️⃣2️⃣ Testar Editar
```bash
curl -X PATCH https://seu-worker.dev/admin/edit-user \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: seu-token-secreto-aqui" \
  -d '{
    "uid": "abc123...",
    "emailAtual": "teste@empresa.com",
    "cargo": "Supervisor"
  }'
```

#### 1️⃣3️⃣ Testar Deletar
```bash
curl -X DELETE https://seu-worker.dev/admin/delete-user \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: seu-token-secreto-aqui" \
  -d '{
    "uid": "abc123...",
    "email": "teste@empresa.com"
  }'
```

---

### **FASE 6: Integração Frontend (1-2 horas)**

#### 1️⃣4️⃣ Atualizar admin-panel.js
Se usar o padrão atual, devem estar usando a API local. Agora mudar para usar o Worker:

```javascript
// Mudar de:
// const apiBase = "http://localhost:3000";

// Para:
const apiBase = "https://seu-worker.dev";  // URL do Cloudflare Worker
```

#### 1️⃣5️⃣ Adicionar Token nas Requisições
```javascript
const headers = {
  "Content-Type": "application/json",
  "X-Admin-Token": "seu-token-secreto-aqui"  // ⚠️ Guardar de forma segura
};

const response = await fetch(`${apiBase}/admin/create-user`, {
  method: "POST",
  headers,
  body: JSON.stringify({ email, password, displayName, cargo })
});
```

---

## 📊 Checklist Completo

### **Preparação**
- [ ] Base64 gerado corretamente (`base64 -d` decodifica em JSON válido)
- [ ] Base64 adicionado como secret `FIREBASE_SERVICE_ACCOUNT_BASE64`
- [ ] `ADMIN_TOKEN` configurado

### **Código**
- [ ] `worker/auth-secondary.mjs` criado
- [ ] `worker/criar-usuario.mjs` criado
- [ ] `worker/gerenciar-usuario.mjs` criado
- [ ] `worker/funcoes.mjs` criado
- [ ] `worker/index.mjs` atualizado com imports
- [ ] `worker/index.mjs` atualizado com rotas
- [ ] `wrangler.toml` atualizado

### **Deploy**
- [ ] `wrangler deploy` executado com sucesso
- [ ] Logs mostram "[Firebase] ✓ Base64 decodificado com sucesso"
- [ ] Logs mostram "[Firebase] ✓ Service account parseado com sucesso"

### **Testes**
- [ ] Criar usuário funciona (201)
- [ ] Usuário aparece em Firebase Console > Firestore
- [ ] Editar cargo funciona (200)
- [ ] Deletar usuário funciona (200)
- [ ] Usuário é removido de Firestore e Auth

### **Frontend**
- [ ] admin-panel.js aponta para URL correta do Worker
- [ ] Requisições incluem X-Admin-Token
- [ ] Erro 401 se token inválido

---

## 🆘 Se Algo Não Funcionar

### **"Erro ao decodificar Base64"**
```bash
# 1. Verificar se Base64 é válido
cat firebase-base64.txt | base64 -d | jq . 

# 2. Se falhar, regenerar:
cat firebase-service-account.json | base64 -w0 > firebase-base64-new.txt

# 3. Atualizar no Cloudflare
wrangler secret put FIREBASE_SERVICE_ACCOUNT_BASE64
```

### **"PERMISSION_DENIED"**
Não é problema do Base64! Verificar Firestore Rules:
1. Firebase Console > Firestore > Rules
2. Deve ter permissão para `usuarios` collection
3. Exemplo:
   ```
   match /usuarios/{document=**} {
     allow read, write: if request.auth != null;
   }
   ```

### **Admin é deslogado após criar usuário**
- Verificar se `auth-secondary.mjs` está sendo usado
- Verificar logs: deve mostrar "FirebaseSecondary" nos logs
- Não deve aparecer "[Firebase] Admin SDK inicializado" após criar user

---

## 📞 Suporte

Se precisar de ajuda:
1. Verificar logs: `wrangler tail`
2. Verificar Firebase Console para erros
3. Comparar com exemplos em `FIREBASE_BASE64_GUIDE.md`
4. Verificar `ARQUITETURA_FLUXO.md` para entender o fluxo

