$env:PATH = "C:\Program Files\nodejs;$env:PATH"
Set-Location -Path 'C:\Users\chiba\work\synapse\scripts\synapse-agent'
$logDir = Join-Path $PSScriptRoot 'logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
$logFile = Join-Path $logDir ("archive-chat-" + (Get-Date -Format 'yyyyMMdd') + ".log")
"=== run-archive-chat start $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ===" | Add-Content $logFile -Encoding UTF8
cmd /c npm run archive-chat >> $logFile 2>&1
"=== run-archive-chat exit code: $LASTEXITCODE at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ===" | Add-Content $logFile -Encoding UTF8
exit $LASTEXITCODE
