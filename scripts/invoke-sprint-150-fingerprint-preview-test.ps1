<#
Sprint 150D - one controlled call to /api/cron/write-candidates on a
Preview deployment, for the Michalowice source only.

ZERO secrets are stored in this file. Every secret is prompted for
interactively, held only as a SecureString for as short a time as
possible, and explicitly cleared from memory before the script exits.

Source key is hardcoded to "michalowice-komunikaty" and cannot be
overridden - this script intentionally has no parameter for it. WKD
and any other source are out of scope for this controlled test.

Exactly ONE HTTP request is made. No loop, no retry, no polling.
Do not run this script more than once per approved test.
#>

[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

# Hardcoded, non-overridable - do not add a parameter for this.
$SourceKey = "michalowice-komunikaty"

function ConvertFrom-SecureStringPlain {
    param([Parameter(Mandatory)][System.Security.SecureString]$Secure)
    $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
    try {
        return [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    } finally {
        [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
}

Write-Host "=== Sprint 150D - controlled fingerprint preview test ==="
Write-Host "Source key (hardcoded, cannot be changed): $SourceKey"
Write-Host ""
Write-Host "This script makes exactly ONE request. It will not retry on failure."
Write-Host ""

# --- Preview base URL ---
$baseUrlRaw = Read-Host "Podaj pelny Preview base URL (np. https://alertownik-mvp-xxxx.vercel.app)"
$baseUrl = $baseUrlRaw.Trim().TrimEnd("/")

if ($baseUrl -notmatch '^https://') {
    Write-Host "BLAD: Preview URL musi zaczynac sie od https://. Przerywam, bez ponawiania." -ForegroundColor Red
    return
}

$endpoint = "$baseUrl/api/cron/write-candidates?sourceKey=$SourceKey"
Write-Host ""
Write-Host "Docelowy endpoint (bez sekretow):"
Write-Host "  $endpoint"
Write-Host ""

# --- Secrets, prompted, never echoed, never written to any file ---
$cronSecretSecure = Read-Host -AsSecureString "Podaj CRON_SECRET (nie bedzie widoczny na ekranie)"
$bypassSecretSecure = Read-Host -AsSecureString "Podaj Vercel Protection Bypass secret (nie bedzie widoczny na ekranie)"

$cronSecretPlain = $null
$bypassSecretPlain = $null
$response = $null
$didError = $false

try {
    $cronSecretPlain = ConvertFrom-SecureStringPlain -Secure $cronSecretSecure
    $bypassSecretPlain = ConvertFrom-SecureStringPlain -Secure $bypassSecretSecure

    $headers = @{
        "Authorization"              = "Bearer $cronSecretPlain"
        "x-vercel-protection-bypass" = $bypassSecretPlain
    }

    Write-Host "Wysylam DOKLADNIE JEDNO zadanie GET..."
    $response = Invoke-RestMethod -Uri $endpoint -Method Get -Headers $headers -TimeoutSec 30
}
catch {
    $didError = $true
    Write-Host ""
    Write-Host "BLAD podczas wywolania. Nie ponawiam automatycznie." -ForegroundColor Red
    Write-Host "Bezpieczny komunikat: $($_.Exception.Message)" -ForegroundColor Red
}
finally {
    # Clear plaintext secrets from memory as soon as possible, regardless
    # of success or failure above.
    if ($cronSecretPlain) { $cronSecretPlain = "0" * $cronSecretPlain.Length }
    if ($bypassSecretPlain) { $bypassSecretPlain = "0" * $bypassSecretPlain.Length }
    Remove-Variable -Name cronSecretPlain -ErrorAction SilentlyContinue
    Remove-Variable -Name bypassSecretPlain -ErrorAction SilentlyContinue
    Remove-Variable -Name cronSecretSecure -ErrorAction SilentlyContinue
    Remove-Variable -Name bypassSecretSecure -ErrorAction SilentlyContinue
    Remove-Variable -Name headers -ErrorAction SilentlyContinue
    [System.GC]::Collect()
}

if (-not $didError) {
    Write-Host ""
    Write-Host "=== Odpowiedz JSON ==="
    $response | ConvertTo-Json -Depth 10
    Write-Host ""
    if ($response.published -eq $false) {
        Write-Host "published = false -- OK (zgodnie z oczekiwaniem)." -ForegroundColor Green
    } else {
        Write-Host "UWAGA: published nie jest wprost 'false' w odpowiedzi -- zweryfikuj recznie przed dalszymi krokami." -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "=====================================================" -ForegroundColor Yellow
Write-Host " DO NOT RUN AGAIN - this was a single, one-off, manually" -ForegroundColor Yellow
Write-Host " approved controlled test. Re-running requires a fresh," -ForegroundColor Yellow
Write-Host " separate decision, not a retry of this script." -ForegroundColor Yellow
Write-Host "=====================================================" -ForegroundColor Yellow
