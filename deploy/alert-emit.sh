#!/usr/bin/env bash
# ============================================================================
# 统一告警出口（供「备用告警」使用）
# ----------------------------------------------------------------------------
# 背景：巡检主链是 health-probe.sh → notify-if-changed.sh（去抖）→ notify-dispatch.sh（外发）。
#   但「备份可恢复性演练失败」「磁盘高水位」这类**周检备用告警**此前只写本地
#   /home/ubuntu/health-probe-alerts.log —— 无人看，等于没告警（与 2026-10-09 P0 同类问题）。
#   本脚本把任意 stdin 文本：① 追加到 alerts.log ② 尝试外发（未配置通道则静默）。
#
# 用法：  some-command 2>&1 | alert-emit.sh "备份可恢复性演练失败"
# 退出码：恒 0（告警本身不得反过来让 cron/上游判失败）。
# ============================================================================
set -uo pipefail

SUBJECT="${1:-运维告警}"
ALERTS="${ALERT_LOG:-/home/ubuntu/health-probe-alerts.log}"
DISPATCH="/home/ubuntu/notify-dispatch.sh"

BODY="$(cat)"

# 1) 本地留痕（永不失败，避免 cron 报错邮件风暴）
{
  echo "=== $(date '+%F %T') ${SUBJECT} ==="
  printf '%s\n' "$BODY"
} >> "$ALERTS" 2>/dev/null || true

# 2) 外发（dormant 时 notify-dispatch 自行静默；失败也只落日志）
if [ -x "$DISPATCH" ]; then
  printf '%s\n' "$BODY" | "$DISPATCH" "$SUBJECT" >>"$ALERTS".dispatch.log 2>&1 || true
fi

exit 0
