# 🔧 Guia Completo: Converter Firebase Service Account para Base64

## O Problema

Quando você tenta usar um arquivo `firebase-service-account.json` no Cloudflare Workers via variável de ambiente, às vezes ocorrem erros:

- ❌ `Erro ao decodificar Base64`
- ❌ `Erro ao parsear JSON`
- ❌ `private_key inválida`
- ❌ `PERMISSION_DENIED`

## ✅ Soluções

### **1. Linux/Mac - Usando Terminal**

```bash
# Gerar Base64 de uma linha (sem quebras de linha)
cat firebase-service-account.json | base64 -w0 > firebase-base64.txt

# Ou copiar para clipboard
cat firebase-service-account.json | base64 -w0 | pbcopy  # Mac
cat firebase-service-account.json | base64 -w0 | xclip   # Linux

# Verificar se foi gerado corretamente
cat firebase-base64.txt
```

### **2. Windows - PowerShell**

```powershell
# Ler o arquivo e converter para Base64
$fileContent = Get-Content "C:\path\to\firebase-service-account.json" -Raw
$base64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($fileContent))
$base64 | Set-Clipboard  # Copiar para clipboard

# Ou salvar em arquivo
$base64 | Out-File "firebase-base64.txt"
```

### **3. Node.js/Browser - Qualquer Sistema**

```javascript
// No terminal Node.js ou em um arquivo .js
const fs = require('fs');
const fileContent = fs.readFileSync('./firebase-service-account.json', 'utf8');
const base64 = Buffer.from(fileContent).toString('base64');
console.log(base64);

// Ou sem fs (apenas JSON object):
const serviceAccount = { /* seu object aqui */ };
const base64 = Buffer.from(JSON.stringify(serviceAccount)).toString('base64');
console.log(base64);
```

### **4. Python**

```python
import base64
import json

# Opção 1: De um arquivo
with open('firebase-service-account.json', 'r') as f:
    content = f.read()
    base64_str = base64.b64encode(content.encode()).decode()
    print(base64_str)

# Opção 2: De um dicionário
service_account = { "type": "service_account", ... }
base64_str = base64.b64encode(json.dumps(service_account).encode()).decode()
print(base64_str)
```

### **5. Online (⚠️ Use com cuidado - não em ambiente produção)**

Se o arquivo tem dados sensíveis, **NÃO use sites online**!

Mas para testar estrutura:
- https://www.base64encode.org/

---

## 📋 Checklist: Como Verificar se Está Correto

```bash
# 1. Verificar se é Base64 válido
echo "seu_base64_aqui" | base64 -d | head -c 50

# 2. Deve começar com { se for JSON
echo "seu_base64_aqui" | base64 -d | head -c 1

# 3. Verificar se tem os campos essenciais
echo "seu_base64_aqui" | base64 -d | grep -o '"type":\|"project_id":\|"private_key":'
```

---

## 🚀 Inserir no Cloudflare Dashboard

### **Método 1: Via Dashboard UI**

1. Abra [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Selecione seu Worker
3. → **Settings** → **Variables and Secrets**
4. → **Add Variable**
5. Nome: `FIREBASE_SERVICE_ACCOUNT_BASE64`
6. Valor: Cole o resultado base64 gerado
7. → **Save**

### **Método 2: Via Wrangler CLI**

```bash
# Instalar Wrangler (se não tiver)
npm install -g wrangler

# Fazer login
wrangler login

# Adicionar variável
wrangler secret put FIREBASE_SERVICE_ACCOUNT_BASE64

# Cole o base64 quando solicitado, pressione Ctrl+D (Mac/Linux) ou Ctrl+Z+Enter (Windows)
```

### **Método 3: Via wrangler.toml**

⚠️ **Atenção:** Nunca committe secrets em Git!

```toml
[env.production]
vars = { }

[[env.production.r2_buckets]]
binding = "BUCKET"
bucket_name = "prod-bucket"

[env.production.vars]
# FIREBASE_SERVICE_ACCOUNT_BASE64 = "..." ← Não deixe aqui!
FIREBASE_PROJECT_ID = "seu-project-id"
```

---

## 🔍 Troubleshooting

### **Erro: "Erro ao decodificar Base64"**

✅ **Solução:**
```bash
# Verificar se não tem espaços ou quebras de linha extras
echo "seu_base64" | tr -d '\n\r\t ' | base64 -d > teste.json

# Se tiver quebras de linha, remover:
cat firebase-base64.txt | tr -d '\n' > firebase-base64-clean.txt
```

### **Erro: "private_key inválida"**

✅ **Solução:**
A string deve ter `\n` literal (dois caracteres) que serão convertidos para quebra de linha real:

```json
❌ ERRADO - quebra de linha real no JSON:
"private_key": "-----BEGIN PRIVATE KEY-----
MIIEvQIBADA..."

✅ CORRETO - \n literal:
"private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADA..."
```

Se seu JSON tem quebras reais:
```bash
# Escapar quebras de linha
sed 's/$/\\n/' firebase-service-account.json | tr -d '\n'
```

### **Erro: "PERMISSION_DENIED"**

✅ **Solução:**
Não é problema do base64, é das regras Firestore. Verifique:
- [Firestore Rules](https://console.firebase.google.com/project/seu-projeto/firestore/rules)
- Permissões da conta de serviço

---

## 📝 Script Completo - Converter e Verificar

```bash
#!/bin/bash
# converte-firebase-base64.sh

if [ ! -f "$1" ]; then
    echo "Uso: $0 <caminho/firebase-service-account.json>"
    exit 1
fi

echo "🔄 Lendo arquivo: $1"
echo "📊 Tamanho original: $(wc -c < "$1") bytes"

echo "🔐 Convertendo para Base64..."
BASE64=$(cat "$1" | base64 -w0)

echo "✅ Base64 gerado com sucesso"
echo "📏 Tamanho Base64: ${#BASE64} caracteres"

echo ""
echo "🔍 Verificando integridade..."
DECODED=$(echo "$BASE64" | base64 -d)
DECODED_SIZE=$(echo "$DECODED" | wc -c)

echo "✓ Decodificação OK"
echo "✓ Pode decodificar de volta para JSON"

echo ""
echo "📋 Primeiros 100 caracteres:"
echo "$BASE64" | cut -c1-100
echo "..."

echo ""
echo "💾 Salvando em firebase-base64.txt"
echo "$BASE64" > firebase-base64.txt

echo "✅ Pronto! Use o conteúdo de firebase-base64.txt no Cloudflare"
```

---

## 🎯 Checklist Final

- [ ] Arquivo `firebase-service-account.json` está válido (tem `type`, `project_id`, `private_key`)
- [ ] Convertido para Base64 (uma linha, sem quebras de linha extras)
- [ ] Inserido no Cloudflare como `FIREBASE_SERVICE_ACCOUNT_BASE64`
- [ ] Testado: `echo "seu_base64" | base64 -d | jq .` mostra JSON válido
- [ ] Verificar nos logs do Worker: "[Firebase] ✓ Base64 decodificado com sucesso"

