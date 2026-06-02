# Script para Adicionar Firebase Service Account ao Cloudflare
# Execute com: .\add-firebase-secret.ps1

$ErrorActionPreference = "Stop"

# Cores
$Success = "Green"
$Error = "Red"
$Warning = "Yellow"
$Info = "Cyan"

Write-Host ""
Write-Host "========================================" -ForegroundColor $Warning
Write-Host "🔐 Adicionando Firebase Secret" -ForegroundColor $Warning
Write-Host "========================================" -ForegroundColor $Warning
Write-Host ""

# Passo 1: Verificar se arquivo existe
Write-Host "[1/4] Procurando arquivo firebase-service-account.json..." -ForegroundColor $Info

$firebaseFile = "firebase-service-account.json"

if (-not (Test-Path $firebaseFile)) {
    Write-Host "❌ Erro: Arquivo não encontrado!" -ForegroundColor $Error
    Write-Host "Procure por: $firebaseFile" -ForegroundColor $Warning
    exit 1
}

Write-Host "✅ Arquivo encontrado: $firebaseFile" -ForegroundColor $Success
Write-Host ""

# Passo 2: Ler o arquivo
Write-Host "[2/4] Lendo arquivo JSON..." -ForegroundColor $Info

try {
    $json = Get-Content $firebaseFile -Raw
    Write-Host "✅ JSON lido com sucesso" -ForegroundColor $Success
    Write-Host "   Tamanho: $($json.Length) caracteres" -ForegroundColor $Success
} catch {
    Write-Host "❌ Erro ao ler arquivo: $_" -ForegroundColor $Error
    exit 1
}

Write-Host ""

# Passo 3: Converter para Base64
Write-Host "[3/4] Convertendo para Base64..." -ForegroundColor $Info

try {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $base64 = [Convert]::ToBase64String($bytes)
    Write-Host "✅ Convertido com sucesso" -ForegroundColor $Success
    Write-Host "   Base64 length: $($base64.Length) caracteres" -ForegroundColor $Success
} catch {
    Write-Host "❌ Erro ao converter: $_" -ForegroundColor $Error
    exit 1
}

Write-Host ""

# Passo 4: Adicionar ao Cloudflare
Write-Host "[4/4] Adicionando secret ao Cloudflare..." -ForegroundColor $Info
Write-Host ""
Write-Host "⏳ Aguarde... Será solicitado para confirmar" -ForegroundColor $Warning
Write-Host ""

try {
    # Passar o Base64 via stdin do Wrangler
    $base64 | wrangler secret put FIREBASE_SERVICE_ACCOUNT_BASE64
    
    Write-Host ""
    Write-Host "✅ Secret adicionado com sucesso!" -ForegroundColor $Success
} catch {
    Write-Host ""
    Write-Host "❌ Erro ao adicionar secret: $_" -ForegroundColor $Error
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor $Success
Write-Host "📋 Próximos Passos:" -ForegroundColor $Info
Write-Host "========================================" -ForegroundColor $Success
Write-Host ""
Write-Host "1. Verificar secret foi adicionado:" -ForegroundColor $Info
Write-Host "   wrangler secret list" -ForegroundColor $Warning
Write-Host ""
Write-Host "2. Fazer deploy:" -ForegroundColor $Info
Write-Host "   wrangler deploy" -ForegroundColor $Warning
Write-Host ""
Write-Host "3. Limpar cache do navegador:" -ForegroundColor $Info
Write-Host "   Ctrl+Shift+Delete" -ForegroundColor $Warning
Write-Host ""
Write-Host "4. Testar:" -ForegroundColor $Info
Write-Host "   https://suportetecnico-api.mateus-henriques.workers.dev/admin" -ForegroundColor $Warning
Write-Host ""
Write-Host "========================================" -ForegroundColor $Success
