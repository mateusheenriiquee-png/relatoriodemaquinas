# 🚀 Guia Rápido de Início

## Pré-requisitos
- Firebase Project (suportetecnico-api) já criado
- Acesso ao Firebase Console

## ⚡ 5 Passos para Ativar Autenticação

### 1️⃣ Ativar Firebase Authentication

1. Abra [Firebase Console](https://console.firebase.google.com/)
2. Selecione projeto `suportetecnico-api`
3. Vá para **Authentication** (no menu esquerdo)
4. Clique na aba **Sign-in method**
5. Clique em **Email/Password**
6. Ative "Email/Password" (toggle)
7. Clique **Save**

### 2️⃣ Atualizar Firestore Security Rules

1. No Firebase Console, vá para **Firestore Database**
2. Clique em **Rules**
3. Copie todo o conteúdo de `firestore.rules` deste projeto
4. Cole no editor do Firebase Console
5. Clique **Publish**

### 3️⃣ Criar Primeiro Usuário Admin

**Opção A: Via Firebase Console (Manual)**

1. Em Authentication → Users, clique **Add User**
2. Email: `seu.email@example.com`
3. Senha: `senhaforte123`
4. Clique **Add User**
5. Copie o **UID** gerado

6. Vá para **Firestore Database**
7. Clique em **Start Collection**
8. Nome: `usuarios`
9. Clique **Auto ID** ou Cole o **UID** do usuário
10. Adicione os dados:

```json
{
  "uid": "{copie o UID aqui}",
  "email": "seu.email@example.com",
  "displayName": "Seu Nome",
  "cargo": "admin",
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-01T00:00:00Z"
}
```

**Opção B: Via Browser Console**

1. Abra `/public/init-admin.js` em um navegador
2. Abra Developer Tools (F12)
3. Vá para Console
4. Cole:
```javascript
import { createAdminUser } from './js/init-admin.js';
createAdminUser('seu.email@example.com', 'senhaforte123', 'Seu Nome');
```

### 4️⃣ Testar Login

1. Abra `http://localhost:3000/login.html`
2. Email: `seu.email@example.com`
3. Senha: `senhaforte123`
4. Clique **Entrar**
5. ✅ Deveria levar ao painel principal

### 5️⃣ Verificar Painel Admin

1. Após login, clique no botão **⚙️ Admin**
2. Você deve ver a aba **Usuários**
3. Seu usuário deve estar listado com cargo **ADMIN**

## 📝 Criar Novos Usuários

### Via Painel Admin

1. Acesse `/admin.html` (use conta admin)
2. Vá para aba **Novo Usuário**
3. Preencha:
   - **Email**: novo.usuario@example.com
   - **Senha**: senhasegura123
   - **Nome Completo**: João da Silva
   - **Cargo**: Operador (ou Admin)
4. Clique **Criar Usuário**

### Verificar Preenchimento Automático

1. Faça login com novo usuário
2. Clique em **+ Novo Suporte**
3. Campo "Responsável pela Abertura" deve estar preenchido
4. ✅ Campo não deve ser editável

## 🔐 Verificação de Segurança

- [ ] Firestore Rules estão publicadas?
- [ ] Firebase Auth tem Email/Password ativado?
- [ ] Coleção `usuarios` foi criada?
- [ ] Primeiro admin foi criado?
- [ ] Login está funcionando?
- [ ] Campo "Responsável" está sendo preenchido?

## 🆘 Problemas Comuns

### "Erro: Usuário não autorizado"
→ Verifique Firestore Rules. Elas estão publicadas?

### "Erro: Autenticação falhou"
→ Firebase Auth está ativado? Email/Password provider está ON?

### "Campo 'Responsável' vazio"
→ Verifique se `displayName` do usuário está preenchido

### "Admin não vê botão ⚙️"
→ Verifique se `cargo: "admin"` está no Firestore

### "Não consigo criar usuários"
→ Você é admin? Verifique seu cargo em Firestore

## 📱 URLs Principais

| Página | URL |
|--------|-----|
| Login | `/login.html` |
| Painel | `/index.html` |
| Dashboard | `/dashboard.html` |
| Admin | `/admin.html` |

## 📚 Documentação Completa

Para detalhes técnicos, veja:
- `AUTH_GUIDE.md` - Guia completo
- `IMPLEMENTATION_SUMMARY.md` - Resumo técnico

## ✅ Checklist Final

- [ ] Projeto Firebase criado
- [ ] Email/Password ativado em Auth
- [ ] Firestore Rules publicadas
- [ ] Primeira collection `usuarios` criada
- [ ] Primeiro usuário admin criado
- [ ] Login está funcionando
- [ ] Dashboard está acessível
- [ ] Admin consegue ver botão ⚙️
- [ ] Admin consegue criar usuários
- [ ] Campo "Responsável" está sendo preenchido

---

**Pronto!** 🎉 Seu sistema de autenticação está ativo!

Dúvidas? Consulte a documentação em `AUTH_GUIDE.md`
