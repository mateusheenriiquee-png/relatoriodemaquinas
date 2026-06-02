# Guia de Autenticação e Administração

## 🔐 Sistema de Autenticação

O sistema agora possui autenticação por email e senha usando Firebase Authentication. Todos os usuários precisam fazer login para acessar o painel.

### Características Principais

1. **Login Obrigatório** - Todos os acessos redirecionam para `/login.html` se não autenticado
2. **Gerenciamento de Cargos** - Usuários podem ser "operador" ou "admin"
3. **Painel de Administrador** - Admins podem gerenciar usuários e cargos
4. **Preenchimento Automático** - Campo "Responsável pela Abertura" é preenchido automaticamente com o nome do usuário

## 🚀 Como Começar

### 1. Criar Primeiro Usuário Administrador

Você precisa criar manualmente o primeiro usuário admin no Firebase Console:

1. Vá para [Firebase Console](https://console.firebase.google.com/)
2. Selecione seu projeto `suportetecnico-api`
3. No menu, vá para **Authentication** → **Users**
4. Clique em **Add User** (ícone +)
5. Crie um usuário com:
   - **Email**: seu.email@example.com
   - **Password**: senha segura

6. Após criar, vá para **Firestore Database**
7. Crie uma coleção chamada `usuarios`
8. Adicione um documento com ID = `{uid do usuário criado}` e dados:
   ```json
   {
     "uid": "{uid do usuário}",
     "email": "seu.email@example.com",
     "displayName": "Seu Nome",
     "cargo": "admin",
     "createdAt": "2024-01-01T00:00:00Z",
     "updatedAt": "2024-01-01T00:00:00Z"
   }
   ```

### 2. Acessar o Painel de Administrador

- Faça login com a conta admin criada
- No painel principal, você verá o botão **⚙️ Admin**
- Acesse `/admin.html` para gerenciar usuários

### 3. Criar Novos Usuários

No painel admin, vá para a aba **Novo Usuário** e preencha:
- **Email**: email do novo usuário
- **Senha**: senha segura
- **Nome Completo**: nome que aparecerá como "Responsável pela Abertura"
- **Cargo**: "Operador" ou "Administrador"

## 📋 Estrutura de Dados

### Coleção `usuarios`

Cada usuário criado gera um documento nesta coleção:

```
usuarios/
  ├── {uid1}/
  │   ├── uid: string (ID único)
  │   ├── email: string
  │   ├── displayName: string (nome do usuário)
  │   ├── cargo: string ("admin" | "operador")
  │   ├── createdAt: timestamp
  │   └── updatedAt: timestamp
  │
  └── {uid2}/
      └── ... (mesmo padrão)
```

### Campo "Responsável pela Abertura"

- **Preenchimento Automático**: Usa `displayName` do usuário autenticado
- **Campo Desabilitado**: Não pode ser editado durante nova abertura ou edição
- **Rastreabilidade**: Mantém a informação de quem criou o suporte

## 🔒 Segurança

### Firestore Security Rules

As regras de segurança estão em `firestore.rules`:

```
- ✅ Usuários autenticados podem ler usuários
- ✅ Admins podem criar, atualizar e deletar usuários
- ✅ Usuários podem atualizar seus próprios dados
- ✅ Todos podem criar suportes técnicos
- ✅ Admins podem deletar suportes
- ✅ Admins podem acessar configurações
```

### Padrão de Segurança

1. Verificação de autenticação em todas as páginas
2. Verificação de permissões para ações admin
3. Regras de Firestore como camada adicional

## 🎯 Fluxos de Uso

### Fluxo de Operador Normal

```
Login → Painel Principal → Criar Suporte → Logout
```

### Fluxo de Administrador

```
Login → Painel Admin (ou Principal)
  ├── Gerenciar Usuários
  │   ├── Criar novo usuário
  │   ├── Alterar cargos
  │   └── Deletar usuários
  │
  └── Configurações
      └── Definir email de admin
```

## 🐛 Solução de Problemas

### "Erro ao sincronizar com o Firebase"
- Verifique se a coleção `usuarios` foi criada
- Confirme que o Firestore está habilitado no projeto Firebase

### "Você não tem permissão para acessar esta página"
- O usuário não é admin
- Entre em contato com um administrador para alterar seu cargo

### Campo "Responsável pela Abertura" vazio
- Certifique-se de que o usuário tem um `displayName` definido
- Se não estiver, o email será usado como fallback

## 📱 Páginas Principais

| Página | URL | Acesso | Descrição |
|--------|-----|--------|-----------|
| Login | `/login.html` | Público | Autenticação de usuários |
| Painel Principal | `/index.html` | Autenticado | Lista de suportes e criar novo |
| Dashboard | `/dashboard.html` | Autenticado | Análise de dados |
| Painel Admin | `/admin.html` | Admin | Gerenciar usuários |

## 🔑 Variáveis de Ambiente

As seguintes configurações estão no Firebase:

- **projectId**: suportetecnico-api
- **authDomain**: suportetecnico-api.firebaseapp.com
- **apiKey**: Configurado em `firebase.js`

## 📞 Suporte

Para questões sobre:
- **Autenticação**: Verifique Firebase Console → Authentication
- **Dados**: Verifique Firestore → Database
- **Código**: Verifique `js/auth.js` e `js/pages/`

---

**Versão**: 1.0.0  
**Última atualização**: Janeiro 2024
