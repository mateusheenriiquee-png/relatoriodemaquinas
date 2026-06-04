#!/usr/bin/env powershell
# Setup Script - Adicionar Secrets no Cloudflare Workers
# Este script configura todos os secrets necessários para o Cloudflare

Write-Host "🚀 Setup de Secrets - Cloudflare Workers" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Verificar se wrangler está instalado
Write-Host "1️⃣  Verificando se Wrangler está instalado..." -ForegroundColor Yellow
$wrangler = Get-Command wrangler -ErrorAction SilentlyContinue

if (-not $wrangler) {
    Write-Host "❌ Wrangler não encontrado!" -ForegroundColor Red
    Write-Host "   Instale com: npm install -g wrangler" -ForegroundColor Gray
    exit 1
}

Write-Host "✅ Wrangler encontrado: $($wrangler.Source)" -ForegroundColor Green
Write-Host ""

# 2. Ler .dev.vars para obter o Base64
Write-Host "2️⃣  Lendo arquivo .dev.vars..." -ForegroundColor Yellow

$devVarsPath = ".\.dev.vars"
if (-not (Test-Path $devVarsPath)) {
    Write-Host "❌ Arquivo .dev.vars não encontrado!" -ForegroundColor Red
    exit 1
}

$devVarsContent = Get-Content $devVarsPath -Raw

# Extrair FIREBASE_SERVICE_ACCOUNT do .dev.vars
$firebaseAccountMatch = [regex]::Match($devVarsContent, 'FIREBASE_SERVICE_ACCOUNT=(.+?)(?=\n[A-Z_]+=|$)', [System.Text.RegularExpressions.RegexOptions]::Singleline)

if ($firebaseAccountMatch.Success) {
    $firebaseAccountJson = $firebaseAccountMatch.Groups[1].Value.Trim()
    Write-Host "✅ FIREBASE_SERVICE_ACCOUNT encontrado (JSON)" -ForegroundColor Green
    
    # Converter JSON para Base64
    $jsonBytes = [System.Text.Encoding]::UTF8.GetBytes($firebaseAccountJson)
    $base64 = [Convert]::ToBase64String($jsonBytes)
    Write-Host "✅ Convertido para Base64 ($($base64.Length) caracteres)" -ForegroundColor Green
} else {
    Write-Host "❌ FIREBASE_SERVICE_ACCOUNT não encontrado em .dev.vars" -ForegroundColor Red
    exit 1
}

Write-Host ""

# 3. Adicionar secrets no Cloudflare
Write-Host "3️⃣  Adicionando secrets no Cloudflare Workers..." -ForegroundColor Yellow
Write-Host ""

try {
    # Adicionar FIREBASE_SERVICE_ACCOUNT_BASE64
    Write-Host "   📝 Adicionando FIREBASE_SERVICE_ACCOUNT_BASE64..." -ForegroundColor Cyan
    
    $base64 | wrangler secret put FIREBASE_SERVICE_ACCOUNT_BASE64
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   ✅ FIREBASE_SERVICE_ACCOUNT_BASE64 adicionado!" -ForegroundColor Green
    } else {
        Write-Host "   ❌ Erro ao adicionar FIREBASE_SERVICE_ACCOUNT_BASE64" -ForegroundColor Red
        Write-Host "      Certifique-se que você fez login com: wrangler login" -ForegroundColor Yellow
        exit 1
    }
    
} catch {
    Write-Host "❌ Erro durante adicionar secrets: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "4️⃣  Verificando secrets adicionados..." -ForegroundColor Yellow

wrangler secret list

Write-Host ""
Write-Host "✅ SETUP COMPLETO!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Próximos passos:" -ForegroundColor Cyan
Write-Host "1. Execute: wrangler deploy" -ForegroundColor Gray
Write-Host "2. Teste: wrangler tail" -ForegroundColor Gray
Write-Host "3. Crie um usuário: curl -X POST https://seu-worker.dev/admin/create-user ..." -ForegroundColor Gray
Write-Host ""
Write-Host "Documentacao:" -ForegroundColor Cyan
Write-Host "- PROXIMOS_PASSOS.md" -ForegroundColor Gray
Write-Host "- ROTAS_ADMIN_IMPLEMENTADAS.md" -ForegroundColor Gray
Write-Host "- FIREBASE_BASE64_GUIDE.md" -ForegroundColor Gray
Write-Host ""
