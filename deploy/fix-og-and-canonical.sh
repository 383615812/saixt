#!/usr/bin/env bash
# ============================================================
# 分享图栅格化 + 规范化 URL（canonical）统一
#   背景（本轮实测出的三个问题）：
#     1) 小龙虾的 og:image / twitter:image / itemprop:image 指向 **SVG**
#        （/xiaolongxia/icons/og-image.svg）—— 微信、QQ、微博的分享卡片
#        只渲染栅格图（PNG/JPG），SVG 等于「分享出去没有缩略图」。
#     2) 小龙虾的 canonical / hreflang / og:url / JSON-LD 全部用**裸域**
#        https://xlxzb.com/…，而门户、春招、职教用的是 https://www.xlxzb.com/…
#        （两个域都能 200 → 搜索引擎视为重复内容）。
#     3) 门户与春招/职教缺 canonical；四站分享图共用一张，无法体现站点差异。
#
#   做法：
#     · 裸域 xlxzb.com → www.xlxzb.com（站内全部绝对 URL 引用）
#     · 分享图改为各站专属 PNG：og-cover / og-xiaolongxia / og-saixt / og-ynva
#     · 各站补 <link rel="canonical">
#     · 小龙虾 author 改为法人主体并补 copyright；JSON-LD 补 parentOrganization
#   幂等；每步先备份 xxx.bak.og2.<ts>
# 用法: sudo bash fix-og-and-canonical.sh
# 前置: 四张 PNG 已放 /var/www/portal/（由 make-og-cover.py 生成）
#       nginx 已有 /og-*.png 的精确 location（nginx-harden-and-seo.sh）
# ============================================================
set -e
TS=$(date +%s)
ENTITY="云南文华教育科技有限责任公司"
PG=/opt/ynva/static/index.html

echo "==> [1/3] 小龙虾 index.html：裸域→www、SVG 分享图→PNG、canonical"
F=/var/www/html/xiaolongxia/index.html
cp -p "$F" "$F.bak.og2.$TS"
python3 - "$F" "$ENTITY" <<'PY'
import io, sys
p, ENTITY = sys.argv[1], sys.argv[2]
s = io.open(p, encoding='utf-8').read()
orig, changed = s, []

if 'https://xlxzb.com/' in s:
    s = s.replace('https://xlxzb.com/', 'https://www.xlxzb.com/')
    changed.append('绝对 URL 裸域→www')
if '//xlxzb.com' in s:                      # dns-prefetch / preconnect 的协议相对写法
    s = s.replace('//xlxzb.com', '//www.xlxzb.com')
    changed.append('协议相对裸域→www')

# 分享图栅格化：SVG 在微信/QQ 卡片里不渲染
svg = 'https://www.xlxzb.com/xiaolongxia/icons/og-image.svg'
png = 'https://www.xlxzb.com/og-xiaolongxia.png'
if svg in s:
    n = s.count(svg)
    s = s.replace(svg, png)
    changed.append('og/twitter/itemprop 分享图 SVG→PNG ×%d' % n)
if 'og:image:type' not in s and '<meta property="og:image:width"' in s:
    s = s.replace('<meta property="og:image:width"',
                  '<meta property="og:image:type" content="image/png" />\n    '
                  '<meta property="og:image:width"', 1)
    changed.append('补齐 og:image:type')

# 法人主体：author + copyright
if 'name="copyright"' not in s:
    a = '<meta name="author" content="小龙虾AI教育团队" />'
    if a in s:
        s = s.replace(a, '<meta name="author" content="%s" />\n    '
                         '<meta name="copyright" content="© 2026 %s 版权所有" />' % (ENTITY, ENTITY), 1)
        changed.append('author→法人主体 + copyright')

# JSON-LD 归属母公司
if 'parentOrganization' not in s:
    k = '"description": "AI 驱动的智能学习平台，提供智能学习规划、AI 辅导答疑、学习数据分析、错题本、家校互通等核心功能。",'
    if k in s:
        s = s.replace(k, k + '\n      "parentOrganization": { "@type": "Organization", "name": "%s" },' % ENTITY, 1)
        changed.append('JSON-LD parentOrganization')

print('    ' + ('; '.join(changed) if changed else '已是目标状态'))
if s != orig:
    io.open(p, 'w', encoding='utf-8').write(s)
PY

echo "==> [2/3] 职教 index.html：分享图换专属 PNG、补 canonical"
cp -p "$PG" "$PG.bak.og2.$TS"
python3 - "$PG" <<'PY'
import io, sys
p = sys.argv[1]
s = io.open(p, encoding='utf-8').read()
orig, changed = s, []

if 'https://www.xlxzb.com/og-cover.png' in s:
    s = s.replace('https://www.xlxzb.com/og-cover.png', 'https://www.xlxzb.com/og-ynva.png')
    changed.append('分享图 → og-ynva.png')
if 'rel="canonical"' not in s:
    k = '<meta property="og:url" content="https://www.xlxzb.com/ynva/">'
    if k in s:
        s = s.replace(k, k + '\n    <link rel="canonical" href="https://www.xlxzb.com/ynva/">', 1)
        changed.append('补 canonical')
if 'og:image:type' not in s and '<meta property="og:image:width"' in s:
    s = s.replace('<meta property="og:image:width"',
                  '<meta property="og:image:type" content="image/png">\n    '
                  '<meta property="og:image:width"', 1)
    changed.append('补 og:image:type')

print('    ' + ('; '.join(changed) if changed else '已是目标状态'))
if s != orig:
    io.open(p, 'w', encoding='utf-8').write(s)
PY

echo "==> [3/3] 门户页（如已上传 /tmp/portal.html）+ 职教 SW 缓存版本"
if [ -f /tmp/portal.html ]; then
    cp -p /var/www/portal/index.html "/var/www/portal/index.html.bak.og2.$TS"
    cp /tmp/portal.html /var/www/portal/index.html
    chown www-data:www-data /var/www/portal/index.html
    echo "    门户页已更新"
else
    echo "    ! /tmp/portal.html 不存在，跳过门户页"
fi
# index.html 内容变了 → 必须 bump SW 缓存名，否则老用户吃旧缓存
sed -i "s/yunzhixue-v6'/yunzhixue-v7'/g; s/yunzhixue-static-v6'/yunzhixue-static-v7'/g; s/yunzhixue-api-v6'/yunzhixue-api-v7'/g" /opt/ynva/static/sw.js

echo "==> 校验"
echo -n "  小龙虾 裸域残留: "; grep -c "https://xlxzb.com/" /var/www/html/xiaolongxia/index.html || true
echo -n "  小龙虾 og PNG : "; grep -c "og-xiaolongxia.png" /var/www/html/xiaolongxia/index.html
echo -n "  小龙虾 canonical: "; grep -o 'rel="canonical" href="[^"]*"' /var/www/html/xiaolongxia/index.html | head -1
echo -n "  职教 og PNG   : "; grep -c "og-ynva.png" "$PG"
echo -n "  职教 canonical: "; grep -o 'rel="canonical" href="[^"]*"' "$PG" | head -1
echo -n "  职教 SW       : "; grep -oE "yunzhixue-[a-z]*-?v[0-9]+" /opt/ynva/static/sw.js | head -1
echo -n "  门户 canonical: "; grep -c 'rel="canonical"' /var/www/portal/index.html
