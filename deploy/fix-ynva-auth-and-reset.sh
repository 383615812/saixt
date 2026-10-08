#!/usr/bin/env bash
# 职教（/opt/ynva，FastAPI）安全收口：
#   A) /api/system/reset 改为「默认拒绝」——只有显式设置 ALLOW_DB_RESET=1 才允许执行，生产一律 404
#   B) 三个此前完全没有限流的端点补齐频率限制：
#        POST /api/auth/login                  （可无限撞库）
#        POST /api/auth/register               （可批量注册）
#        POST /api/users/{id}/ai-generate-questions （直接消耗大模型额度）
#
# 为什么自带限流而不用 slowapi 的 default_limits：
#   项目虽引入 slowapi，但只注册了 Limiter 与异常处理器，**没有挂 SlowAPIMiddleware**，
#   因此 default_limits=["120/minute"] 从未生效（实测连发 130 次全部 200）。
#   这里按春招平台(saixt)同一策略自实现：按 IP 宽限（容忍校园 NAT 下多人同 IP），
#   按账号严格（防单账号跨 IP 分布式爆破）。单进程 uvicorn 部署，内存计数即可。
#
# 幂等；改前备份；语法/导入预检任一失败立即回滚且不重启。
set -euo pipefail

MAIN=/opt/ynva/main.py
TS=$(date +%s)
BAK="$MAIN.bak.security.$TS"
PY=/opt/ynva/.venv/bin/python3

echo "=== [0] 备份 ==="
cp -p "$MAIN" "$BAK"
echo "  $BAK"

echo "=== [1] 打补丁 ==="
OUT=$(python3 - "$MAIN" <<'PY'
import io, sys
p = sys.argv[1]
s = io.open(p, encoding='utf-8').read()

if 'auth_ip_guard' in s:
    print('ALREADY PATCHED')
    raise SystemExit(0)

orig = s
changes = []

# ---- 1) threading ----
if 'import threading' not in s:
    old = 'import logging\n'
    assert old in s, 'logging import 锚点缺失'
    s = s.replace(old, old + 'import threading\n', 1)
    changes.append('import threading')

# ---- 2) 限流助手（必须放在 app = FastAPI( 之前：装饰器在函数定义时求值）----
HELPER = '''# ============================================================
# 频率限制：内存固定窗口计数，按 IP + 按账号双维度
# ------------------------------------------------------------
# 背景：本项目虽引入 slowapi，但未挂 SlowAPIMiddleware，default_limits 从未生效；
# 且 /api/auth/login、/api/auth/register、/api/users/{id}/ai-generate-questions
# 三个端点此前没有任何限流 —— 登录口可被无限制撞库，AI 命题口会直接消耗大模型额度。
# 策略与春招平台(saixt)一致：按 IP 宽限（容忍校园 NAT 下多人同 IP），
# 按账号严格（防单账号跨 IP 分布式爆破）。单进程 uvicorn，内存计数即可。
_AUTH_WINDOWS: Dict[str, list] = {}
_AUTH_LOCK = threading.Lock()


def _rate_throttle(key: str, window_sec: int, max_hits: int) -> None:
    """固定窗口计数；超限抛 429（带 Retry-After），否则放行。"""
    now = datetime.now().timestamp()
    with _AUTH_LOCK:
        if len(_AUTH_WINDOWS) > 5000:      # 机会式清理，避免内存无界增长
            for k in [k for k, v in list(_AUTH_WINDOWS.items()) if v[1] <= now]:
                _AUTH_WINDOWS.pop(k, None)
        rec = _AUTH_WINDOWS.get(key)
        if rec is None or now >= rec[1]:
            rec = [0, now + window_sec]
            _AUTH_WINDOWS[key] = rec
        rec[0] += 1
        if rec[0] > max_hits:
            raise HTTPException(
                status_code=429,
                detail="尝试过于频繁，请稍后再试",
                headers={"Retry-After": str(int(rec[1] - now) + 1)},
            )


def _client_ip(request: Request) -> str:
    """真实客户端 IP：uvicorn 信任 127.0.0.1 传入的 X-Forwarded-For（nginx 已注入）。"""
    ip = request.client.host if request.client else ''
    return (ip or 'unknown').replace('::ffff:', '')


def rate_limit_dep(window_sec: int, max_hits: int, label: str):
    """生成一个「按客户端 IP 限流」的 FastAPI 依赖。"""
    def _dep(request: Request) -> None:
        _rate_throttle(f"{label}|ip:{_client_ip(request)}", window_sec, max_hits)
    return _dep


auth_ip_guard = rate_limit_dep(600, 60, "auth")   # 登录/注册：每 IP 10 分钟 60 次
ai_ip_guard = rate_limit_dep(60, 5, "ai_gen")     # AI 命题：每 IP 每分钟 5 次


def auth_user_guard(username: str) -> None:
    """登录：同账号 10 分钟最多 10 次（跨 IP 聚合，防分布式爆破）。"""
    _rate_throttle(f"auth|user:{(username or '').strip().lower()}", 600, 10)


'''
anchor = 'app = FastAPI('
assert anchor in s, 'app = FastAPI( 锚点缺失'
s = s.replace(anchor, HELPER + anchor, 1)
changes.append('限流助手')

# ---- 3) register ----
old = 'def register(req: RegisterRequest, db: Session = Depends(get_db)):\n    """用户注册"""'
new = ('def register(req: RegisterRequest, db: Session = Depends(get_db),\n'
       '             _rl: None = Depends(auth_ip_guard)):\n'
       '    """用户注册（按 IP 限流，防批量注册）"""')
assert old in s, 'register 锚点缺失'
s = s.replace(old, new, 1)
changes.append('register 限流')

# ---- 4) login（IP + 账号双维度）----
old = ('def login(req: LoginRequest, db: Session = Depends(get_db)):\n'
       '    """用户登录"""\n'
       '    user = db.query(User).filter(User.username == req.username).first()')
new = ('def login(req: LoginRequest, db: Session = Depends(get_db),\n'
       '          _rl: None = Depends(auth_ip_guard)):\n'
       '    """用户登录（按 IP + 按账号双维度限流，防撞库/爆破）"""\n'
       '    auth_user_guard(req.username)\n'
       '    user = db.query(User).filter(User.username == req.username).first()')
assert old in s, 'login 锚点缺失'
s = s.replace(old, new, 1)
changes.append('login 限流')

# ---- 5) AI 命题 ----
old = ('def ai_generate_questions(\n'
       '    body: dict,\n'
       '    user_id: int,\n'
       '    db: Session = Depends(get_db),\n'
       '):')
new = ('def ai_generate_questions(\n'
       '    body: dict,\n'
       '    user_id: int,\n'
       '    db: Session = Depends(get_db),\n'
       '    _rl: None = Depends(ai_ip_guard),\n'
       '):')
assert old in s, 'ai_generate_questions 锚点缺失'
s = s.replace(old, new, 1)
changes.append('AI命题 限流')

# ---- 6) system/reset 生产门禁 ----
old = ('@app.get("/api/system/reset")\n'
       'def reset_system(db: Session = Depends(get_db)):\n'
       '    """重置数据库（开发用）"""\n'
       '    seed_database()\n'
       '    return {"message": "数据库已重置", "status": "success"}')
new = ('@app.get("/api/system/reset")\n'
       'def reset_system(db: Session = Depends(get_db)):\n'
       '    """重置数据库（仅限本地开发）。\n'
       '\n'
       '    安全说明：该端点原为【公开 GET + 零鉴权】，一次请求即执行 reset_db() 重建整库，\n'
       '    属数据销毁级风险（且 /openapi.json、/docs 公开可见，可被一键触发）。\n'
       '    现改为默认拒绝：仅当显式设置 ALLOW_DB_RESET=1 时才执行；生产环境一律 404。\n'
       '    """\n'
       '    if os.getenv("ALLOW_DB_RESET") != "1":\n'
       '        raise HTTPException(status_code=404, detail="Not Found")\n'
       '    seed_database()\n'
       '    return {"message": "数据库已重置", "status": "success"}')
assert old in s, 'system/reset 锚点缺失'
s = s.replace(old, new, 1)
changes.append('system/reset 生产门禁')

assert s != orig, '无改动'
io.open(p, 'w', encoding='utf-8').write(s)
print('CHANGES: ' + ', '.join(changes))
PY
)
echo "$OUT"

# 注意：不用 `printf | grep -q` 判分支 —— set -o pipefail 下 grep 命中即退出会让 printf 吃
# SIGPIPE(141)，整条管道被判失败（本项目监控脚本已踩过一次，勿复发）。
case "$OUT" in
  *CHANGES:*) : ;;
  *) echo "=== 无改动（已打过补丁），跳过预检与重启 ==="; exit 0 ;;
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

echo "=== [5] 校验（同一台机器直连 8000，绕过 nginx）==="
echo -n "  /health                             -> "
curl -s -o /dev/null -w '%{http_code}\n' -m 15 http://127.0.0.1:8000/health
echo -n "  /api/system/reset (OPTIONS 安全探测) -> "
curl -s -o /dev/null -w '%{http_code}\n' -m 15 -X OPTIONS http://127.0.0.1:8000/api/system/reset
echo -n "  /api/system/reset (GET 应用层门禁)   -> "
curl -s -o /dev/null -w '%{http_code}\n' -m 15 http://127.0.0.1:8000/api/system/reset
echo -n "  login 错密码                        -> "
curl -s -o /dev/null -w '%{http_code}\n' -m 20 -X POST -H 'Content-Type: application/json' \
  -d '{"username":"demo_student","password":"wrong"}' http://127.0.0.1:8000/api/auth/login
echo -n "  登录第 11 次（应 429）               -> "
for i in $(seq 1 11); do
  c=$(curl -s -o /dev/null -w '%{http_code}' -m 20 -X POST -H 'Content-Type: application/json' \
      -d '{"username":"__rl_probe__","password":"x"}' http://127.0.0.1:8000/api/auth/login)
done
echo "$c"
echo -n "  AI命题第 6 次（空 subject，应 429，不调大模型）-> "
for i in $(seq 1 6); do
  c=$(curl -s -o /dev/null -w '%{http_code}' -m 20 -X POST -H 'Content-Type: application/json' \
      -d '{}' http://127.0.0.1:8000/api/users/1/ai-generate-questions)
done
echo "$c"
