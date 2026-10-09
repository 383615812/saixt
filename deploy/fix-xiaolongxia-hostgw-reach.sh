#!/usr/bin/env bash
# =============================================================================
# fix-xiaolongxia-hostgw-reach.sh
#
# 问题：小龙虾微服务(与 mysql/redis/nacos 同在 172.19.0.0/16 网络)把
#       基础设施地址硬编码为宿主网关 172.17.0.1:port（DB_HOST/REDIS_HOST/
#       NACOS_SERVER=172.17.0.1...）。docker 在 nat/DOCKER 链为发布端口生成的
#       DNAT 规则带有 `! -i br-<netid>` 约束，会**排除同网段容器来源**的流量：
#           -A DOCKER -d 172.17.0.1/32 ! -i br-xxxx --dport 3306 -j DNAT --to 172.19.0.2:3306
#       => 容器经 172.17.0.1 访问 mysql/redis/nacos 会被丢弃(Connect timed out)，
#          导致 15 个微服务启动失败、崩溃重启循环(load 15+、网关 503)。
#
# 解法：为基础设基础设施端口补一条**不带 -i 约束**的同目标 DNAT 规则，置于链首。
#       该规则仅匹配目的地址 172.17.0.1（宿主 docker0 网关，公网不可达），
#       不改变任何对外暴露面。
#
# 用法：
#   sudo bash fix-xiaolongxia-hostgw-reach.sh            # dry-run（默认）
#   sudo bash fix-xiaolongxia-hostgw-reach.sh --apply    # 实际写入
#   sudo bash fix-xiaolongxia-hostgw-reach.sh --apply --remove   # 回滚（删除本脚本加的规则）
#
# 幂等：已存在的规则不会重复添加（iptables -C 检查）。
# 目标 IP 每次按 docker inspect 实时解析，故容器重建换 IP 后重跑即可自愈。
# =============================================================================
set -uo pipefail

APPLY=0
REMOVE=0
for a in "$@"; do
  case "$a" in
    --apply)  APPLY=1 ;;
    --remove) REMOVE=1 ;;
    -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
    *) echo "unknown arg: $a" >&2; exit 2 ;;
  esac
done
[ "$REMOVE" = 1 ] && APPLY=1

# 需要打通的基础设施容器（其余为业务微服务，走 Nacos 服务发现，不需要宿主网关）
INFRA="${INFRA:-mysql redis nacos rabbitmq neo4j zipkin}"
HOSTGW="172.17.0.1"

say() { printf '%s\n' "$*"; }
have_rule() { iptables -t nat -C DOCKER -d "$HOSTGW/32" -p tcp -m tcp --dport "$1" -j DNAT --to-destination "$2" 2>/dev/null; }
add_rule()  { iptables -t nat -I DOCKER 1 -d "$HOSTGW/32" -p tcp -m tcp --dport "$1" -j DNAT --to-destination "$2"; }
del_rule()  { iptables -t nat -D DOCKER -d "$HOSTGW/32" -p tcp -m tcp --dport "$1" -j DNAT --to-destination "$2"; }

added=0; exists=0; removed=0
for c in $INFRA; do
  docker inspect "$c" >/dev/null 2>&1 || { say "skip  $c (容器不存在)"; continue; }
  ip=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' "$c" 2>/dev/null | awk '{print $1}')
  [ -z "$ip" ] && { say "skip  $c (无 IP)"; continue; }

  # 取该容器 HostIp=172.17.0.1 的所有端口映射：每行 "HostPort|Proto"
  docker inspect -f '{{range $p,$b := .HostConfig.PortBindings}}{{range $b}}{{if eq .HostIp "172.17.0.1"}}{{.HostPort}}|{{$p}}{{"\n"}}{{end}}{{end}}{{end}}' "$c" 2>/dev/null \
  | while IFS='|' read -r hp pp; do
      [ -z "${hp:-}" ] && continue
      cp="${pp%/*}"
      dst="$ip:$cp"
      if [ "$REMOVE" = 1 ]; then
        if have_rule "$hp" "$dst"; then
          if [ "$APPLY" = 1 ]; then del_rule "$hp" "$dst"; say "del   $c  $HOSTGW:$hp -> $dst"; else say "DRY-del $c $HOSTGW:$hp -> $dst"; fi
        fi
        continue
      fi
      if have_rule "$hp" "$dst"; then
        say "exist $c  $HOSTGW:$hp -> $dst"
      else
        if [ "$APPLY" = 1 ]; then add_rule "$hp" "$dst"; say "ADD   $c  $HOSTGW:$hp -> $dst"; else say "DRY   $c  $HOSTGW:$hp -> $dst"; fi
      fi
    done
done

say "----"
if [ "$REMOVE" = 1 ]; then
  say "回滚完成（$([ $APPLY = 1 ] && echo applied || echo dry-run)）"
elif [ "$APPLY" = 1 ]; then
  say "应用完成。当前 DOCKER 链相关规则："
  iptables -t nat -S DOCKER | grep -- "$HOSTGW/32" || true
else
  say "dry-run 结束（未改动）。加 --apply 生效。"
fi
