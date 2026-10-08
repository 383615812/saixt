#!/usr/bin/env bash
# ============================================================================
# 小龙虾容器日志上限「真正生效」——维护窗口重建脚本
#
# 背景（2026-10-09 核查）：
#   /etc/docker/daemon.json 已配 log-opts max-size=50m / max-file=3，但该配置只在
#   容器【创建时】写入 HostConfig，对存量容器无效。当前 23 个容器（含 17 个小龙虾
#   微服务 + redis/mysql/rabbitmq/neo4j/nacos/zipkin）LogConfig 均为 {}，日志会无限增长。
#   之前的 fix-docker-logs.sh 只做了零停机兜底（truncate + logrotate copytruncate），
#   本脚本在【维护窗口】把每个容器按原样重建并带上 50M 上限（真正的 docker 原生轮转）。
#
#  ⚠ 风险提示（2026-10-09 事故复盘）：
#   1) 本脚本【故意丢弃】所有 --add-host (ExtraHosts)。部分容器把服务名硬编码成创建时旧 IP，
#      IP 漂移后会连错目标。务必改用内网 DNS 按服务名解析。
#   2) 逐容器重建会触发网络重新附着，存在内网 DNS 竞态/幽灵附着风险；务必逐个健康校验、
#      异常即回滚（脚本已内置 rename→stop→run→校验→回滚）。严禁在大流量时段批量并行重建。
#   3) 多数情况下，直接用 fix-docker-logs.sh 的 logrotate copytruncate 即可零停机限容，
#      无需重建。仅当必须让 docker 原生 max-size 生效时才用本脚本，且须先 --dry-run 复核。

#
# 为什么不用 `docker compose up --force-recreate`：
#   现有 docker-compose-backend.yml 只定义了 2 个服务（compose 漂移），其余 14 个
#   小龙虾服务启动时所用的完整 compose 已被替换（有 .bak.jwt 备份为证），且无 compose
#   标签。因此只能从「容器当前 inspect 规格」逐容器重建，才能 100% 还原。
#
# 安全设计：
#   * 默认 DRY-RUN：只打印将要执行的 docker run 命令，不改动任何容器。
#   * --apply 才真正执行；每重建一个：原容器 rename 为 <name>.bak-<ts>（不删），
#     建新容器（spec 完全一致 + --log-opt max-size=50m --log-opt max-file=3），
#     校验 Running/health 通过后才保留，异常则立即回滚（把旧容器 rename 回来、新容器 rm）。
#   * 全部挂载（bind / named volume / tmpfs）原样保留 ⇒ 有状态服务（mysql/redis 等）数据不丢。
#   * 状态无关服务与有状态服务分组，便于在窗口内按依赖顺序执行。
#
# 用法：
#   sudo bash fix-xiaolongxia-log-recreate.sh            # 默认 dry-run，打印命令
#   sudo bash fix-xiaolongxia-log-recreate.sh --apply    # 真正重建（建议在维护窗口）
#   sudo bash fix-xiaolongxia-log-recreate.sh --apply --only xiaolongxia-gateway,redis
# ============================================================================
set -uo pipefail
cd /tmp || exit 2

APPLY=0
ONLY=""
while [ $# -gt 0 ]; do
  case "$1" in
    --apply) APPLY=1 ;;
    --only)  ONLY="$2"; shift ;;
    *) echo "未知参数: $1" >&2; exit 2 ;;
  esac
  shift
done

LOG_OPT_SIZE="50m"
LOG_OPT_FILE="3"
PY=/opt/ynva/.venv/bin/python3
[ -x "$PY" ] || PY=python3

# --- 生成重建命令的 Python（从 inspect 还原 docker run）---
read -r -d '' GEN <<'PYEOF' || true
import json, sys, shlex

def q(s): return shlex.quote(s)

only = set(x for x in (sys.argv[1].split(',') if len(sys.argv) > 1 and sys.argv[1] else []) if x)
conts = json.loads(sys.stdin.read())
out = []
for c in conts:
    name = c['Name'].lstrip('/')
    if only and name not in only:
        continue
    cfg = c['Config']; hc = c['HostConfig']; ns = c['NetworkSettings']
    cmd = ['docker', 'run', '-d', '--name', name]
    # user
    if cfg.get('User'):
        cmd += ['--user', cfg['User']]
    # workdir
    if cfg.get('WorkingDir'):
        cmd += ['--workdir', cfg['WorkingDir']]
    # hostname (skip default)
    # env
    for e in cfg.get('Env') or []:
        cmd += ['-e', e]
    # labels
    for k, v in (cfg.get('Labels') or {}).items():
        if k.startswith('com.docker.compose') or k.startswith('org.opencontainers'):
            continue  # 漂移 compose 标签不再适用，重建后按独立容器管理
        cmd += ['--label', f'{k}={v}']
    # entrypoint + cmd：--entrypoint 是 flag（放前面），但入口点参数/CMD 必须放到【镜像之后】
    # （docker run 语法：flags ... IMAGE [command args]，否则 -Dxxx 等会被当成未知 flag 解析失败）
    ep = cfg.get('Entrypoint') or []
    cm = cfg.get('Cmd') or []
    tail_args = []
    if ep:
        cmd += ['--entrypoint', ep[0]]
        tail_args = ep[1:] + cm
    else:
        tail_args = cm
    # mounts：必须读【顶层】.Mounts，HostConfig.Mounts 在旧版 docker 创建的容器里是 null
    # （bind 在 HostConfig.Binds、匿名卷只出现在顶层 .Mounts），否则会丢掉所有挂载（含数据卷！）
    # 注意：type=volume 必须用【卷名 Name】而非 Source 路径，否则会变成 bind 挂载而丢失命名卷数据。
    for m in (c.get('Mounts') or hc.get('Mounts') or []):
        t = m.get('Type'); dst = m.get('Destination')
        if not dst:
            continue
        if t == 'bind':
            spec = f"{m.get('Source')}:{dst}"
            mode = m.get('Mode')
            if mode: spec += f":{mode}"
            cmd += ['--volume', spec]
        elif t == 'volume':
            spec = f"{m.get('Name')}:{dst}"
            mode = m.get('Mode')
            if mode: spec += f":{mode}"
            cmd += ['--volume', spec]
        elif t == 'tmpfs':
            cmd += ['--tmpfs', dst]
    # ports
    for port, binds in (hc.get('PortBindings') or {}).items():
        if not binds:
            cmd += ['-p', port]
            continue
        for b in binds:
            hip = b.get('HostIp') or ''
            hport = b.get('HostPort') or ''
            spec = f"{hip}:{hport}:{port}" if hip or hport else port
            cmd += ['-p', spec]
    # restart
    rp = hc.get('RestartPolicy') or {}
    if rp.get('Name'):
        r = rp['Name']
        if rp.get('MaximumRetryCount'):
            r += f":{rp['MaximumRetryCount']}"
        cmd += ['--restart', r]
    # privileged / caps / security
    if hc.get('Privileged'):
        cmd += ['--privileged']
    for cap in hc.get('CapAdd') or []:
        cmd += ['--cap-add', cap]
    for cap in hc.get('CapDrop') or []:
        cmd += ['--cap-drop', cap]
    for so in hc.get('SecurityOpt') or []:
        cmd += ['--security-opt', so]
    # extra hosts —— 【关键】故意【不】保留！
    # 教训（2026-10-09 事故）：小龙虾部分容器（如 xiaolongxia-notification-service）的
    # ExtraHosts 把服务名硬编码成创建时的旧 IP（rabbitmq:172.19.0.22 / mysql:172.19.0.3 /
    # neo4j:172.19.0.23 等）。一旦 IP 因重启/网络重建而漂移，这些 --add-host 会比 Docker DNS
    # 优先级更高，导致容器连错目标（connection refused / actuator DOWN）。重建时一律丢弃，
    # 改由 xiaolongxia-system_xiaolongxia-network 的内网 DNS 按服务名解析（当前干净、正确）。
    # 若确有需要固定 host 映射的场景，请在重建前人工核对 IP 是否仍有效，再单独 --add-host。
    if hc.get('ExtraHosts'):
        dropped = hc['ExtraHosts']
    else:
        dropped = []
    # log opts (THE FIX)
    cmd += ['--log-opt', f'max-size={sys.argv[2]}', '--log-opt', f'max-file={sys.argv[3]}']
    # networks: first as --network, rest connected after start
    nets = [n for n in (ns.get('Networks') or {}) if n not in ('none', 'ingress')]
    extra_nets = []
    if nets:
        cmd += ['--network', nets[0]]
        extra_nets = nets[1:]
        # network aliases on first net
        aliases = (ns['Networks'][nets[0]].get('Aliases') or [])
        for a in aliases:
            if a and a != name:
                cmd += ['--network-alias', a]
    cmd += [cfg['Image']]
    # 入口点参数 / CMD 必须位于镜像之后（docker run flags ... IMAGE [args]）
    cmd += [q(t) for t in tail_args]
    runstr = ' '.join(shlex.quote(x) if i >= 0 else x for i, x in enumerate(cmd))
    # post-connect for extra networks
    post = ''
    for n in extra_nets:
        post += f"\ndocker network connect {shlex.quote(n)} {shlex.quote(name)}"
    out.append((name, runstr + post, dropped))
print(json.dumps(out))
PYEOF

echo "=== 收集容器 inspect ==="
MAP=$(sudo docker ps -q | xargs -r sudo docker inspect)
# 过滤出小龙虾相关 + 依赖组件（stateful 一并处理，规格重建保挂载）
SELECTED=$(echo "$MAP" | "$PY" -c '
import json,sys
cs=json.loads(sys.stdin.read())
want=[]
for c in cs:
    n=c["Name"].lstrip("/")
    if n.startswith("xiaolongxia-") or n in ("redis","mysql","rabbitmq","neo4j","nacos","zipkin"):
        want.append(c)
print(json.dumps(want))
')

echo "=== 生成重建命令（dry-run 默认；--apply 才执行）==="
GENOUT=$("$PY" -c "$GEN" "$ONLY" "$LOG_OPT_SIZE" "$LOG_OPT_FILE" <<< "$SELECTED")

if [ "$APPLY" -eq 0 ]; then
  echo "$GENOUT" | "$PY" -c 'import json,sys
for n,s,d in json.loads(sys.stdin.read()):
    print("# ---- "+n+" ----")
    if d: print("#  \u26a0 \u5df2\u4e22\u5f03 ExtraHosts (\u6539\u7528 Docker DNS): "+", ".join(d))
    print(s); print()'
  echo ">>> 以上为 DRY-RUN 输出，未改动任何容器。加 --apply 才真正重建。"
  exit 0
fi

# ===================== APPLY =====================
TS=$(date +%s)
echo ">>> APPLY 模式：开始重建（stop 旧容器 → 建新容器 → 健康校验 → 异常回滚）"
echo ">>> 旧容器以 <name>.bak-$TS 保留，确认无误后手动 docker rm"
FAIL=0
for n in $(echo "$GENOUT" | "$PY" -c 'import json,sys
for x in json.loads(sys.stdin.read()): print(x[0])'); do
  spec=$(echo "$GENOUT" | N="$n" "$PY" -c 'import json,sys,os
d={x[0]:x[1] for x in json.loads(sys.stdin.read())}
print(d[os.environ["N"]])')
  echo "--- 重建 $n ---"
  # 1) rename 旧容器（保留以便回滚）
  if ! sudo docker rename "$n" "$n.bak-$TS" 2>/dev/null; then
    echo "  [SKIP] rename 失败，跳过"; FAIL=$((FAIL+1)); continue
  fi
  # 2) 必须先停旧容器，否则其端口/卷占用会让新容器创建失败
  sudo docker stop "$n.bak-$TS" >/dev/null 2>&1
  # 3) 建新容器（spec 一致 + log limit）
  if ! eval "$spec" >/dev/null 2>&1; then
    echo "  [ROLLBACK] 新建失败，重启旧容器"
    sudo docker start "$n.bak-$TS" >/dev/null 2>&1
    sudo docker rename "$n.bak-$TS" "$n" 2>/dev/null
    FAIL=$((FAIL+1)); continue
  fi
  # 4) 健康校验（Running + 有健康探针则须 healthy）
  ok=0
  for i in $(seq 1 25); do
    st=$(sudo docker inspect -f '{{.State.Running}}' "$n" 2>/dev/null)
    hc=$(sudo docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}na{{end}}' "$n" 2>/dev/null)
    if [ "$st" = "true" ] && { [ "$hc" = "na" ] || [ "$hc" = "healthy" ]; }; then ok=1; break; fi
    sleep 1
  done
  if [ "$ok" -eq 1 ]; then
    echo "  [OK] 重建成功且健康，旧容器保留为 $n.bak-$TS"
  else
    echo "  [ROLLBACK] 健康校验未通过，回滚"
    sudo docker rm -f "$n" 2>/dev/null
    sudo docker start "$n.bak-$TS" >/dev/null 2>&1
    sudo docker rename "$n.bak-$TS" "$n" 2>/dev/null
    FAIL=$((FAIL+1))
  fi
done
echo ">>> 完成。失败/回滚容器数: $FAIL"
echo ">>> 确认全部正常后清理旧容器："
echo "    sudo docker rm \$(sudo docker ps -a --filter name=bak-$TS -q)"
