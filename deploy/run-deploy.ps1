# ============================================================
# saixt 生产一键部署（本地 Windows 入口）
# 用法:  powershell -File run-deploy.ps1 [--force-build]
# 流程: 本地打 bundle -> scp 上传 -> 远端执行 deploy.sh
# ============================================================
param([switch]$ForceBuild)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$key  = "$env:USERPROFILE\.ssh\AIzjgk_123.pem"
$host = 'ubuntu@62.234.79.165'
$bundle = "$env:TEMP\saixt.bundle"

Write-Host "[1/3] 本地生成 bundle (master) ..."
git -C $root bundle create $bundle master | Out-Null
Write-Host "      bundle: $((Get-Item $bundle).Length) bytes"

Write-Host "[2/3] 上传 bundle 与部署脚本 ..."
scp -i $key -o StrictHostKeyChecking=no $bundle "${host}:/tmp/saixt.bundle"
scp -i $key -o StrictHostKeyChecking=no "$root\deploy\deploy.sh" "${host}:/tmp/deploy.sh"
ssh -i $key -o StrictHostKeyChecking=no $host "mkdir -p /opt/saixt/deploy && cp /tmp/deploy.sh /opt/saixt/deploy/deploy.sh && chmod +x /opt/saixt/deploy/deploy.sh"

Write-Host "[3/3] 远端执行部署 ..."
$args = "/tmp/saixt.bundle"
if ($ForceBuild) { $args += " --force-build" }
ssh -i $key -o StrictHostKeyChecking=no $host "bash /opt/saixt/deploy/deploy.sh $args"
Write-Host "DONE"
