#!/usr/bin/env bash
# 职教（/opt/ynva，FastAPI）限流「校园 NAT 友好化」收口。
#
# 背景（为什么改）：
#   fix-ynva-auth-and-reset.sh 已给登录/注册/AI 命题三端点加上限流，但当时是「按 IP 限流」：
#     auth_ip_guard = 60/10min/IP
#     ai_ip_guard   = 5/min/IP
#   职教是校园产品，学生多在同一个校园网 NAT 后 —— 全校共享一个公网 IP。
#   这导致：一个机房/班级同时发起请求会从同一个 IP 打限流桶，出现「整班集体 429」：
#     · AI 命题 5/min/IP 最致命：一个班 6 个学生在同一分钟问 AI 题，第 6 个直接 429。
#     · 登录/注册 60/10min/IP：大机房整班登录也可能撞桶。
#
# 修法（IP 宽 / 账号严，与春招 saixt 同一策略）：
#   1. _client_ip 显式读 X-Forwarded-For 兜底：万一某天 uvicorn 关掉 proxy_headers，
#      不至于退化成 127.0.0.1 单一桶（全站集体 429）。正常情况（ProxyHeadersMiddleware
#      默认信任 127.0.0.1）request.client.host 已是真实 IP，行为与之前一致。
#   2. AI 命题改为「按账号限流」：新增 ai_user_guard(user_id) = 8/min/账号，挂在
#      /api/users/{id}/ai-generate-questions 上（user_id 取路径参数，与该站 IDOR 设计一致）。
#      每个学生在自己桶里，整班并发互不干扰；同时 per-IP 抬到 200/min 仅作 DDoS 兜底。
#   3. 登录/注册 per-IP 抬到 300/10min（容忍大机房整班登录），保留 auth_user_guard 10/10min/账号
#      做撞库防护。
#
# 幂等；改前备份；语法/导入预检任一失败立即回滚且不重启。
set -euo pipefail

MAIN=/opt/ynva/main.py
TS=$(date +%s)
BAK="$MAIN.bak.ratelimit-nat.$TS"
PY=/opt/ynva/.venv/bin/python3

echo "=== [0] 备份 ==="
cp -p "$MAIN" "$BAK"
echo "  $BAK"

echo "=== [1] 打补丁 ==="
OUT=$(python3 - "$MAIN" <<'PY'
import io, sys
p = sys.argv[1]
s = io.open(p, encoding='utf-8').read()
orig = s
changed = []

# ---- 1. _client_ip 显式读 XFF 兜底（防御 proxy_headers 被关的退化）----
old_ip = '''def _client_ip(request: Request) -> str:
    """真实客户端 IP：uvicorn 信任 127.0.0.1 传入的 X-Forwarded-For（nginx 已注入）。"""
    ip = request.client.host if request.client else ''
    return (ip or 'unknown').replace('::ffff:', '')'''
new_ip = '''def _client_ip(request: Request) -> str:
    """真实客户端 IP（防御性兜底）。

    nginx 在 127.0.0.1 反代时已注入 X-Forwarded-For（最左=原始客户端）；
    uvicorn ProxyHeadersMiddleware 默认信任 127.0.0.1，会把 scope["client"] 改写为真实 IP，
    因此 request.client.host 即真实客户端 IP。这里再显式读 XFF 作为兜底，
    避免某天 proxy_headers 被关掉后退化成 127.0.0.1 单一桶（全站集体 429）。
    """
    xff = request.headers.get("x-forwarded-for")
    if xff:
        first = xff.split(",")[0].strip()
        if first:
            return first.replace("::ffff:", "")
    ip = request.client.host if request.client else ''
    return (ip or 'unknown').replace('::ffff:', '')'''
if old_ip in s:
    s = s.replace(old_ip, new_ip, 1); changed.append('_client_ip XFF 兜底')
elif 'xff = request.headers.get' in s:
    print('ALREADY PATCHED'); raise SystemExit(0)
else:
    print('ERR: _client_ip 锚点缺失'); raise SystemExit(2)

# ---- 2. 放宽 per-IP 登录/注册限流（容忍校园 NAT 整班）----
if 'rate_limit_dep(600, 60, "auth")' in s:
    s = s.replace('rate_limit_dep(600, 60, "auth")', 'rate_limit_dep(600, 300, "auth")', 1)
    changed.append('auth_ip 60->300/10min')
else:
    print('SKIP auth_ip（已改或锚点变化）')

# ---- 3. per-IP AI 限流抬到粗粒度 DDoS 兜底 ----
if 'rate_limit_dep(60, 5, "ai_gen")' in s:
    s = s.replace('rate_limit_dep(60, 5, "ai_gen")', 'rate_limit_dep(60, 200, "ai_gen_ip")', 1)
    changed.append('ai_ip 5->200/min')
else:
    print('SKIP ai_ip（已改或锚点变化）')

# ---- 4. 新增 per-user AI 限流守卫 ----
anchor = '''def auth_user_guard(username: str) -> None:
    """登录：同账号 10 分钟最多 10 次（跨 IP 聚合，防分布式爆破）。"""
    _rate_throttle(f"auth|user:{(username or '').strip().lower()}", 600, 10)'''
addition = anchor + '''


def ai_user_guard(user_id: int) -> None:
    """AI 命题：同账号每分钟最多 8 次（按账号限流，规避校园 NAT 下整班共用一个 IP 被集体 429）。"""
    _rate_throttle(f"ai|user:{int(user_id)}", 60, 8)'''
if anchor in s and 'def ai_user_guard' not in s:
    s = s.replace(anchor, addition, 1); changed.append('新增 ai_user_guard')
elif 'def ai_user_guard' in s:
    print('ALREADY PATCHED'); raise SystemExit(0)
else:
    print('ERR: auth_user_guard 锚点缺失'); raise SystemExit(2)

# ---- 5. AI 端点同时挂 per-IP + per-user ----
old_ep = '''    _rl: None = Depends(ai_ip_guard),
):'''
new_ep = '''    _rl_ip: None = Depends(ai_ip_guard),
    _rl_user: None = Depends(ai_user_guard),
):'''
if old_ep in s:
    s = s.replace(old_ep, new_ep, 1); changed.append('AI 端点挂 ai_user_guard')
elif '_rl_user: None = Depends(ai_user_guard)' in s:
    print('ALREADY PATCHED'); raise SystemExit(0)
else:
    print('ERR: AI 端点锚点缺失'); raise SystemExit(2)

assert s != orig, '无改动'
io.open(p, 'w', encoding='utf-8').write(s)
print('CHANGES: ' + ', '.join(changed))
PY
)
echo "$OUT"

case "$OUT" in
  *CHANGES:*) : ;;
  *ALREADY*) echo "=== 已打过补丁，跳过预检与重启 ==="; exit 0 ;;
  *) echo "=== 无改动，退出 ==="; exit 0 ;;
esac

echo "=== [2] 语法预检 ==="
PYC=$(mktemp -d)
if ! PYTHONPYCACHEPREFIX="$PYC" "$PY" -m py_compile "$MAIN"; then
  echo "  ✗ 语法错误，回滚"; cp -p "$BAK" "$MAIN"; rm -rf "$PYC"; exit 1
fi
echo "  ✓ 语法 OK"

echo "=== [3] 导入预检（os._exit 硬退出，避免非守护线程挂住）==="
if ! (cd /opt/ynva && PYTHONPATH=/opt/ynva PYTHONPYCACHEPREFIX="$PYC" timeout 120 "$PY" \
        -c "import main, os; print('  ✓ 导入 OK', flush=True); os._exit(0)"); then
  echo "  ✗ 导入失败，回滚"; cp -p "$BAK" "$MAIN"; rm -rf "$PYC"; exit 1
fi
rm -rf "$PYC"

echo "=== [4] 重启服务 ==="
sudo systemctl restart yn-vocational-agent
sleep 5
echo -n "  服务状态: "; systemctl is-active yn-vocational-agent

echo "=== [5] 校验（直连 8000，绕过 nginx）==="
echo -n "  /api/system/ai-models  -> "
curl -s -o /dev/null -w '%{http_code}\n' -m 15 http://127.0.0.1:8000/api/system/ai-models
echo -n "  同一用户 AI 第 9 次（应 429，证 per-user 生效）-> "
for i in $(seq 1 9); do
  c=$(curl -s -o /dev/null -w '%{http_code}' -m 20 -X POST -H 'Content-Type: application/json' \
      -d '{"subject":"语文","num":1}' http://127.0.0.1:8000/api/users/990001/ai-generate-questions)
done
echo "$c"
echo -n "  另一用户 AI 第 1 次（应 200，证非按 IP 整桶）-> "
curl -s -o /dev/null -w '%{http_code}\n' -m 20 -X POST -H 'Content-Type: application/json' \
  -d '{"subject":"数学","num":1}' http://127.0.0.1:8000/api/users/990002/ai-generate-questions
