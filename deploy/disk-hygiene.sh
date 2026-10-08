#!/bin/bash
# ============================================================================
# 磁盘卫生体检 / 清理（xlxzb.com 三站同机服务器）
#
# 背景：这台 120G 盘的占用长期在 70%+ 徘徊，且「涨了也没人知道」——
#   · Docker 构建缓存（buildx）每次 docker build 静默增长，曾一次性堆积 10.8G
#   · 已完成的 maven 构建容器从不回收（Exited 0 后一直留着可写层，543MB）
#   · /home/ubuntu 下迭代部署留下的 pXX-backup / www-backup-* 目录已 130+ 个（11.8G）
#   · 86 个镜像里有 60+ 个是历史版本/部署前快照，仅 23 个在用（可回收 9.66G）
#
# 设计原则（重要）：
#   1. 默认**只读**：不加任何参数 = 只做体检，绝不改动任何东西
#   2. 删除动作必须显式 `--apply`，且会先完整列出将删除的清单
#   3. docker 构建缓存 / 已退出容器 = 纯缓存，`--apply` 直接清（零数据风险）
#   4. 主机备份目录 / 镜像 = 可能是回滚点，保留策略保守，默认只干跑
#
# 用法：
#   disk-hygiene.sh                      # 只读体检（推荐先跑这个）
#   disk-hygiene.sh --buildcache --apply # 清 docker 构建缓存（安全）
#   disk-hygiene.sh --containers --apply # 清已退出的容器（安全）
#   disk-hygiene.sh --hostbak            # 干跑：列出拟清理的 /home/ubuntu 备份目录
#   disk-hygiene.sh --hostbak --apply    # 真正删除（保留 14 天内 + 每组最新 1 个）
#   disk-hygiene.sh --images             # 干跑：列出未被任何容器使用的镜像
#   disk-hygiene.sh --images --apply     # 删除（保留 latest/在用/rollback 等保护项）
#
# 可选参数：
#   --keep-days N       主机备份的保留天数（默认 14）
#   --keep-per-group N  过期备份每组保留最新几个（默认 1）
# ============================================================================
set -uo pipefail

APPLY=0
DO_BUILD=0; DO_CONT=0; DO_HOSTBAK=0; DO_IMAGES=0
KEEP_DAYS=14
KEEP_PER_GROUP=1
HB_ROOT=/home/ubuntu

while [ $# -gt 0 ]; do
  case "$1" in
    --apply)          APPLY=1 ;;
    --buildcache)     DO_BUILD=1 ;;
    --containers)     DO_CONT=1 ;;
    --hostbak)        DO_HOSTBAK=1 ;;
    --images)         DO_IMAGES=1 ;;
    --keep-days)      shift; KEEP_DAYS="${1:-14}" ;;
    --keep-per-group) shift; KEEP_PER_GROUP="${1:-1}" ;;
    -h|--help)        sed -n '2,40p' "$0"; exit 0 ;;
    *) echo "未知参数: $1（--help 查看用法）" >&2; exit 2 ;;
  esac
  shift
done

# 无任何动作参数 = 只读总览
if [ "${DO_BUILD}${DO_CONT}${DO_HOSTBAK}${DO_IMAGES}" = "0000" ]; then
  DO_BUILD=1; DO_CONT=1; DO_HOSTBAK=1; DO_IMAGES=1
fi

hr()  { printf '\n\033[1;36m--- %s ---\033[0m\n' "$*"; }
note(){ printf '    %s\n' "$*"; }
warn(){ printf '\033[1;33m    ⚠ %s\033[0m\n' "$*"; }
act() { printf '\033[1;32m    ✓ %s\033[0m\n' "$*"; }
# KB -> 自适应单位
hsz() { awk -v k="${1:-0}" 'BEGIN{ if (k>=1048576) printf "%.1f G", k/1048576; else if (k>=1024) printf "%d MB", k/1024; else printf "%d KB", k }'; }

PLAN=/tmp/.dh_plan.$$
cleanup_tmp() { rm -f "$PLAN" /tmp/.dh_img.$$; }
trap cleanup_tmp EXIT

FREE_BEFORE=$(df -P / | awk 'NR==2{print $4}')
echo "==================================================================="
echo " 磁盘卫生体检   $(date '+%F %T')   （$( [ "$APPLY" = 1 ] && echo 'APPLY=真删' || echo '只读干跑' )）"
echo "==================================================================="
df -h / | awk 'NR==1{print "  "$0} NR==2{print "  "$0}'

# ---------------------------------------------------------------------------
# 1) Docker 构建缓存（纯缓存，删除零风险；只会让下次 build 变慢）
# ---------------------------------------------------------------------------
if [ "$DO_BUILD" = 1 ]; then
  hr "1) Docker 构建缓存"
  BCV=$(sudo docker buildx du 2>/dev/null | awk '/^Total:/{print $2}')
  note "当前构建缓存: ${BCV:-0B}"
  if [ "$APPLY" = 1 ] && [ "${BCV:-0B}" != "0B" ]; then
    sudo docker buildx prune -af >/dev/null 2>&1 && act "已清理，释放 ${BCV}"
  elif [ "${BCV:-0B}" != "0B" ]; then
    warn "未清理（加 --buildcache --apply 执行；纯缓存，无数据风险）"
  else
    note "无需清理"
  fi
fi

# ---------------------------------------------------------------------------
# 2) 已退出的容器（本机均为已完成的 maven 构建容器）
# ---------------------------------------------------------------------------
if [ "$DO_CONT" = 1 ]; then
  hr "2) 已停止/退出的容器"
  STOPPED=$(sudo docker ps -a --filter status=exited --format '{{.Names}}|{{.Image}}|{{.Status}}' 2>/dev/null)
  if [ -z "$STOPPED" ]; then
    note "无"
  else
    printf '%s\n' "$STOPPED" | while IFS='|' read -r nm im st; do
      printf '    %-20s %-28s %s\n' "$nm" "$im" "$st"
    done
    if [ "$APPLY" = 1 ]; then
      sudo docker container prune -f 2>&1 | tail -1 | sed 's/^/    /'
      act "已清理已退出容器"
    else
      warn "未清理（加 --containers --apply 执行；均为 Exited(0) 的构建容器）"
    fi
  fi
fi

# ---------------------------------------------------------------------------
# 3) /home/ubuntu 下的迭代部署备份目录
#    保留：KEEP_DAYS 天内修改的；过期后每组（按前缀）保留最新 KEEP_PER_GROUP 个
#    绝不碰：backups / backups-3sites / db-backup 及非备份目录
# ---------------------------------------------------------------------------
if [ "$DO_HOSTBAK" = 1 ]; then
  hr "3) /home/ubuntu 备份目录（保留 ${KEEP_DAYS} 天内 + 每组最新 ${KEEP_PER_GROUP} 个）"
  CUTOFF_TS=$(( $(date +%s) - KEEP_DAYS*86400 ))

  # 产出：grp|ts|kb|name（ts 升序 ⇒ 组内靠后的是较新的）
  RAW=$(cd "$HB_ROOT" 2>/dev/null && for d in */; do
      d="${d%/}"
      case "$d" in
        *backup*|*bak*|p[0-9]*) ;;
        *) continue ;;
      esac
      case "$d" in
        backups|backups-3sites|db-backup|ddl-backup-r9) continue ;;
      esac
      ts=$(stat -c %Y "$d" 2>/dev/null || echo 0)
      grp=$(printf '%s' "$d" | sed -E 's/-[0-9]{8}(-[0-9]{6})?$//')
      kb=$(du -sk "$d" 2>/dev/null | cut -f1)
      printf '%s|%s|%s|%s\n' "$grp" "$ts" "$kb" "$d"
    done | sort -t'|' -k1,1 -k2,2n)

  # 单次 awk：输出 verdict|kb|name
  printf '%s\n' "$RAW" | awk -F'|' -v KP="$KEEP_PER_GROUP" -v CUT="$CUTOFF_TS" '
    {
      grp=$1; ts=$2; kb=$3; name=$4
      if (name=="") next
      if (ts >= CUT) { print "KEEP|" kb "|" name; next }
      n[grp]++; L[grp, n[grp]] = kb "|" name
    }
    END {
      for (g in n) {
        c = n[g]
        keep = (c < KP ? c : KP)
        for (i = 1; i <= c; i++) {
          if (i > c - keep) print "KEEP|" L[g, i]
          else               print "DEL|"  L[g, i]
        }
      }
    }' > "$PLAN"

  TOTAL_KB=$(printf '%s\n' "$RAW" | awk -F'|' '{s+=$3} END{print s+0}')
  DEL_N=$(grep -c '^DEL|' "$PLAN" 2>/dev/null || true)
  DEL_KB=$(awk -F'|' '/^DEL\|/{s+=$2} END{print s+0}' "$PLAN")
  KEEP_N=$(grep -c '^KEEP|' "$PLAN" 2>/dev/null || true)

  note "备份目录合计 $(hsz "$TOTAL_KB")（$(printf '%s\n' "$RAW" | grep -c . ) 个）"
  note "拟保留 ${KEEP_N:-0} 个 / 拟清理 ${DEL_N:-0} 个（约 $(hsz "$DEL_KB")）"
  if [ "${DEL_N:-0}" -gt 0 ]; then
    printf '\n    将删除的目录：\n'
    awk -F'|' '/^DEL\|/{printf "      [删] %-48s %8.1f MB\n", $3, $2/1024}' "$PLAN"
    if [ "$APPLY" = 1 ]; then
      awk -F'|' '/^DEL\|/{print $3}' "$PLAN" | while read -r d; do
        [ -n "$d" ] || continue
        # 二次护栏：只删 /home/ubuntu 下的直接子目录（禁绝对路径/穿越）
        case "$d" in
          */*|..*|"") warn "跳过可疑路径: $d"; continue ;;
        esac
        rm -rf -- "$HB_ROOT/$d"
      done
      act "已删除 ${DEL_N} 个目录"
    else
      warn "未删除（加 --hostbak --apply 执行）"
    fi
  else
    note "无需清理"
  fi
fi

# ---------------------------------------------------------------------------
# 4) 未被任何容器使用的镜像
#    保护：latest、在用镜像、rollback/bak-final、基础镜像
# ---------------------------------------------------------------------------
if [ "$DO_IMAGES" = 1 ]; then
  hr "4) 未被使用的镜像"
  IMG=/tmp/.dh_img.$$
  INUSE=$(sudo docker ps -a --format '{{.Image}}' 2>/dev/null | sort -u)
  sudo docker images --format '{{.Repository}}:{{.Tag}}|{{.Size}}' 2>/dev/null > /tmp/.dh_all.$$
  while IFS='|' read -r ref sz; do
    [ -n "$ref" ] || continue
    case "$ref" in
      *:latest|*rollback*|*bak-final*|\
      maven*|eclipse-temurin*|mysql*|rabbitmq*|redis*|neo4j*|nacos/*|openzipkin/*|library/*)
        echo "PROT|$ref|$sz" >> "$IMG"; continue ;;
    esac
    if printf '%s\n' "$INUSE" | grep -qxF "$ref"; then
      echo "PROT|$ref|$sz" >> "$IMG"
    else
      echo "UNUSED|$ref|$sz" >> "$IMG"
    fi
  done < /tmp/.dh_all.$$
  rm -f /tmp/.dh_all.$$

  UN=$(grep -c '^UNUSED|' "$IMG" 2>/dev/null || true)
  note "未被使用的镜像: ${UN:-0} 个"
  awk -F'|' '/^UNUSED\|/{printf "      %-52s %s\n", $2, $3}' "$IMG"
  if [ "${UN:-0}" -gt 0 ]; then
    warn "含历史版本与部署前快照，可能是回滚点 ⇒ 默认不删"
    if [ "$APPLY" = 1 ]; then
      awk -F'|' '/^UNUSED\|/{print $2}' "$IMG" | while read -r ref; do
        sudo docker rmi "$ref" >/dev/null 2>&1 && act "已删 $ref" || warn "跳过 $ref（仍被依赖）"
      done
    else
      warn "未删除（加 --images --apply 执行）"
    fi
  fi
  rm -f "$IMG"
fi

# ---------------------------------------------------------------------------
FREE_AFTER=$(df -P / | awk 'NR==2{print $4}')
hr "结果"
note "磁盘可用: $((FREE_BEFORE/1048576))G -> $((FREE_AFTER/1048576))G"
df -h / | awk 'NR==2{print "  "$0}'
