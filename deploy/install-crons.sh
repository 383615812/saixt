#!/usr/bin/env bash
# ============================================================================
# 安装/刷新 ubuntu 用户的运维 crontab（幂等，保留一切既有条目）
#
# 目标状态：
#   */10 * * * *  health-probe.sh          巡检 → notify-if-changed.sh 去抖后写 alerts
#   40 3  * * *   backup-3sites.sh         三站数据库备份
#   30 4  * * 0   verify-backups.sh        每周日「备份可恢复性演练」
#
# 注意：crontab 里 % 是特殊字符（换行），必须转义为 \% —— 本脚本不含 %。
# ============================================================================
set -uo pipefail
cd /tmp || exit 2

TMP=/tmp/_cron.$$
crontab -l > "$TMP" 2>/dev/null || : > "$TMP"

add_line() { # add_line <匹配串> <整行>
  if grep -qF "$1" "$TMP"; then
    echo "  已存在: $1"
  else
    printf '%s\n' "$2" >> "$TMP"
    echo "  新增  : $1"
  fi
}

echo "=== 安装 crontab ==="
# 旧的「整份日志直接追加」写法必须先摘掉，否则去抖形同虚设：
# 同一故障每 10 分钟追加 ~3KB，一天 ~430KB，把真正的新故障淹没，人也对其脱敏。
if grep -qF 'cat /home/ubuntu/health-probe-latest.log) >> /home/ubuntu/health-probe-alerts.log' "$TMP"; then
  grep -vF 'cat /home/ubuntu/health-probe-latest.log) >> /home/ubuntu/health-probe-alerts.log' "$TMP" > "$TMP.new" && mv "$TMP.new" "$TMP"
  echo "  已移除旧的刷屏式告警行"
fi
add_line "notify-if-changed.sh" '*/10 * * * * /home/ubuntu/health-probe.sh > /home/ubuntu/health-probe-latest.log 2>&1; /home/ubuntu/notify-if-changed.sh /home/ubuntu/health-probe-latest.log'
add_line "backup-3sites.sh"   '40 3 * * * /home/ubuntu/backup-3sites.sh >> /home/ubuntu/backups-3sites.log 2>&1'
add_line "verify-backups.sh"  '30 4 * * 0 /home/ubuntu/verify-backups.sh >> /home/ubuntu/verify-backups.log 2>&1 || { echo "=== $(date) 备份可恢复性演练失败 ===" >> /home/ubuntu/health-probe-alerts.log; tail -40 /home/ubuntu/verify-backups.log >> /home/ubuntu/health-probe-alerts.log; }'

crontab "$TMP" && rm -f "$TMP"
echo
echo "=== 当前 crontab ==="
crontab -l | grep -v '^#' | grep -v '^$'
