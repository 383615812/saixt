#!/usr/bin/env bash
# ============================================================================
# 告警去抖：状态"变化"才写入 alerts 日志（由 health-probe 的 cron 调用）
#
# 问题：原先 cron 是「只要最新一轮不是『系统总体: 正常』就把整份日志追加到 alerts」。
#   ⇒ 同一个故障每 10 分钟追加一次（~3KB），一天 ~430KB，既爆日志又把「新故障」淹没。
#   ⇒ 而且一旦有长期未修的配置项（如 AI 密钥缺失），alerts 会永远在刷，人对它脱敏。
#
# 规则：
#   - 异常项数量发生变化          ⇒ 立即告警
#   - 异常项数量不变但已过 6 小时 ⇒ 重复提醒一次（避免故障被遗忘）
#   - 异常项数量不变且 6 小时内    ⇒ 静默
#   - 恢复正常                      ⇒ 记一条恢复通知（一次）
# ============================================================================
set -uo pipefail

LATEST=${1:-/home/ubuntu/health-probe-latest.log}
STATE=/home/ubuntu/.health-probe-state      # 内容: "<异常项数> <上次告警时间戳>"
ALERTS=/home/ubuntu/health-probe-alerts.log
REPEAT_SEC=$((6 * 3600))

[ -f "$LATEST" ] || exit 0

# ⚠️ 不能写 `SIG=$(grep -c ... || echo 0)`：grep 无匹配时**既打印 "0" 又返回退出码 1**，
#    于是 `||` 分支再 echo 一个 0 —— SIG 变成两行 "0\n0"，后面所有数值比较全部失真，
#    表现为「明明正常也每 10 分钟告警一次」。这里显式做数字净化。
SIG=$(grep -c 'ABNORMAL' "$LATEST" 2>/dev/null) || true
SIG=${SIG:-0}
case "$SIG" in ''|*[!0-9]*) SIG=0;; esac
NOW=$(date +%s)
PREV_SIG=""; PREV_AT=0
if [ -f "$STATE" ]; then
  read -r PREV_SIG PREV_AT < "$STATE" 2>/dev/null || { PREV_SIG=""; PREV_AT=0; }
fi
# 首次运行（无状态文件）时 PREV_SIG 为空 —— 必须归零，否则会被误判成「上一轮是异常的」，
# 从而在一切正常的情况下也追加一条假的「已恢复正常」。
PREV_SIG=${PREV_SIG:-0}
PREV_AT=${PREV_AT:-0}

write_state() { printf '%s %s\n' "$1" "$2" > "$STATE"; }

# ---------------------------------------------------------------------------
# 外发告警（最后一公里）。见 notify-dispatch.sh：未配置通道时静默跳过。
# 只在"真正写告警"时调用，避免每 10 分钟骚扰。
DISPATCH=/home/ubuntu/notify-dispatch.sh
dispatch() { # $1=标题  $2=正文
  [ -x "$DISPATCH" ] || return 0
  printf '%s' "$2" | "$DISPATCH" "$1" >>"$ALERTS".dispatch.log 2>&1 || true
}

if [ "$SIG" = "0" ]; then
  if [ "$PREV_SIG" != "0" ]; then
    MSG="=== $(date '+%F %T') 已恢复正常（此前异常 ${PREV_SIG} 项）==="
    echo "$MSG" >> "$ALERTS"
    dispatch "xlxzb 已恢复(此前异常${PREV_SIG}项)" "$MSG"
  fi
  write_state 0 "$NOW"
  exit 0
fi

if [ "$SIG" != "$PREV_SIG" ]; then
  BLOCK="=== $(date '+%F %T') 异常项 ${SIG}（上次 ${PREV_SIG:-0}）===
$(cat "$LATEST")"
  printf '%s\n' "$BLOCK" >> "$ALERTS"
  dispatch "xlxzb 异常${SIG}项" "$BLOCK"
  write_state "$SIG" "$NOW"
elif [ $((NOW - PREV_AT)) -ge "$REPEAT_SEC" ]; then
  BLOCK="=== $(date '+%F %T') 异常项 ${SIG} 持续未修复（每 6h 提醒一次）===
$(grep 'ABNORMAL' "$LATEST")"
  printf '%s\n' "$BLOCK" >> "$ALERTS"
  dispatch "xlxzb 异常${SIG}项(持续未修复)" "$BLOCK"
  write_state "$SIG" "$NOW"
fi
