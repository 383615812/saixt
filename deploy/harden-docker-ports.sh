#!/usr/bin/env bash
# ============================================================================
# 小龙虾容器端口加固：把公网 0.0.0.0 绑定改成 172.17.0.1（宿主桥网关，公网不可达）
#
# 背景（2026-10-09 安全审计发现）：
#   服务器 ufw 未启用 (inactive)，且大量 docker 容器把端口发布到了 0.0.0.0（公网），
#   包括 mysql:3306 / redis:6379 / rabbitmq:5672,15672 / neo4j:7474,7687 /
#   nacos:8848,9848,9849 / zipkin:9411 / 以及 14 个微服务 8082-8098。
#   这些服务只被同 docker 网络内的其他容器（按服务名）访问，主机侧根本不需要它们
#   暴露到公网。一旦腾讯云安全组放宽对应端口，即直接暴露（MySQL 还存有 root@% 远程账户）。
#
# 修法：重建容器时把 HostIp 0.0.0.0(含空=默认) 改写为 172.17.0.1（宿主桥网关，公网不可达，容器内仍可达）。
#   * 公网不可达（阻断互联网暴露）
#   * 主机回环仍可访问（mysqldump / redis-cli 本地调试、备份不受影响）
#   * 容器间经 docker 网络服务名互访，完全不受影响
#
# 安全设计（与 fix-xiaolongxia-log-recreate.sh 同款）：
#   * 默认 DRY-RUN：只打印命令。
#   * --apply 才执行；每重建一个：旧容器 rename <name>.bak-<ts> 保留，建新容器，
#     健康校验通过才保留，异常立即回滚。
#   * 丢弃 ExtraHosts（改用 Docker DNS，见 2026-10-09 事故复盘）。
#   * 全部挂载原样保留 ⇒ 有状态服务数据不丢。
#
# 用法：
#   sudo bash harden-docker-ports.sh                 # dry-run
#   sudo bash harden-docker-ports.sh --apply         # 真正重建（建议维护窗口）
#   sudo bash harden-docker-ports.sh --apply --only mysql,redis
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
    if cfg.get('User'):
        cmd += ['--user', cfg['User']]
    if cfg.get('WorkingDir'):
        cmd += ['--workdir', cfg['WorkingDir']]
    for e in cfg.get('Env') or []:
        cmd += ['-e', e]
    for k, v in (cfg.get('Labels') or {}).items():
        if k.startswith('com.docker.compose') or k.startswith('org.opencontainers'):
            continue
        cmd += ['--label', f'{k}={v}']
    ep = cfg.get('Entrypoint') or []
    cm = cfg.get('Cmd') or []
    tail_args = []
    if ep:
        cmd += ['--entrypoint', ep[0]]
        tail_args = ep[1:] + cm
    else:
        tail_args = cm
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
    # ===== 端口加固：0.0.0.0/空 -> 172.17.0.1（宿主桥网关，公网不可达，容器内仍可达）=====
    # 为什么绑 172.17.0.1 而不是 127.0.0.1：
    #   大量应用容器（含其启动命令里硬编码的 jdbc:mysql://172.17.0.1:3306）经宿主桥网关
    #   172.17.0.1 访问 mysql/redis（因为二者发布在 0.0.0.0 上、docker-proxy 转发）。
    #   若改绑 127.0.0.1，这些硬编码引用会失效 → 应用失去 DB。绑 172.17.0.1 则：
    #     * 公网（119.45.196.149）不可达（docker 仅在 172.17.0.1 监听，DNAT 不匹配公网目的 IP）
    #     * 容器内经宿主路由仍可访问 172.17.0.1:*（与现状完全一致，零行为变化）
    #   即：无需改任何应用配置，即把公网暴露面清零。若要更彻底，后续可再改应用配置走服务名。
    rebinds = []
    for port, binds in (hc.get('PortBindings') or {}).items():
        if not binds:
            cmd += ['-p', port]
            continue
        for b in binds:
            hip = b.get('HostIp') or ''
            hport = b.get('HostPort') or ''
            if hip in ('', '0.0.0.0'):
                hip = '172.17.0.1'
                rebinds.append(f"{hport}:{port}")
            spec = f"{hip}:{hport}:{port}" if hip or hport else port
            cmd += ['-p', spec]
    # restart
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
    # 丢弃 ExtraHosts（改 Docker DNS）
    dropped = hc.get('ExtraHosts') or []
    # log opts（与线上 daemon.json 一致，无害）
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
    # 注意：此处【不可】对 tail_args 逐个 q() 二次引用——下方 runstr 会统一 shlex.quote 一次。
    # 双重引用会让【含空格】的参数（典型：shell 形式 Entrypoint=["/bin/sh"] + Cmd=["-c","java ..."]）
    # 在 eval 还原后带上字面单引号 → 容器执行 /bin/sh -c "'java ...'" → command not found → exit 127。
    # （2026-10-09 全量加固事故根因：10 个 shell-form 容器因此崩溃重启）
    # 不含特殊字符的单 token 参数（如 -Xmx256m / -jar）quote 后原样，故 exec 形式容器恰好免疫。
    cmd += tail_args
    runstr = ' '.join(shlex.quote(x) for x in cmd)
    post = ''
    for n in extra_nets:
        post += f"\ndocker network connect {shlex.quote(n)} {shlex.quote(name)}"
    out.append((name, runstr + post, dropped, rebinds))
print(json.dumps(out))
PYEOF

echo "=== 收集容器 inspect ==="
MAP=$(sudo docker ps -q | xargs -r sudo docker inspect)
SELECTED=$(echo "$MAP" | "$PY" -c '
import json,sys
cs=json.loads(sys.stdin.read())
want=[]
for c in cs:
    n=c["Name"].lstrip("/")
    # 只选确实把端口发布到 0.0.0.0 的容器
    pb=(c.get("HostConfig") or {}).get("PortBindings") or {}
    public=False
    for port,binds in pb.items():
        for b in (binds or []):
            hip=b.get("HostIp") or ""
            if hip in ("","0.0.0.0"):
                public=True; break
        if public: break
    if public:
        want.append(c)
print(json.dumps(want))
')

if [ -z "$SELECTED" ] || [ "$SELECTED" = "[]" ]; then
  echo ">>> 未发现任何把端口发布到 0.0.0.0 的容器，无需加固。"
  exit 0
fi

echo "=== 生成重建命令（dry-run 默认；--apply 才执行）==="
GENOUT=$("$PY" -c "$GEN" "$ONLY" <<< "$SELECTED")

if [ "$APPLY" -eq 0 ]; then
  echo "$GENOUT" | "$PY" -c 'import json,sys
for n,s,d,rb in json.loads(sys.stdin.read()):
    print("# ---- "+n+" ----")
    if rb: print("#  \u91cd\u7ed1\u5b9a\u516c\u7f51\u7aef\u53e3\u5230 172.17.0.1: "+", ".join(rb))
    if d: print("#  \u26a0 \u5df2\u4e22\u5f03 ExtraHosts (\u6539\u7528 Docker DNS): "+", ".join(d))
    print(s); print()'
  echo ">>> 以上为 DRY-RUN 输出，未改动任何容器。加 --apply 才真正重建。"
  exit 0
fi

# ===================== APPLY =====================
TS=$(date +%s)
echo ">>> APPLY 模式：开始重建（旧容器 rename 保留，建新容器 → 健康校验 → 异常回滚）"
FAIL=0
for n in $(echo "$GENOUT" | "$PY" -c 'import json,sys
for x in json.loads(sys.stdin.read()): print(x[0])'); do
  spec=$(echo "$GENOUT" | N="$n" "$PY" -c 'import json,sys,os
d={x[0]:x[1] for x in json.loads(sys.stdin.read())}
print(d[os.environ["N"]])')
  echo "--- 重建 $n ---"
  if ! sudo docker rename "$n" "$n.bak-$TS" 2>/dev/null; then
    echo "  [SKIP] rename 失败，跳过"; FAIL=$((FAIL+1)); continue
  fi
  sudo docker stop "$n.bak-$TS" >/dev/null 2>&1
  if ! eval "$spec" >/dev/null 2>&1; then
    echo "  [ROLLBACK] 新建失败，重启旧容器"
    sudo docker start "$n.bak-$TS" >/dev/null 2>&1
    sudo docker rename "$n.bak-$TS" "$n" 2>/dev/null
    FAIL=$((FAIL+1)); continue
  fi
  ok=0
  for i in $(seq 1 30); do
    st=$(sudo docker inspect -f '{{.State.Running}}' "$n" 2>/dev/null)
    rst=$(sudo docker inspect -f '{{.State.Restarting}}' "$n" 2>/dev/null)
    hc=$(sudo docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}na{{end}}' "$n" 2>/dev/null)
    if [ "$st" = "true" ] && [ "$rst" = "false" ] && { [ "$hc" = "na" ] || [ "$hc" = "healthy" ]; }; then
      # 二次确认：再等 4s，确认仍 Running、未 Restarting 且 RestartCount 仍为 0
      # （防止被"崩溃-重启间隙"骗过：exit 127 的容器也会短暂出现 Running）
      sleep 4
      st2=$(sudo docker inspect -f '{{.State.Running}}' "$n" 2>/dev/null)
      rst2=$(sudo docker inspect -f '{{.State.Restarting}}' "$n" 2>/dev/null)
      rc=$(sudo docker inspect -f '{{.RestartCount}}' "$n" 2>/dev/null)
      if [ "$st2" = "true" ] && [ "$rst2" = "false" ] && [ "$rc" = "0" ]; then ok=1; break; fi
    fi
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
