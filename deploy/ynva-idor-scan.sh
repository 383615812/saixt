#!/usr/bin/env bash
# ============================================================================
# 职教 IDOR 枚举离线检测（配合 main.py 的 IdorMonitorMiddleware 日志）
#
# 原理：职教大量 /api/users/{id}/... 路由「身份取自路径 user_id、无服务端会话
# 鉴权」（前端切换学生用 localStorage.currentUserId），属于潜在 IDOR 面。
# 监控中间件只记录、不拦截；本脚本离线分析日志，识别：
#   「同一客户端 IP 在最近 WINDOW 秒内触碰 >= THRESH 个不同 user_id」
#   → 疑似越权枚举（如爬虫顺序扫 user_id、或攻击者在试不同账号）。
#
# 注意：教师/机房 NAT 下一个 IP 触碰多个学生账号是正常现象，故阈值默认
#   偏高（20/10min）；本脚本只「发现并告警」，绝不阻断，供人工复核。
#
# 用法：
#   bash ynva-idor-scan.sh                 # 用默认阈值
#   WINDOW=300 THRESH=10 bash ynva-idor-scan.sh
# 退出码：0=无异常，1=发现疑似枚举（便于 cron/health-probe 联动）
# ============================================================================
set -uo pipefail

LOG=/var/log/ynva/idor-monitor.log
ALERT=/var/log/ynva/idor-alerts.log
WINDOW=${WINDOW:-600}     # 最近 600 秒（10 分钟）
THRESH=${THRESH:-20}      # 同一 IP 触碰 >=20 个不同 user_id 判疑似

[ -f "$LOG" ] || { echo "no idor-monitor.log yet (middleware not logging?)"; exit 0; }

NOW=$(date +%s)

SUSPECTS=$(awk -v now="$NOW" -v win="$WINDOW" -v th="$THRESH" -F'\t' '
function ipof(s, a){ split(s,a,"="); return a[2] }
function uidof(s, b){ split(s,b,"="); return b[2] }
{
  t = $1 + 0
  if ((now - t) <= win) {
    ip  = ipof($2)
    uid = uidof($3)
    key = ip SUBSEP uid
    if (!(key in seen)) { seen[key] = 1; cnt[ip]++ }
  }
}
END {
  for (ip in cnt) {
    if (cnt[ip] >= th) printf("  ip=%s distinct_uids=%d (window=%ds)\n", ip, cnt[ip], win)
  }
}' "$LOG")

if [ -n "$SUSPECTS" ]; then
  {
    echo "$(date '+%Y-%m-%d %H:%M:%S') [IDOR-SCAN] 疑似越权枚举（阈值: ${THRESH}个不同user_id/${WINDOW}s）:"
    echo "$SUSPECTS"
  } >> "$ALERT"
  echo "IDOR-SUSPECT detected:"
  echo "$SUSPECTS"
  exit 1
fi

echo "OK: 最近 ${WINDOW}s 内无 IDOR 疑似枚举（阈值 ${THRESH} 个不同 user_id）"
exit 0
