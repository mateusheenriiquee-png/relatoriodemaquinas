# 🔄 Arquitetura de Autenticação - Diagrama

## 📊 Fluxo de Operações de Usuário

```
┌─────────────────────────────────────────────────────────────────┐
│                     Cloudflare Worker                           │
│                                                                 │
│  ┌────────────────┐        ┌──────────────────────────────┐    │
│  │  Admin Panel   │        │   Variáveis de Ambiente      │    │
│  │   (Frontend)   │        │  FIREBASE_SERVICE_ACCOUNT_   │    │
│  │                │        │  BASE64 (criptografado)      │    │
│  └────────┬───────┘        └──────────────────────────────┘    │
│           │                                                     │
│           ▼                                                     │
│  ┌────────────────────────────────────────────────────────┐    │
│  │              Routes Handler (index.mjs)               │    │
│  │                                                        │    │
│  │  POST /admin/create-user                             │    │
│  │  PATCH /admin/edit-user                              │    │
│  │  DELETE /admin/delete-user                           │    │
│  └────────┬───────┬──────────────┬──────────────────┬────┘    │
│           │       │              │                  │          │
│           ▼       ▼              ▼                  ▼          │
│  ┌──────────────────────────────────────────────────────┐     │
│  │    Firebase Admin SDK - Instâncias                   │     │
│  │                                                      │     │
│  │  ┌────────────────┐    ┌──────────────────────┐    │     │
│  │  │ auth-admin.mjs │    │ auth-secondary.mjs   │    │     │
│  │  │                │    │                      │    │     │
│  │  │ Primária:      │    │ Secundária:          │    │     │
│  │  │ - Webhooks     │    │ - Criar usuário      │    │     │
│  │  │ - Sheets sync  │    │ - Editar usuário     │    │     │
│  │  │ (Admin logado) │    │ - Deletar usuário    │    │     │
│  │  │                │    │ (Sem afetar admin)   │    │     │
│  │  └────────────────┘    └──────────────────────┘    │     │
│  │                                                      │     │
│  └────────┬─────────────────────────────┬──────────────┘     │
│           │                             │                    │
└───────────┼─────────────────────────────┼──────────────────────┘
            │                             │
            ▼                             ▼
     ┌────────────────┐          ┌─────────────────┐
     │ Firebase Auth  │          │ Firestore DB    │
     │                │          │                 │
     │ - Criar user   │          │ - usuarios/     │
     │ - Editar email │          │   {uid}/        │
     │ - Deletar user │          │   - email       │
     │                │          │   - cargo       │
     └────────────────┘          │   - createdAt   │
                                 └─────────────────┘
```

---

## 🔐 Comparação: Admin Primária vs Secundária

```
┌─────────────────────────────────────────────────────────────────┐
│                  ADMIN PRIMÁRIA (auth-admin.mjs)                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Responsabilidades:                                            │
│  ✓ Inicializar Firebase Admin SDK                             │
│  ✓ Processar webhooks (suportes_tecnicos)                     │
│  ✓ Sincronizar com Sheets                                     │
│  ✓ Operações de leitura/escrita no Firestore                 │
│                                                                 │
│  Usuário: firebase-admin-sdk (service account padrão)          │
│  Status: Mantém conexão ativa com Firestore                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────┐
│               ADMIN SECUNDÁRIA (auth-secondary.mjs)             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Responsabilidades:                                            │
│  ✓ Criar novo usuário em Firebase Auth                        │
│  ✓ Editar dados do usuário (email, senha, nome)              │
│  ✓ Deletar usuário                                            │
│  ✓ Gerenciar coleção "usuarios" no Firestore                 │
│                                                                 │
│  Usuário: Mesma service account (isolada em app separado)     │
│  Status: Operações isoladas, sem afetar conexão primária      │
│                                                                 │
│  ✨ BENEFÍCIO: Admin não é deslogado quando cria/edita users  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🎯 Fluxo Detalha: Criar Usuário

```
1. Frontend envia requisição
   │
   ├─ POST /admin/create-user
   ├─ Body: { email, password, displayName, cargo }
   │
   ▼
2. index.mjs recebe e valida
   │
   ├─ Verifica token (X-Admin-Token)
   ├─ Valida campos obrigatórios
   ├─ Normaliza cargo (gerenciar-usuario.mjs)
   │
   ▼
3. Chama criarUsuarioFirebase
   │
   ├─ getSecondaryAuth(env) - obtém instância secundária
   ├─ admin.auth().createUser({...})
   │
   ▼
4. Firebase Auth - Usuário criado
   │
   ├─ UID gerado automaticamente
   ├─ Email e senha registrados
   ├─ displayName definido
   │
   ▼
5. Firestore - Documento criado
   │
   ├─ Coleção: "usuarios"
   ├─ Doc ID: {uid}
   ├─ Dados: { email, cargo, createdAt, ... }
   │
   ▼
6. Response ao Frontend
   │
   ├─ Status: 201
   └─ Body: { ok: true, uid, email, cargo, message }
```

---

## 🔌 Exemplo: Criar + Editar + Deletar

```javascript
// Cenário: Admin cria novo usuário, depois edita o cargo, depois deleta

// 1️⃣ CRIAR
POST /admin/create-user
{
  "email": "joao@empresa.com",
  "password": "SenhaSegura123",
  "displayName": "João Silva",
  "cargo": "Operador"
}
// Response: { ok: true, uid: "abc123xyz", ... }

// 2️⃣ EDITAR CARGO
PATCH /admin/update-cargo
{
  "uid": "abc123xyz",
  "cargo": "Supervisor"
}
// Response: { ok: true }

// 3️⃣ DELETAR
DELETE /admin/delete-user
{
  "uid": "abc123xyz",
  "email": "joao@empresa.com"
}
// Response: { ok: true, avisos: ["Usuário removido..."] }

⏱️ Tempo total: ~2-3 segundos (sem afetar sessão do admin)
```

---

## 🔄 Base64 - Fluxo de Decodificação

```
┌──────────────────────────────────────────────────────────────────┐
│          Variável de Ambiente: FIREBASE_SERVICE_ACCOUNT_BASE64    │
│                                                                  │
│  eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9eyJzdWIiOiIxMjM0NTY3ODkwIi wibmFtZSI...
│  (string muito longa sem quebras de linha)                       │
└────────────────────┬─────────────────────────────────────────────┘
                     │
                     ▼
         auth-admin.mjs: parseServiceAccount()
         │
         ├─ Limpar caracteres de controle
         │  ┌─────────────────────────────────┐
         │  │ .replace(/[\s\n\r\t]/g, "")     │
         │  │ .replace(/[^\w+/=]/g, "")       │
         │  └─────────────────────────────────┘
         │
         ├─ Usar atob() para decodificar
         │  ┌─────────────────────────────────┐
         │  │ const json = atob(cleanBase64)  │
         │  │ // Resultado:                   │
         │  │ // {"type":"service_account",   │
         │  │ //  "project_id":"...",         │
         │  │ //  "private_key":"-----BEGIN.." }
         │  └─────────────────────────────────┘
         │
         ├─ Parse JSON
         │  ┌─────────────────────────────────┐
         │  │ JSON.parse(json)                │
         │  │ // Agora é objeto JavaScript    │
         │  └─────────────────────────────────┘
         │
         ├─ Normalizar private_key
         │  ┌─────────────────────────────────┐
         │  │ .replace(/\\n/g, "\n")          │
         │  │ // Converter \n literal para    │
         │  │ // quebra de linha real         │
         │  └─────────────────────────────────┘
         │
         ├─ Validar campos
         │  ┌─────────────────────────────────┐
         │  │ ✓ project_id                    │
         │  │ ✓ private_key                   │
         │  │ ✓ client_email                  │
         │  └─────────────────────────────────┘
         │
         ▼
    Firebase Admin SDK Inicializado ✅
```

---

## 📊 Estrutura de Dados - Firestore

```
firestore/
│
└── usuarios/  (coleção)
    │
    ├── abc123xyz/  (document - uid do user)
    │   ├── uid: "abc123xyz"
    │   ├── email: "joao@empresa.com"
    │   ├── displayName: "João Silva"
    │   ├── cargo: "Supervisor"
    │   ├── status: "ativo"
    │   ├── criadoEm: "2026-06-02T10:30:00Z"
    │   └── atualizadoEm: "2026-06-02T14:45:00Z"
    │
    ├── def456uvw/  (outro user)
    │   ├── uid: "def456uvw"
    │   ├── email: "maria@empresa.com"
    │   ├── displayName: "Maria Santos"
    │   ├── cargo: "Operador"
    │   ├── status: "ativo"
    │   ├── criadoEm: "2026-06-01T09:00:00Z"
    │   └── atualizadoEm: "2026-06-01T09:00:00Z"
    │
    └── ghi789xyz/  (user deletado)
        ├── (documento removido de Firestore)
        ├── (mas UID pode estar em Auth se não foi deletado lá)
```

---

## 🧪 Teste: Verificar Logs

Depois de fazer requisições ao Worker:

```bash
# Ver logs em tempo real
wrangler tail

# Logs esperados para criar usuário com Base64:
# [Firebase] Inicializando Admin SDK...
# [Firebase] Using Base64: true
# [Firebase] ✓ Base64 decodificado com sucesso
# [Firebase] ✓ Service account parseado com sucesso
# [Firebase] Project ID: suportetecnico-api-9386b
# [Firebase] ✓ Admin SDK inicializado com sucesso
# [UserCreation] Criando novo usuário: joao@empresa.com
# [UserCreation] Cargo: Supervisor
# [UserCreation] ✓ Auth user criado. UID: abc123xyz
# [UserCreation] ✓ Documento Firestore criado para abc123xyz
```

---

## ✅ Checklist: Tudo Funcionando?

- [ ] Base64 sendo decodificado com sucesso
- [ ] Usuário criado em Firebase Auth
- [ ] Documento criado em Firestore/usuarios
- [ ] Admin não é deslogado após criar usuário
- [ ] Editar cargo funciona
- [ ] Deletar usuário remove de Auth + Firestore
- [ ] Cargos são normalizados (compatibilidade com dados antigos)
- [ ] Erros retornam mensagens claras

