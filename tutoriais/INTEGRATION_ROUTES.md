# 🔌 Integração de Rotas Admin - index.mjs do Worker

## 📋 Rotas Necessárias para Adicionar

Adicione estas rotas no seu `worker/index.mjs` após as rotas existentes:

```javascript
import { criarUsuarioFirebase } from "./criar-usuario.mjs";
import { editarUsuario, atualizarCargo, excluirUsuario } from "./gerenciar-usuario.mjs";
import { CARGOS, normalizarCargo } from "./funcoes.mjs";

// ============================================
// 👤 ROTAS DE GERENCIAMENTO DE USUÁRIOS
// ============================================

/**
 * POST /admin/create-user
 * Criar novo usuário no Firebase Auth e Firestore
 * 
 * Body:
 * {
 *   "email": "novo@email.com",
 *   "password": "senha123",
 *   "displayName": "João Silva",
 *   "cargo": "Operador"  // Opcional, padrão: "Operador"
 * }
 */
if (url.pathname === "/admin/create-user") {
  if (request.method !== "POST") {
    return jsonResponse(405, { ok: false, error: "Metodo nao permitido." });
  }

  try {
    const body = await request.json();
    const { email, password, displayName, cargo } = body;

    // Validações
    if (!email || !password || !displayName) {
      return jsonResponse(400, {
        ok: false,
        error: "Email, senha e displayName são obrigatórios."
      });
    }

    // Criar usuário com instância secundária
    const result = await criarUsuarioFirebase({
      email,
      password,
      displayName,
      cargo: normalizarCargo(cargo),
      env
    });

    if (result.ok) {
      return jsonResponse(201, { ok: true, ...result });
    } else {
      return jsonResponse(400, result);
    }
  } catch (error) {
    return jsonResponse(500, {
      ok: false,
      error: "Erro ao criar usuário.",
      details: error.message
    });
  }
}

/**
 * PATCH /admin/edit-user
 * Editar usuário (email, nome, cargo, senha)
 * 
 * Body:
 * {
 *   "uid": "user-uid",
 *   "emailAtual": "email@atual.com",
 *   "nome": "Novo Nome",
 *   "emailNovo": "novo@email.com",  // Opcional
 *   "cargo": "Supervisor",           // Opcional
 *   "novaSenha": "novaSenha123",     // Opcional
 *   "senhaAtual": "senhaAtual123"    // Opcional (requerido se mudar email/senha)
 * }
 */
if (url.pathname === "/admin/edit-user") {
  if (request.method !== "PATCH") {
    return jsonResponse(405, { ok: false, error: "Metodo nao permitido." });
  }

  try {
    const body = await request.json();
    const result = await editarUsuario({
      ...body,
      cargo: body.cargo ? normalizarCargo(body.cargo) : undefined,
      env
    });

    if (result.ok) {
      return jsonResponse(200, result);
    } else {
      return jsonResponse(400, result);
    }
  } catch (error) {
    return jsonResponse(500, {
      ok: false,
      error: "Erro ao editar usuário.",
      details: error.message
    });
  }
}

/**
 * PATCH /admin/update-cargo
 * Atualizar apenas o cargo do usuário
 * 
 * Body:
 * {
 *   "uid": "user-uid",
 *   "cargo": "Administrador"
 * }
 */
if (url.pathname === "/admin/update-cargo") {
  if (request.method !== "PATCH") {
    return jsonResponse(405, { ok: false, error: "Metodo nao permitido." });
  }

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

    if (result.ok) {
      return jsonResponse(200, result);
    } else {
      return jsonResponse(400, result);
    }
  } catch (error) {
    return jsonResponse(500, {
      ok: false,
      error: "Erro ao atualizar cargo.",
      details: error.message
    });
  }
}

/**
 * DELETE /admin/delete-user
 * Excluir usuário (remove auth e Firestore)
 * 
 * Body:
 * {
 *   "uid": "user-uid",
 *   "email": "email@do.usuario",
 *   "senhaAtual": "senha123"  // Opcional (para verificação)
 * }
 */
if (url.pathname === "/admin/delete-user") {
  if (request.method !== "DELETE") {
    return jsonResponse(405, { ok: false, error: "Metodo nao permitido." });
  }

  try {
    const body = await request.json();
    const result = await excluirUsuario({
      ...body,
      env
    });

    if (result.ok) {
      return jsonResponse(200, result);
    } else {
      return jsonResponse(400, result);
    }
  } catch (error) {
    return jsonResponse(500, {
      ok: false,
      error: "Erro ao excluir usuário.",
      details: error.message
    });
  }
}

/**
 * GET /admin/cargos
 * Listar cargos disponíveis
 */
if (url.pathname === "/admin/cargos") {
  if (request.method !== "GET") {
    return jsonResponse(405, { ok: false, error: "Metodo nao permitido." });
  }

  return jsonResponse(200, {
    ok: true,
    cargos: CARGOS
  });
}

// ============================================
```

## 🔐 Proteção de Rotas

Para adicionar autenticação/autorização, use middleware:

```javascript
/**
 * Middleware: Verificar se request está autorizado
 * Use token no header X-Admin-Token (mesmo do webhook)
 */
function isAdminAuthorized(request, env) {
  const token = request.headers.get("x-admin-token") || 
                request.headers.get("authorization")?.replace("Bearer ", "");
  const expected = env.ADMIN_TOKEN || "";
  return token && token === expected;
}

// Aplicar proteção nas rotas admin:
if (url.pathname.startsWith("/admin/")) {
  // Se não estiver autorizado, rejeitar
  if (!isAdminAuthorized(request, env)) {
    return jsonResponse(401, {
      ok: false,
      error: "Não autorizado. Forneça um token válido."
    });
  }
}
```

## 📝 Atualizar wrangler.toml

Adicione as novas variáveis de ambiente:

```toml
# Variáveis de ambiente
[env.production.vars]
FIREBASE_PROJECT_ID = "seu-project-id"
USUARIOS_COLLECTION = "usuarios"
ADMIN_TOKEN = "seu-token-secreto"  # Para proteger rotas admin

# Secrets (não commitar!)
[env.production]
name = "suporte-tecnico-worker"

# Na CLI:
# wrangler secret put FIREBASE_SERVICE_ACCOUNT_BASE64
```

## 🧪 Testar Rotas

### **Criar Usuário**
```bash
curl -X POST https://seu-worker.dev/admin/create-user \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: seu-token-secreto" \
  -d '{
    "email": "novo@email.com",
    "password": "senha123",
    "displayName": "Novo Usuário",
    "cargo": "Operador"
  }'
```

### **Editar Usuário**
```bash
curl -X PATCH https://seu-worker.dev/admin/edit-user \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: seu-token-secreto" \
  -d '{
    "uid": "user-uid",
    "emailAtual": "email@atual.com",
    "nome": "Novo Nome",
    "cargo": "Supervisor"
  }'
```

### **Listar Cargos**
```bash
curl https://seu-worker.dev/admin/cargos
```

---

## 📦 Estrutura Completa do Worker

```
worker/
├── index.mjs                    ✅ Main handler
├── auth-admin.mjs               ✅ Instância primária (melhorada)
├── auth-secondary.mjs           ✅ Nova - Instância secundária
├── criar-usuario.mjs            ✅ Nova - Criar usuário
├── gerenciar-usuario.mjs        ✅ Nova - Editar/deletar
├── funcoes.mjs                  ✅ Nova - Cargos padronizados
├── firestore-rest.mjs           ✅ Já existe (Sheets sync)
├── sheets-sync.mjs              ✅ Já existe
├── webhook.mjs                  ✅ Já existe
└── wrangler.toml                📝 Atualizar
```

