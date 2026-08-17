# scripts/deploy.ps1
# Triggers a Render deploy via Deploy Hook or Render API.
#
# SETUP (one-time):
#   1. Go to https://dashboard.render.com → cinemachat-server → Settings
#   2. Under "Build & Deploy" click "Deploy Hook" → Copy the URL
#   3. Save it as an env var or paste below:
#
# USAGE:
#   .\scripts\deploy.ps1
#   .\scripts\deploy.ps1 -HookUrl "https://api.render.com/deploy?key=YOUR_KEY"

param(
  [string]$HookUrl = $env:RENDER_DEPLOY_HOOK,
  [string]$ServiceId = $env:RENDER_SERVICE_ID,
  [string]$ApiKey = $env:RENDER_API_KEY
)

$ErrorActionPreference = "Stop"

# Auto-load .env.local if present (gitignored)
$envLocal = Join-Path $PSScriptRoot ".env.local"
if (Test-Path $envLocal) {
  Get-Content $envLocal | ForEach-Object {
    if ($_ -match "^\s*([^#][^=]+)=(.+)$") {
      $key = $Matches[1].Trim()
      $val = $Matches[2].Trim()
      if (-not [System.Environment]::GetEnvironmentVariable($key)) {
        [System.Environment]::SetEnvironmentVariable($key, $val, "Process")
      }
    }
  }
  Write-Host "Loaded .env.local" -ForegroundColor DarkGray
}

# --- Method 1: Deploy Hook (simplest, no API key needed) ---
if ($HookUrl) {
  Write-Host "Triggering Render deploy via hook..." -ForegroundColor Cyan
  try {
    $resp = Invoke-WebRequest -Uri $HookUrl -Method POST -UseBasicParsing -TimeoutSec 30
    Write-Host "Deploy triggered! Status: $($resp.StatusCode)" -ForegroundColor Green
    Write-Host "Render will build and deploy the latest commit on main." -ForegroundColor Gray
    exit 0
  } catch {
    Write-Host "Deploy hook failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
  }
}

# --- Method 2: Render API (needs RENDER_API_KEY + RENDER_SERVICE_ID) ---
if ($ApiKey -and $ServiceId) {
  Write-Host "Triggering Render deploy via API..." -ForegroundColor Cyan
  $headers = @{ "Authorization" = "Bearer $ApiKey"; "Content-Type" = "application/json" }
  $body = @{ service_id = $ServiceId } | ConvertTo-Json
  try {
    $resp = Invoke-WebRequest -Uri "https://api.render.com/v1/services/$ServiceId/deploys" -Method POST -Headers $headers -Body $body -UseBasicParsing -TimeoutSec 30
    $deploy = $resp.Content | ConvertFrom-Json
    Write-Host "Deploy triggered! ID: $($deploy.id) Status: $($deploy.status)" -ForegroundColor Green
    exit 0
  } catch {
    Write-Host "API deploy failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
  }
}

# --- No credentials configured ---
Write-Host ""
Write-Host "ERROR: No Render credentials found." -ForegroundColor Red
Write-Host ""
Write-Host "Setup options (pick one):" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Option A - Deploy Hook (easiest):" -ForegroundColor White
Write-Host "    1. Go to https://dashboard.render.com" -ForegroundColor Gray
Write-Host "    2. cinemachat-server -> Settings -> Build & Deploy -> Deploy Hook" -ForegroundColor Gray
Write-Host "    3. Copy the URL" -ForegroundColor Gray
Write-Host "    4. Run: `$env:RENDER_DEPLOY_HOOK = 'https://api.render.com/deploy?key=xxx'" -ForegroundColor Gray
Write-Host "    5. Then: .\scripts\deploy.ps1" -ForegroundColor Gray
Write-Host ""
Write-Host "  Option B - Render API:" -ForegroundColor White
Write-Host "    1. Go to https://dashboard.render.com/account#api-keys" -ForegroundColor Gray
Write-Host "    2. Create an API key" -ForegroundColor Gray
Write-Host "    3. Run:" -ForegroundColor Gray
Write-Host "       `$env:RENDER_API_KEY = 'rnd_xxx'" -ForegroundColor Gray
Write-Host "       `$env:RENDER_SERVICE_ID = 'srv-xxx'" -ForegroundColor Gray
Write-Host "    4. Then: .\scripts\deploy.ps1" -ForegroundColor Gray
Write-Host ""
Write-Host "  Option C - Set permanently in .env.local (gitignored):" -ForegroundColor White
Write-Host "    Add to scripts/.env.local:" -ForegroundColor Gray
Write-Host "    RENDER_DEPLOY_HOOK=https://api.render.com/deploy?key=xxx" -ForegroundColor Gray
Write-Host "    This script auto-loads from .env.local if present." -ForegroundColor Gray

exit 1
