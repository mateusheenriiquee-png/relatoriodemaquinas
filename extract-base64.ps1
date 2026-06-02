$devVars = Get-Content ".\.dev.vars" -Raw
$lines = $devVars -split "`n"
foreach ($line in $lines) {
    if ($line.StartsWith("FIREBASE_SERVICE_ACCOUNT=")) {
        $jsonStr = $line.Substring(26)
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($jsonStr)
        $base64 = [Convert]::ToBase64String($bytes)
        Write-Output $base64 | Out-File "firebase-base64-temp.txt"
        Write-Host "Base64 extracted and saved to firebase-base64-temp.txt" -ForegroundColor Green
        break
    }
}
