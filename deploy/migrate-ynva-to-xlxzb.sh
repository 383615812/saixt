#!/usr/bin/env bash
# ============================================================
# 职教高考学习系统（yn-vocational-agent / 云智学）迁移到新服务器
# 源: 62.234.79.165:/home/ubuntu/yn-vocational-agent (Python3.12 + PG16 + systemd)
# 目标: 119.45.196.149  ->  https://www.xlxzb.com/ynva/
#
# 用法（在有 SSH 私钥的机器上）:
#   bash deploy/migrate-ynva-to-xlxzb.sh
#
# 本脚本只在【新服务器】上执行；旧服务器的导出步骤见文件头注释。
# ============================================================
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

# ---------- 0. 旧服务器导出（在 62.234.79.165 上执行）----------
#   sudo -u postgres pg_dump --no-owner --clean --if-exists yunzhixue > /tmp/ynva_pg.sql
#   cd /home/ubuntu && tar \
#     --exclude='yn-vocational-agent/__pycache__' \
#     --exclude='yn-vocational-agent/*.db*' \
#     --exclude='yn-vocational-agent/data' \
#     --exclude='yn-vocational-agent/backups' \
#     --exclude='yn-vocational-agent/.venv' \
#     --exclude='yn-vocational-agent/*.bak*' \
#     -czf /tmp/ynva_code.tgz yn-vocational-agent
#   # 再把 .env 单独 scp 出来（/home/ubuntu/yn-vocational-agent/.env）
#
# ⚠️ 坑1：打包时不要排除 *.py。requirements-docker.txt 之外还有运行时
#    必import 的模块（seed_data.py / auth.py 依赖的 jose / passlib ...），
#    漏掉会导致 systemd 无限重启 auto-restart。

# ---------- 1. 前置产物 ----------
for f in /tmp/ynva_pg.sql /tmp/ynva_code.tgz /tmp/ynva.env; do
  [ -f "$f" ] || { echo "缺少产物: $f（先按文件头注释从旧服务器导出）"; exit 1; }
done

APP=/opt/ynva
SVC=yn-vocational-agent
DB=yunzhixue
DBUSER=yunzhixue
DBPASS='YnZhiXue@2026'

echo "[1] 安装 PostgreSQL + Python venv"
sudo apt-get update -y
sudo apt-get install -y postgresql postgresql-contrib python3-venv python3-pip
sudo systemctl enable --now postgresql

echo "[2] 建库建用户"
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='$DBUSER'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE USER $DBUSER WITH PASSWORD '$DBPASS';"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='$DB'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE DATABASE $DB OWNER $DBUSER;"

# ⚠️ 坑2：PG16 导出的 dump 含 v16 专属 psql 元指令与扩展，PG14 不认。
#    \restrict 是 v16 psql 独有；pg_stat_statements 需要 shared_preload_libraries。
grep -vE '^\\restrict|pg_stat_statements' /tmp/ynva_pg.sql > /tmp/ynva_pg_clean.sql
sudo -u postgres psql "$DB" < /tmp/ynva_pg_clean.sql

# ⚠️ 坑3：pg_dump --no-owner 恢复后，所有表属主是 postgres，
#    应用用户 yunzhixue 读表会报 permission denied → 必须显式授权。
echo "[3] 授权（--no-owner 恢复后必需）"
sudo -u postgres psql -d "$DB" <<SQL
GRANT USAGE, CREATE ON SCHEMA public TO $DBUSER;
GRANT ALL ON ALL TABLES IN SCHEMA public TO $DBUSER;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO $DBUSER;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO $DBUSER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO $DBUSER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO $DBUSER;
SQL
echo "    tables: $(sudo -u postgres psql -d "$DB" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';")"

echo "[4] 部署代码到 $APP"
sudo rm -rf "$APP"; sudo mkdir -p "$APP"
sudo tar -xzf /tmp/ynva_code.tgz -C "$APP" --strip-components=1
sudo cp /tmp/ynva.env "$APP/.env"
sudo chown -R ubuntu:ubuntu "$APP"
sudo chmod 600 "$APP/.env"

echo "[5] venv + 依赖"
sudo -u ubuntu python3 -m venv "$APP/.venv"
sudo -u ubuntu "$APP/.venv/bin/pip" install --quiet --upgrade pip
sudo -u ubuntu "$APP/.venv/bin/pip" install --quiet -r "$APP/requirements-docker.txt" \
  -i https://mirrors.tencent.com/pypi/simple/

# ⚠️ 坑4：requirements-docker.txt 不完整。旧服务器用系统 python3.12 跑，
#    额外装了 python-jose / passlib / bcrypt / numpy，缺任一个都会
#    ModuleNotFoundError → systemd 无限重启。用 AST 扫描一次性补齐。
echo "[6] 补齐 requirements 未声明的运行时依赖"
sudo -u ubuntu "$APP/.venv/bin/pip" install --quiet \
  'python-jose[cryptography]>=3.3' passlib bcrypt numpy python-dotenv \
  -i https://mirrors.tencent.com/pypi/simple/

echo "[7] 校验所有第三方 import 可用"
sudo -u ubuntu "$APP/.venv/bin/python3" - <<'PY'
import jose, passlib, bcrypt, numpy, dotenv
import fastapi, sqlalchemy, psycopg2, pydantic, requests, slowapi, psutil, uvicorn
print("    ALL_IMPORTS_OK")
PY

echo "[8] run.py 引导（应用不自动读 .env，用 python-dotenv 显式加载）"
cat | sudo -u ubuntu tee "$APP/run.py" >/dev/null <<'PYEOF'
import dotenv
dotenv.load_dotenv()
import uvicorn
uvicorn.run("main:app", host="0.0.0.0", port=8000)
PYEOF

echo "[9] systemd 服务"
cat | sudo tee /etc/systemd/system/$SVC.service >/dev/null <<UNIT
[Unit]
Description=YunZhiXue - Yunnan Vocational Education AI Agent Learning System
After=network.target postgresql.service

[Service]
Type=simple
User=ubuntu
WorkingDirectory=$APP
Environment=PYTHONPATH=$APP
Environment=PATH=$APP/.venv/bin:/usr/bin:/bin
ExecStart=$APP/.venv/bin/python3 $APP/run.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable --now $SVC

echo "[10] nginx 子路径 /ynva/（^~ 避开静态正则优先级）"
sudo cp /etc/nginx/nginx.conf "/etc/nginx/nginx.conf.bak.ynva-$(date +%Y%m%d%H%M%S)"
sudo python3 - <<'PYEOF'
p = '/etc/nginx/nginx.conf'
s = open(p).read()
anchor = 'server_name www.xlxzb.com xlxzb.com; # managed by Certbot'
assert anchor in s, '443 server block anchor not found'
i = s.index(anchor)
sub = s[i:]
needle = 'return 302 /xiaolongxia/;'
assert needle in sub, 'catch-all location not found'
k = sub.rindex(needle)            # 最后一次 = 真正的 catch-all location /
loc = sub.rfind('location / {', 0, k)
assert loc != -1
block = '''        # ===== yn-vocational-agent (/ynva) 子路径，剥离前缀反代到 8000 =====
        location ^~ /ynva/ {
            proxy_pass http://127.0.0.1:8000/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_read_timeout 300s;
            proxy_send_timeout 300s;
            proxy_buffering off;
        }

'''
if 'location ^~ /ynva/' not in s:
    open(p, 'w').write(s[:i+loc] + block + s[i+loc:])
    print('    INSERTED /ynva/')
else:
    print('    /ynva/ already present, skipped')
PYEOF
sudo nginx -t
sudo systemctl reload nginx

echo "[11] 等待启动"
sleep 12
sudo systemctl is-active $SVC
sudo ss -ltnp | grep ':8000' || { echo "8000 未监听，查看 journalctl -u $SVC"; exit 1; }
curl -s -o /dev/null -w '    local :8000 -> HTTP %{http_code}\n' http://127.0.0.1:8000/

echo "[12] 公网验证"
for u in /ynva/ /ynva/static/index.html /ynva/health /ynva/openapi.json; do
  printf '    %s -> ' "$u"
  curl -s -o /dev/null -w '%{http_code}\n' "https://www.xlxzb.com$u"
done
echo "MIGRATE_DONE"
