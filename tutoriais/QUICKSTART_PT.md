# 🚀 Guia Rápido de Inicialização - Suporte Técnico API

## 1. Pré-requisitos Instalados ✅

- Node.js >= 18
- npm ou yarn
- Git

## 2. Instalação de Dependências

```bash
npm install
```

## 3. Configuração Inicial

### 3.1 Variáveis de Ambiente

O arquivo `.env` já foi criado com as configurações básicas. Verifique se está na raiz do projeto:

```bash
cat .env
```

### 3.2 Credenciais Firebase

As credenciais Firebase estão configuradas em:
- **Frontend**: `public/config/firebase.js` - Usa API pública
- **Backend**: `wrangler.toml` - Usa chaves de serviço

## 4. Executar a Aplicação

### Opção A: Desenvolvimento Local (Node.js)

```bash
npm run dev
# ou
npm start
```

A aplicação estará disponível em: `http://localhost:3000`

### Opção B: Cloudflare Pages (recomendado para produção)

```bash
npm run pages:dev
```

## 5. Criar Primeiro Usuário Admin ⚙️

### Via Browser Console:

1. Abra `http://localhost:3000` (ou a URL da sua aplicação)
2. Abra o console do navegador (F12 → Console)
3. Copie e execute o código abaixo:

```javascript
import { createAdminUser } from './js/init-admin.js';
createAdminUser('admin@suportetecnico.com.br', 'senha123456', 'Administrador');
```

### Resultado esperado:
```
✅ Usuário admin criado com sucesso!
   Email: admin@suportetecnico.com.br
   UID: [uid-gerado]
   Nome: Administrador
```

## 6. Login

1. Acesse `http://localhost:3000/login.html`
2. Use as credenciais criadas acima:
   - Email: `admin@suportetecnico.com.br`
   - Senha: `senha123456`

## 7. Dados de Teste

Para popular com dados de teste:

1. No console do navegador, execute:

```javascript
// Será adicionado em breve - use a interface para adicionar manualmente por enquanto
```

## 8. Acessar Dashboard

Após login como admin:
1. Clique em "Dashboard" no menu superior
2. O dashboard exibirá estatísticas dos suportes

## 📋 Estrutura de Dados

### Coleção: `suportes_tecnicos`
```
{
  protocolo: string          // ID único
  cpfCnpj: string           // CPF ou CNPJ do cliente
  responsavelAbertura: string // Quem abriu o chamado
  dataAbertura: date        // Data de abertura
  tipo: string              // Tipo de atendimento
  ac: string                // Filial/Local
  contato: string           // Email ou telefone
  descricao: string         // Descrição do problema
  tecnico: string           // Técnico responsável
  status: string            // EM ABERTO | EM ANDAMENTO | FINALIZADO | REAGENDADO | SEM RETORNO
  statusAbertura: string    // DEVIDO | INDEVIDO
  createdAt: timestamp      // Criado em
  updatedAt: timestamp      // Atualizado em
}
```

### Coleção: `usuarios`
```
{
  uid: string               // ID do Firebase Auth
  email: string             // Email único
  displayName: string       // Nome completo
  cargo: string             // admin | supervisor | atendente | operador
  createdAt: timestamp      // Data de criação
  updatedAt: timestamp      // Última atualização
}
```

## 🔧 Troubleshooting

### Dashboard mostra "0 resultados"
- ✅ Verifique se há dados na coleção `suportes_tecnicos`
- ✅ Certifique-se de estar logado como admin
- ✅ Verifique a conexão com o Firebase em browser DevTools

### Erro "Firestore não está configurado"
- ✅ Verifique se `public/config/firebase.js` existe
- ✅ Verifique a chave API no Firebase Console

### Erro de autenticação no backend
- ✅ Certifique-se que `FIREBASE_SERVICE_ACCOUNT` está em `wrangler.toml`
- ✅ Verifique permissões no Firestore Rules

## 📱 URLs Principais

- **Página Principal**: `http://localhost:3000/index.html`
- **Login**: `http://localhost:3000/login.html`
- **Admin**: `http://localhost:3000/admin.html`
- **Dashboard**: `http://localhost:3000/dashboard.html`
- **API Health**: `http://localhost:3000/health`

## 🚨 Problemas Comuns Resolvidos

✅ **Arquivo firebase.js não existia** → Criado em `public/config/firebase.js`
✅ **Arquivo app-config.js não existia** → Criado em `public/config/app-config.js`
✅ **sheets-sync.js estava comentado** → Descomentado
✅ **Race condition na inicialização** → Corrigida com async/await
✅ **Falta de .env** → Arquivo criado
✅ **Dashboard vazio** → Agora funciona ao adicionar dados

## 📚 Documentação

- **Firebase**: https://firebase.google.com/docs
- **Cloudflare Workers**: https://developers.cloudflare.com/workers/
- **Firestore**: https://firebase.google.com/docs/firestore

## 💡 Próximos Passos

1. Configurar Google Sheets sync (adicionar SHEETS_SPREADSHEET_ID em `.env`)
2. Configurar webhooks externos se necessário
3. Adicionar certificado SSL em produção
4. Configurar backups automáticos do Firestore

---

**Última atualização**: 02/06/2026
