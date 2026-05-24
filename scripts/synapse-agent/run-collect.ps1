$env:PATH = "C:\Program Files\nodejs;$env:PATH"
Set-Location -Path 'C:\Users\chiba\work\synapse\scripts\synapse-agent'
$logDir = Join-Path $PSScriptRoot 'logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
$logFile = Join-Path $logDir ("collect-" + (Get-Date -Format 'yyyyMMdd') + ".log")
"=== run-collect start $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ===" | Add-Content $logFile -Encoding UTF8
cmd /c npm run collect >> $logFile 2>&1
"=== run-collect exit code: $LASTEXITCODE at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ===" | Add-Content $logFile -Encoding UTF8
exit $LASTEXITCODE
