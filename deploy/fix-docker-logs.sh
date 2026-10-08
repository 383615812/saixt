#!/usr/bin/env bash
# ============================================================================
# Docker 容器日志治理（零停机）
#
# 背景（2026-10-08 实测）：
#   /etc/docker/daemon.json 里其实**已经**配了 log-opts max-size=50m max-file=3，
#   但那两个容器是 9/02、9/05 创建的 —— **日志上限在容器创建时写入 HostConfig，之后改
#   daemon.json 对存量容器完全无效**（这正是"配置看起来是对的、盘却在涨"的经典原因）。
#   实测：xiaolongxia-gateway 285MB、xiaolongxia-order-service 255MB，且无上限、持续增长。
#
# 处置思路（不动容器、不重启 docker）：
#   1. truncate -s 0 截断超限日志 —— 立即回收空间，容器无感知（docker 按偏移续写）
#   2. 装一份 logrotate（copytruncate）作为兜底 —— 对所有容器生效，包括没有上限的存量容器
#   想让存量容器真正带上 50M 上限，需要 `docker compose up -d --force-recreate <svc>`
#   （有秒级停机），建议留到维护窗口，本脚本不做。
# ============================================================================
set -uo pipefail
cd /tmp || exit 2

LOG_DIR=/var/lib/docker/containers
THRESH_MB=${1:-50}      # 超过该体积的日志立即截断
ROT_MAX_MB=${2:-50}     # logrotate 兜底阈值（与 daemon.json 的 50m 对齐）
LR=/etc/logrotate.d/docker-containers

echo "=== [0] 现状：超过 ${THRESH_MB}MB 的容器日志 ==="
sudo find "$LOG_DIR" -name '*-json.log' -size +${THRESH_MB}M -printf '%s %p\n' 2>/dev/null | sort -rn |
while read -r sz p; do
  cid=$(basename "$(dirname "$p")" | cut -c1-12)
  nm=$(sudo docker inspect --format '{{.Name}}' "$cid" 2>/dev/null || echo "未知容器")
  lim=$(sudo docker inspect --format '{{index .HostConfig.LogConfig.Config "max-size"}}' "$cid" 2>/dev/null)
  printf '  %4sMB  %-38s 上限=%s\n' "$((sz/1024/1024))" "$nm" "${lim:-无(会无限增长)}"
done
TOTAL_BEFORE=$(sudo du -sm "$LOG_DIR" 2>/dev/null | cut -f1)

echo
echo "=== [1] 截断超限日志（容器无需重启）==="
sudo find "$LOG_DIR" -name '*-json.log' -size +${THRESH_MB}M -print0 2>/dev/null |
while IFS= read -r -d '' p; do
  before=$(sudo stat -c %s "$p")
  cid=$(basename "$(dirname "$p")" | cut -c1-12)
  nm=$(sudo docker inspect --format '{{.Name}}' "$cid" 2>/dev/null || echo "$cid")
  sudo truncate -s 0 "$p"
  printf '  回收 %4sMB  %s\n' "$((before/1024/1024))" "$nm"
done
TOTAL_AFTER=$(sudo du -sm "$LOG_DIR" 2>/dev/null | cut -f1)
echo "  容器日志总量: ${TOTAL_BEFORE}MB → ${TOTAL_AFTER}MB"

echo
echo "=== [2] 安装 logrotate 兜底（copytruncate，对存量容器同样生效）==="
[ -f "$LR" ] && { sudo cp -p "$LR" "$LR.bak.$(date +%s)"; echo "  已备份原有 $LR"; }
cat > /tmp/_docker_lr <<EOF
# docker 容器日志兜底轮转（由 deploy/fix-docker-logs.sh 安装）
# 为什么需要：daemon.json 的 log-opts 只对新创建容器生效，存量容器（如 9/02 创建的
# xiaolongxia-order-service）没有上限、会无限增长。copytruncate 无需重启容器。
# 注意：已受 docker 自身 max-file 轮转的容器会同时命中本规则，属正常，不会丢数据。
/var/lib/docker/containers/*/*-json.log {
    daily
    rotate 3
    size ${ROT_MAX_MB}M
    copytruncate
    compress
    delaycompress
    missingok
    notifempty
}
EOF
sudo install -m 644 /tmp/_docker_lr "$LR"
rm -f /tmp/_docker_lr
echo "  已写入 $LR"
sudo logrotate -d "$LR" 2>&1 | grep -E "considering|error|reading|rotating|log needs|does not need" | head -12
echo
echo "  （logrotate 由系统 logrotate.timer 每日自动执行，无需另加 cron）"
systemctl list-timers logrotate.timer --no-pager 2>/dev/null | head -3

echo
echo "=== [3] 复验：是否还有超限日志 ==="
REST=$(sudo find "$LOG_DIR" -name '*-json.log' -size +${THRESH_MB}M 2>/dev/null | wc -l)
echo "  仍超限文件数: $REST"
echo
echo "提示：想让存量容器真正带上 50M 上限（而非靠 logrotate 兜底），需在维护窗口执行："
echo "  cd <xiaolongxia compose 目录> && docker compose up -d --force-recreate gateway order-service"
