param(
  [string]$ProjectRoot = "C:\Apps\insidernews-ai-publisher",
  [switch]$RunAfterUpdate,
  [string]$GitExe = "",
  [string]$NpmExe = ""
)

$ErrorActionPreference = "Stop"

function Get-GitCandidatesFromGitHubDesktop {
  $results = @()

  $roots = @()
  if ($env:LOCALAPPDATA) {
    $roots += (Join-Path $env:LOCALAPPDATA "GitHubDesktop")
  }

  $userRoots = Get-ChildItem "C:\Users" -Directory -ErrorAction SilentlyContinue |
    ForEach-Object { Join-Path $_.FullName "AppData\Local\GitHubDesktop" }
  $roots += $userRoots

  foreach ($root in ($roots | Select-Object -Unique)) {
    if (-not (Test-Path $root)) { continue }
    $apps = Get-ChildItem $root -Directory -Filter "app-*" -ErrorAction SilentlyContinue |
      Sort-Object Name -Descending
    foreach ($app in $apps) {
      $candidate = Join-Path $app.FullName "resources\app\git\cmd\git.exe"
      if (Test-Path $candidate) {
        $results += $candidate
      }
    }
  }

  return ($results | Select-Object -Unique)
}

function Resolve-Executable {
  param(
    [string]$ProvidedPath,
    [string]$CommandName,
    [string[]]$Candidates
  )

  if ($ProvidedPath -and (Test-Path $ProvidedPath)) {
    return $ProvidedPath
  }

  $cmd = Get-Command $CommandName -ErrorAction SilentlyContinue
  if ($cmd -and $cmd.Source) {
    return $cmd.Source
  }

  foreach ($candidate in $Candidates) {
    if (Test-Path $candidate) {
      return $candidate
    }
  }

  throw "Cannot find '$CommandName'. Install it or pass -${CommandName}Exe with full path."
}

if (-not (Test-Path $ProjectRoot)) {
  throw "ProjectRoot not found: $ProjectRoot"
}

Set-Location $ProjectRoot

$gitDesktopCandidates = Get-GitCandidatesFromGitHubDesktop
$gitPath = Resolve-Executable -ProvidedPath $GitExe -CommandName "git" -Candidates (
  @(
    "C:\Program Files\Git\cmd\git.exe",
    "C:\Program Files\Git\bin\git.exe",
    "C:\Program Files (x86)\Git\cmd\git.exe",
    "C:\Program Files (x86)\Git\bin\git.exe"
  ) + $gitDesktopCandidates
)
if (-not (Test-Path $gitPath)) {
  throw "Resolved git path does not exist: $gitPath"
}

$npmPath = Resolve-Executable -ProvidedPath $NpmExe -CommandName "npm" -Candidates @(
  "C:\Program Files\nodejs\npm.cmd",
  "C:\Program Files (x86)\nodejs\npm.cmd"
)
if (-not (Test-Path $npmPath)) {
  throw "Resolved npm path does not exist: $npmPath"
}

Write-Host "===> Fetch origin/main"
& $gitPath fetch origin main

Write-Host "===> Pull origin/main"
& $gitPath pull origin main

Write-Host "===> Install/update dependencies"
& $npmPath install

if ($RunAfterUpdate) {
  Write-Host "===> Run publisher once after update"
  powershell -NoProfile -ExecutionPolicy Bypass -File "$ProjectRoot\scripts\windows\run-publisher.ps1" -ProjectRoot $ProjectRoot
}

Write-Host "Update complete."

