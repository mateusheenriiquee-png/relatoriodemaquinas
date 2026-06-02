# 📖 Referência Rápida - Autenticação

## 🔗 URLs Principais

| Página | URL | Acesso |
|--------|-----|--------|
| Login | `/login.html` | Público |
| Painel Principal | `/index.html` | Autenticado |
| Dashboard | `/dashboard.html` | Autenticado |
| Admin | `/admin.html` | Admin Only |

---

## 🔐 Credenciais de Teste (Exemplo)

```
Email: admin@example.com
Senha: senha123
Cargo: admin
```

> ⚠️ Altere para credenciais reais após setup

---

## 📚 Arquivos por Função

### Autenticação
- `public/js/auth.js` - Gerenciador de autenticação (core)
- `firestore.rules` - Regras de segurança

### Páginas
- `public/login.html` - Tela de login
- `public/admin.html` - Painel admin
- `public/index.html` - Painel principal (modificado)
- `public/dashboard.html` - Dashboard (modificado)

### Documentação
- `QUICKSTART.md` - Comece aqui!
- `AUTH_GUIDE.md` - Guia detalhado
- `IMPLEMENTATION_SUMMARY.md` - Resumo técnico
- `README_AUTENTICACAO.md` - Visão geral

---

## 💻 Classe AuthManager

### Métodos Principais

```javascript
// Inicializar
await authManager.initialize()

// Login/Logout
await authManager.login(email, password)
await authManager.logout()

// Verificação
authManager.isAuthenticated()     // true/false
authManager.isAdmin()             // true/false
authManager.getCurrentUser()      // Objeto Firebase
authManager.getCurrentUserData()  // Dados do Firestore
authManager.getUserDisplayName()  // String

// Usuários (admin)
await authManager.createUser(email, password, displayName, cargo)
await authManager.getUsers()
await authManager.updateUserCargo(userId, cargo)
await authManager.updateUserData(userId, data)
await authManager.deleteUser(userId)
```

---

## 🔄 Fluxos de Autenticação

### Novo Usuário
```
1. Admin acessa /admin.html
2. Vai para "Novo Usuário"
3. Preenche: email, senha, nome, cargo
4. Clica "Criar Usuário"
5. Usuário é criado em Firebase Auth
6. Documento criado em Firestore /usuarios/{uid}
```

### Login
```
1. Usuário acessa /login.html
2. Preenche email e senha
3. Firebase Auth autentica
4. Dados carregados do Firestore
5. Redireciona para /index.html
```

### Logout
```
1. Usuário clica "Logout"
2. Sessão é limpa
3. Redireciona para /login.html
```

---

## 🗄️ Firestore - Estrutura

### Collection: `usuarios`
```
usuarios/
├── {uid1}/
│   ├── uid: string
│   ├── email: string
│   ├── displayName: string
│   ├── cargo: "admin" | "operador"
│   ├── createdAt: timestamp
│   └── updatedAt: timestamp
│
└── {uid2}/
    └── ... (mesmo padrão)
```

### Collection: `config` (Opcional)
```
config/
└── admin_email/
    └── adminEmail: string
```

---

## 🎯 Casos de Uso

### Caso 1: Criar Novo Operador

```javascript
// No painel admin:
1. Clique em "Novo Usuário"
2. Email: operador@empresa.com
3. Senha: senha123
4. Nome: João Silva
5. Cargo: Operador
6. Clique "Criar Usuário"

// João pode fazer login e criar suportes
// Campo "Responsável pela Abertura" será "João Silva"
```

### Caso 2: Promover Operador a Admin

```javascript
// No painel admin:
1. Vá para "Usuários"
2. Localize "João Silva"
3. Clique "Alterar Cargo"
4. Selecione "Admin"
5. João agora tem acesso a /admin.html
```

### Caso 3: Deletar Usuário

```javascript
// No painel admin:
1. Vá para "Usuários"
2. Localize o usuário
3. Clique "Excluir"
4. Confirme
5. Usuário é deletado do Firebase
```

---

## 🧪 Testes Manuais

### ✓ Teste 1: Login Básico
```
1. Abra /login.html
2. Insira email e senha corretos
3. Deve levar a /index.html
4. Campo "Responsável pela Abertura" preenchido
```

### ✓ Teste 2: Senha Incorreta
```
1. Abra /login.html
2. Insira email correto, senha errada
3. Deve mostrar erro "Email ou senha incorretos"
```

### ✓ Teste 3: Proteção de Páginas
```
1. Abra /index.html sem fazer login
2. Deve redirecionar para /login.html
```

### ✓ Teste 4: Logout
```
1. Após login, clique "Logout"
2. Deve redirecionar para /login.html
3. Tente acessar /index.html
4. Deve pedir login novamente
```

### ✓ Teste 5: Admin Access
```
1. Faça login como admin
2. Deve ver botão "⚙️ Admin" no painel
3. Clique no botão
4. Deve acessar /admin.html
```

### ✓ Teste 6: Operador Denied
```
1. Faça login como operador
2. Não deve ver botão "⚙️ Admin"
3. Tente acessar /admin.html manualmente
4. Deve ser redirecionado ou bloqueado
```

---

## 🐛 Erros Comuns e Soluções

| Erro | Causa | Solução |
|------|-------|---------|
| "Erro ao sincronizar" | Firestore Rules incorretas | Publique firestore.rules |
| "Email já cadastrado" | Usuário já existe | Use outro email |
| "Senha muito fraca" | < 6 caracteres | Use senha com 6+ chars |
| "Não autorizado" | Não é admin | Verifique cargo em Firestore |
| "Campo vazio" | displayName não preenchido | Atualize perfil no Firebase Auth |

---

## 🔒 Segurança - Checklist

- [ ] Email/Password ativado em Firebase Auth
- [ ] Firestore Rules estão publicadas
- [ ] Collection `usuarios` foi criada
- [ ] Primeiro admin foi criado
- [ ] Senha do admin é forte
- [ ] Regra de timeout de sessão implementada
- [ ] HTTPS ativado em produção

---

## 🚀 Deploy em Produção

### Passos Finais

1. **Testar completamente**
   - Login/Logout
   - Criar usuários
   - Mudar cargos
   - Preenchimento automático

2. **Garantir Segurança**
   - Firestore Rules corretas
   - HTTPS ativado
   - Credenciais seguras

3. **Documentar**
   - Criação de novos admins
   - Procedimento de reset de senha
   - Contatos de suporte

4. **Monitorar**
   - Logs de autenticação
   - Alertas de falhas
   - Auditoria de ações

---

## 📊 Status do Sistema

```
Authentication:    ✅ Ativo
Authorization:     ✅ Ativo
Database:          ✅ Ativo
Security Rules:    ✅ Publicadas
Admin Panel:       ✅ Funcional
Auto-fill:         ✅ Funcional
```

---

## 🔗 Links Úteis

- [Firebase Console](https://console.firebase.google.com)
- [Firebase Auth Docs](https://firebase.google.com/docs/auth)
- [Firestore Docs](https://firebase.google.com/docs/firestore)
- [Security Rules Guide](https://firebase.google.com/docs/firestore/security/start)

---

## 📞 FAQ

**P: Como redefinir senha de um usuário?**  
R: Atualmente, o usuário deve usar "Esqueci a senha" no login. Para forçar reset, delete e recrie o usuário.

**P: Como backup de dados?**  
R: Firestore tem backup automático. Para exports, use Firebase Console.

**P: Quantos usuários suporta?**  
R: Limitado apenas por quota do Firebase (geralmente ilimitado).

**P: Posso integrar com SSO?**  
R: Sim, Firebase suporta Google, GitHub, etc. Consulte documentação.

---

**Última Atualização**: Janeiro 2024  
**Versão**: 1.0.0  
**Mantido por**: Sistema de Suporte Técnico
