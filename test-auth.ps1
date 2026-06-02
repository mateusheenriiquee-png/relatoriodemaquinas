# 🔐 Script de Teste - Autenticação Admin (PowerShell)
# Testa a validação de tokens Firebase

param(
    [string]$FirebaseApiKey = $env:FIREBASE_API_KEY,
    [string]$ApiUrl = "http://localhost:3000",
    [string]$AdminEmail = "admin@teste.com",
    [string]$AdminPassword = "Senha123!"
)

# Cores
$Success = "Green"
$Error = "Red"
$Warning = "Yellow"

Write-Host "========================================" -ForegroundColor $Warning
Write-Host "🔐 Testes de Autenticação Admin" -ForegroundColor $Warning
Write-Host "========================================" -ForegroundColor $Warning

if (-not $FirebaseApiKey) {
    Write-Host "❌ Erro: FIREBASE_API_KEY não definida" -ForegroundColor $Error
    Write-Host "Use: `$env:FIREBASE_API_KEY = 'sua_chave_aqui'" -ForegroundColor $Warning
    exit 1
}

Write-Host ""
Write-Host "📝 Configurações:" -ForegroundColor $Warning
Write-Host "API URL: $ApiUrl"
Write-Host "Admin Email: $AdminEmail"
Write-Host "Firebase API Key: $($FirebaseApiKey.Substring(0, 20))..."

# Teste 1: Obter Firebase Token
Write-Host ""
Write-Host "[Teste 1/3] 🔑 Obtendo Firebase ID Token..." -ForegroundColor $Warning

$tokenBody = @{
    email = $AdminEmail
    password = $AdminPassword
    returnSecureToken = $true
} | ConvertTo-Json

try {
    $tokenResponse = Invoke-WebRequest `
        -Uri "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=$FirebaseApiKey" `
        -Method POST `
        -Headers @{ "Content-Type" = "application/json" } `
        -Body $tokenBody
    
    $tokenData = $tokenResponse.Content | ConvertFrom-Json
    $idToken = $tokenData.idToken
    
    if (-not $idToken) {
        Write-Host "❌ Falha ao obter token" -ForegroundColor $Error
        Write-Host "Resposta: $($tokenResponse.Content)" -ForegroundColor $Error
        exit 1
    }
    
    Write-Host "✅ Token obtido com sucesso" -ForegroundColor $Success
    Write-Host "Token: $($idToken.Substring(0, 50))..."
}
catch {
    Write-Host "❌ Erro ao obter token: $_" -ForegroundColor $Error
    exit 1
}

# Teste 2: Validar token
Write-Host ""
Write-Host "[Teste 2/3] 🔍 Testando header Authorization..." -ForegroundColor $Warning

$userBody = @{
    email = "teste@exemplo.com"
    password = "Teste123!"
    displayName = "Teste"
    cargo = "operador"
} | ConvertTo-Json

try {
    $response = Invoke-WebRequest `
        -Uri "$ApiUrl/admin/create-user" `
        -Method POST `
        -Headers @{ 
            "Authorization" = "Bearer $idToken"
            "Content-Type" = "application/json"
        } `
        -Body $userBody `
        -SkipHttpErrorCheck
    
    $httpStatus = $response.StatusCode
    
    if ($httpStatus -eq 401) {
        Write-Host "❌ Token não foi validado (401)" -ForegroundColor $Error
        Write-Host "Resposta: $($response.Content)" -ForegroundColor $Error
    }
    elseif ($httpStatus -eq 400) {
        Write-Host "✅ Token foi aceito (validação passou)" -ForegroundColor $Success
        $responseData = $response.Content | ConvertFrom-Json
        Write-Host "Resposta: $($responseData | ConvertTo-Json)" -ForegroundColor $Success
    }
    elseif ($httpStatus -eq 201) {
        Write-Host "✅ Usuário criado com sucesso!" -ForegroundColor $Success
        $responseData = $response.Content | ConvertFrom-Json
        Write-Host "Resposta: $($responseData | ConvertTo-Json)" -ForegroundColor $Success
    }
    else {
        Write-Host "⚠️  Status: $httpStatus" -ForegroundColor $Warning
        Write-Host "Resposta: $($response.Content)" -ForegroundColor $Warning
    }
}
catch {
    Write-Host "❌ Erro na requisição: $_" -ForegroundColor $Error
}

# Teste 3: Testar sem token
Write-Host ""
Write-Host "[Teste 3/3] 🚫 Testando sem token (deve retornar 401)..." -ForegroundColor $Warning

try {
    $response = Invoke-WebRequest `
        -Uri "$ApiUrl/admin/create-user" `
        -Method POST `
        -Headers @{ "Content-Type" = "application/json" } `
        -Body $userBody `
        -SkipHttpErrorCheck
    
    $httpStatus = $response.StatusCode
    
    if ($httpStatus -eq 401) {
        Write-Host "✅ Corretamente rejeitado sem token" -ForegroundColor $Success
        Write-Host "Resposta: $($response.Content)" -ForegroundColor $Success
    }
    else {
        Write-Host "❌ Deveria retornar 401, mas retornou $httpStatus" -ForegroundColor $Error
        Write-Host "Resposta: $($response.Content)" -ForegroundColor $Error
    }
}
catch {
    Write-Host "❌ Erro na requisição: $_" -ForegroundColor $Error
}

Write-Host ""
Write-Host "========================================" -ForegroundColor $Warning
Write-Host "✅ Testes Concluídos!" -ForegroundColor $Success
Write-Host "========================================" -ForegroundColor $Warning
