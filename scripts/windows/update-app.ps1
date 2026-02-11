param(
  [string]$ProjectRoot = "C:\Apps\insidernews-ai-publisher",
  [switch]$RunAfterUpdate
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $ProjectRoot)) {
  throw "ProjectRoot not found: $ProjectRoot"
}

Set-Location $ProjectRoot

Write-Host "===> Fetch origin/main"
git fetch origin main

Write-Host "===> Pull origin/main"
git pull origin main

Write-Host "===> Install/update dependencies"
npm install

if ($RunAfterUpdate) {
  Write-Host "===> Run publisher once after update"
  powershell -NoProfile -ExecutionPolicy Bypass -File "$ProjectRoot\scripts\windows\run-publisher.ps1" -ProjectRoot $ProjectRoot
}

Write-Host "Update complete."

