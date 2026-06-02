#!/bin/bash

# 🔐 Script de Teste - Autenticação Admin
# Testa a validação de tokens Firebase

set -e

# Cores para output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}🔐 Testes de Autenticação Admin${NC}"
echo -e "${YELLOW}========================================${NC}"

# Configurações
FIREBASE_API_KEY="${FIREBASE_API_KEY:-}"
API_URL="${API_URL:-http://localhost:3000}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@teste.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-Senha123!}"

if [ -z "$FIREBASE_API_KEY" ]; then
    echo -e "${RED}❌ Erro: FIREBASE_API_KEY não definida${NC}"
    echo "Use: export FIREBASE_API_KEY=sua_chave_aqui"
    exit 1
fi

echo ""
echo -e "${YELLOW}📝 Configurações:${NC}"
echo "API URL: $API_URL"
echo "Admin Email: $ADMIN_EMAIL"
echo "Firebase API Key: ${FIREBASE_API_KEY:0:20}..."

# Teste 1: Obter Firebase Token
echo ""
echo -e "${YELLOW}[Teste 1/3] 🔑 Obtendo Firebase ID Token...${NC}"

TOKEN_RESPONSE=$(curl -s -X POST \
  "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}" \
  -H 'Content-Type: application/json' \
  -d "{
    \"email\": \"${ADMIN_EMAIL}\",
    \"password\": \"${ADMIN_PASSWORD}\",
    \"returnSecureToken\": true
  }")

ID_TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.idToken // empty')

if [ -z "$ID_TOKEN" ]; then
    echo -e "${RED}❌ Falha ao obter token${NC}"
    echo "Resposta: $TOKEN_RESPONSE"
    exit 1
fi

echo -e "${GREEN}✅ Token obtido com sucesso${NC}"
echo "Token: ${ID_TOKEN:0:50}..."

# Teste 2: Validar token (sem fazer requisição real)
echo ""
echo -e "${YELLOW}[Teste 2/3] 🔍 Testando header Authorization...${NC}"

HEADER_TEST=$(curl -s -X POST \
  "$API_URL/admin/create-user" \
  -H "Authorization: Bearer $ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "teste@exemplo.com",
    "password": "Teste123!",
    "displayName": "Teste",
    "cargo": "operador"
  }' \
  -w "\nHTTP_STATUS:%{http_code}\n")

HTTP_STATUS=$(echo "$HEADER_TEST" | grep HTTP_STATUS | cut -d: -f2)

if [ "$HTTP_STATUS" = "401" ]; then
    echo -e "${RED}❌ Token não foi validado (401)${NC}"
    echo "Resposta: $(echo "$HEADER_TEST" | grep -v HTTP_STATUS)"
elif [ "$HTTP_STATUS" = "400" ]; then
    echo -e "${GREEN}✅ Token foi aceito (validação passou)${NC}"
    echo "Resposta: $(echo "$HEADER_TEST" | grep -v HTTP_STATUS)"
elif [ "$HTTP_STATUS" = "201" ]; then
    echo -e "${GREEN}✅ Usuário criado com sucesso!${NC}"
    echo "Resposta: $(echo "$HEADER_TEST" | grep -v HTTP_STATUS)"
else
    echo -e "${YELLOW}⚠️  Status: $HTTP_STATUS${NC}"
    echo "Resposta: $(echo "$HEADER_TEST" | grep -v HTTP_STATUS)"
fi

# Teste 3: Testar sem token (deve retornar 401)
echo ""
echo -e "${YELLOW}[Teste 3/3] 🚫 Testando sem token (deve retornar 401)...${NC}"

NO_TOKEN_TEST=$(curl -s -X POST \
  "$API_URL/admin/create-user" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "teste2@exemplo.com",
    "password": "Teste123!",
    "displayName": "Teste 2",
    "cargo": "operador"
  }' \
  -w "\nHTTP_STATUS:%{http_code}\n")

HTTP_STATUS=$(echo "$NO_TOKEN_TEST" | grep HTTP_STATUS | cut -d: -f2)

if [ "$HTTP_STATUS" = "401" ]; then
    echo -e "${GREEN}✅ Corretamente rejeitado sem token${NC}"
else
    echo -e "${RED}❌ Deveria retornar 401, mas retornou $HTTP_STATUS${NC}"
fi

echo ""
echo -e "${YELLOW}========================================${NC}"
echo -e "${GREEN}✅ Testes Concluídos!${NC}"
echo -e "${YELLOW}========================================${NC}"
