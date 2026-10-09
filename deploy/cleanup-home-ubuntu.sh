#!/usr/bin/env bash
# ============================================================================
# /home/ubuntu 陈旧部署产物清理器（默认 dry-run，只打印不删）
# ----------------------------------------------------------------------------
# 背景：长期迭代在 /home/ubuntu 累积了 31G 产物（129 个 jar 备份 12.5G、
#   大量 pNN-backup-* 暂存目录、npm/pip 缓存），非其中任何服务运行所必需。
#
# 安全设计（逐条对应运维红线）：
#   1. 默认 dry-run；--apply 才真正删除。
#   2. 永不触碰：点文件/目录、*.sh、白名单活动日志、正在运行的容器挂载引用路径、
#      活动数据目录（src / xiaolongxia-system / build / backups-3sites / node_modules…）。
#   3. 年龄闸门 --min-age-days（默认 7）：只处理 N 天前未修改的对象。
#   4. 分层开关 --tier：1=可再生缓存与旧日志 2=备份文件/目录(jar/*backup*) 3=其它暂存目录。
#   5. 每层打印逐项大小/时间与合计，便于二次确认与事后审计。
# 用法：
#   sudo bash cleanup-home-ubuntu.sh                      # 全部层 dry-run
#   sudo bash cleanup-home-ubuntu.sh --tier 1             # 只看第 1 层
#   sudo bash cleanup-home-ubuntu.sh --tier 1 --apply     # 真正删除第 1 层
# ============================================================================
set -uo pipefail
ROOT=/home/ubuntu
APPLY=0
MINAGE=7
TIERS="1 2"

while [ $# -gt 0 ]; do
  case "$1" in
    --apply) APPLY=1;;
    --min-age-days) MINAGE="${2:-7}"; shift;;
    --tier) TIERS="$2"; shift;;
    -h|--help) sed -n '2,20p' "$0"; exit 0;;
    *) echo "未知参数: $1"; exit 2;;
  esac
  shift
done

NOW=$(date +%s)
TOTAL_BYTES=0
TOTAL_N=0

# ---- 保护名单：文件名/路径前缀（永不删除） ----
KEEP_LOGS='health-probe-alerts.log health-probe-latest.log notify-dispatch.log probe-cleanup.log backups-3sites.log verify-backups.log disk-hygiene.log xiaolongxia-pool-refresh.log security-audit.log'
KEEP_DIRS='src xiaolongxia-system build backups-3sites node_modules'
SEEN="/tmp/.cleanup-seen.$$"; : > "$SEEN"

# ---- 收集容器挂载引用的宿主机路径（强制排除） ----
REFERENCED=""
for c in $(sudo docker ps -a --format '{{.Names}}' 2>/dev/null); do
  ms=$(sudo docker inspect -f '{{range .Mounts}}{{.Source}}{{"\n"}}{{end}}' "$c" 2>/dev/null || true)
  while IFS= read -r p; do
    [ -n "$p" ] || continue
    case "$p" in "$ROOT"/*) REFERENCED="$REFERENCED$p"$'\n';; esac
  done <<< "$ms"
done

is_referenced() { # $1=abs path
  [ -n "$REFERENCED" ] || return 1
  printf '%s' "$REFERENCED" | grep -qxF "$1" && return 0
  # 也排除"位于被引用目录之内"的项
  printf '%s' "$REFERENCED" | while IFS= read -r r; do
    [ -n "$r" ] || continue
    case "$1" in "$r"/*) echo hit; break;; esac
  done | grep -q hit
}

is_kept() { # $1=basename $2=abspath
  local b="$1" p="$2"
  case " $KEEP_LOGS " in *" $b "*) return 0;; esac
  for d in $KEEP_DIRS; do case "$p" in "$ROOT/$d"|"$ROOT/$d"/*) return 0;; esac; done
  case "$b" in .*) return 0;; esac
  case "$b" in
    *.sh|*.pem|*.env|*.py|*.js|*.cjs|*.mjs|*.ts|*.vue|*.json|*.yml|*.yaml|*.toml|*.conf|*.cfg|*.ini|*.sql|*.md|*.txt|*.html|*.css) return 0;;
  esac
  return 1
}

age_ok() { # $1=abspath  -> 0 表示"够老，可处理"
  local m
  m=$(stat -c %Y "$1" 2>/dev/null) || return 1
  [ $(( (NOW - m) / 86400 )) -ge "$MINAGE" ]
}

human() { numfmt --to=iec --suffix=B "$1" 2>/dev/null || echo "$1"; }

size_of() { du -sb "$1" 2>/dev/null | awk '{print $1}'; }

report_item() { # $1=abspath
  local sz age
  sz=$(size_of "$1"); sz=${sz:-0}
  age=$(( (NOW - $(stat -c %Y "$1" 2>/dev/null || echo "$NOW")) / 86400 ))
  printf '  [%s] %s  (%sd)  %s\n' "$(human "$sz")" "${1#$ROOT/}" "$age" "$([ "$APPLY" -eq 1 ] && echo DEL || echo -)"
  TOTAL_BYTES=$((TOTAL_BYTES + sz)); TOTAL_N=$((TOTAL_N + 1))
}

del_item() { # $1=abspath
  if [ "$APPLY" -eq 1 ]; then rm -rf -- "$1"; fi
}

scan() { # $1=glob pattern(s)
  local pat
  for pat in $1; do
    for f in $pat; do
      [ -e "$f" ] || continue
      grep -qxF "$f" "$SEEN" && continue     # 去重：同一路径只报/删一次
      b=$(basename "$f")
      is_kept "$b" "$f" && continue
      is_referenced "$f" && { echo "  跳过(容器引用): ${f#$ROOT/}"; continue; }
      age_ok "$f" || { echo "  跳过(未满 ${MINAGE} 天): ${f#$ROOT/}"; continue; }
      printf '%s\n' "$f" >> "$SEEN"
      report_item "$f"
      del_item "$f"
    done
  done
}

echo "=========================================================="
echo " 清理 /home/ubuntu 陈旧产物   apply=$APPLY  min-age=${MINAGE}d  tiers=[$TIERS]"
echo " 时间: $(date '+%F %T')"
echo "=========================================================="

case " $TIERS " in *" 1 "*)
echo "--- T1 可再生缓存与旧日志 ---"
scan "$ROOT/.npm/_cacache"
scan "$ROOT/.cache/pip $ROOT/.cache/yarn $ROOT/.cache/node-gyp"
scan "$ROOT/build*.log $ROOT/build-*.log $ROOT/probe_*.log $ROOT/backfill_*.log $ROOT/*.tar.gz.bak-*"
;; esac

case " $TIERS " in *" 2 "*)
echo "--- T2 备份文件与备份目录（jar / *backup*）---"
scan "$ROOT/*.jar"
scan "$ROOT/p*-backup-* $ROOT/*-src-backup-* $ROOT/*-jar-backup-* $ROOT/*-backups $ROOT/*-backups-*"
;; esac

case " $TIERS " in *" 3 "*)
echo "--- T3 其它 pNN 暂存目录 ---"
scan "$ROOT/p[0-9]*"
;; esac

echo "=========================================================="
printf ' 合计可回收: %s   (%d 项)\n' "$(human "$TOTAL_BYTES")" "$TOTAL_N"
if [ "$APPLY" -eq 0 ]; then echo " [dry-run] 未删除任何文件；确认后加 --apply 执行。"; fi
echo "=========================================================="
