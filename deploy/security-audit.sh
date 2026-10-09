#!/usr/bin/env bash
# ============================================================================
# 服务器只读安全审计（119.45.196.149 同机四站）
# 目的：把 2026-10-09 的人工审计固化为可复跑脚本。**全程只读**，不改配置、不重启。
#
# 用法：
#   sudo bash security-audit.sh              # 全量
#   sudo bash security-audit.sh --brief      # 只看分级结论
#
# 输出：分级态势（P1/P2/P3）+ 证据。配套报告见 SECURITY-AUDIT-2026-10-09.md
# 修复工具：harden-docker-ports.sh（端口重绑 172.17.0.1，dry-run 默认）
# ============================================================================
set -uo pipefail

BRIEF=0
[ "${1:-}" = "--brief" ] && BRIEF=1

hr() { echo "------------------------------------------------------------"; }
say() { [ "$BRIEF" -eq 1 ] || echo "$@"; }

P1=(); P2=()

echo "=== 服务器安全审计 $(date '+%F %T') ==="
hr
say "【1】对外监听端口（0.0.0.0 = 公网可达面）"
PUB=$(ss -ltnH 2>/dev/null | awk '$4 ~ /0\.0\.0\.0:/ {split($4,a,":"); print a[2]}' | sort -n -u)
echo "  0.0.0.0 端口: $(echo $PUB | tr '\n' ' ')"
INFRA="3306 6379 5672 15672 7474 7687 8848 9848 9849 9411"
for p in $INFRA; do
  if echo "$PUB" | grep -qw "$p"; then P2+=("基础设施端口 $p 绑 0.0.0.0"); fi
done
say "  预期仅 22/80/443 应公网；其余基础设施/微服务端口应绑 172.17.0.1"

hr
say "【2】主机防火墙"
UFW=$(ufw status 2>/dev/null | head -1)
echo "  ufw: $UFW"
case "$UFW" in *inactive*|*"未启用"*|"") P1+=("ufw 未启用，公网暴露仅靠云安全组兜底") ;; esac

hr
say "【3】Nacos 鉴权（P1 关键）"
NC=$(curl -s -m5 -o /dev/null -w '%{http_code}' "http://127.0.0.1:8848/nacos/v1/ns/catalog/services?pageNo=1&pageSize=1" 2>/dev/null)
echo "  未登录访问服务列表 HTTP: $NC  （200 = 鉴权关闭，高危）"
[ "$NC" = "200" ] && P1+=("Nacos 鉴权关闭：未登录可枚举/读写配置与注册中心")

hr
say "【4】Redis 鉴权"
RP=$(printf 'PING\r\n' | timeout 3 nc -q1 127.0.0.1 6379 2>/dev/null | head -1)
echo "  Redis 无口令 PING: ${RP:-<无响应>}  （含 NOAUTH = 需鉴权，好）"
echo "$RP" | grep -qi "NOAUTH" || { [ -n "$RP" ] && P2+=("Redis 可能免鉴权"); }

hr
say "【5】MySQL root@% 远程账户"
MC=$(docker ps --format '{{.Names}}' | grep -iE 'mysql' | head -1)
if [ -n "$MC" ]; then
  docker exec "$MC" sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -N -e "SELECT CONCAT(user,CHAR(64),host,CHAR(58),LENGTH(authentication_string)) FROM mysql.user WHERE host=\"%\";"' 2>/dev/null \
    | sed 's/^/  /'
  R=$(docker exec "$MC" sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -N -e "SELECT COUNT(*) FROM mysql.user WHERE user=\"root\" AND host=\"%\";"' 2>/dev/null | tr -d '[:space:]')
  echo "  root@% 存在数量: ${R:-?}"
  [ "${R:-0}" != "0" ] && P1+=("MySQL 存在 root@% 远程账户（建议删，保留 root@localhost）")
fi

hr
say "【6】微服务宿主映射可达性（8082 采样）"
C=$(curl -s -m5 -o /dev/null -w '%{http_code}' http://127.0.0.1:8082/ 2>/dev/null)
echo "  127.0.0.1:8082 -> $C  （000 = 映射不可达，非直接暴露）"

hr
say "【7】SSH / 文件权限 / 证书 / Docker 正向项"
grep -iE "^\s*(PermitRootLogin|PasswordAuthentication|PermitEmptyPasswords)" /etc/ssh/sshd_config 2>/dev/null | sed 's/^/  /'
ls -l /opt/saixt/server/.env /opt/ynva/.env 2>/dev/null | sed 's/^/  /'
echo "  失败登录次数: $(grep -c 'Failed password' /var/log/auth.log 2>/dev/null)"
ls -l /var/run/docker.sock 2>/dev/null | sed 's/^/  /'
certbot certificates 2>/dev/null | grep -E "Domains|Expiry" | head -4 | sed 's/^/  /'

hr
say "【8】容器暴露端口明细"
docker ps --format '{{.Names}}  {{.Ports}}' 2>/dev/null | grep -E '0\.0\.0\.0' | sed 's/^/  /' | head -30

hr
echo "=== 分级结论 ==="
if [ "${#P1[@]}" -gt 0 ]; then
  echo "🔴 P1（高危，需尽快处置）:"
  for x in "${P1[@]}"; do echo "   - $x"; done
else
  echo "🔴 P1: 无"
fi
if [ "${#P2[@]}" -gt 0 ]; then
  echo "🟠 P2（加固）:"
  for x in "${P2[@]}"; do echo "   - $x"; done
else
  echo "🟠 P2: 无"
fi
echo
echo "建议处置：sudo bash harden-docker-ports.sh        # 端口重绑 172.17.0.1（dry-run）"
echo "详见：deploy/SECURITY-AUDIT-2026-10-09.md"
