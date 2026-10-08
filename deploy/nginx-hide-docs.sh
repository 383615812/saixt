#!/usr/bin/env bash
# 收敛职教（/ynva）的「接口文档 / 运行指标」公网暴露 —— nginx 层，即时生效、不改应用、不重启服务。
#
# 背景（2026-10-08 外网实测）：
#   GET https://www.xlxzb.com/ynva/docs          -> 200  Swagger UI，完整暴露 110+ 路由与参数
#   GET https://www.xlxzb.com/ynva/openapi.json  -> 200  机器可读的完整接口契约
#   GET https://www.xlxzb.com/ynva/metrics       -> 200  CPU/内存/磁盘/库表行数等运行指标
# 风险：接口文档 = 攻击面清单（含历史遗留的零鉴权端点）；指标 = 主机指纹与容量信息。
#
# 处置：docs / redoc / openapi.json / metrics 一律精确匹配短路 404。
#   精确匹配(=) 优先级高于 ^~ 前缀匹配，请求在此短路，根本到不了应用。
#   注意：location 内若只写 allow/deny 而无 proxy_pass/return，nginx 会退化为
#   默认 root 静态查找 —— 表现为 404，看起来"像是成功了"，实为语义错误。
#   这里显式用 return 404，避免歧义。
#
# 运维如需查看文档 / 采集指标，请走 SSH 隧道直连应用：
#   ssh -L 8000:127.0.0.1:8000 ubuntu@<server>   然后打开 http://127.0.0.1:8000/docs
#
# 幂等（含"升级"：会先移除本脚本上一版插入的整段再重写）；改前备份；nginx -t 失败立即回滚。
set -euo pipefail

CONF=/etc/nginx/nginx.conf
TS=$(date +%s)
BAK="$CONF.bak.hidedocs.$TS"

echo "=== [0] 备份 $CONF ==="
sudo cp -p "$CONF" "$BAK"
echo "  $BAK"

echo "=== [1] 写入 docs / openapi / metrics 收敛规则 ==="
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

BLOCK_START = "        # ===== 接口文档 / 运行指标公网收敛（务必保留）====="
BLOCK = BLOCK_START + """
        # docs / redoc / openapi.json 是接口攻击面清单；metrics 是主机指纹。
        # 精确匹配(=) 优先级高于 ^~ 前缀匹配，请求在此短路，不会到达应用。
        # 运维查看文档 / 采集指标：ssh -L 8000:127.0.0.1:8000 <server> 后访问 http://127.0.0.1:8000/docs
        location = /ynva/docs { return 404; }
        location = /ynva/docs/ { return 404; }
        location = /ynva/redoc { return 404; }
        location = /ynva/openapi.json { return 404; }
        location = /ynva/metrics { return 404; }
        location = /ynva/api/system/metrics { return 404; }
"""
anchor = '        location ^~ /ynva/ {'
assert anchor in blk, 'location ^~ /ynva/ 锚点缺失（配置已变，停止）'

# 归一化：移除本脚本旧版本插入的整段，避免重复堆叠 / 遗留错误写法
removed = False
k = blk.find(BLOCK_START)
if k != -1:
    a = blk.find(anchor, k)
    assert a != -1, '旧段落未找到结束锚点（配置已变，停止）'
    blk = blk[:k] + blk[a:]
    removed = True

blk = blk.replace(anchor, BLOCK + anchor, 1)
io.open(p, 'w', encoding='utf-8').write(s[:i] + blk + s[j:])
print('  REPLACED(old removed)' if removed else '  APPLIED')
PY

echo "=== [2] nginx -t ==="
if ! sudo nginx -t; then
  echo "  ✗ 校验失败，回滚"; sudo cp -p "$BAK" "$CONF"; exit 1
fi

echo "=== [3] reload ==="
sudo systemctl reload nginx
sleep 2
echo "  ✓ reloaded"

echo "=== [4] 校验（走真实 443，解析到回环）==="
probe() {
  local code
  code="$(curl -s -k --resolve www.xlxzb.com:443:127.0.0.1 -o /dev/null -w '%{http_code}' -m 15 "https://www.xlxzb.com$1")"
  printf '  %-34s -> %s' "$1" "$code"
  if [ "$2" = "$code" ]; then printf '  OK\n'; else printf '  ✗ 期望 %s\n' "$2"; fi
}
probe /ynva/docs 404
probe /ynva/docs/ 404
probe /ynva/openapi.json 404
probe /ynva/redoc 404
probe /ynva/metrics 404
probe /ynva/api/system/metrics 404

echo "=== [5] 反向确认业务未受影响 ==="
for u in /ynva/health /ynva/static/index.html /ynva/ /saixt/ /; do
  printf '  %-24s -> %s\n' "$u" "$(curl -s -k --resolve www.xlxzb.com:443:127.0.0.1 -o /dev/null -w '%{http_code}' -m 15 "https://www.xlxzb.com$u")"
done

echo "=== [6] 确认旧版 allow/deny 写法未残留 ==="
if sudo grep -n "location = /ynva/metrics" -A4 "$CONF" | grep -q "allow 127.0.0.1"; then
  echo "  ✗ 仍有 allow/deny 残留"; exit 1
else
  echo "  ✓ 无残留"
fi
