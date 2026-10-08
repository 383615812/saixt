#!/usr/bin/env bash
set -e
APP=/opt/saixt
BUNDLE=/tmp/saixt-xlxzb.bundle
DB=/tmp/saixt-prod-20261008_160429.db
OLDENV=/tmp/old.env
LOG=/tmp/deploy-xlxzb.log
exec >"$LOG" 2>&1

echo "==> [$(date)] 1. 克隆 bundle 解出版本"
sudo mkdir -p "$APP"
sudo chown -R ubuntu:ubuntu "$APP"
rm -rf "$APP/server" "$APP/web" "$APP/deploy" "$APP/package.json" "$APP/package-lock.json"
TMPREPO=$(mktemp -d)
git clone --no-checkout "$BUNDLE" "$TMPREPO" >/dev/null 2>&1
git -C "$TMPREPO" checkout -f master >/dev/null 2>&1
cp -a "$TMPREPO/server" "$APP/server"
cp -a "$TMPREPO/web" "$APP/web"
cp -a "$TMPREPO/deploy" "$APP/deploy"
cp -a "$TMPREPO/package.json" "$APP/package.json" 2>/dev/null || true
cp -a "$TMPREPO/package-lock.json" "$APP/package-lock.json" 2>/dev/null || true
rm -rf "$TMPREPO"
echo "    解压完成: $(ls -d $APP/server $APP/web $APP/deploy 2>/dev/null | tr '\n' ' ')"

echo "==> [$(date)] 2. 恢复生产库"
mkdir -p "$APP/server/data"
cp "$DB" "$APP/server/data/saixt.db"
sudo chown -R ubuntu:ubuntu "$APP/server/data"
echo "    库大小: $(du -h $APP/server/data/saixt.db | cut -f1)"

echo "==> [$(date)] 3. 生成 .env (改写域名, 其余字段原样保留)"
mkdir -p "$APP/server"
sed -E \
  -e 's#^CORS_ORIGIN=.*#CORS_ORIGIN=https://www.xlxzb.com#' \
  -e 's#^BASE_URL=.*#BASE_URL=https://www.xlxzb.com/saixt#' \
  "$OLDENV" > "$APP/server/.env"
echo "    生成 .env 字段: $(grep -oE '^[A-Z_]+=' $APP/server/.env | tr '\n' ' ')"

echo "==> [$(date)] 4. 安装后端依赖"
cd "$APP/server" && npm install --omit=dev 2>&1 | tail -3

echo "==> [$(date)] 5. 安装前端依赖并构建"
cd "$APP/web" && npm install 2>&1 | tail -3
npm run build 2>&1 | tail -6
echo "    构建产物: $(ls $APP/web/dist 2>/dev/null | head -5 | tr '\n' ' ')"

echo "==> [$(date)] 6. 日志目录 + PM2 启动"
sudo mkdir -p /var/log/saixt
sudo chown -R ubuntu:ubuntu /var/log/saixt
cd "$APP"
pm2 delete saixt-server 2>/dev/null || true
pm2 start deploy/ecosystem.config.cjs --env production 2>&1 | tail -12
pm2 save 2>&1 | tail -2

echo "==> [$(date)] DONE"
