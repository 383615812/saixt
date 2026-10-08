#!/usr/bin/env bash
# 封堵职教（/opt/ynva）的「数据库重置」危险端点 —— nginx 层，即时生效、不改应用、不重启服务。
#
# 背景：@app.get("/api/system/reset") 是【公开 GET + 零鉴权】，一次请求即执行 reset_db()
# 重建整库（数据销毁级）；且 /ynva/openapi.json 与 /ynva/docs 公开可见，攻击者可直接一键触发。
#
# 做法：用「精确匹配」location = 短路返回 404。
#   精确匹配(=) 的优先级高于 ^~ 前缀匹配，因此 /ynva/api/system/reset 不会落到
#   location ^~ /ynva/ 的 proxy_pass 上，请求根本到不了应用。
#   同时封带尾斜杠的变体（应用 redirect_slashes 会把它 307 回无斜杠版本，两边都堵死）。
#
# 幂等；改前备份；nginx -t 失败立即回滚。
set -euo pipefail

CONF=/etc/nginx/nginx.conf
TS=$(date +%s)
BAK="$CONF.bak.blockreset.$TS"

echo "=== [0] 备份 $CONF ==="
sudo cp -p "$CONF" "$BAK"
echo "  $BAK"

echo "=== [1] 插入精确匹配封堵 ==="
sudo python3 - "$CONF" <<'PY'
import io, sys
p = sys.argv[1]
s = io.open(p, encoding='utf-8').read()

marker = "server_name www.xlxzb.com xlxzb.com; # managed by Certbot"
i = s.find(marker)
assert i > 0, 'Certbot server_name 锚点缺失（nginx.conf 结构已变，停止）'
j = s.find("\n    server {", i)
assert j > i, '443 块结束锚点缺失（nginx.conf 结构已变，停止）'
blk = s[i:j]

BLOCK = """        # ===== 危险端点封堵：数据库重置（数据销毁级，务必保留）=====
        # /api/system/reset 原为 公开 GET + 零鉴权，一次请求即 reset_db() 重建整库；
        # 且 /openapi.json、/docs 公开可见，可被一键触发。
        # 精确匹配(=) 优先级高于 ^~ 前缀匹配 —— 请求在此短路为 404，不会到达应用。
        # 应用层另有 ALLOW_DB_RESET=1 显式开关（默认 404）作为第二道防线。
        location = /ynva/api/system/reset { return 404; }
        location = /ynva/api/system/reset/ { return 404; }
"""

if 'location = /ynva/api/system/reset ' in blk:
    print('  ALREADY BLOCKED（幂等，无改动）')
else:
    anchor = '        location ^~ /ynva/ {'
    assert anchor in blk, 'location ^~ /ynva/ 锚点缺失（配置已变，停止）'
    blk = blk.replace(anchor, BLOCK + anchor, 1)
    io.open(p, 'w', encoding='utf-8').write(s[:i] + blk + s[j:])
    print('  BLOCK ADDED')
PY

echo "=== [2] nginx -t ==="
if ! sudo nginx -t; then
  echo "  ✗ 校验失败，回滚"; sudo cp -p "$BAK" "$CONF"; exit 1
fi

echo "=== [3] reload ==="
sudo systemctl reload nginx
# graceful reload 是异步的：旧 worker 仍会服务既有连接，立即探测会读到旧配置
# （表现为 405/307 而非 404，极易误判"补丁没生效"）。等一个 worker 轮换周期再验。
sleep 2
echo "  ✓ reloaded"

echo "=== [4] 校验（仅用 OPTIONS，绝不用 GET —— 该端点未被封堵时 GET 会清库）==="
for path in /ynva/api/system/reset /ynva/api/system/reset/; do
  printf '  %-34s OPTIONS -> %s\n' "$path" \
    "$(curl -s -k --resolve www.xlxzb.com:443:127.0.0.1 -o /dev/null -w '%{http_code}' -X OPTIONS -m 15 "https://www.xlxzb.com$path")"
done
