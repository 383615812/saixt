# 后台自动补推：每 40s 重试 git push 直到所有本地提交入库，成功即退出
$ErrorActionPreference = 'SilentlyContinue'
Set-Location 'E:\saixt'
$logPath = Join-Path $env:TEMP 'push_ok.log'
$deadline = (Get-Date).AddHours(3)
$i = 0
while ($true) {
  $i++
  $out = git push origin master 2>&1 | Out-String
  if ($LASTEXITCODE -eq 0) {
    ("PUSH-OK [$i] {0}`n{1}" -f (Get-Date -Format 'HH:mm:ss'), $out) | Set-Content -Path $logPath
    Write-Output "PUSH-OK [$i] $(Get-Date -Format HH:mm:ss)"
    exit 0
  }
  if ($out -match 'up to date|up-to-date') {
    "PUSH-OK(up-to-date) [$i] $(Get-Date -Format HH:mm:ss)" | Set-Content -Path $logPath
    exit 0
  }
  if ((Get-Date) -gt $deadline) {
    "PUSH-TIMEOUT [$i] 已达3小时上限" | Set-Content -Path $logPath
    exit 1
  }
  Start-Sleep -Seconds 40
}