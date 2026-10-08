#!/usr/bin/env bash
# ============================================================
# saixt 迁移到新服务器(www.xlxzb.com) 一键部署脚本
# ============================================================
# 在【新服务器】上以 root 或具备 sudo 的普通用户执行：
#   bash migrate-to-xlxzb.sh <saixt.bundle> <prod.db> [旧.env路径]
#
# 参数：
#   $1  saixt-xlxzb.bundle   —— 由开发机 `git bundle create` 生成
#   $2  saixt-prod-*.db      —— 由旧服务器 VACUUM INTO 导出的生产库快照
#   $3  (可选) 旧服务器 .env —— 提供则自动搬运密钥并覆盖域名相关字段
#
# 前置（脚本会自检/尝试安装）：
#   - 可访问外网以安装 Node 22 / PM2（Ubuntu apt 或 CentOS yum）
#   - 新服务器 Nginx 已存在（脚本只打印需手工插入的 location 块）
#
# 行为：
#   1) 安装 Node 22 LTS + PM2（若缺失）
#   2) 从 bundle 解出版本到 /opt/saixt
#   3) 安装依赖 + 构建前端(base=/saixt/)
#   4) 生成 /opt/saixt/server/.env（搬运旧密钥 / 套用模板）
#   5) 恢复生产库到 server/data/saixt.db
#   6) PM2 启动 saixt-server
#   7) 自检 /api/health
# ============================================================
set -euo pipefail

APP=/opt/saixt
BUNDLE=${1:?用法: bash $0 <saixt.bundle> <prod.db> [旧.env]}
DBFILE=${2:?缺少生产库快照参数}
OLDENV=${3:-}

echo "==> [0] 参数校验"
[ -f "$BUNDLE" ] || { echo "FATAL: bundle 不存在: $BUNDLE"; exit 1; }
[ -f "$DBFILE" ] || { echo "FATAL: 生产库不存在: $DBFILE"; exit 1; }
command -v git >/dev/null 2>&1 || { echo "FATAL: 需要 git"; exit 1; }

echo "==> [1] 安装 Node 22 LTS + PM2"
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 22 ]; then
  echo "    安装 Node 22 ..."
  if command -v apt-get >/dev/null 2>&1; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
  elif command -v yum >/dev/null 2>&1; then
    curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
    yum install -y nodejs
  else
    echo "FATAL: 未知包管理器，请手动安装 Node 22 LTS"; exit 1
  fi
fi
node -v
command -v pm2 >/dev/null 2>&1 || npm i -g pm2
pm2 -v

echo "==> [2] 从 bundle 解出版本到 $APP"
mkdir -p "$APP"
# bundle 当作 git 仓库直接克隆（bundle 内含完整历史，可 clone）
TMPREPO=$(mktemp -d)
git clone "$BUNDLE" "$TMPREPO" 2>/dev/null
rm -rf "$APP/server" "$APP/web" "$APP/deploy" "$APP/package.json" "$APP/package-lock.json"
cp -a "$TMPREPO/server" "$APP/server"
cp -a "$TMPREPO/web" "$APP/web"
cp -a "$TMPREPO/deploy" "$APP/deploy" 2>/dev/null || true
cp -a "$TMPREPO/package.json" "$APP/package.json" 2>/dev/null || true
cp -a "$TMPREPO/package-lock.json" "$APP/package-lock.json" 2>/dev/null || true
rm -rf "$TMPREPO"
echo "    解出版本: $(git -C "$APP" log --oneline -1 2>/dev/null || echo unknown)"

echo "==> [3] 后端 + 前端依赖安装与构建"
cd "$APP/server" && npm ci --omit=dev
cd "$APP/web" && npm ci && npm run build   # 已含 --base=/saixt/

echo "==> [4] 生成 .env"
mkdir -p "$APP/server/data"
if [ -n "$OLDENV" ] && [ -f "$OLDENV" ]; then
  echo "    从旧 .env 搬运密钥 ..."
  # 先整文件复制，再覆盖域名相关字段
  cp "$OLDENV" "$APP/server/.env"
  sed -i 's#^BASE_URL=.*#BASE_URL=https://www.xlxzb.com#' "$APP/server/.env"
  sed -i 's#^CORS_ORIGIN=.*#CORS_ORIGIN=https://www.xlxzb.com#' "$APP/server/.env"
  sed -i 's#^TRUST_PROXY=.*#TRUST_PROXY=1#' "$APP/server/.env"
  sed -i 's#^NODE_ENV=.*#NODE_ENV=production#' "$APP/server/.env"
  sed -i 's#^PORT=.*#PORT=3000#' "$APP/server/.env"
  # 生产禁用 demo 支付
  sed -i 's#^PAY_PROVIDER=.*#PAY_PROVIDER=wechat#' "$APP/server/.env"
else
  echo "    未提供旧 .env，请手工补全 $APP/server/.env（参考 deploy/.env.xlxzb.example）"
  [ -f "$APP/server/.env" ] || cp "$APP/deploy/.env.xlxzb.example" "$APP/server/.env"
fi

echo "==> [5] 恢复生产库"
cp "$DBFILE" "$APP/server/data/saixt.db"
chmod 600 "$APP/server/data/saixt.db"
echo "    库大小: $(du -h "$APP/server/data/saixt.db" | cut -f1)"

echo "==> [6] PM2 启动"
cd "$APP"
pm2 delete saixt-server 2>/dev/null || true
pm2 start deploy/ecosystem.config.cjs --env production
pm2 save

echo "==> [7] 自检"
OK=0
for i in $(seq 1 6); do
  sleep 3
  CODE=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/health || true)
  if [ "$CODE" = "200" ]; then OK=1; break; fi
  echo "    health=$CODE 重试 $i/6"
done
[ "$OK" = "1" ] || { echo "FATAL: 健康检查未通过，查看 pm2 logs saixt-server"; exit 1; }
echo "    健康检查通过 ✓"

echo ""
echo "============================================================"
echo " 代码/后端/数据库已就位。最后一步（需手工）："
echo " 1) 把 deploy/nginx.xlxzb.saixt.conf 里的两个 location 块"
echo "    插入新服务器 Nginx 现有 'listen 443 ssl' server 块内（在 location / 之前）"
echo " 2) nginx -t && systemctl reload nginx"
echo " 3) 浏览器访问 https://www.xlxzb.com/saixt/ 验证"
echo "============================================================"
