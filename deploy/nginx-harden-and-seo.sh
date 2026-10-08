#!/usr/bin/env bash
# ============================================================
# 站点加固 + SEO 补齐（幂等，可重复执行）
#   1) 安全响应头：修复「自定义 location 丢失父级 add_header」缺陷
#      （nginx add_header 非累加：子 location 只要自带 add_header，
#        父级 server 块的全部 add_header 都会失效 → 实测 /、/ynva/、/portal/、
#        /logo.svg 曾只剩 Server 头）
#   2) 放开 client_max_body_size（原默认 1M，实测 2MB 上传 413）
#   3) 站点级 robots.txt / sitemap.xml（原被 PWA 正则 301 到 /xiaolongxia/）
#   4) /og-cover.png（og:image 分享图，须显式 location，否则被静态正则接管而 404）
# 用法: sudo bash nginx-harden-and-seo.sh
# ============================================================
set -e
CONF=/etc/nginx/nginx.conf
SNIP=/etc/nginx/snippets/security-headers.conf
TS=$(date +%s)

echo "==> [0] 备份 $CONF"
cp -p "$CONF" "$CONF.bak.harden.$TS"

echo "==> [1] 写入安全头 snippet"
mkdir -p /etc/nginx/snippets
cat > "$SNIP" <<'SNIPEOF'
# 站点安全响应头（被各 location include，用于绕过 nginx add_header 不累加的限制）
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;
add_header Strict-Transport-Security "max-age=31536000" always;
SNIPEOF
echo "    snippet: $SNIP"

echo "==> [2] 补丁 nginx.conf"
python3 - "$CONF" <<'PY'
import io, sys
p = sys.argv[1]
s = io.open(p, encoding='utf-8').read()
INC = 'include /etc/nginx/snippets/security-headers.conf;'
changed = []

# ---- 2.1 全局放开上传体积限制 ----
if 'client_max_body_size' not in s:
    assert '    gzip on;' in s, 'http 块 gzip on; 锚点缺失'
    s = s.replace('    gzip on;',
                  '    # 放开上传体积限制（默认 1M 会让 2MB+ 上传直接 413）\n'
                  '    client_max_body_size 20m;\n\n    gzip on;', 1)
    changed.append('client_max_body_size 20m')

# ---- 2.2 只在 443 server 块内操作 ----
anchor = 'server_name www.xlxzb.com xlxzb.com; # managed by Certbot'
i = s.find(anchor)
assert i > 0, '未找到 443 server 块锚点'
# 该块到文件末尾（本配置中 443 块是最后一个 server 之前的块，取其到下一个 "server {" 之前）
j = s.find('\n    server {', i)
if j < 0:
    j = len(s)
head, block, tail = s[:i], s[i:j], s[j:]

# 2.2.1 给自带 add_header 的 location 补 include（这些 location 会丢弃父级安全头）
loc_anchors = [
    'location = / {',
    'location ~* /assets/js/views-(dashboard|KnowledgeGraph).*\\.js$ {',
    'location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|wasm)$ {',
    'location ^~ /qimages/ {',
    'location ^~ /ynva/ {',
    'location = /logo.svg {',
    'location ^~ /portal/ {',
]
for a in loc_anchors:
    k = block.find(a)
    if k < 0:
        print('    ! 锚点未找到(跳过):', a)
        continue
    window = block[k:k + 400]
    if INC in window:
        continue
    indent = ' ' * 12
    block = block[:k + len(a)] + '\n' + indent + INC + block[k + len(a):]
    changed.append(a)

# 2.2.2 robots.txt / sitemap.xml 不再被 PWA 正则吃掉；新增三个精确 location
old_re = ('        location ~ ^/(service-worker\\.js|manifest\\.json|robots\\.txt|sitemap\\.xml'
          '|offline\\.html|browserconfig\\.xml)$ {')
if old_re in block:
    new_re = ('        location ~ ^/(service-worker\\.js|manifest\\.json'
              '|offline\\.html|browserconfig\\.xml)$ {')
    block = block.replace(old_re, new_re, 1)
    changed.append('PWA 正则去掉 robots/sitemap')

seo_block = '''
        # ===== 站点级 robots.txt / sitemap.xml =====
        # 原被上面 PWA 正则 301 到 /xiaolongxia/，导致门户页与三站入口无法被搜索引擎按根域收录
        location = /robots.txt {
            alias /var/www/portal/robots.txt;
            default_type text/plain;
            include /etc/nginx/snippets/security-headers.conf;
        }
        location = /sitemap.xml {
            alias /var/www/portal/sitemap.xml;
            default_type application/xml;
            include /etc/nginx/snippets/security-headers.conf;
        }
        # ===== 品牌社交分享图（og:image）=====
        # 必须显式声明：否则 /og-cover.png 命中静态资源正则 location，到 /var/www/html 取文件 → 404
        location = /og-cover.png {
            alias /var/www/portal/og-cover.png;
            include /etc/nginx/snippets/security-headers.conf;
        }
'''
if 'location = /og-cover.png' not in block:
    marker = '# ===== 研途AI (saixt) 子系统'
    assert marker in block, 'saixt 段锚点缺失，无法插入 SEO 段'
    block = block.replace(marker, '\n\n' + seo_block.strip('\n') + '\n\n                ' + marker, 1)
    changed.append('robots/sitemap/og-cover location')

s = head + block + tail
io.open(p, 'w', encoding='utf-8').write(s)
print('    已改动: ' + ('; '.join(changed) if changed else '无（已是目标状态）'))
PY

echo "==> [3] nginx -t"
if nginx -t; then
    systemctl reload nginx
    echo "    ✅ 语法通过并已 reload"
else
    echo "    ❌ 语法失败，回滚"
    cp -p "$CONF.bak.harden.$TS" "$CONF"
    exit 1
fi
