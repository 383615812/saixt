#!/usr/bin/env bash
# ============================================================================
# 职教路由 IDOR 监控（只读、不阻断） —— 幂等部署脚本
#
# 做什么：
#   1) 给 /opt/ynva/main.py 注入 IdorMonitorMiddleware：
#      对 /api/users/{id}/... 这类「身份取自路径 user_id、无服务端会话鉴权」的路由，
#      仅记录 (epoch, 客户端IP, 访问的 user_id, method, path) 到
#      /var/log/ynva/idor-monitor.log；不改写、不拦截任何请求，不破坏多学生切换设计。
#   2) 建 /var/log/ynva（ubuntu:ubuntu, 755）并部署 logrotate（10M×4，copytruncate）。
#   3) 部署 ynva-idor-scan.sh 到 /home/ubuntu，并加每 10 分钟 cron 做疑似枚举检测。
#   4) 重启职教服务并验证监控日志真实落盘。
#
# 不做什么：不开启鉴权、不改动任何业务路由、不阻断任何 IP。
# 回滚：sudo cp /opt/ynva/main.py.bak.idor.<ts> /opt/ynva/main.py && sudo systemctl restart yn-vocational-agent
# ============================================================================
set -uo pipefail
TS=$(date +%s)
MAIN=/opt/ynva/main.py
BACKUP="$MAIN.bak.idor.$TS"
SCAN=/home/ubuntu/ynva-idor-scan.sh

echo "=== [0] 备份 main.py ==="
sudo cp -p "$MAIN" "$BACKUP" && echo "  $BACKUP"

echo "=== [1] 注入 IdorMonitorMiddleware（幂等）==="
sudo python3 - "$MAIN" <<'PY'
import io, sys
p = sys.argv[1]
s = io.open(p, encoding='utf-8').read()
if 'class IdorMonitorMiddleware' in s:
    print("SKIP: middleware already present")
    sys.exit(0)
if '# API 速率限制' not in s:
    print("ERR: anchor '# API 速率限制' not found")
    sys.exit(2)

block = '''\
# ---------------------------------------------------------------------------
# IDOR 监控中间件（只读、不阻断）
# 针对 /api/users/{id}/... 这类「身份取自路径 user_id、无服务端会话鉴权」的路由，
# 记录 (epoch秒, 客户端IP, 访问的 user_id, method, path) 到 /var/log/ynva/idor-monitor.log，
# 供 ynva-idor-scan.sh 离线检测单 IP 短时间内触碰过多不同 user_id 的疑似越权枚举。
# 本中间件只记录、不改写、不拦截任何请求，绝不破坏现有多学生切换设计。
# ---------------------------------------------------------------------------
import time
from starlette.middleware.base import BaseHTTPMiddleware

_IDOR_LOG = "/var/log/ynva/idor-monitor.log"
_USER_RES_RE = re.compile(r"^/api/users/(\\d+)(?:/|$)")

try:
    os.makedirs(os.path.dirname(_IDOR_LOG), exist_ok=True)
except OSError:
    pass


class IdorMonitorMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        m = _USER_RES_RE.match(request.url.path)
        if m:
            try:
                ts = int(time.time())
                with open(_IDOR_LOG, "a", encoding="utf-8") as _f:
                    print(f"{ts}\\tip={_client_ip(request)}\\tuid={m.group(1)}\\tmethod={request.method}\\tpath={request.url.path}", file=_f)
            except OSError:
                pass
        return await call_next(request)


app.add_middleware(IdorMonitorMiddleware)

# API 速率限制
'''
s = s.replace('# API 速率限制', block, 1)
io.open(p, 'w', encoding='utf-8').write(s)
print("PATCHED")
PY

echo "=== [2] 语法/导入预检 ==="
sudo /opt/ynva/.venv/bin/python3 -m py_compile "$MAIN" && echo "COMPILE_OK"

echo "=== [3] 目录 + logrotate ==="
sudo mkdir -p /var/log/ynva
sudo chown ubuntu:ubuntu /var/log/ynva
sudo chmod 755 /var/log/ynva
sudo tee /etc/logrotate.d/ynva-idor >/dev/null <<'ROT'
/var/log/ynva/idor-monitor.log {
    missingok
    notifempty
    size 10M
    rotate 4
    copytruncate
    compress
    delaycompress
}
ROT
echo "  logrotate installed"

echo "=== [4] 部署扫描脚本 + cron ==="
sudo cp -p "$(dirname "$0")/ynva-idor-scan.sh" "$SCAN" 2>/dev/null || sudo cp -p /tmp/ynva-idor-scan.sh "$SCAN" 2>/dev/null || echo "  WARN: 未能从本地复制，请在服务器上手动放置 ynva-idor-scan.sh"
sudo chmod 755 "$SCAN"
# 幂等加入 cron（ubuntu 用户）
if ! sudo crontab -u ubuntu -l 2>/dev/null | grep -q "ynva-idor-scan.sh"; then
  (sudo crontab -u ubuntu -l 2>/dev/null; echo "*/10 * * * * $SCAN >/dev/null 2>&1") | sudo crontab -u ubuntu -
  echo "  cron 已添加（每10分钟）"
else
  echo "  cron 已存在，跳过"
fi

echo "=== [5] 重启职教服务 ==="
sudo systemctl restart yn-vocational-agent
sleep 6
systemctl is-active yn-vocational-agent

echo "=== [6] 验证监控日志落盘（请求一个 user 路由，应产生一条日志）==="
curl -s -o /dev/null -w "GET /api/users/1/daily-stats -> %{http_code}\n" http://127.0.0.1:8000/api/users/1/daily-stats
sleep 1
echo "--- 最新监控日志行 ---"
sudo tail -n 3 /var/log/ynva/idor-monitor.log 2>/dev/null || echo "（暂无日志，检查中间件是否生效）"
echo "--- 立即跑一次扫描（应 OK）---"
sudo -u ubuntu bash "$SCAN" || true

echo "=== 完成。回滚：sudo cp $BACKUP $MAIN && sudo systemctl restart yn-vocational-agent ==="
