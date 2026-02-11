param(
  [string]$ProjectRoot = "C:\Apps\insidernews-ai-publisher",
  [string]$NodeExe = "node"
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

if (-not (Test-Path $ProjectRoot)) {
  throw "ProjectRoot not found: $ProjectRoot"
}

Set-Location $ProjectRoot

$envFile = Join-Path $ProjectRoot "config\publisher.env.ps1"
if (-not (Test-Path $envFile)) {
  throw "Missing config file: $envFile"
}

$logDir = Join-Path $ProjectRoot "logs"
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$stamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$logFile = Join-Path $logDir "publisher_$stamp.log"

$mutexName = "Global\InsiderNewsPublisherLock"
$createdNew = $false
$mutex = New-Object System.Threading.Mutex($false, $mutexName, [ref]$createdNew)
$hasLock = $false

try {
  $hasLock = $mutex.WaitOne(0)
  if (-not $hasLock) {
    $msg = "[{0}] Skip: another publisher instance is already running." -f (Get-Date -Format "s")
    $msg | Tee-Object -FilePath $logFile
    exit 0
  }

  . $envFile

  $startMsg = "[{0}] START node src/index.js" -f (Get-Date -Format "s")
  $startMsg | Tee-Object -FilePath $logFile

  if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
    $global:PSNativeCommandUseErrorActionPreference = $false
  }

  $oldErrorActionPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = "Continue"
    & $NodeExe "src/index.js" *>&1 | Tee-Object -FilePath $logFile -Append
  }
  finally {
    $ErrorActionPreference = $oldErrorActionPreference
  }
  $exitCode = if ($LASTEXITCODE -ne $null) { [int]$LASTEXITCODE } else { 0 }

  $endMsg = "[{0}] END exit={1}" -f (Get-Date -Format "s"), $exitCode
  $endMsg | Tee-Object -FilePath $logFile -Append
  exit $exitCode
}
catch {
  $errMsg = "[{0}] ERROR: {1}" -f (Get-Date -Format "s"), $_.Exception.Message
  $errMsg | Tee-Object -FilePath $logFile -Append
  exit 1
}
finally {
  if ($hasLock) {
    $mutex.ReleaseMutex() | Out-Null
  }
  if ($null -ne $mutex) {
    $mutex.Dispose()
  }
}

