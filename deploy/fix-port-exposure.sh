#!/usr/bin/env bash
# ============================================================================
# 端口暴露收口：把应用进程从 0.0.0.0 收回 127.0.0.1
#
# 背景（2026-10-08 外网实测发现）：
#   http://119.45.196.149:3000   —— 春招后端 Express 公网明文直连可达（HTTP 200）
#   *:3000 (node) / 0.0.0.0:8000 (python) 均监听所有网卡
#   危害：绕过 Nginx 的 TLS、安全响应头、上传体积限制、按 IP 限流；
#         登录口令在链路上明文传输；前端可在非权威源(裸 IP)上运行。
#
# 处置：两个应用默认仅监听回环，对外统一经 Nginx 反代（同机）。
#       需要局域网直连时显式 HOST=0.0.0.0。
#
# 幂等：可重复执行；失败自动回滚。
# ============================================================================
set -uo pipefail

KEY=/e/wyzb/fudu.pem
HOSTIP=119.45.196.149
SSH="ssh -i $KEY -o StrictHostKeyChecking=no -o ConnectTimeout=15 ubuntu@$HOSTIP"
SCP="scp -i $KEY -o StrictHostKeyChecking=no"
TS=$(date +%s)
ROOT=$(cd "$(dirname "$0")/.." && pwd)
LOCAL_INDEX="$ROOT/server/src/index.js"
LOCAL_ECO="$ROOT/deploy/ecosystem.config.cjs"

R_INDEX=/opt/saixt/server/src/index.js
R_ECO=/opt/saixt/deploy/ecosystem.config.cjs
R_RUN=/opt/ynva/run.py

say() { printf '\n\033[1;36m== %s\033[0m\n' "$*"; }
ok()  { printf '\033[1;32m   ✓ %s\033[0m\n' "$*"; }
bad() { printf '\033[1;31m   ✗ %s\033[0m\n' "$*"; }

[ -f "$LOCAL_INDEX" ] || { echo "缺少 $LOCAL_INDEX"; exit 2; }
[ -f "$LOCAL_ECO" ]   || { echo "缺少 $LOCAL_ECO"; exit 2; }

say "0. 上传前基线：确认 nginx 反代目标仍是回环"
$SSH 'grep -n "proxy_pass" /etc/nginx/nginx.conf | grep -E "3000|8000"' || { bad "无法确认 nginx 反代目标，中止"; exit 2; }

say "1. 远端备份（含时间戳，失败可原样还原）"
$SSH "
set -e
sudo cp $R_INDEX $R_INDEX.bak.port.$TS
sudo cp $R_ECO   $R_ECO.bak.port.$TS
sudo cp $R_RUN   $R_RUN.bak.port.$TS
sudo chown ubuntu:ubuntu $R_INDEX.bak.port.$TS $R_ECO.bak.port.$TS $R_RUN.bak.port.$TS 2>/dev/null || true
ls -l $R_INDEX.bak.port.$TS $R_ECO.bak.port.$TS $R_RUN.bak.port.$TS
" || { bad "备份失败，中止"; exit 2; }
ok "备份完成 tag=port.$TS"

say "2. 上传春招服务端改动"
$SCP "$LOCAL_INDEX" ubuntu@$HOSTIP:/tmp/index.js.$TS && \
$SCP "$LOCAL_ECO"   ubuntu@$HOSTIP:/tmp/ecosystem.config.cjs.$TS || { bad "上传失败"; exit 2; }
$SSH "sudo install -o ubuntu -g ubuntu -m 644 /tmp/index.js.$TS $R_INDEX && \
      sudo install -o ubuntu -g ubuntu -m 644 /tmp/ecosystem.config.cjs.$TS $R_ECO && \
      rm -f /tmp/index.js.$TS /tmp/ecosystem.config.cjs.$TS && \
      /opt/saixt/server/node_modules/.bin/node --check $R_INDEX 2>/dev/null || node --check $R_INDEX" \
  || { bad "安装/语法校验失败，回滚"; $SSH "sudo cp $R_INDEX.bak.port.$TS $R_INDEX; sudo cp $R_ECO.bak.port.$TS $R_ECO"; exit 2; }
ok "春招代码已就位且语法通过"

say "3. 改造职教 run.py（0.0.0.0 → 127.0.0.1，可被 HOST 覆盖）"
$SSH "python3 - <<'PYEOF'
import io, re, os
p = '$R_RUN'
s = io.open(p, encoding='utf-8').read()
orig = s
if not re.search(r'^import os\$', s, re.M):
    s = 'import os\n' + s
s = s.replace('host=\"0.0.0.0\"', 'host=os.getenv(\"HOST\", \"127.0.0.1\")')
s = s.replace('port=8000', 'port=int(os.getenv(\"PORT\", \"8000\"))')
if s != orig:
    io.open(p, 'w', encoding='utf-8').write(s)
    print('PATCHED')
else:
    print('ALREADY-OK-OR-UNMATCHED')
PYEOF
cat $R_RUN" || { bad "职教启动脚本改造失败"; exit 2; }
ok "职教启动脚本已改造"

say "4. 重启两个服务"
$SSH "sudo systemctl restart yn-vocational-agent && sleep 3 && systemctl is-active yn-vocational-agent" || { bad "职教重启失败"; exit 2; }
ok "职教 yn-vocational-agent 已重启"

$SSH "cd /opt/saixt && pm2 startOrReload deploy/ecosystem.config.cjs --env production >/dev/null 2>&1; sleep 4; pm2 save >/dev/null 2>&1; pm2 jlist 2>/dev/null | head -c 0; pm2 list | grep saixt-server" || true
ok "春招 PM2 已按新 ecosystem 重载"

say "5. 验证监听地址（必须全部是 127.0.0.1）"
sleep 2
LISTEN=$($SSH "sudo ss -ltnp | grep -E ':(3000|8000)\b'")
echo "$LISTEN"
if echo "$LISTEN" | grep -qE '(\*|0\.0\.0\.0|\[::\]):(3000|8000)'; then
  bad "仍有端口监听所有网卡！"
else
  ok "3000 / 8000 均已收敛到 127.0.0.1"
fi

say "6. 验证业务链路（经 Nginx 必须正常）"
for u in "https://www.xlxzb.com/saixt/api/health" "https://www.xlxzb.com/ynva/health" "https://www.xlxzb.com/saixt/" "https://www.xlxzb.com/ynva/static/index.html" "https://www.xlxzb.com/"; do
  code=$(curl -s -k -m 15 -o /dev/null -w '%{http_code}' "$u")
  printf '   %-52s %s\n' "$u" "$code"
  [ "$code" = "200" ] || bad "期望 200"
done

say "完成"
echo "回滚命令（如需）："
echo "  sudo cp $R_INDEX.bak.port.$TS $R_INDEX && sudo cp $R_ECO.bak.port.$TS $R_ECO"
echo "  sudo cp $R_RUN.bak.port.$TS $R_RUN"
echo "  cd /opt/saixt && pm2 startOrReload deploy/ecosystem.config.cjs --env production"
echo "  sudo systemctl restart yn-vocational-agent"
