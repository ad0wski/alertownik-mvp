<#
Sprint 152A - one controlled manual call to the Production dry-run
endpoint, GET /api/cron/check-sources, scoped to Michalowice only.

Purpose: prove, with exactly ONE real HTTP request against Production,
that the route returns its genuine dry-run success shape - ok:true,
dryRun:true, savedCandidates:0, savedSourceChecks:0, published:false -
and that no other shape (HTML, 401, 404, 500, or an unexpected JSON
body) is silently treated as a pass. This route is structurally
zero-write (no Supabase import anywhere in its chain, confirmed by
docs/SPRINT_151_PRODUCTION_RELEASE_AUDIT_V1.md and
docs/SPRINT_152_PRODUCTION_MANUAL_DRY_RUN_RUNBOOK_V1.md) - this script
is a validation of that fact against the real deployment, not a write
test.

ZERO secrets are stored in this file. The only secret this script
needs - the Production CRON_SECRET - is prompted for interactively,
held only as a SecureString / cleared plaintext for as short a time as
possible, and explicitly wiped before the script exits.

Production URL and the target path + sourceKey are hardcoded below on
purpose - this script has no parameter for any of them, so none can be
mistyped or pointed at the wrong environment.

Exactly ONE HTTP request is made. No loop, no retry, no polling.
This script must not be run more than once per approved dry-run.
No Vercel Protection Bypass header is sent - the Production custom
domain is public (confirmed empirically during the Sprint 151B smoke
test: anonymous requests already returned real 200 responses, not a
Vercel Authentication page).
#>

[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

# --- Hardcoded, non-overridable - do not add parameters for these ---
$ProductionBaseUrl = "https://alertownik-mvp.vercel.app"
$SourceKey = "michalowice-komunikaty"

# --- Expected dry-run success shape ---
$ExpectedStatusCode = 200
$ExpectedOkValue = $true
$ExpectedDryRunValue = $true
$ExpectedSavedCandidates = 0
$ExpectedSavedSourceChecks = 0
$ExpectedPublishedValue = $false

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

Write-Host "=== Sprint 152A - Production dry-run manual validation ==="
Write-Host "Production URL (hardcoded): $ProductionBaseUrl"
Write-Host "Source key (hardcoded, cannot be changed): $SourceKey"
Write-Host ""
Write-Host "This script makes exactly ONE request. It will not retry on failure."
Write-Host "This is a SAFETY validation: the target route is zero-write by"
Write-Host "construction - this script only confirms that fact against the real"
Write-Host "Production deployment, it does not itself write anything."
Write-Host ""

if ($ProductionBaseUrl -notmatch '^https://[a-z0-9.\-]+\.vercel\.app$') {
    Write-Host "BLAD: hardcoded Production URL does not look like a vercel.app URL. Stopping, no request made." -ForegroundColor Red
    return
}

$endpoint = "$ProductionBaseUrl/api/cron/check-sources?sourceKey=$SourceKey"
Write-Host "Docelowy endpoint (bez sekretow):"
Write-Host "  $endpoint"
Write-Host ""

# --- Secret, prompted, never echoed, never written to any file ---
$cronSecretSecure = Read-Host -AsSecureString "Podaj Production CRON_SECRET (nie bedzie widoczny na ekranie)"

$cronSecretPlain = $null
$statusCode = $null
$rawBody = $null
$contentType = $null
$requestFailed = $false
$failureMessage = $null

try {
    $cronSecretPlain = ConvertFrom-SecureStringPlain -Secure $cronSecretSecure

    $headers = @{
        "Authorization" = "Bearer $cronSecretPlain"
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
    Remove-Variable -Name cronSecretPlain -ErrorAction SilentlyContinue
    Remove-Variable -Name cronSecretSecure -ErrorAction SilentlyContinue
    Remove-Variable -Name headers -ErrorAction SilentlyContinue
    try { Set-Clipboard -Value $null -ErrorAction SilentlyContinue } catch {}
    [System.GC]::Collect()
}

Write-Host ""
Write-Host "=== Wynik ==="

if ($requestFailed) {
    Write-Host "FAIL - request could not be completed. Bezpieczny komunikat: $failureMessage" -ForegroundColor Red
    Write-Host ""
    Write-Host "DO NOT RUN AGAIN" -ForegroundColor Yellow
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
    $reason = "response Content-Type is not application/json (could be an HTML error/protection page) - cannot be PASS"
} elseif ($null -eq $parsed) {
    $reason = "response body did not parse as JSON - cannot be PASS"
} elseif ($statusCode -eq 401) {
    $reason = "HTTP 401 Unauthorized - CRON_SECRET mismatch or misconfiguration - cannot be PASS"
} elseif ($statusCode -eq 404) {
    $reason = "HTTP 404 Not Found - route missing on this deployment - cannot be PASS"
} elseif ($statusCode -eq 500) {
    $reason = "HTTP 500 Internal Server Error - cannot be PASS"
} elseif ($statusCode -ne $ExpectedStatusCode) {
    $reason = "HTTP status $statusCode does not match expected $ExpectedStatusCode"
} elseif ($parsed.ok -ne $ExpectedOkValue) {
    $reason = "JSON 'ok' field is not exactly `$true"
} elseif ($parsed.dryRun -ne $ExpectedDryRunValue) {
    $reason = "JSON 'dryRun' field is not exactly `$true"
} elseif ($parsed.savedCandidates -ne $ExpectedSavedCandidates) {
    $reason = "JSON 'savedCandidates' is not exactly 0 - this would mean the route wrote something, which must never happen"
} elseif ($parsed.savedSourceChecks -ne $ExpectedSavedSourceChecks) {
    $reason = "JSON 'savedSourceChecks' is not exactly 0 - this would mean the route wrote something, which must never happen"
} elseif ($parsed.published -ne $ExpectedPublishedValue) {
    $reason = "JSON 'published' is not exactly `$false - this must never happen on this route"
} elseif ($null -eq $parsed.checkedSources -or $null -eq $parsed.results) {
    $reason = "response is missing expected dry-run fields (checkedSources/results) - unexpected shape, cannot be PASS"
} else {
    $pass = $true
}

if ($pass) {
    Write-Host "PASS - genuine Production dry-run confirmed (200, ok=true, dryRun=true, savedCandidates=0, savedSourceChecks=0, published=false)." -ForegroundColor Green
} else {
    Write-Host "FAIL - $reason" -ForegroundColor Red
    Write-Host "Do not treat this as confirmation of safe dry-run behavior. Stop and investigate before any further action." -ForegroundColor Red
}

Write-Host ""
Write-Host "=====================================================" -ForegroundColor Yellow
Write-Host " DO NOT RUN AGAIN - this was a single, one-off, manually" -ForegroundColor Yellow
Write-Host " approved Production validation. Re-running requires a" -ForegroundColor Yellow
Write-Host " fresh, separate decision, not a retry of this script." -ForegroundColor Yellow
Write-Host "=====================================================" -ForegroundColor Yellow
