param(
  [int]$Port = 5173
)

$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $projectRoot

function Resolve-CloudflaredPath {
  if ($env:CLOUDFLARED_BIN -and (Test-Path $env:CLOUDFLARED_BIN)) {
    return $env:CLOUDFLARED_BIN
  }

  $knownPaths = @(
    "C:\Program Files\cloudflared\cloudflared.exe",
    "$env:USERPROFILE\Downloads\cloudflared.exe",
    "$env:USERPROFILE\Desktop\cloudflared.exe"
  )

  foreach ($path in $knownPaths) {
    if ($path -and (Test-Path $path)) {
      return $path
    }
  }

  $cmd = Get-Command cloudflared -ErrorAction SilentlyContinue
  if ($cmd) {
    return $cmd.Source
  }

  throw "cloudflared executable not found. Set CLOUDFLARED_BIN to the full path of cloudflared.exe."
}

function Set-EnvValue([string]$filePath, [string]$key, [string]$value) {
  $lines = @()
  if (Test-Path $filePath) {
    $lines = Get-Content $filePath
  }

  $updated = $false
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match "^\Q$key\E=") {
      $lines[$i] = "$key=$value"
      $updated = $true
      break
    }
  }

  if (-not $updated) {
    $lines += "$key=$value"
  }

  Set-Content -Path $filePath -Value $lines
}

function Find-TunnelUrl([string[]]$paths) {
  foreach ($path in $paths) {
    if (-not (Test-Path $path)) { continue }
    $content = Get-Content $path -Raw -ErrorAction SilentlyContinue
    if (-not $content) { continue }
    $match = [regex]::Match($content, "https://[-a-zA-Z0-9.]+\.trycloudflare\.com")
    if ($match.Success) {
      return $match.Value
    }
  }
  return $null
}

$cloudflaredPath = Resolve-CloudflaredPath
$logDir = Join-Path $projectRoot ".cloudflare"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$stdoutLog = Join-Path $logDir "tunnel.out.log"
$stderrLog = Join-Path $logDir "tunnel.err.log"
Remove-Item -Path $stdoutLog, $stderrLog -Force -ErrorAction SilentlyContinue

Write-Host "Starting Cloudflare tunnel with $cloudflaredPath on port $Port ..."
Start-Process `
  -FilePath $cloudflaredPath `
  -ArgumentList @("tunnel", "--url", "http://localhost:$Port") `
  -RedirectStandardOutput $stdoutLog `
  -RedirectStandardError $stderrLog `
  -WindowStyle Hidden

$publicUrl = $null
for ($attempt = 0; $attempt -lt 60; $attempt++) {
  Start-Sleep -Milliseconds 500
  $publicUrl = Find-TunnelUrl -paths @($stdoutLog, $stderrLog)
  if ($publicUrl) { break }
}

if (-not $publicUrl) {
  throw "Could not find the Cloudflare public URL. Check $stderrLog"
}

$envFile = Join-Path $projectRoot ".env"
Set-EnvValue -filePath $envFile -key "PUBLIC_APP_URL" -value $publicUrl
Set-EnvValue -filePath $envFile -key "PUBLIC_SERVER_URL" -value $publicUrl
Set-EnvValue -filePath $envFile -key "PUBLIC_WEB_BASE_URL" -value $publicUrl
Set-EnvValue -filePath $envFile -key "VITE_PUBLIC_APP_URL" -value $publicUrl
Set-EnvValue -filePath $envFile -key "VITE_API_URL" -value $publicUrl

Write-Host "Cloudflare public URL: $publicUrl"
Write-Host ".env updated for QR ticket downloads."
Write-Host "Restart the API and Vite dev server so they reload .env, then open the public URL on your phone."
