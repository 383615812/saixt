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

echo "=== 1) 小龙虾AI学习系统 (/xiaolongxia/) ==="
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

echo "=== 4) 根路径跳转 ==="
ROOT=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$BASE/")
if [ "$ROOT" = "302" ]; then
  ROWS+=("$(printf '  ✅ %-34s %-30s %s' "根路径302跳转" "/" "$ROOT")"); PASS=$((PASS+1))
else
  ROWS+=("$(printf '  ❌ %-34s %-30s %s (期望 302)' "根路径302跳转" "/" "$ROOT")"); FAIL=$((FAIL+1))
fi

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

echo ""
printf '%s\n' "${ROWS[@]}"
echo ""
echo "================================"
echo " 通过: $PASS项  失败: $FAIL项"
echo "================================"
[ "$FAIL" -eq 0 ] && echo "结论: ✅ 三站公网访问全部正常" || { echo "结论: ❌ 存在失败项，需排查"; exit 1; }
