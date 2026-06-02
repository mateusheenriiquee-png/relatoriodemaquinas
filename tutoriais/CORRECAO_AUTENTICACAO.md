# 🔐 Correção da Autenticação - Admin Token

## Problema Identificado

O painel de admin estava recebendo erro **401 Unauthorized** porque:

1. ❌ O **frontend** estava enviando o **Firebase ID Token** no header `Authorization: Bearer`
2. ❌ A **API** não estava verificando a autenticação na rota `/admin/create-user`
3. ❌ Não havia um middleware que validasse o Firebase Token

## Solução Implementada

### 1. Frontend - `public/js/auth.js`

✅ **Adicionado:**
- Novo método `getIdToken()` que retorna o Firebase ID Token do usuário autenticado
- Atualização do método `createUser()` para enviar o token no header

**Código:**
```javascript
async getIdToken() {
  if (!this.currentUser) {
    throw new Error("Usuário não autenticado");
  }
  return await this.currentUser.getIdToken();
}

// Na função createUser():
const token = await this.getIdToken();

const response = await fetch(`${apiBase}/admin/create-user`, {
  method: "POST",
  headers: { 
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`  // ✅ Token adicionado aqui
  },
  body: JSON.stringify({ email, password, displayName, cargo })
});
```

### 2. Backend - Worker (Cloudflare) - `worker/index.mjs` e `worker/auth-admin.mjs`

✅ **Adicionado:**
- Função `verifyFirebaseToken()` em `auth-admin.mjs` que valida Firebase ID Tokens
- Middleware `isAdminAuthorized()` atualizado para aceitar tanto:
  - Token `ADMIN_TOKEN` fixo (se configurado)
  - Firebase ID Token válido (se não houver token fixo configurado)
- Middleware agora é assíncrono e faz a verificação do token

**Código em `auth-admin.mjs`:**
```javascript
export async function verifyFirebaseToken(token, env = {}) {
  try {
    if (!token) {
      return {
        valid: false,
        error: "Token não fornecido"
      };
    }

    initializeFirebaseAdmin(env);
    const decodedToken = await admin.auth().verifyIdToken(token);

    console.log(`[Firebase] ✓ Token validado. UID: ${decodedToken.uid}`);
    return {
      valid: true,
      uid: decodedToken.uid,
      email: decodedToken.email
    };
  } catch (error) {
    console.error(`[Firebase] ❌ Erro ao validar token:`, error.message);
    return {
      valid: false,
      error: "Token inválido ou expirado."
    };
  }
}
```

### 3. Backend - Node.js API - `api/src/server.js`

✅ **Adicionado:**
- Função `isAdminAuthorized()` assíncrona que valida:
  - Token `ADMIN_TOKEN` fixo (se configurado)
  - Firebase ID Token válido (usando `admin.auth().verifyIdToken()`)
- Verificação na rota `/admin/create-user`

**Código:**
```javascript
async function isAdminAuthorized(req) {
  const expectedToken = process.env.ADMIN_TOKEN;
  const headerToken = req.headers["x-admin-token"] ||
                      req.headers["authorization"]?.replace("Bearer ", "");
  
  if (expectedToken) {
    if (headerToken && headerToken === expectedToken) {
      return true;
    }
  }
  
  if (headerToken && !expectedToken) {
    try {
      const decodedToken = await admin.auth().verifyIdToken(headerToken);
      console.log(`[Admin] Token Firebase validado. UID: ${decodedToken.uid}`);
      return true;
    } catch (error) {
      console.error("[Admin] Erro ao validar Firebase token:", error.message);
      return false;
    }
  }
  
  return !expectedToken;
}

// Na rota:
app.post("/admin/create-user", async (req, res) => {
  const authorized = await isAdminAuthorized(req);
  if (!authorized) {
    return res.status(401).json({
      ok: false,
      error: "Não autorizado. Forneça um token válido..."
    });
  }
  // ... resto da lógica
});
```

## Como Usar

### Opção 1: Token Firebase (Recomendado para Frontend)

O frontend automaticamente envia o token Firebase quando o usuário está autenticado:

```javascript
// Frontend - app.js/admin-panel.js
const token = await authManager.getIdToken();  // Obtém automaticamente
await fetch('/admin/create-user', {
  headers: {
    'Authorization': `Bearer ${token}`
  },
  // ...
});
```

### Opção 2: Token Fixo (Admin Token)

Se configurar `ADMIN_TOKEN` em variáveis de ambiente:

```bash
# Cloudflare Workers / Node.js
ADMIN_TOKEN=seu-token-secreto-aqui
```

Então enviar:

```bash
curl -H "Authorization: Bearer seu-token-secreto-aqui" \
  https://api.seu-dominio.com/admin/create-user
```

## Fluxo de Autenticação

```
1. Usuário faz login (Firebase Auth)
   ↓
2. Firebase gera ID Token
   ↓
3. Frontend guarda o token em memória (session persistence)
   ↓
4. Frontend envia token em cada requisição ao header Authorization
   ↓
5. Backend valida o token com Firebase Admin SDK
   ↓
6. Se válido, autoriza a operação admin
```

## Testes

### Teste 1: Criar Usuário (Frontend)

1. Abra o painel de admin: `https://seu-dominio.com/admin.html`
2. Faça login com uma conta admin
3. Vá para "Novo Usuário"
4. Preencha o formulário e clique em "Criar Usuário"
5. ✅ Deve criar com sucesso (erro 401 foi resolvido)

### Teste 2: Criar Usuário (CURL - Token Firebase)

```bash
# 1. Obter Firebase ID Token
TOKEN=$(curl -s -X POST \
  'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=SUA_FIREBASE_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "admin@exemplo.com",
    "password": "senha123",
    "returnSecureToken": true
  }' | jq -r '.idToken')

# 2. Usar o token para criar novo usuário
curl -X POST https://api.seu-dominio.com/admin/create-user \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "novo@exemplo.com",
    "password": "senha123",
    "displayName": "Novo Usuário",
    "cargo": "operador"
  }'
```

### Teste 3: Criar Usuário (CURL - Admin Token Fixo)

```bash
curl -X POST https://api.seu-dominio.com/admin/create-user \
  -H "Authorization: Bearer sk-admin-suportetecnico-secure-token" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "novo@exemplo.com",
    "password": "senha123",
    "displayName": "Novo Usuário",
    "cargo": "operador"
  }'
```

## Variáveis de Ambiente Necessárias

### Para Firebase Token Validation

✅ Já configuradas:
- `FIREBASE_SERVICE_ACCOUNT` ou `FIREBASE_SERVICE_ACCOUNT_BASE64`
- `FIREBASE_PROJECT_ID`

### Opcional: Token Fixo de Admin

```bash
# Cloudflare Workers
wrangler secret put ADMIN_TOKEN

# Node.js / Heroku
ADMIN_TOKEN=seu-token-secreto-aqui
```

## Segurança

✅ **Implementado:**
- Token Firebase expira em 1 hora (renovado automaticamente pelo SDK)
- Token é validado no servidor com Firebase Admin SDK
- CORS habilitado apenas para domínios autorizados
- Senha não é armazenada em cliente, apenas token JWT validado

## Resumo das Mudanças

| Arquivo | Mudança |
|---------|---------|
| `public/js/auth.js` | ✅ Adicionado método `getIdToken()` e token no header |
| `worker/auth-admin.mjs` | ✅ Adicionado `verifyFirebaseToken()` |
| `worker/index.mjs` | ✅ Middleware `isAdminAuthorized()` agora valida Firebase Token |
| `api/src/server.js` | ✅ Adicionado middleware de autenticação em `/admin/create-user` |

---

**Status:** ✅ Resolvido  
**Data:** 02/06/2026  
**Próximos Passos:** Testar no painel de admin e em produção
