#!/usr/bin/env bash
# ============================================================================
# 安装/刷新 ubuntu 用户的运维 crontab（幂等，保留一切既有条目）
#
# 目标状态：
#   */10 * * * *  health-probe.sh          巡检 → notify-if-changed.sh 去抖后写 alerts + 外发
#   40 3  * * *   backup-3sites.sh         三站数据库备份
#   30 4  * * 0   verify-backups.sh        每周日「备份可恢复性演练」失败 → alert-emit.sh 外发
#   15 5  * * 0   disk-hygiene.sh          每周日磁盘卫生 → 高水位经 alert-emit.sh 外发
#   20 5  * * *   probe-cleanup            每日扫除巡检探测账号（两站）
#
# 注意：crontab 里 % 是特殊字符（其后全部被当 stdin），命令中若出现 % 必须转义为 \%；
#       本脚本的 disk 判据改用 `df --output=pcent` 取数值，**全行不含 %**，从根上规避。
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

# 备用告警行升级：旧的 verify/disk 行只写本地 alerts.log（无人看、不外发），
# 且 disk 行的判据里 `%` 未转义 ⇒ crontab 把其后全部当 stdin ⇒ 该 if 整行失效
# （「磁盘高水位」从未真正告警过）。统一改为管道给 alert-emit.sh（写 alerts.log + 外发）。
for _stale in 'verify-backups.sh' 'disk-hygiene.sh'; do
  if grep -qF "$_stale" "$TMP"; then
    grep -vF "$_stale" "$TMP" > "$TMP.new" && mv "$TMP.new" "$TMP"
    echo "  已移除旧行(升级为 alert-emit 外发): $_stale"
  fi
done
add_line "notify-if-changed.sh" '*/10 * * * * /home/ubuntu/health-probe.sh > /home/ubuntu/health-probe-latest.log 2>&1; /home/ubuntu/notify-if-changed.sh /home/ubuntu/health-probe-latest.log'
add_line "backup-3sites.sh"   '40 3 * * * /home/ubuntu/backup-3sites.sh >> /home/ubuntu/backups-3sites.log 2>&1'
add_line "verify-backups.sh"  '30 4 * * 0 /home/ubuntu/verify-backups.sh >> /home/ubuntu/verify-backups.log 2>&1 || { tail -40 /home/ubuntu/verify-backups.log | /home/ubuntu/alert-emit.sh "备份可恢复性演练失败"; }'
# 磁盘卫生：只自动清理「零风险」的两项（构建缓存 + 已退出容器），
# 备份目录/镜像的删除一律不自动执行，只写进报告供人审阅。
# 高水位判据用 `df --output=pcent` 取纯数值比较，**全行不含 %**（规避 crontab 的 % 陷阱）。
add_line "disk-hygiene.sh"    '15 5 * * 0 /home/ubuntu/disk-hygiene.sh --buildcache --containers --apply > /home/ubuntu/disk-hygiene.log 2>&1; /home/ubuntu/disk-hygiene.sh >> /home/ubuntu/disk-hygiene.log 2>&1; P=$(df --output=pcent / | tail -1 | tr -dc 0-9); if [ "${P:-0}" -ge 85 ]; then { echo "磁盘使用率偏高(pcent=${P})"; df -hP / | tail -1; } | /home/ubuntu/alert-emit.sh "磁盘水位告警"; fi'
# 探测账号兜底扫除：巡检若从远程机器运行，本机清理分支不生效，账号会残留。
# 每日按「职教用户名 zzprobe*」「春招昵称 巡检探测」两个**明确指纹**清扫，不会误伤真实用户。
add_line "probe-cleanup"      '20 5 * * * { echo "=== $(date) ==="; /home/ubuntu/ynva-probe-cleanup.sh 2>&1; node /home/ubuntu/saixt-probe-cleanup.cjs 2>&1; } >> /home/ubuntu/probe-cleanup.log 2>&1'

crontab "$TMP" && rm -f "$TMP"
echo
echo "=== 当前 crontab ==="
crontab -l | grep -v '^#' | grep -v '^$'
