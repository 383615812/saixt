#!/usr/bin/env bash
# ============================================================
# saixt 生产部署脚本（在服务器上以 ubuntu 用户执行）
# 用法:
#   bash deploy.sh /tmp/saixt.bundle [--force-build]
# 前置:
#   - 本地已生成 bundle: git bundle create saixt.bundle master
#   - bundle 已上传到服务器 /tmp/saixt.bundle
# 行为:
#   1. 变更感知: 仅当 server/ 有变更才 pm2 reload; 仅当 web/ 有变更才构建前端
#   2. 部署前自动备份数据库与旧 dist（backups/<时间戳>/）
#   3. 失败自动回滚（恢复数据库/旧 dist，git 回到部署前提交）
# 注意: 全程以 ubuntu 身份运行（git/npm/pm2 属主保持一致）；
#       勿用 sudo 执行，否则 pm2 找不到 ubuntu 的进程、文件属主被改乱。
# ============================================================
set -euo pipefail

APP=/opt/saixt
BUNDLE=${1:?用法: bash deploy.sh <bundle路径> [--force-build]}
FORCE_BUILD=0
[ "${2:-}" = "--force-build" ] && FORCE_BUILD=1

cd "$APP"
[ -d .git ] || { echo "FATAL: $APP 不是 git 仓库"; exit 1; }
[ -f "$BUNDLE" ] || { echo "FATAL: bundle 不存在: $BUNDLE"; exit 1; }

TS=$(date +%Y%m%d_%H%M%S)
BK="$APP/backups/$TS"
PREV=$(git rev-parse HEAD)
LOG="$BK/deploy.log"
mkdir -p "$BK"

echo "[deploy] 部署开始 $(date '+%F %T') 当前: ${PREV:0:7}" | tee -a "$LOG"

# ---- 1. 拉取新代码 ----
git fetch "$BUNDLE" master >>"$LOG" 2>&1 || { echo "FATAL: bundle 拉取失败"; exit 1; }
NEW=$(git rev-parse FETCH_HEAD)
if [ "$PREV" = "$NEW" ] && [ "$FORCE_BUILD" != "1" ]; then
  echo "[deploy] 无新提交（$PREV），跳过部署" | tee -a "$LOG"
  exit 0
fi

# ---- 2. 变更感知 ----
SERVER_CHANGED=0; WEB_CHANGED=0
git diff --quiet "$PREV" "$NEW" -- server package.json server/package-lock.json 2>/dev/null || SERVER_CHANGED=1
git diff --quiet "$PREV" "$NEW" -- web 2>/dev/null || WEB_CHANGED=1
[ "$FORCE_BUILD" = "1" ] && WEB_CHANGED=1
echo "[deploy] server变更=$SERVER_CHANGED web变更=$WEB_CHANGED" | tee -a "$LOG"

# ---- 3. 备份数据库与旧 dist ----
echo "[deploy] 备份数据库与旧构建产物 -> $BK" | tee -a "$LOG"
cp "$APP/server/data/saixt.db" "$BK/saixt.db"
[ -d "$APP/web/dist" ] && [ "$WEB_CHANGED" = "1" ] && cp -r "$APP/web/dist" "$BK/dist"

rollback() {
  echo "[deploy] !! 部署失败，执行回滚 $PREV" | tee -a "$LOG"
  git reset --hard "$PREV" >>"$LOG" 2>&1
  [ -f "$BK/saixt.db" ] && cp "$BK/saixt.db" "$APP/server/data/saixt.db"
  if [ -d "$BK/dist" ]; then
    sudo rm -rf "$APP/web/dist"
    sudo cp -r "$BK/dist" "$APP/web/dist"
    sudo chown -R ubuntu:ubuntu "$APP/web/dist"
  fi
  pm2 reload saixt-server >>"$LOG" 2>&1 || true
  echo "[deploy] 已回滚到 ${PREV:0:7}，数据库/前端已恢复" | tee -a "$LOG"
  exit 1
}
trap rollback ERR

# ---- 4. 后端代码 + 依赖 + 重启 ----
echo "[deploy] 更新代码到 $NEW" | tee -a "$LOG"
git reset --hard "$NEW" >>"$LOG" 2>&1

if [ "$SERVER_CHANGED" = "1" ]; then
  if ! git diff --quiet "$PREV" "$NEW" -- server/package.json server/package-lock.json 2>/dev/null || [ ! -d server/node_modules ]; then
    echo "[deploy] 后端依赖变化或缺失，npm ci --omit=dev ..." | tee -a "$LOG"
    (cd server && npm ci --omit=dev) >>"$LOG" 2>&1
  fi
  echo "[deploy] pm2 reload saixt-server" | tee -a "$LOG"
  pm2 reload saixt-server >>"$LOG" 2>&1
fi

# ---- 5. 前端构建与部署 ----
if [ "$WEB_CHANGED" = "1" ]; then
  if ! git diff --quiet "$PREV" "$NEW" -- web/package.json web/package-lock.json 2>/dev/null || [ ! -d web/node_modules ]; then
    echo "[deploy] 前端依赖变化或缺失，npm ci ..." | tee -a "$LOG"
    (cd web && npm ci) >>"$LOG" 2>&1
  fi
  # vite 构建需清空旧 dist：旧产物可能属主 www-data（历史手工部署），移交 ubuntu 一次后保持
  if [ -d web/dist ] && [ ! -w web/dist ]; then
    echo "[deploy] web/dist 不可写，chown -> ubuntu" | tee -a "$LOG"
    sudo chown -R ubuntu:ubuntu web/dist
  fi
  echo "[deploy] 前端构建 vite build ..." | tee -a "$LOG"
  (cd web && npm run build) >>"$LOG" 2>&1
  echo "[deploy] 新 dist 已就位（nginx 直接服务 web/dist）" | tee -a "$LOG"
fi

# ---- 6. 健康检查 ----
echo "[deploy] 健康检查 ..." | tee -a "$LOG"
OK=0
for i in 1 2 3 4 5 6; do
  sleep 3
  CODE=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/health || true)
  if [ "$CODE" = "200" ]; then OK=1; break; fi
  echo "[deploy]   health=$CODE 重试 $i/6" | tee -a "$LOG"
done
[ "$OK" = "1" ] || { echo "FATAL: 健康检查未通过"; exit 1; }

echo "[deploy] 部署成功 ${PREV:0:7} -> ${NEW:0:7} 备份: $BK" | tee -a "$LOG"
echo "BACKUP_DIR=$BK" | tee -a "$LOG"
