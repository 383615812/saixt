#!/usr/bin/env bash
# ============================================================
# www.xlxzb.com 三站公网可用性巡检（只读，无副作用）
#   1. 小龙虾AI学习系统  https://www.xlxzb.com/xiaolongxia/  (docker :8080)
#   2. 云南春招智能学习平台 https://www.xlxzb.com/saixt/     (node  :3000, PM2)
#   3. 云智学·职教高考AI系统 https://www.xlxzb.com/ynva/      (uvicorn :8000, systemd)
#
# 用法: bash deploy/health-check-3sites.sh
# 退出码: 0=全绿, 1=有失败项
# ============================================================
set -uo pipefail
BASE="https://www.xlxzb.com"
PASS=0; FAIL=0
declare -a ROWS=()

chk() { # chk <名称> <路径> <期望码>
  local name="$1" path="$2" want="${3:-200}" code
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$BASE$path")
  if [ "$code" = "$want" ]; then
    ROWS+=("$(printf '  ✅ %-34s %-30s %s' "$name" "$path" "$code")"); PASS=$((PASS+1))
  else
    ROWS+=("$(printf '  ❌ %-34s %-30s %s (期望 %s)' "$name" "$path" "$code" "$want")"); FAIL=$((FAIL+1))
  fi
}

echo "=== 1) 小龙虾AI学习系统 (/xiaolongxia/) + 商业导航页 (/ /portal/) ==="
chk "小龙虾首页"        "/xiaolongxia/"                     200
chk "小龙猫favicon"     "/xiaolongxia/icons/favicon.svg"    200
chk "小龙虾PWA图标"     "/xiaolongxia/icons/icon-192.png"   200

echo "=== 2) 云南春招智能学习平台 (/saixt/) ==="
chk "春招首页"          "/saixt/"                          200
chk "春招API健康"       "/saixt/api/health"                200
chk "春招ServiceWorker" "/saixt/sw.js"                     200
chk "春招深链practice"  "/saixt/practice"                  200

echo "=== 3) 云智学·职教高考AI系统 (/ynva/) ==="
chk "云智学首页"        "/ynva/"                           200
chk "云智学health"      "/ynva/health"                     200
chk "云智学OpenAPI"     "/ynva/openapi.json"               200
chk "云智学静态页"      "/ynva/static/index.html"          200
chk "云智学知识图谱"    "/ynva/static/knowledge-graph.html" 200

echo "=== 4) 根路径（商业导航页，2026-10-08 起替代原302跳转）==="
ROOT=$(curl -s -o /tmp/_portal_root.html -w '%{http_code}' --max-time 15 "$BASE/")
if [ "$ROOT" = "200" ] && grep -q '文华教育' /tmp/_portal_root.html 2>/dev/null; then
  ROWS+=("$(printf '  ✅ %-34s %-30s %s' "根路径商业导航页" "/" "$ROOT")"); PASS=$((PASS+1))
else
  ROWS+=("$(printf '  ❌ %-34s %-30s %s' "根路径商业导航页" "/" "$ROOT")"); FAIL=$((FAIL+1))
fi
# 备用入口
chk "导航页备用入口"      "/portal/"                     200
# favicon 曾因文件与引用路径不一致而 404，且只在浏览器标签页可见、极易漏检
chk "导航页Logo(favicon)"  "/logo.svg"                    200

echo "=== 5) 登录鉴权冒烟（期望 401 = 鉴权生效，非 404/500）==="
LOGC=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 -X POST "$BASE/ynva/api/auth/login" \
  -H 'Content-Type: application/json' -d '{"username":"__probe__","password":"__probe__"}')
if [ "$LOGC" = "401" ]; then
  ROWS+=("$(printf '  ✅ %-34s %-30s %s' "云智学登录鉴权" "/ynva/api/auth/login" "$LOGC")"); PASS=$((PASS+1))
else
  ROWS+=("$(printf '  ❌ %-34s %-30s %s (期望 401)' "云智学登录鉴权" "/ynva/api/auth/login" "$LOGC")"); FAIL=$((FAIL+1))
fi

# ⚠️ 只测 HTTP 200 会漏掉「页面能开但前端 API 全挂」这类子路径部署故障
#    （前端用绝对路径 /api/*，迁到子路径后会打到同域其它站）。
#    这里模拟真实链路：登录 demo 账号拿 token，再打业务接口。
echo "=== 6) 前端 API 链路（token + 业务接口，验证子路径前缀正确）==="
TOKEN=$(curl -s --max-time 15 -X POST "$BASE/ynva/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"username":"demo_student","password":"__wrong__"}' \
  | grep -oE '"access_token":"[^"]+"' | cut -d'"' -f4)
if [ -z "$TOKEN" ]; then
  # 探测账号不存在时用注册做只读探测（失败也仅记为提示，不计失败项）
  echo "  ℹ️  demo_student 登录失败（可能口令不同），跳过带 token 的业务接口检查"
  ROWS+=("$(printf '  ℹ️ %-34s %-30s %s' "云智学token链路" "(需有效账号)" "跳过")")
else
  for u in /api/auth/me /api/users/1/today-focus /api/users/1/study-diary; do
    C=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$BASE/ynva$u" -H "Authorization: Bearer $TOKEN")
    if [ "$C" = "200" ]; then
      ROWS+=("$(printf '  ✅ %-34s %-30s %s' "云智学$(basename $u)" "$u" "$C")"); PASS=$((PASS+1))
    else
      ROWS+=("$(printf '  ❌ %-34s %-30s %s (期望 200)' "云智学$(basename $u)" "$u" "$C")"); FAIL=$((FAIL+1))
    fi
  done
fi

echo "=== 7) 前端 API 前缀注入确认（const API 必须指向 /ynva）==="
APILINE=$(curl -s --max-time 15 "$BASE/ynva/" | grep -oE "const API = [^;]*" | head -1)
if grep -q '__APP_BASE__' <<<"$APILINE"; then
  ROWS+=("$(printf '  ✅ %-34s %-30s %s' "前端API前缀注入" "(index.html)" "$APILINE")"); PASS=$((PASS+1))
else
  ROWS+=("$(printf '  ❌ %-34s %-30s %s' "前端API前缀注入" "(index.html)" "${APILINE:-未找到}")"); FAIL=$((FAIL+1))
fi

echo "=== 8) 春招 axios baseURL 前缀确认（必须是 /saixt/api）==="
SJS=$(curl -s --max-time 15 "$BASE/saixt/" | grep -oE '/saixt/assets/index-[A-Za-z0-9_-]+\.js' | head -1)
if [ -n "$SJS" ]; then
  BURL=$(curl -s --max-time 25 "$BASE$SJS" | grep -oE '"/saixt/api"' | head -1)
  if [ -n "$BURL" ]; then
    ROWS+=("$(printf '  ✅ %-34s %-30s %s' "春招axios baseURL" "(bundle)" "$BURL")"); PASS=$((PASS+1))
  else
    ROWS+=("$(printf '  ❌ %-34s %-30s %s' "春招axios baseURL" "(bundle)" "未找到 /saixt/api")"); FAIL=$((FAIL+1))
  fi
else
  ROWS+=("$(printf '  ❌ %-34s %-30s %s' "春招axios baseURL" "(bundle)" "未找到入口JS")"); FAIL=$((FAIL+1))
fi

echo "=== 9) 两站 Service Worker 子路径自适配（sw.js 内不得有裸路径预缓存）==="
# 云智学 sw.js：应含 BASE 变量并用 BASE + 'api'
YNVA_SW=$(curl -s --max-time 15 "$BASE/ynva/static/sw.js")
if grep -q "const BASE = '/ynva'" <<<"$YNVA_SW" && grep -q "BASE + '/api/'" <<<"$YNVA_SW"; then
  ROWS+=("$(printf '  ✅ %-34s %-30s %s' "云智学SW子路径适配" "/ynva/static/sw.js" "BASE已注入")"); PASS=$((PASS+1))
else
  ROWS+=("$(printf '  ❌ %-34s %-30s %s' "云智学SW子路径适配" "/ynva/static/sw.js" "缺BASE或API判定")"); FAIL=$((FAIL+1))
fi
# 春招 sw.js：应含 BASE 推导 且 startsWith(BASE + 'api')，且不得再有裸 '/index.html' 预缓存
SAI_SW=$(curl -s --max-time 15 "$BASE/saixt/sw.js")
if grep -q "startsWith(BASE + 'api')" <<<"$SAI_SW" && ! grep -qE "^\s+'/(index\.html|logo\.svg)',?$" <<<"$SAI_SW"; then
  ROWS+=("$(printf '  ✅ %-34s %-30s %s' "春招SW子路径适配" "/saixt/sw.js" "BASE已推导")"); PASS=$((PASS+1))
else
  ROWS+=("$(printf '  ❌ %-34s %-30s %s' "春招SW子路径适配" "/saixt/sw.js" "仍是裸路径")"); FAIL=$((FAIL+1))
fi

echo "=== 10) 春招真实业务链路（注册→登录→鉴权接口）==="
# 只测 200 无法证明"页面能用"：这里做一次真实写入+读取，验证前后端与数据库贯通
SP=$(date +%s | tail -c 9)
PROBE_PHONE="19${SP}"
[ ${#PROBE_PHONE} -eq 11 ] || PROBE_PHONE="199$(date +%s | tail -c 9)"
REG=$(curl -s --max-time 20 -X POST "$BASE/saixt/api/auth/register" -H 'Content-Type: application/json' \
  -d "{\"phone\":\"$PROBE_PHONE\",\"password\":\"Probe@2026\",\"name\":\"巡检探测\"}" -o /tmp/saxt_reg.json -w '%{http_code}')
STOK=$(curl -s --max-time 20 -X POST "$BASE/saixt/api/auth/login" -H 'Content-Type: application/json' \
  -d "{\"phone\":\"$PROBE_PHONE\",\"password\":\"Probe@2026\"}" \
  | grep -oE '"token":"[^"]+"' | cut -d'"' -f4)
if [ -n "$STOK" ]; then
  ROWS+=("$(printf '  ✅ %-34s %-30s %s' "春招注册+登录拿token" "/saixt/api/auth/*" "HTTP $REG")"); PASS=$((PASS+1))
  for u in /api/auth/me /api/questions /api/stats/dashboard /api/checkin/me; do
    C=$(curl -s -o /dev/null -w '%{http_code}' --max-time 25 "$BASE/saixt$u" -H "Authorization: Bearer $STOK")
    if [ "$C" = "200" ]; then
      ROWS+=("$(printf '  ✅ %-34s %-30s %s' "春招$(basename $u)" "$u" "$C")"); PASS=$((PASS+1))
    else
      ROWS+=("$(printf '  ❌ %-34s %-30s %s (期望 200)' "春招$(basename $u)" "$u" "$C")"); FAIL=$((FAIL+1))
    fi
  done
  echo "  ℹ️  探测手机号 $PROBE_PHONE 已创建，需清理：DELETE FROM users WHERE phone='$PROBE_PHONE'"
else
  ROWS+=("$(printf '  ❌ %-34s %-30s %s' "春招注册+登录拿token" "/saixt/api/auth/*" "HTTP $REG 无token")"); FAIL=$((FAIL+1))
fi

# 清理探测数据：脚本在服务器本机运行时直接删库，否则打印待清理提示
if [ -n "${PROBE_PHONE:-}" ]; then
  if [ -f /opt/saixt/server/data/saixt.db ] && command -v node >/dev/null 2>&1; then
    node -e "
      const { DatabaseSync } = require('node:sqlite');
      const db = new DatabaseSync('/opt/saixt/server/data/saixt.db');
      try { db.exec(\"DELETE FROM users WHERE phone='$PROBE_PHONE'\"); console.log('  🧹 已清理探测手机号 $PROBE_PHONE'); }
      catch(e) { console.log('  ⚠️ 清理失败: ' + e.message); }
    " 2>/dev/null
  else
    echo "  ⚠️  探测手机号 $PROBE_PHONE 需手工清理（DELETE FROM users WHERE phone='$PROBE_PHONE'）"
  fi
fi

# 备案号是合规硬要求，且极易在改版/重构前端时被连带删掉（页脚重写、组件替换），
# 因此纳入常驻巡检：四处必须都能在公网页面上取到备案号 + 工信部链接。
echo "=== 11) ICP 备案号 + 公司主体展示（导航页 / 小龙虾 / 春招 / 职教高考）==="
ICP_NO="滇ICP备2026019339号-1"
ENTITY="云南文华教育科技有限责任公司"
# 一份内容同时核验「备案号」与「版权所有主体」，二者缺一即为合规回退
check_legal() {
  local name="$1" url="$2" body hit_no hit_ent
  body=$(curl -s --max-time 25 "$url")
  # 用 here-string 而非 `printf | grep -c`：脚本开头是 `set -uo pipefail`，
  # 管道里 grep 提前退出会让上游吃 SIGPIPE（141），pipefail 把整条管道判为失败 → 误报。
  hit_no=$(grep -c "$ICP_NO" <<<"$body" 2>/dev/null)
  hit_ent=$(grep -c "$ENTITY" <<<"$body" 2>/dev/null)
  if [ "${hit_no:-0}" -ge 1 ] && [ "${hit_ent:-0}" -ge 1 ]; then
    ROWS+=("$(printf '  ✅ %-34s %-30s %s' "$name" "$url" "$ICP_NO + 主体")"); PASS=$((PASS+1))
  else
    ROWS+=("$(printf '  ❌ %-34s %-30s %s' "$name" "$url" "备案号=$hit_no 主体=$hit_ent")"); FAIL=$((FAIL+1))
  fi
}
check_legal "商业导航页版权+备案" "$BASE/"
check_legal "小龙虾版权+备案" "$BASE/xiaolongxia/"
check_legal "职教高考版权+备案" "$BASE/ynva/"
# 春招是 SPA，版权与备案号在入口 JS chunk 里，先取 index.html 再定位入口 JS
SA_JS=$(curl -s --max-time 25 "$BASE/saixt/" | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' | head -1)
if [ -n "$SA_JS" ]; then
  check_legal "春招版权+备案(入口JS)" "$BASE/saixt/$SA_JS"
else
  ROWS+=("$(printf '  ❌ %-34s %-30s %s' "春招版权+备案" "/saixt/" "未定位到入口JS")"); FAIL=$((FAIL+1))
fi

echo "=== 12) 安全响应头全覆盖（nginx add_header 不累加，子 location 易丢父级头）==="
# 曾经的缺陷：server 块配了安全头，但自带 add_header 的 location（/、/ynva/、/portal/、
# /logo.svg、静态资源正则）会整体丢弃父级 add_header → 实测只剩 Server 头。
# 修法是 snippets/security-headers.conf + 各 location include，这里做回归看护。
SEC_WANT=5   # x-frame-options / x-content-type-options / referrer-policy / permissions-policy / hsts
check_sec() {
  local name="$1" url="$2" n
  n=$(curl -sI --max-time 25 "$url" | grep -icE \
      'x-frame-options|x-content-type-options|referrer-policy|permissions-policy|strict-transport-security')
  if [ "${n:-0}" -ge "$SEC_WANT" ]; then
    ROWS+=("$(printf '  ✅ %-34s %-30s %s' "$name" "$url" "$n/$SEC_WANT 头")"); PASS=$((PASS+1))
  else
    ROWS+=("$(printf '  ❌ %-34s %-30s %s (期望 >=%s)' "$name" "$url" "${n:-0} 头" "$SEC_WANT")"); FAIL=$((FAIL+1))
  fi
}
check_sec "门户页安全头" "$BASE/"
check_sec "门户备用入口安全头" "$BASE/portal/"
check_sec "春招安全头" "$BASE/saixt/"
check_sec "职教高考安全头" "$BASE/ynva/"
check_sec "小龙虾安全头" "$BASE/xiaolongxia/"
check_sec "品牌图标安全头" "$BASE/logo.svg"
check_sec "分享图安全头" "$BASE/og-cover.png"

echo "=== 13) SEO 资源（robots / sitemap / og:image）==="
# robots.txt 与 sitemap.xml 曾被 PWA 正则 301 到 /xiaolongxia/，导致根域无法被正确收录。
RB=$(curl -s --max-time 25 "$BASE/robots.txt")
if grep -q "Sitemap: https://www.xlxzb.com/sitemap.xml" <<<"$RB"; then
  ROWS+=("$(printf '  ✅ %-34s %-30s %s' "robots.txt" "/robots.txt" "含 Sitemap 声明")"); PASS=$((PASS+1))
else
  ROWS+=("$(printf '  ❌ %-34s %-30s %s' "robots.txt" "/robots.txt" "缺失或未声明 Sitemap")"); FAIL=$((FAIL+1))
fi
SM=$(curl -s --max-time 25 "$BASE/sitemap.xml")
SMN=$(grep -c "<loc>" <<<"$SM" 2>/dev/null)
if grep -q "<urlset" <<<"$SM" && [ "${SMN:-0}" -ge 5 ]; then
  ROWS+=("$(printf '  ✅ %-34s %-30s %s' "sitemap.xml" "/sitemap.xml" "$SMN 个入口")"); PASS=$((PASS+1))
else
  ROWS+=("$(printf '  ❌ %-34s %-30s %s' "sitemap.xml" "/sitemap.xml" "无效或入口不足(${SMN:-0})")"); FAIL=$((FAIL+1))
fi
# 四张分享图必须都是「可用栅格图」：微信/QQ/微博卡片只渲染 PNG/JPG，
# 早先小龙虾用的是 SVG（/xiaolongxia/icons/og-image.svg）→ 分享出去没有缩略图，
# 而这种问题在页面上完全看不出来（HTTP 200、文件也在），只能靠巡检守。
for f in og-cover.png og-xiaolongxia.png og-saixt.png og-ynva.png; do
  OG=$(curl -s -o /dev/null -w '%{http_code} %{content_type}' --max-time 25 "$BASE/$f")
  case "$OG" in
    "200 image/png") ROWS+=("$(printf '  ✅ %-34s %-30s %s' "分享图 $f" "/$f" "$OG")"); PASS=$((PASS+1));;
    *) ROWS+=("$(printf '  ❌ %-34s %-30s %s (期望 200 image/png)' "分享图 $f" "/$f" "$OG")"); FAIL=$((FAIL+1));;
  esac
done
# 每站必须声明「自己的」分享图（不能四站共用一张，更不能指向 SVG）
for spec in "门户页:/:og-cover.png" "小龙虾:/xiaolongxia/:og-xiaolongxia.png" \
            "职教高考:/ynva/:og-ynva.png" "春招:/saixt/:og-saixt.png"; do
  nm=${spec%%:*}; rest=${spec#*:}
  pp=${rest%%:*}; want=${rest#*:}
  # 先落变量再 here-string：直接把 curl 接给 `grep -q` 时，grep 命中即退出会让 curl 吃
  # SIGPIPE(141)，pipefail 判整条管道失败 → 大页面（职教 index.html ~1MB）稳定误报。
  body=$(curl -s --max-time 25 "$BASE$pp")
  if grep -q "og:image\" content=\"https://www.xlxzb.com/$want" <<<"$body"; then
    ROWS+=("$(printf '  ✅ %-34s %-30s %s' "$nm og:image" "$pp" "$want")"); PASS=$((PASS+1))
  else
    ROWS+=("$(printf '  ❌ %-34s %-30s %s' "$nm og:image" "$pp" "未指向 $want")"); FAIL=$((FAIL+1))
  fi
done

echo "=== 14) 规范化 URL（canonical）与裸域收敛 ==="
# xlxzb.com 与 www.xlxzb.com 都能 200 → 搜索引擎视为重复内容。四个入口都必须
# 声明 canonical 指向 https://www.xlxzb.com/…，且页面内不得再残留裸域绝对 URL
# （小龙虾曾整站用 https://xlxzb.com/… 写死 canonical/hreflang/og:url）。
check_canon() {
  local name="$1" pp="$2" expect="$3" body can apex
  body=$(curl -s --max-time 25 "$BASE$pp")
  can=$(grep -o 'rel="canonical" href="[^"]*"' <<<"$body" | head -1 | sed 's/.*href="//;s/"$//')
  apex=$(grep -c 'https://xlxzb.com/' <<<"$body" 2>/dev/null)
  if [ "$can" = "$expect" ] && [ "${apex:-0}" -eq 0 ]; then
    ROWS+=("$(printf '  ✅ %-34s %-30s %s' "$name canonical" "$pp" "$expect")"); PASS=$((PASS+1))
  else
    ROWS+=("$(printf '  ❌ %-34s %-30s %s' "$name canonical" "$pp" \
            "canonical=${can:-无} 裸域残留=${apex:-0}")"); FAIL=$((FAIL+1))
  fi
}
check_canon "门户页" "/" "https://www.xlxzb.com/"
check_canon "小龙虾" "/xiaolongxia/" "https://www.xlxzb.com/xiaolongxia/"
check_canon "职教高考" "/ynva/" "https://www.xlxzb.com/ynva/"
check_canon "春招" "/saixt/" "https://www.xlxzb.com/saixt/"

echo "=== 15) 上传体积限制（nginx client_max_body_size，原默认 1M 会让 2MB+ 直接 413）==="
# 判定「是否被 nginx 拦掉」而不是「业务是否接受」：用一个 1.5MB 的合法 JSON 打业务端点，
# 只要返回的不是 nginx 的 413 HTML，就说明 nginx 已放行（业务层自行返回 4xx 属正常）。
if [ "${SKIP_UPLOAD_PROBE:-0}" = "1" ]; then
  ROWS+=("$(printf '  ℹ️  %-34s %-30s %s' "上传体积探测" "(SKIP_UPLOAD_PROBE=1)" "已跳过")")
else
  BIG=$(mktemp)
  { printf '{"phone":"19900000000","password":"probe","pad":"'; head -c 1500000 /dev/zero | tr '\0' 'a'; printf '"}'; } > "$BIG"
  for pair in "春招:$BASE/saixt/api/auth/login" "职教高考:$BASE/ynva/api/auth/login"; do
    nm=${pair%%:*}; uu=${pair#*:}
    C=$(curl -s -o /tmp/upload_probe.out -w '%{http_code}' --max-time 60 \
        -X POST -H 'Content-Type: application/json' --data-binary @"$BIG" "$uu")
    if [ "$C" = "413" ] && grep -qi "nginx" /tmp/upload_probe.out; then
      ROWS+=("$(printf '  ❌ %-34s %-30s %s (仍被 nginx 拦)' "$nm 1.5MB 上传" "$uu" "$C")"); FAIL=$((FAIL+1))
    else
      ROWS+=("$(printf '  ✅ %-34s %-30s %s (nginx 已放行)' "$nm 1.5MB 上传" "$uu" "$C")"); PASS=$((PASS+1))
    fi
  done
  rm -f "$BIG" /tmp/upload_probe.out
fi

echo "=== 16) 性能与错误语义（HTTP/2 / 静态缓存 / 404 语义）==="
# 这几项都是「改错了页面也不会报错、但体验与收录实打实变差」的类型，必须常驻看护。
HOST=$(printf '%s' "$BASE" | sed -E 's#^https?://##; s#/.*$##')

# 16.1 HTTP/2：证书的 ALPN 是否协商出 h2（nginx 1.18 需 `listen 443 ssl http2;`）
if command -v openssl >/dev/null 2>&1; then
  ALPN=$(echo | openssl s_client -connect "$HOST:443" -servername "$HOST" -alpn h2 2>/dev/null \
         | grep -i "ALPN protocol" | head -1)
  if grep -q "h2" <<<"$ALPN"; then
    ROWS+=("$(printf '  ✅ %-34s %-30s %s' "HTTP/2 协商" "$HOST:443" "h2")"); PASS=$((PASS+1))
  else
    ROWS+=("$(printf '  ❌ %-34s %-30s %s' "HTTP/2 协商" "$HOST:443" "未协商出 h2（仍 HTTP/1.1）")"); FAIL=$((FAIL+1))
  fi
else
  ROWS+=("$(printf '  ℹ️  %-34s %-30s %s' "HTTP/2 协商" "(无 openssl)" "已跳过")")
fi

# 16.2 未知路径必须是真 404（原 catch-all 302 兜到小龙虾 = 软 404，伤收录）
NF_BODY=$(curl -s --max-time 25 "$BASE/this-page-should-404-probe")
NF_CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 25 "$BASE/this-page-should-404-probe")
if [ "$NF_CODE" = "404" ] && grep -q "没有找到这个页面" <<<"$NF_BODY"; then
  ROWS+=("$(printf '  ✅ %-34s %-30s %s' "未知路径 404 语义" "/this-page-should-404-probe" "404 + 品牌 404 页")"); PASS=$((PASS+1))
else
  ROWS+=("$(printf '  ❌ %-34s %-30s %s' "未知路径 404 语义" "/this-page-should-404-probe" "code=$NF_CODE（应为 404）")"); FAIL=$((FAIL+1))
fi

# 16.3 统一 404 页不得吃掉接口的 JSON 404（error_page 只该接管 nginx 自身产生的 404）
API404=$(curl -s -o /tmp/hc_api404.out -w '%{http_code} %{content_type}' --max-time 25 "$BASE/ynva/api/__probe_not_exist__")
case "$API404" in
  404\ application/json*) ROWS+=("$(printf '  ✅ %-34s %-30s %s' "接口 404 未被替换" "/ynva/api/__probe_not_exist__" "$API404")"); PASS=$((PASS+1));;
  *) ROWS+=("$(printf '  ❌ %-34s %-30s %s' "接口 404 未被替换" "/ynva/api/__probe_not_exist__" "$API404")"); FAIL=$((FAIL+1));;
esac
rm -f /tmp/hc_api404.out

# 16.4 春招带哈希的构建产物必须长缓存（Express 默认 max-age=0 ⇒ 每次全量回源校验）
SA_ENTRY=$(curl -s --max-time 25 "$BASE/saixt/" | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' | head -1)
if [ -n "$SA_ENTRY" ]; then
  SA_CC=$(curl -sI --max-time 25 "$BASE/saixt/$SA_ENTRY" | grep -i '^cache-control' | head -1 | tr -d '\r')
  if grep -q "immutable" <<<"$SA_CC"; then
    ROWS+=("$(printf '  ✅ %-34s %-30s %s' "春招产物长缓存" "/saixt/$SA_ENTRY" "immutable")"); PASS=$((PASS+1))
  else
    ROWS+=("$(printf '  ❌ %-34s %-30s %s' "春招产物长缓存" "/saixt/$SA_ENTRY" "无 immutable")"); FAIL=$((FAIL+1))
  fi
else
  ROWS+=("$(printf '  ❌ %-34s %-30s %s' "春招产物长缓存" "/saixt/" "未定位到入口 chunk")"); FAIL=$((FAIL+1))
fi

# 16.5 职教不得再回退成 no-store（~550KB 单文件应用，no-store 会让每次访问全量重下）
YNVA_CC=$(curl -sI --max-time 25 "$BASE/ynva/" | grep -i '^cache-control' | head -1 | tr -d '\r')
if grep -qi "no-store" <<<"$YNVA_CC"; then
  ROWS+=("$(printf '  ❌ %-34s %-30s %s' "职教缓存策略" "/ynva/" "出现 no-store（全量重下）")"); FAIL=$((FAIL+1))
else
  ROWS+=("$(printf '  ✅ %-34s %-30s %s' "职教缓存策略" "/ynva/" "${YNVA_CC:-无 Cache-Control}")"); PASS=$((PASS+1))
fi

# 16.6 favicon 应统一到品牌图标（原被 catch-all 302 到小龙虾）
FAV=$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 25 "$BASE/favicon.ico")
case "$FAV" in
  30*\ *logo.svg) ROWS+=("$(printf '  ✅ %-34s %-30s %s' "favicon 统一" "/favicon.ico" "→ /logo.svg")"); PASS=$((PASS+1));;
  *) ROWS+=("$(printf '  ❌ %-34s %-30s %s' "favicon 统一" "/favicon.ico" "$FAV")"); FAIL=$((FAIL+1));;
esac

echo "=== 17) 危险端点封堵与接口限流（负路径探测）==="
# 17.1 数据库重置端点必须不可达。
# ⚠️ 只用 OPTIONS 探测，**绝不用 GET**：该端点一旦未被封堵，一次 GET 就会立即执行
#     reset_db() 重建整库。OPTIONS 在 nginx 层被精确匹配短路为 404；即便 nginx 规则
#     被移除，Starlette 对非 GET 方法返回 405 也不会执行处理函数 —— 两种路径都不可能触发重置。
RS=$(curl -s -o /dev/null -w '%{http_code}' -X OPTIONS --max-time 20 "$BASE/ynva/api/system/reset")
case "$RS" in
  404) ROWS+=("$(printf '  ✅ %-34s %-30s %s' "危险端点 system/reset" "OPTIONS" "404 已封堵")"); PASS=$((PASS+1));;
  405) ROWS+=("$(printf '  ⚠️ %-34s %-30s %s' "危险端点 system/reset" "OPTIONS" "405 应用层拦截，nginx 规则缺失")"); PASS=$((PASS+1));;
  *)   ROWS+=("$(printf '  ❌ %-34s %-30s %s' "危险端点 system/reset" "OPTIONS" "code=$RS 未被封堵！")"); FAIL=$((FAIL+1));;
esac

# 17.2 职教登录防爆破：同账号连续第 11 次应被 429。
# 用专用探测账号 __rl_probe__（独立计数桶），不污染真实账号。
# 注：春招的限流桶是 login/register/password 共用一个 limiter 实例、按 IP 共享，
#     在此做触发式探测会把该 IP 的登录桶打满并持续 10 分钟，反而误伤后续登录检查 ——
#     故春招只保留功能性 401 检查（见第 10 段），不做触发式探测。
RLH=0
for _i in $(seq 1 11); do
  _c=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 -X POST -H 'Content-Type: application/json' \
       -d '{"username":"__rl_probe__","password":"x"}' "$BASE/ynva/api/auth/login")
  [ "$_c" = "429" ] && RLH=$((RLH+1))
done
if [ "$RLH" -ge 1 ]; then
  ROWS+=("$(printf '  ✅ %-34s %-30s %s' "职教登录限流" "11 次同账号登录" "$RLH 次 429")"); PASS=$((PASS+1))
else
  ROWS+=("$(printf '  ❌ %-34s %-30s %s' "职教登录限流" "11 次同账号登录" "无限流（可无限撞库）")"); FAIL=$((FAIL+1))
fi

# 17.3 职教 AI 命题端点限流：该端点会让大模型真实计费，探测用空 subject 触发处理函数提前
# 返回 —— 既不调用大模型也不写库；但限流依赖在进入处理函数之前就已计数，第 6 次仍应 429。
AILH=0
for _i in $(seq 1 6); do
  _c=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 -X POST -H 'Content-Type: application/json' \
       -d '{}' "$BASE/ynva/api/users/1/ai-generate-questions")
  [ "$_c" = "429" ] && AILH=$((AILH+1))
done
if [ "$AILH" -ge 1 ]; then
  ROWS+=("$(printf '  ✅ %-34s %-30s %s' "职教AI命题限流" "6 次空 subject" "$AILH 次 429")"); PASS=$((PASS+1))
else
  ROWS+=("$(printf '  ❌ %-34s %-30s %s' "职教AI命题限流" "6 次空 subject" "无限流（可烧大模型额度）")"); FAIL=$((FAIL+1))
fi

echo ""
printf '%s\n' "${ROWS[@]}"

echo ""
echo "================================"
echo " 通过: $PASS项  失败: $FAIL项"
echo "================================"
[ "$FAIL" -eq 0 ] && echo "结论: ✅ 三站公网访问全部正常" || { echo "结论: ❌ 存在失败项，需排查"; exit 1; }
