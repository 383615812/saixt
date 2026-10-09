#!/usr/bin/env bash
# ============================================================================
# fix-xiaolongxia-cmd-dns.sh —— 根治：启动命令(Cmd/Entrypoint)中硬编码 172.17.0.1
#                              改为 Docker DNS 名(mysql / redis)
#
# 背景（2026-10-09 续查）：
#   fix-xiaolongxia-dns-env.sh 已把 env(DB_HOST/REDIS_HOST) 由 172.17.0.1 改为
#   mysql/redis。但 resource-service 的启动命令额外把数据源 URL 与 redis host 以
#   **命令行参数**形式硬编码：
#     --spring.datasource.url=jdbc:mysql://172.17.0.1:3306/xiaolongxia_system?...
#     --spring.data.redis.host=172.17.0.1  --spring.redis.host=172.17.0.1
#   命令行参数优先级高于 env，故 env 修复对它无效；它仍在打宿主网关 172.17.0.1，
#   而从 172.19.0.0/16 子网经 172.17.0.1 连接被 docker DNAT(! -i br-*)丢弃
#   ⇒ 2280 次/小时 SocketTimeout / Communications link failure（DB 实际已崩，
#   只是 /health 端点不校验 DB 返回 200 把问题掩盖）。
#   learning-progress / hermes 同类硬编码但当前 0 错误(疑似被 env 覆盖)，一并修正以求一致。
#
# 安全设计（同 dns-env 脚本）：
#   * 默认 DRY-RUN；--apply 才执行。
#   * 逐个重建：旧容器 rename <name>.bak-<ts> 保留 → 建新 → 强健康校验 → 失败立即回滚。
#   * 强健康校验：等日志 `Started .*Application in`/`Tomcat started on port`
#     且 Running && Restarting=false && RestartCount==0。
#   * 其余运行参数（挂载/网络/端口/重启策略/Entrypoint/Cmd 非地址部分）原样保留。
#   * 保留 ExtraHosts（避免重蹈 notification 旧 IP 钉死覆辙）。
#   * 严格规避 shlex 双重引用坑：tail_args 不二次 quote，统一由 runstr 单次 quote。
#
# 用法：
#   sudo bash fix-xiaolongxia-cmd-dns.sh                              # dry-run
#   sudo bash fix-xiaolongxia-cmd-dns.sh --only xiaolongxia-resource-service   # dry-run 单个
#   sudo bash fix-xiaolongxia-cmd-dns.sh --apply                      # 全量(含 3 个硬编码服务)
#   sudo bash fix-xiaolongxia-cmd-dns.sh --apply --only xiaolongxia-resource-service
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

PY=/opt/ynva/.venv/bin/python3
[ -x "$PY" ] || PY=python3

read -r -d '' GEN <<'PYEOF' || true
import json, sys, shlex

def fix_env(e):
    if '=' not in e:
        return e
    k, v = e.split('=', 1)
    if '172.17.0.1' not in v:
        return e
    keymap = {
        'DB_HOST': 'mysql', 'REDIS_HOST': 'redis', 'MYSQL_HOST': 'mysql',
        'NACOS_SERVER': 'nacos:8848',
        'SPRING_CLOUD_NACOS_SERVER_ADDR': 'nacos:8848',
        'SPRING_CLOUD_NACOS_DISCOVERY_SERVER_ADDR': 'nacos:8848',
    }
    if k in keymap:
        return f'{k}={keymap[k]}'
    nv = v.replace('172.17.0.1:8848', 'nacos:8848') \
          .replace('172.17.0.1:3306', 'mysql:3306') \
          .replace('172.17.0.1:6379', 'redis:6379')
    return f'{k}={nv}' if nv != v else e

def fix_str(s):
    # 只处理数据源/redis 的硬编码宿主网关地址
    return (s
        .replace('jdbc:mysql://172.17.0.1:3306', 'jdbc:mysql://mysql:3306')
        .replace('redis://172.17.0.1:6379', 'redis://redis:6379')
        .replace('spring.data.redis.host=172.17.0.1', 'spring.data.redis.host=redis')
        .replace('spring.redis.host=172.17.0.1', 'spring.redis.host=redis'))

only = set(x for x in (sys.argv[1].split(',') if len(sys.argv) > 1 and sys.argv[1] else []) if x)
conts = json.loads(sys.stdin.read())
out = []
for c in conts:
    name = c['Name'].lstrip('/')
    if only and name not in only:
        continue
    cfg = c['Config']; hc = c['HostConfig']; ns = c['NetworkSettings']
    cmd = ['docker', 'run', '-d', '--name', name]
    if cfg.get('User'):
        cmd += ['--user', cfg['User']]
    if cfg.get('WorkingDir'):
        cmd += ['--workdir', cfg['WorkingDir']]
    changed = []
    for e in cfg.get('Env') or []:
        ne = fix_env(e)
        if ne != e:
            changed.append(f'{e}  ->  {ne}')
        cmd += ['-e', ne]
    for k, v in (cfg.get('Labels') or {}).items():
        if k.startswith('com.docker.compose') or k.startswith('org.opencontainers'):
            continue
        cmd += ['--label', f'{k}={v}']
    ep = [fix_str(x) for x in (cfg.get('Entrypoint') or [])]
    cm = [fix_str(x) for x in (cfg.get('Cmd') or [])]
    if ep:
        cmd += ['--entrypoint', ep[0]]
        tail_args = ep[1:] + cm
    else:
        tail_args = cm
    leftover = [x for x in (ep + cm) if '172.17.0.1' in x]
    if leftover:
        changed.append('WARN 仍有未处理 172.17.0.1: ' + ' | '.join(leftover))
    for m in (c.get('Mounts') or hc.get('Mounts') or []):
        t = m.get('Type'); dst = m.get('Destination')
        if not dst:
            continue
        if t == 'bind':
            spec = f"{m.get('Source')}:{dst}"
            if m.get('Mode'): spec += f":{m.get('Mode')}"
            cmd += ['--volume', spec]
        elif t == 'volume':
            spec = f"{m.get('Name')}:{dst}"
            if m.get('Mode'): spec += f":{m.get('Mode')}"
            cmd += ['--volume', spec]
        elif t == 'tmpfs':
            cmd += ['--tmpfs', dst]
    for port, binds in (hc.get('PortBindings') or {}).items():
        if not binds:
            cmd += ['-p', port]; continue
        for b in binds:
            hip = b.get('HostIp') or ''
            hport = b.get('HostPort') or ''
            if hip in ('', '0.0.0.0'):
                hip = '172.17.0.1'          # 维持既有端口加固
            spec = f"{hip}:{hport}:{port}" if (hip or hport) else port
            cmd += ['-p', spec]
    for eh in hc.get('ExtraHosts') or []:
        cmd += ['--add-host', eh]
    rp = hc.get('RestartPolicy') or {}
    if rp.get('Name'):
        r = rp['Name']
        if rp.get('MaximumRetryCount'):
            r += f":{rp['MaximumRetryCount']}"
        cmd += ['--restart', r]
    if hc.get('Privileged'):
        cmd += ['--privileged']
    for cap in hc.get('CapAdd') or []:
        cmd += ['--cap-add', cap]
    for cap in hc.get('CapDrop') or []:
        cmd += ['--cap-drop', cap]
    for so in hc.get('SecurityOpt') or []:
        cmd += ['--security-opt', so]
    cmd += ['--log-opt', 'max-size=50m', '--log-opt', 'max-file=3']
    nets = [n for n in (ns.get('Networks') or {}) if n not in ('none', 'ingress')]
    extra_nets = []
    if nets:
        cmd += ['--network', nets[0]]
        extra_nets = nets[1:]
        for a in (ns['Networks'][nets[0]].get('Aliases') or []):
            if a and a != name:
                cmd += ['--network-alias', a]
    cmd += [cfg['Image']]
    cmd += tail_args
    runstr = ' '.join(shlex.quote(x) for x in cmd)
    post = ''.join(f"\ndocker network connect {shlex.quote(n)} {shlex.quote(name)}" for n in extra_nets)
    out.append((name, runstr + post, changed))
print(json.dumps(out))
PYEOF

echo "=== 收集容器 inspect（筛选 Cmd/Entrypoint 含 172.17.0.1 的）==="
MAP=$(sudo docker ps -q | xargs -r sudo docker inspect)
SELECTED=$(echo "$MAP" | "$PY" -c '
import json,sys
cs=json.loads(sys.stdin.read())
want=[]
for c in cs:
    cfg=(c.get("Config") or {})
    blob=json.dumps(cfg.get("Cmd"))+json.dumps(cfg.get("Entrypoint"))
    if "172.17.0.1" in blob:
        want.append(c)
print(json.dumps(want))
')

if [ -z "$SELECTED" ] || [ "$SELECTED" = "[]" ]; then
  echo ">>> 没有 Cmd/Entrypoint 引用 172.17.0.1 的容器，无需处理。"
  exit 0
fi

GENOUT=$("$PY" -c "$GEN" "$ONLY" <<< "$SELECTED")

if [ "$APPLY" -eq 0 ]; then
  echo "$GENOUT" | "$PY" -c 'import json,sys
for n,s,ch in json.loads(sys.stdin.read()):
    print("# ---- "+n+" ----")
    for x in ch: print("#   "+x)
    print(s); print()'
  echo ">>> 以上为 DRY-RUN，未改动。加 --apply 生效。"
  exit 0
fi

# ===================== APPLY =====================
TS=$(date +%s)
echo ">>> APPLY：逐个重建（改 Cmd 硬编码地址 → 强健康校验 → 失败回滚）"
FAIL=0
NAMES=$(echo "$GENOUT" | "$PY" -c 'import json,sys
for x in json.loads(sys.stdin.read()): print(x[0])')

wait_ready() {
  n=$1; t=0
  while [ "$t" -lt 200 ]; do
    run=$(sudo docker inspect -f '{{.State.Running}}' "$n" 2>/dev/null)
    rst=$(sudo docker inspect -f '{{.State.Restarting}}' "$n" 2>/dev/null)
    rc=$(sudo docker inspect -f '{{.RestartCount}}' "$n" 2>/dev/null)
    [ "$rst" = "true" ] && return 1
    [ -n "$rc" ] && [ "$rc" != "0" ] && return 1
    if [ "$run" = "true" ] && sudo docker logs "$n" 2>&1 | grep -qE 'Started .*Application in|Tomcat started on port'; then
      sleep 6
      rc2=$(sudo docker inspect -f '{{.RestartCount}}' "$n" 2>/dev/null)
      run2=$(sudo docker inspect -f '{{.State.Running}}' "$n" 2>/dev/null)
      [ "$rc2" = "0" ] && [ "$run2" = "true" ] && return 0
    fi
    sleep 4; t=$((t+4))
  done
  return 1
}

for n in $NAMES; do
  spec=$(echo "$GENOUT" | N="$n" "$PY" -c 'import json,sys,os
d={x[0]:x[1] for x in json.loads(sys.stdin.read())}
print(d[os.environ["N"]])')
  echo "--- 重建 $n ---"
  if ! sudo docker rename "$n" "$n.bak-$TS" 2>/dev/null; then
    echo "  [SKIP] rename 失败"; FAIL=$((FAIL+1)); continue
  fi
  sudo docker stop "$n.bak-$TS" >/dev/null 2>&1
  if ! eval "$spec" >/dev/null 2>&1; then
    echo "  [ROLLBACK] 新建失败"
    sudo docker start "$n.bak-$TS" >/dev/null 2>&1
    sudo docker rename "$n.bak-$TS" "$n" 2>/dev/null
    FAIL=$((FAIL+1)); continue
  fi
  if wait_ready "$n"; then
    echo "  [OK] 已启动并就绪（旧容器保留 $n.bak-$TS）"
  else
    echo "  [ROLLBACK] 健康校验未通过"
    sudo docker rm -f "$n" >/dev/null 2>&1
    sudo docker start "$n.bak-$TS" >/dev/null 2>&1
    sudo docker rename "$n.bak-$TS" "$n" 2>/dev/null
    FAIL=$((FAIL+1))
  fi
done
echo ">>> 完成。失败/回滚数: $FAIL"
echo ">>> 全部正常后清理旧容器：sudo docker rm \$(sudo docker ps -a --filter name=bak-$TS -q)"
