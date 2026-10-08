#!/usr/bin/env bash
# ============================================================
# 站点性能与错误语义修正（幂等，可重复执行）
#   1) HTTP/2：`listen 443 ssl;` 未带 http2 ⇒ 全站只有 HTTP/1.1。
#      门户/preload 了几十个 chunk，HTTP/2 多路复用收益明显。
#      （nginx 1.18 用 `listen ... http2`；1.25+ 才支持 `http2 on;`）
#   2) /saixt/assets/ 长缓存：Express 默认 `max-age=0`，而 Vite 产物文件名自带
#      内容哈希 ⇒ 每次访问都要回源校验每个 chunk。改为 1 年 immutable。
#   3) /ynva/ 由 `no-cache, no-store` 改为 `no-cache`：职教是 ~550KB 单文件应用，
#      no-store 让浏览器完全不存副本 ⇒ 每次访问全量重下；no-cache 仍强制校验，
#      但命中 ETag 时走 304（同样的「绝不显示旧页面」，省掉整包传输）。
#   4) 软 404 修正：catch-all 原为 `return 302 /xiaolongxia/`，任何错链都被判为
#      「首页」（软 404），搜索引擎无法识别失效页面、用户也无提示。改为返回
#      真实 404 状态 + 品牌 404 页（含三个系统入口）。
# 前置：/var/www/portal/404.html 已就位（脚本会检查，缺失则拒绝执行）
# 用法: sudo bash nginx-perf-and-404.sh
# ============================================================
set -e
CONF=/etc/nginx/nginx.conf
PORTAL=/var/www/portal
TS=$(date +%s)

if [ ! -f "$PORTAL/404.html" ]; then
  echo "❌ 缺少 $PORTAL/404.html —— 先上传 404 页，否则 error_page 会造成内部重定向死循环"
  exit 1
fi

echo "==> [0] 备份 $CONF"
cp -p "$CONF" "$CONF.bak.perf.$TS"

echo "==> [1] 补丁 nginx.conf（仅限 443 server 块）"
python3 - "$CONF" <<'PY'
import io, sys
p = sys.argv[1]
s = io.open(p, encoding='utf-8').read()

# 只在 443 server 块内操作：80 块里有同名的 `location /`，全局替换会改错地方
anchor = 'server_name www.xlxzb.com xlxzb.com; # managed by Certbot'
i = s.find(anchor)
assert i > 0, '未找到 443 server 块锚点'
j = s.find('\n    server {', i)
if j < 0:
    j = len(s)
head, blk, tail = s[:i], s[i:j], s[j:]
changed = []

# ---- 1) HTTP/2 ----
old = '    listen 443 ssl; # managed by Certbot'
if 'listen 443 ssl http2' in blk:
    pass
elif old in blk:
    blk = blk.replace(old, '    listen 443 ssl http2; # managed by Certbot', 1)
    changed.append('HTTP/2 开启')
else:
    print('    ! 未找到 listen 443 ssl 行（跳过）')

# ---- 2) /saixt/assets/ 长缓存（必须插在 ^~ /saixt/ 之前，前缀越长越优先）----
if 'location ^~ /saixt/assets/' in blk:
    pass
else:
    k = blk.find('        location ^~ /saixt/ {')
    assert k > 0, '未找到 ^~ /saixt/ 锚点'
    loc = '''        # saixt 构建产物带内容哈希（assets/index-<hash>.js|css），内容变则文件名变，
        # 可安全长缓存；否则 Express 默认 max-age=0，每次访问都要回源校验所有 chunk。
        location ^~ /saixt/assets/ {
            include /etc/nginx/snippets/security-headers.conf;
            proxy_pass http://127.0.0.1:3000/assets/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_http_version 1.1;
            proxy_hide_header Cache-Control;
            add_header Cache-Control "public, max-age=31536000, immutable" always;
        }

'''
    blk = blk[:k] + loc + blk[k:]
    changed.append('/saixt/assets/ 长缓存')

# ---- 3) 职教 no-store → no-cache ----
old = '            add_header Cache-Control "no-cache, no-store, must-revalidate" always;'
if old not in blk:
    pass
else:
    new = ('            # no-cache（而非 no-store）：仍强制回源校验，命中 ETag 走 304，\n'
           '            # 但允许浏览器存副本 —— 职教是 ~550KB 单文件应用，\n'
           '            # no-store 会让每次访问完整重下整包。\n'
           '            add_header Cache-Control "no-cache" always;')
    blk = blk.replace(old, new, 1)
    changed.append('/ynva/ no-store→no-cache')

# ---- 4) 软 404 → 真 404 ----
old = 'location / {\n            return 302 /xiaolongxia/;\n        }'
if 'try_files $uri =404;' in blk and 'error_page 404 /404.html;' in blk:
    pass
elif old in blk:
    new = '''# 未匹配任何站点的路径：返回真 404。原先一律 302 兜到 /xiaolongxia/，
        # 等于所有错链/失效链接都被当作「首页」（软 404）—— 搜索引擎识别不出失效页，
        # 用户走错也无任何提示。现返回品牌 404 页并保留 404 状态码。
        location / {
            include /etc/nginx/snippets/security-headers.conf;
            root /var/www/portal;
            try_files $uri =404;
            add_header Cache-Control "no-cache" always;
        }'''
    blk = blk.replace(old, new, 1)
    changed.append('软 404 → 真 404')
else:
    print('    ! catch-all 结构已变，请人工确认（跳过 404 改造）')

# ---- 5) 统一 404 页 + favicon ----
if 'error_page 404 /404.html;' in blk:
    pass
else:
    k = blk.find('        # ===== 站点级 robots.txt / sitemap.xml =====')
    assert k > 0, 'robots 段锚点缺失，无法插入 error_page'
    add = '''        # 统一 404 页：只接管 nginx 自身产生的 404。反代上游的 404 默认不被拦截
        # （proxy_intercept_errors 默认 off），因此 /saixt/api、/ynva/api 的
        # JSON 404 仍原样透出，不会被换成 HTML。
        error_page 404 /404.html;

        # 浏览器会主动请求 /favicon.ico；原先被 catch-all 302 到小龙虾，现统一到品牌图标
        location = /favicon.ico {
            include /etc/nginx/snippets/security-headers.conf;
            return 301 /logo.svg;
        }

'''
    blk = blk[:k] + add + blk[k:]
    changed.append('error_page 404 + favicon')

io.open(p, 'w', encoding='utf-8').write(head + blk + tail)
print('    已改动: ' + ('; '.join(changed) if changed else '无（已是目标状态）'))
PY

echo "==> [2] nginx -t"
if nginx -t; then
    systemctl reload nginx
    echo "    ✅ 语法通过并已 reload"
else
    echo "    ❌ 语法失败，回滚"
    cp -p "$CONF.bak.perf.$TS" "$CONF"
    exit 1
fi
