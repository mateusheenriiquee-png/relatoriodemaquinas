# Suporte Técnico — versão React

Migração do front-end de `src/frontend/public` (HTML/JS) para **React + Vite**, mantendo o
mesmo design (`main.css` original) e a mesma conexão com o Firebase (`suportetecnico-api2`).

Esta pasta é um projeto npm independente: tem o próprio `package.json` e o próprio
`node_modules`. O `package.json` da raiz (API/webhook) continua intacto.

## Como rodar

A partir da raiz do repositório:

```bash
npm run web:install   # instala as dependências desta pasta
npm run web:dev       # http://localhost:5173
npm run web:build     # gera src/frontend/web/dist/
```

Ou, de dentro de `src/frontend/web`, os comandos normais: `npm install`, `npm run dev`,
`npm run build`.

A API continua em `npm run dev` na raiz (porta 3000). Em desenvolvimento, o front chama
`http://localhost:3000` automaticamente; em produção, a mesma origem.

## Credenciais

As credenciais do Firebase ficam no `.env` desta pasta, já preenchido com a **mesma config
que `src/frontend/public/js/config/firebase.js` usa hoje** (app `750082685329`, o do painel).

> Atenção: `src/frontend/public/config/firebase.js` aponta para outro app do mesmo projeto
> (`192795919231`), usado pelo `init.html` e pelo `cadastro/`. A versão React seguiu a do
> painel, que é a que atende login e Firestore atualmente.

O `.env` é ignorado pelo git, então no Cloudflare Pages é preciso cadastrar as seis
variáveis `VITE_FIREBASE_*` nas configurações do projeto — sem elas o build sai com a
config vazia e o login quebra em produção.

## O que já está migrado

| Tela | Rota | Status |
|------|------|--------|
| Login (Firebase Auth, email/senha) | `/login` | pronto |
| Lista de suportes (cards, filtros, drawer, modais) | `/` | pronto |
| Dashboard (Chart.js, KPIs, rankings) | `/dashboard` | pronto |
| Painel Admin | `/admin` | placeholder |

## Estrutura

```
src/
  config/firebase.js         Inicialização do Firebase via variáveis de ambiente
  contexts/AuthContext.jsx   Sessão, cargo (Operador/Administrador), login/logout
  hooks/useSuportes.js       Listeners em tempo real, filtros e contagens
  services/suportesService.js  Todas as leituras/escritas no Firestore
  components/                Header, cards, drawer, toasts, modais
  pages/                     LoginPage, SuportesPage, placeholders
  styles/main.css            CSS original, sem alterações de design
```

## Decisões da migração

- **Autenticação**: `signInWithEmailAndPassword` com `browserSessionPersistence`, igual ao
  `auth.js` original. O cargo continua vindo da coleção `usuarios/{uid}`, com o mesmo
  mapa de valores legados (`admin` → `Administrador`, etc.).
- **Rotas protegidas**: `<ProtectedRoute>` substitui o `protegerPagina()`; `/admin` exige
  cargo Administrador.
- **Tempo real**: dois listeners `onSnapshot` — um para a lista filtrada e outro dedicado
  aos suportes `EM ABERTO` (que, como no original, ignoram os demais filtros).
- **Paginação**: a lista usa listener em tempo real com limite de 500 documentos, no lugar
  do scroll infinito com cursores. Se o volume crescer, dá para voltar aos cursores.
- **Contagens**: `getCountFromServer` por status, com debounce, como no `app.js`.
- **Associar técnico**: tenta `POST /admin/supports/:id/associate` e, se a API falhar,
  faz o fallback gravando direto no Firestore — mesmo comportamento de antes.
- **Reagendados vencidos**: verificação a cada 5 minutos, devolvendo o suporte para
  `EM ABERTO`.

### Dashboard

- Listener em tempo real com o filtro de período aplicado na query (7/30/90 dias ou tudo),
  igual ao `dashboard.js` original.
- Operador vê apenas os próprios atendimentos e não enxerga o filtro de técnico; o título
  vira "minhas métricas • <nome>".
- As cores personalizáveis dos gráficos continuam no `localStorage`, sob a mesma chave
  `suporte-dashboard-chart-colors`. As cores por status seguem fixas.
- `ChartCanvas` encapsula o Chart.js e destrói a instância ao desmontar (era o
  `destroyChart()` do original).

## Deploy (Cloudflare Pages)

Hoje o Pages publica `src/frontend/public` como conteúdo estático. Para publicar a versão
React, mude nas configurações do projeto no Cloudflare:

- **Build command**: `cd src/frontend/web && npm install && npm run build`
- **Build output directory**: `src/frontend/web/dist`
- **Environment variables**: as seis `VITE_FIREBASE_*`

O arquivo `public/_redirects` já vai junto no build e é o que faz `/dashboard` responder
ao dar F5 — sem ele o Pages devolve 404 em qualquer rota que não seja `/`.

Enquanto a validação não terminar, **nada do front antigo foi apagado**: `src/frontend/public`
continua no lugar e é o que está publicado. A troca é só mudar essas duas configurações.

## Ainda não migrado

- Painel Admin (`/admin`) — listagem de usuários, criação via API e email do admin.
  Hoje é um placeholder; use `src/frontend/public/admin.html` até a migração.
- Importação/exportação CSV/XLSX (`js/services/import-export.js`).
- Som de notificação de novos suportes — o arquivo já está em
  `public/sounds/msn-wizz-sound.mp3`, falta ligar o disparo.
- App de cadastro (`src/frontend/cadastro/`: `login.html` + `novo-suporte.html`) — não
  entrou no escopo; continua funcionando de forma independente.
