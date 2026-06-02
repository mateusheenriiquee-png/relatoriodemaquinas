# Teste das Rotas de Administração

**Worker URL:** https://suportetecnico-api.mateus-heenriiquee.workers.dev

**Token de Admin:** `sk-admin-suportetecnico-20250104-secure-token-v1`

## 1. Criar Novo Usuário

```bash
curl -X POST https://suportetecnico-api.mateus-heenriiquee.workers.dev/admin/create-user \
  -H "X-Admin-Token: sk-admin-suportetecnico-20250104-secure-token-v1" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "novo.usuario@example.com",
    "password": "Senha@123456",
    "displayName": "Novo Usuário",
    "cargo": "Atendente"
  }'
```

**Resposta esperada (201):**
```json
{
  "success": true,
  "message": "Usuário criado com sucesso",
  "uid": "abc123...",
  "email": "novo.usuario@example.com"
}
```

---

## 2. Editar Usuário

```bash
curl -X PATCH https://suportetecnico-api.mateus-heenriiquee.workers.dev/admin/edit-user \
  -H "X-Admin-Token: sk-admin-suportetecnico-20250104-secure-token-v1" \
  -H "Content-Type: application/json" \
  -d '{
    "uid": "abc123...",
    "emailAtual": "novo.usuario@example.com",
    "nome": "Novo Usuário Atualizado",
    "cargo": "Supervisor"
  }'
```

**Resposta esperada (200):**
```json
{
  "success": true,
  "message": "Usuário atualizado com sucesso",
  "uid": "abc123..."
}
```

---

## 3. Atualizar Cargo do Usuário

```bash
curl -X PATCH https://suportetecnico-api.mateus-heenriiquee.workers.dev/admin/update-cargo \
  -H "X-Admin-Token: sk-admin-suportetecnico-20250104-secure-token-v1" \
  -H "Content-Type: application/json" \
  -d '{
    "uid": "abc123...",
    "cargo": "Operador"
  }'
```

**Resposta esperada (200):**
```json
{
  "success": true,
  "message": "Cargo atualizado com sucesso",
  "uid": "abc123..."
}
```

---

## 4. Deletar Usuário

```bash
curl -X DELETE https://suportetecnico-api.mateus-heenriiquee.workers.dev/admin/delete-user \
  -H "X-Admin-Token: sk-admin-suportetecnico-20250104-secure-token-v1" \
  -H "Content-Type: application/json" \
  -d '{
    "uid": "abc123...",
    "email": "novo.usuario@example.com"
  }'
```

**Resposta esperada (200):**
```json
{
  "success": true,
  "message": "Usuário deletado com sucesso",
  "uid": "abc123..."
}
```

---

## 5. Listar Cargos Disponíveis

```bash
curl -X GET "https://suportetecnico-api.mateus-heenriiquee.workers.dev/admin/cargos" \
  -H "X-Admin-Token: sk-admin-suportetecnico-20250104-secure-token-v1"
```

**Resposta esperada (200):**
```json
{
  "success": true,
  "cargos": [
    "Operador",
    "Atendente",
    "Supervisor",
    "Administrador"
  ]
}
```

---

## Autenticação

### Opções de Token:
1. **Header `X-Admin-Token`** (recomendado para APIs)
```
X-Admin-Token: sk-admin-suportetecnico-20250104-secure-token-v1
```

2. **Bearer Token no Authorization**
```
Authorization: Bearer sk-admin-suportetecnico-20250104-secure-token-v1
```

---

## Códigos de Erro

| Código | Erro | Solução |
|--------|------|---------|
| 401 | Unauthorized | Verifique o token de admin |
| 400 | Bad Request | Verifique os campos obrigatórios |
| 409 | Email já existe | Use outro email |
| 500 | Server Error | Verifique os logs do worker |

---

## Campos Obrigatórios por Rota

### POST /admin/create-user
- `email` (string)
- `password` (string)
- `displayName` (string)
- `cargo` (string: Operador, Atendente, Supervisor, Administrador)

### PATCH /admin/edit-user
- `uid` (string)
- `emailAtual` (string)
- `nome` (string, opcional)
- `emailNovo` (string, opcional)
- `cargo` (string, opcional)
- `novaSenha` (string, opcional)
- `senhaAtual` (string, opcional, se enviar nova senha)

### PATCH /admin/update-cargo
- `uid` (string)
- `cargo` (string)

### DELETE /admin/delete-user
- `uid` (string)
- `email` (string)
- `senhaAtual` (string, opcional)

### GET /admin/cargos
- Sem parâmetros (apenas requer token válido)

---

## Notas de Segurança

- ✅ Token de admin é armazenado como **secret** no Cloudflare
- ✅ Credencial Firebase convertida para Base64 e armazenada como **secret**
- ✅ Nenhuma credencial em git-committed files
- ✅ Diferentes instâncias Firebase para operações de usuário (evita logout do admin)
- ✅ Validação de autorização em todas as rotas

---

## Fluxo de Autorização

```
Request com token
    ↓
isAdminAuthorized() verifica:
  ├─ X-Admin-Token header OU
  └─ Bearer token no Authorization header
    ↓
Compara com env.ADMIN_TOKEN
    ↓
✅ Token válido → Execute ação
❌ Token inválido → Retorna 401
```

---

## Próximos Passos

1. **Testar cada rota** com os exemplos acima
2. **Verificar Firestore** collection "usuarios" para dados persistidos
3. **Integrar frontend** para chamar essas rotas
4. **Monitorar logs** no Cloudflare Dashboard
