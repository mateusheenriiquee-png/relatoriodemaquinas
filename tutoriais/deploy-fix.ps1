# Script de Deploy Automático
# Execute com: .\deploy-fix.ps1

param(
    [switch]$SkipBuild = $false
)

$ErrorActionPreference = "Stop"

# Cores
$Success = "Green"
$Error = "Red"
$Warning = "Yellow"
$Info = "Cyan"

Write-Host ""
Write-Host "========================================" -ForegroundColor $Warning
Write-Host "🚀 Deploy Automático - Correção 401" -ForegroundColor $Warning
Write-Host "========================================" -ForegroundColor $Warning
Write-Host ""

# Passo 1: Verificar Cloudflare CLI
Write-Host "[1/4] Verificando Cloudflare CLI..." -ForegroundColor $Info
try {
    $wranglerVersion = & wrangler --version 2>&1
    Write-Host "✅ Wrangler encontrado: $wranglerVersion" -ForegroundColor $Success
} catch {
    Write-Host "❌ Erro: Wrangler não está instalado" -ForegroundColor $Error
    Write-Host "Instale com: npm install -g wrangler" -ForegroundColor $Warning
    exit 1
}

Write-Host ""

# Passo 2: Build (opcional)
if (-not $SkipBuild) {
    Write-Host "[2/4] Fazendo build do projeto..." -ForegroundColor $Info
    try {
        & npm run build 2>&1
        Write-Host "✅ Build concluído com sucesso" -ForegroundColor $Success
    } catch {
        Write-Host "❌ Erro no build" -ForegroundColor $Error
        exit 1
    }
} else {
    Write-Host "[2/4] Build pulado (--SkipBuild)" -ForegroundColor $Warning
}

Write-Host ""

# Passo 3: Deploy
Write-Host "[3/4] Fazendo deploy no Cloudflare Workers..." -ForegroundColor $Info
try {
    & wrangler deploy 2>&1 | Tee-Object -Variable deployOutput
    
    if ($deployOutput -match "Successfully published") {
        Write-Host "✅ Deploy concluído com sucesso!" -ForegroundColor $Success
    } else {
        Write-Host "⚠️  Deploy pode ter tido problemas" -ForegroundColor $Warning
    }
} catch {
    Write-Host "❌ Erro no deploy" -ForegroundColor $Error
    exit 1
}

Write-Host ""

# Passo 4: Instruções finais
Write-Host "[4/4] Instruções finais..." -ForegroundColor $Info
Write-Host ""
Write-Host "✅ Deploy concluído!" -ForegroundColor $Success
Write-Host ""
Write-Host "📋 Próximos passos:" -ForegroundColor $Warning
Write-Host "1. Abra o navegador" -ForegroundColor $Info
Write-Host "2. Vá para: https://suportetecnico-api.mateus-henriques.workers.dev/admin" -ForegroundColor $Info
Write-Host "3. Pressione Ctrl+Shift+Delete para limpar cache" -ForegroundColor $Info
Write-Host "4. Faça login" -ForegroundColor $Info
Write-Host "5. Vá para 'Novo Usuário'" -ForegroundColor $Info
Write-Host "6. Pressione F12 e abra o Console" -ForegroundColor $Info
Write-Host "7. Clique em 'Criar Usuário'" -ForegroundColor $Info
Write-Host "8. Procure pelos logs [Auth] e [Middleware]" -ForegroundColor $Info
Write-Host ""
Write-Host "📖 Para mais detalhes, veja: PASSOS_MANUAIS.md" -ForegroundColor $Warning
Write-Host ""
Write-Host "========================================" -ForegroundColor $Success
Write-Host "✅ Deploy Concluído!" -ForegroundColor $Success
Write-Host "========================================" -ForegroundColor $Success
