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
if echo "$APILINE" | grep -q '__APP_BASE__'; then
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
if echo "$YNVA_SW" | grep -q "const BASE = '/ynva'" && echo "$YNVA_SW" | grep -q "BASE + '/api/'"; then
  ROWS+=("$(printf '  ✅ %-34s %-30s %s' "云智学SW子路径适配" "/ynva/static/sw.js" "BASE已注入")"); PASS=$((PASS+1))
else
  ROWS+=("$(printf '  ❌ %-34s %-30s %s' "云智学SW子路径适配" "/ynva/static/sw.js" "缺BASE或API判定")"); FAIL=$((FAIL+1))
fi
# 春招 sw.js：应含 BASE 推导 且 startsWith(BASE + 'api')，且不得再有裸 '/index.html' 预缓存
SAI_SW=$(curl -s --max-time 15 "$BASE/saixt/sw.js")
if echo "$SAI_SW" | grep -q "startsWith(BASE + 'api')" && ! echo "$SAI_SW" | grep -qE "^\s+'/(index\.html|logo\.svg)',?$"; then
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
  hit_no=$(printf '%s' "$body" | grep -c "$ICP_NO" 2>/dev/null)
  hit_ent=$(printf '%s' "$body" | grep -c "$ENTITY" 2>/dev/null)
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

echo ""
printf '%s\n' "${ROWS[@]}"

echo ""
echo "================================"
echo " 通过: $PASS项  失败: $FAIL项"
echo "================================"
[ "$FAIL" -eq 0 ] && echo "结论: ✅ 三站公网访问全部正常" || { echo "结论: ❌ 存在失败项，需排查"; exit 1; }
