<#
Sprint 150D - Phase A fail-closed runtime preflight.

Purpose: prove, with exactly ONE real HTTP request against the Preview
deployment, that /api/cron/write-candidates returns its fail-closed
response when SCHEDULED_WRITES_ENABLED=false - and does NOT insert a
source_check, does NOT insert a candidate, does NOT touch alerts, and
does NOT touch WKD. This is a SAFETY TEST, not a live-write test - see
scripts/invoke-sprint-150-fingerprint-preview-test.ps1 for that separate,
still-not-yet-approved script.

ZERO secrets are stored in this file. Every secret is prompted for
interactively, held only as a SecureString / cleared plaintext for as
short a time as possible, and explicitly wiped before the script exits.

Preview URL is hardcoded below (Phase A deployment, branch
sprint-150-race-condition-closure-package-v1, commit 02511a9) so it
cannot be mistyped at the prompt. sourceKey is hardcoded to
"michalowice-komunikaty" for the same reason - this script has no
parameter for either value, on purpose.

Exactly ONE HTTP request is made. No loop, no retry, no polling.
This script must not be run more than once per approved preflight.
#>

[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

# --- Hardcoded, non-overridable - do not add parameters for these ---
$PreviewBaseUrl = "https://alertownik-mvp-git-sprint-150-race-condition-b74b20-alertownik.vercel.app"
$SourceKey = "michalowice-komunikaty"

# --- Expected fail-closed response shape (writes=false) ---
$ExpectedStatusCode = 503
$ExpectedOkValue = $false
# Built from code points, not typed literally, so this ASCII-only .ps1
# file cannot suffer silent mojibake on the two Polish diacritics below.
$ExpectedErrorText = "T" + "ryb zapisu jest wy" + [char]0x0142 + [char]0x0105 + "czony."

function ConvertFrom-SecureStringPlain {
    param([Parameter(Mandatory)][System.Security.SecureString]$Secure)
    $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
    try {
        return [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    } finally {
        [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
}

function Read-ResponseBodySafe {
    param($WebResponse)
    try {
        $stream = $WebResponse.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        $text = $reader.ReadToEnd()
        $reader.Close()
        return $text
    } catch {
        return $null
    }
}

Write-Host "=== Sprint 150D - Phase A fail-closed preflight (writes disabled) ==="
Write-Host "Preview URL (hardcoded): $PreviewBaseUrl"
Write-Host "Source key (hardcoded, cannot be changed): $SourceKey"
Write-Host ""
Write-Host "This script makes exactly ONE request. It will not retry on failure."
Write-Host "It is a SAFETY test: it expects the endpoint to REFUSE to run."
Write-Host ""

if ($PreviewBaseUrl -notmatch '^https://[a-z0-9.\-]+\.vercel\.app$') {
    Write-Host "BLAD: hardcoded Preview URL does not look like a vercel.app URL. Stopping, no request made." -ForegroundColor Red
    return
}

$endpoint = "$PreviewBaseUrl/api/cron/write-candidates?sourceKey=$SourceKey"
Write-Host "Docelowy endpoint (bez sekretow):"
Write-Host "  $endpoint"
Write-Host ""

# --- Secrets, prompted, never echoed, never written to any file ---
$cronSecretSecure = Read-Host -AsSecureString "Podaj CRON_SECRET (nie bedzie widoczny na ekranie)"
$bypassSecretSecure = Read-Host -AsSecureString "Podaj Vercel Protection Bypass secret (nie bedzie widoczny na ekranie)"

$cronSecretPlain = $null
$bypassSecretPlain = $null
$statusCode = $null
$rawBody = $null
$contentType = $null
$requestFailed = $false
$failureMessage = $null

try {
    $cronSecretPlain = ConvertFrom-SecureStringPlain -Secure $cronSecretSecure
    $bypassSecretPlain = ConvertFrom-SecureStringPlain -Secure $bypassSecretSecure

    $headers = @{
        "Authorization"              = "Bearer $cronSecretPlain"
        "x-vercel-protection-bypass" = $bypassSecretPlain
    }

    Write-Host "Wysylam DOKLADNIE JEDNO zadanie GET..."
    try {
        $resp = Invoke-WebRequest -Uri $endpoint -Method Get -Headers $headers -TimeoutSec 30 -UseBasicParsing
        $statusCode = [int]$resp.StatusCode
        $rawBody = $resp.Content
        $contentType = $resp.Headers["Content-Type"]
    } catch [System.Net.WebException] {
        $webResp = $_.Exception.Response
        if ($webResp) {
            $statusCode = [int]$webResp.StatusCode
            $contentType = $webResp.Headers["Content-Type"]
            $rawBody = Read-ResponseBodySafe -WebResponse $webResp
        } else {
            $requestFailed = $true
            $failureMessage = $_.Exception.Message
        }
    }
}
catch {
    $requestFailed = $true
    $failureMessage = $_.Exception.Message
}
finally {
    if ($cronSecretPlain) { $cronSecretPlain = "0" * $cronSecretPlain.Length }
    if ($bypassSecretPlain) { $bypassSecretPlain = "0" * $bypassSecretPlain.Length }
    Remove-Variable -Name cronSecretPlain -ErrorAction SilentlyContinue
    Remove-Variable -Name bypassSecretPlain -ErrorAction SilentlyContinue
    Remove-Variable -Name cronSecretSecure -ErrorAction SilentlyContinue
    Remove-Variable -Name bypassSecretSecure -ErrorAction SilentlyContinue
    Remove-Variable -Name headers -ErrorAction SilentlyContinue
    try { Set-Clipboard -Value $null -ErrorAction SilentlyContinue } catch {}
    [System.GC]::Collect()
}

Write-Host ""
Write-Host "=== Wynik ==="

if ($requestFailed) {
    Write-Host "FAIL - request could not be completed. Bezpieczny komunikat: $failureMessage" -ForegroundColor Red
    Write-Host ""
    Write-Host "DO NOT RUN AGAIN." -ForegroundColor Yellow
    return
}

Write-Host "HTTP status: $statusCode"
Write-Host "Content-Type: $contentType"

$isJson = $contentType -and ($contentType -like "*application/json*")
$parsed = $null
if ($isJson -and $rawBody) {
    try { $parsed = $rawBody | ConvertFrom-Json } catch { $parsed = $null }
}

Write-Host ""
if ($isJson -and $rawBody) {
    Write-Host "Raw JSON body:"
    Write-Host $rawBody
} else {
    Write-Host "Body is not JSON (or empty) - showing first 300 chars only:"
    if ($rawBody) { Write-Host $rawBody.Substring(0, [Math]::Min(300, $rawBody.Length)) }
}

Write-Host ""

$pass = $false
$reason = ""

if (-not $isJson) {
    $reason = "response Content-Type is not application/json (likely a Vercel protection/HTML page, not the app) - cannot be PASS"
} elseif ($null -eq $parsed) {
    $reason = "response body did not parse as JSON - cannot be PASS"
} elseif ($statusCode -ne $ExpectedStatusCode) {
    $reason = "HTTP status $statusCode does not match expected $ExpectedStatusCode"
} elseif ($parsed.ok -ne $ExpectedOkValue) {
    $reason = "JSON 'ok' field is not exactly `$false"
} elseif ($parsed.error -ne $ExpectedErrorText) {
    $reason = "JSON 'error' field does not exactly match the expected fail-closed message"
} elseif ($null -ne $parsed.candidatesInserted -or $null -ne $parsed.published -or $null -ne $parsed.results) {
    $reason = "response contains write-path fields (candidatesInserted/published/results) that should not appear on a fail-closed 503"
} else {
    $pass = $true
}

if ($pass) {
    Write-Host "PREFLIGHT PASS - fail-closed response confirmed (503, ok=false, exact expected message, no write-path fields)." -ForegroundColor Green
} else {
    Write-Host "PREFLIGHT FAIL - $reason" -ForegroundColor Red
    Write-Host "Do not treat this as confirmation that writes are disabled. Stop and investigate before any further action." -ForegroundColor Red
}

Write-Host ""
Write-Host "=====================================================" -ForegroundColor Yellow
Write-Host " DO NOT RUN AGAIN - this was a single, one-off, manually" -ForegroundColor Yellow
Write-Host " approved preflight. Re-running requires a fresh," -ForegroundColor Yellow
Write-Host " separate decision, not a retry of this script." -ForegroundColor Yellow
Write-Host "=====================================================" -ForegroundColor Yellow
