#!/usr/bin/env bash
# 小龙虾AI 系统健康巡检探针（v2）
# 覆盖四类故障面，全部只读：
#   1) 网关 22 条 /health 端点（无需 token）
#   2) 前端构建产物：nginx 反代的 SPA 首页 200 + 引用的 entry JS 实际存在
#   3) HTTPS 证书剩余天数（certbot 自动续期，但续期失败会静默过期）
#   4) 磁盘使用率（/ 与 /var，避免磁盘写满导致服务雪崩）
# 用法：
#   bash health-probe.sh                                    # 默认探本机
#   bash health-probe.sh http://host:8080                   # 指定网关
#   bash health-probe.sh http://host:8080 https://host/xl/  # 指定前端基址
# 退出码：0=全部正常；>0=存在异常项数（供 cron 告警判定）。
set -u

GW="${1:-http://127.0.0.1:8080}"
FE_BASE="${2:-https://127.0.0.1/xiaolongxia/}"
FE_ROOT="/var/www/html/xiaolongxia"

degraded=0   # 全局异常计数

# ---------- 1) 网关端点 ----------
PATHS=(
  /api/health
  /api/user/health
  /api/student/health
  /api/core/health
  /api/crawler/health
  /api/alert/health
  /api/knowledge/health
  /api/teacher/health
  /api/parent/health
  /api/tutor/health
  /api/hermes/health
  /api/auth/health
  /api/learning-progress/health
  /api/plan/health
  /api/resource/health
  /api/notification/health
  /api/data-analysis/health
  /api/agent/health
  /api/learning-analysis/health
  /api/report/health
  /api/exam/health
  /api/order/health
)

ok=0; bad=0
printf '%-42s %-6s %s\n' "ENDPOINT" "HTTP" "STATE"
printf '%-42s %-6s %s\n' "------------------------------------------" "------" "-----"
for p in "${PATHS[@]}"; do
  code=$(curl -s -o /dev/null -m 8 -w '%{http_code}' "$GW$p")
  if [ "$code" = "200" ]; then
    ok=$((ok+1)); state="OK"
  else
    bad=$((bad+1)); state="ABNORMAL"; degraded=$((degraded+1))
  fi
  printf '%-42s %-6s %s\n' "$p" "$code" "$state"
done
echo "-------------------------------------------------------------"
echo "网关: $GW"
echo "通过: $ok   异常: $bad   总计: $((ok+bad))"

# ---------- 2) 前端构建产物 ----------
echo
echo "=== 前端构建产物 ($FE_BASE) ==="
fe_code=$(curl -s -k -o /dev/null -m 10 -w '%{http_code}' "$FE_BASE")
if [ "$fe_code" = "200" ]; then
  echo "首页 HTTP: $fe_code  OK"
  # 提取 index.html 引用的 entry JS，确认该文件确实存在于磁盘（防止「旧首页命中缓存 + 新 entry 404」的断裂构建）
  entry=$(curl -s -k -m 10 "$FE_BASE" | grep -oE 'assets/js/index-[A-Za-z0-9_-]+\.js' | head -1)
  if [ -n "$entry" ]; then
    if [ -f "$FE_ROOT/$entry" ]; then
      echo "entry: $entry  磁盘存在  OK"
    else
      echo "entry: $entry  磁盘缺失  ABNORMAL"; degraded=$((degraded+1))
    fi
  else
    echo "entry: (未在首页解析到 index-*.js)  ABNORMAL"; degraded=$((degraded+1))
  fi
else
  echo "首页 HTTP: $fe_code  ABNORMAL"; degraded=$((degraded+1))
fi

# ---------- 3) HTTPS 证书剩余天数 ----------
echo
echo "=== HTTPS 证书 ($FE_BASE) ==="
enddate=$(echo | openssl s_client -connect 127.0.0.1:443 -servername xlxzb.com 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
if [ -n "$enddate" ]; then
  remain=$(( ( $(date -d "$enddate" +%s) - $(date +%s) ) / 86400 ))
  if [ "$remain" -lt 15 ]; then
    echo "证书到期: $enddate  剩余 ${remain} 天  ABNORMAL(<15天)"; degraded=$((degraded+1))
  else
    echo "证书到期: $enddate  剩余 ${remain} 天  OK"
  fi
else
  echo "证书信息获取失败  ABNORMAL"; degraded=$((degraded+1))
fi

# ---------- 4) 磁盘使用率 ----------
echo
# ===== SAIXT_MONITOR: 三站可用性（xiaolongxia / saixt / ynva）=====
echo
echo "=== 三站可用性 (同机三站共存) ==="
# ⚠️ 必须探测 443（www.xlxzb.com 的 server 块）。80 端口是 default_server，
# 子路径不参与路由：/saixt/ 会命中 catch-all 变成 302 跳小龙虾 —— 旧版把 302 也算 OK，
# 于是「子路径挂掉」会被误判为正常，护栏形同虚设。
for pair in "商业导航页:/" \
            "小龙虾AI:/xiaolongxia/" \
            "春招平台:/saixt/" \
            "职教高考:/ynva/"; do
  NAME="${pair%%:*}"; PATH_PART="${pair#*:}"
  code=$(curl -s -k --resolve www.xlxzb.com:443:127.0.0.1 -o /dev/null -m 8 -w '%{http_code}' "https://www.xlxzb.com$PATH_PART" 2>/dev/null)
  if [ "$code" = "200" ]; then
    echo "$NAME$PATH_PART HTTP: $code  OK"
  else
    echo "$NAME$PATH_PART HTTP: $code  ABNORMAL"; degraded=$((degraded+1))
  fi
done

echo
echo "=== 职教 PostgreSQL 可用性 ==="
if sudo -u postgres pg_isready -q 2>/dev/null; then
  echo "PostgreSQL  OK"
else
  echo "PostgreSQL  ABNORMAL"; degraded=$((degraded+1))
fi

echo
echo "=== 三站数据库备份新鲜度 ==="
BK=/home/ubuntu/backups-3sites
LATEST=$(ls -t "$BK"/saixt-*.db 2>/dev/null | head -1)
if [ -n "$LATEST" ]; then
  AGE=$(( ( $(date +%s) - $(stat -c %Y "$LATEST") ) / 3600 ))
  if [ "$AGE" -le 36 ]; then
    echo "saixt 备份: $(basename "$LATEST")  ${AGE}h前  OK"
  else
    echo "saixt 备份: ${AGE}h前  ABNORMAL(>36h)"; degraded=$((degraded+1))
  fi
else
  echo "saixt 备份: 缺失  ABNORMAL"; degraded=$((degraded+1))
fi
LATESTY=$(ls -t "$BK"/yunzhixue-*.dump 2>/dev/null | head -1)
if [ -n "$LATESTY" ]; then
  AGEY=$(( ( $(date +%s) - $(stat -c %Y "$LATESTY") ) / 3600 ))
  if [ "$AGEY" -le 36 ]; then
    echo "ynva 备份: $(basename "$LATESTY")  ${AGEY}h前  OK"
  else
    echo "ynva 备份: ${AGEY}h前  ABNORMAL(>36h)"; degraded=$((degraded+1))
  fi
else
  echo "ynva 备份: 缺失  ABNORMAL"; degraded=$((degraded+1))
fi

echo
echo
echo "=== 合规与静态资源（备案/主体/SEO/安全头）==="
# 备案号与版权主体属合规展示，改版时最易被连带删除；robots/sitemap/og 图也曾因
# 路由被吞或路径错配而 404 —— 这里做常驻护栏（HTTP 层，经 nginx 与线上完全一致）。
ICP_EXPECT="滇ICP备2026019339号-1"
ENTITY_EXPECT="云南文华教育科技有限责任公司"
for pair in "robots.txt:https://www.xlxzb.com/robots.txt:x"             "sitemap.xml:https://www.xlxzb.com/sitemap.xml:x"             "分享图 og-cover:https://www.xlxzb.com/og-cover.png:x"             "分享图 og-xiaolongxia:https://www.xlxzb.com/og-xiaolongxia.png:x"             "分享图 og-saixt:https://www.xlxzb.com/og-saixt.png:x"             "分享图 og-ynva:https://www.xlxzb.com/og-ynva.png:x"; do
  N="${pair%%:*}"; rest="${pair#*:}"
  U="${rest%:*}"   # URL 自带冒号，只能从尾部截断，不能用 %%:*
  C=$(curl -s -k --resolve www.xlxzb.com:443:127.0.0.1 -m 8 -o /tmp/hp_probe_body -w '%{http_code}' "$U" 2>/dev/null)
  if [ "$C" = "200" ]; then
    echo "$N  HTTP: 200  OK"
  else
    echo "$N  HTTP: $C  ABNORMAL"; degraded=$((degraded+1))
  fi
done
PORTAL=$(curl -s -k --resolve www.xlxzb.com:443:127.0.0.1 -m 10 https://www.xlxzb.com/ 2>/dev/null)
case "$PORTAL" in
  *"$ICP_EXPECT"*) echo "门户备案号  已展示  OK";;
  *) echo "门户备案号  缺失  ABNORMAL"; degraded=$((degraded+1));;
esac
case "$PORTAL" in
  *"$ENTITY_EXPECT"*) echo "版权主体  已展示  OK";;
  *) echo "版权主体  缺失  ABNORMAL"; degraded=$((degraded+1));;
esac
for U in https://www.xlxzb.com/ https://www.xlxzb.com/ynva/; do
  H=$(curl -sI -k --resolve www.xlxzb.com:443:127.0.0.1 -m 8 "$U" 2>/dev/null | grep -icE 'x-frame-options|x-content-type-options|referrer-policy|permissions-policy|strict-transport-security')
  if [ "${H:-0}" -ge 5 ]; then
    echo "安全头 $U  ${H}/5  OK"
  else
    echo "安全头 $U  ${H}/5  ABNORMAL"; degraded=$((degraded+1))
  fi
done

# canonical：xlxzb.com 与 www.xlxzb.com 都能 200（不是 301），页面若不声明 canonical
# 会被搜索引擎当成重复内容；小龙虾曾整站写死裸域，属改版易复发项，纳入常驻护栏。
for spec in "/:https://www.xlxzb.com/"             "/xiaolongxia/:https://www.xlxzb.com/xiaolongxia/"             "/ynva/:https://www.xlxzb.com/ynva/"             "/saixt/:https://www.xlxzb.com/saixt/"; do
  P="${spec%%:*}"; WANT="${spec#*:}"
  BODY=$(curl -s -k --resolve www.xlxzb.com:443:127.0.0.1 -m 10 "https://www.xlxzb.com$P" 2>/dev/null)
  case "$BODY" in
    *"rel=\"canonical\" href=\"$WANT\""*) echo "canonical $P  $WANT  OK";;
    *) echo "canonical $P  缺失/不匹配(期望 $WANT)  ABNORMAL"; degraded=$((degraded+1));;
  esac
done

# 性能与错误语义：catch-all 曾被写成 `return 302 /xiaolongxia/`，任何错链都被兜成
# 「首页」（软 404），搜索收录与用户体验双输；HTTP/2 也曾在改 nginx 时被无意关掉。
C404=$(curl -s -k --resolve www.xlxzb.com:443:127.0.0.1 -m 8 -o /tmp/hp404 -w '%{http_code}' https://www.xlxzb.com/__probe404__ 2>/dev/null)
case "$C404" in
  404) echo "未知路径 404 语义  正确  OK";;
  *) echo "未知路径 404 语义  code=$C404（应为 404）  ABNORMAL"; degraded=$((degraded+1));;
esac
if command -v openssl >/dev/null 2>&1; then
  ALPN=$(echo | openssl s_client -connect 127.0.0.1:443 -servername www.xlxzb.com -alpn h2 2>/dev/null | grep -i "ALPN protocol" | head -1)
  case "$ALPN" in
    *h2*) echo "HTTP/2 协商  h2  OK";;
    *) echo "HTTP/2 协商  未协商出 h2  ABNORMAL"; degraded=$((degraded+1));;
  esac
fi
CC_SAI=$(curl -sI -k --resolve www.xlxzb.com:443:127.0.0.1 -m 8 https://www.xlxzb.com/saixt/ 2>/dev/null | grep -ic 'cache-control')
case "$CC_SAI" in
  *[1-9]*) echo "春招入口可校验  OK";;
  *) echo "春招入口可校验  异常  ABNORMAL"; degraded=$((degraded+1));;
esac

echo "=== 磁盘使用率 ==="
df -P -h / /var 2>/dev/null | awk 'NR>1 && !seen[$6]++' | while read -r fs size used avail use mount; do
  pct=${use%\%}
  if [ "$pct" -ge 90 ]; then
    echo "$mount  使用 ${use}  ABNORMAL(>=90%)"
  else
    echo "$mount  使用 ${use}  OK"
  fi
done
# 磁盘阈值判定（df 子 shell 无法改外部变量，单独再算一次；按挂载点去重）
disk_bad=0
while read -r fs size used avail use mount; do
  pct=${use%\%}
  if [ "$pct" -ge 90 ]; then disk_bad=$((disk_bad+1)); fi
done < <(df -P / /var 2>/dev/null | awk 'NR>1 && !seen[$6]++')
degraded=$((degraded+disk_bad))

# ---------- 总体 ----------
echo
echo "============================================================="
if [ "$degraded" -eq 0 ]; then
  echo "系统总体: 正常"
else
  echo "系统总体: 异常($degraded 项)"
fi
exit "$degraded"
