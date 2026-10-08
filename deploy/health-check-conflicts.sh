#!/usr/bin/env bash
# ============================================================
# 三站共存冲突巡检（只读，无副作用）
#   检查三系统同机共存时的相互干扰面：
#     1. 端口占用冲突
#     2. nginx location 优先级 / 路由劫持
#     3. 数据库与存储隔离
#     4. localStorage / Cookie 键名跨站冲突（同域共享！）
#     5. Service Worker 作用域越界
#     6. 资源争抢（内存/磁盘/负载）
#     7. CORS 配置
#     8. 并发互不干扰
#
# 用法（在 119.45.196.149 上执行）: bash deploy/health-check-conflicts.sh
# 退出码: 0=无冲突, 1=发现冲突
# ============================================================
set -uo pipefail
BASE="https://www.xlxzb.com"
WARN=0
note() { echo "  $1"; }
bad() { echo "  ❌ $1"; WARN=$((WARN+1)); }
ok()  { echo "  ✅ $1"; }

echo "=========================================="
echo " 三站共存冲突巡检 $(date '+%F %T')"
echo "=========================================="

echo ""
echo "=== 1) 端口占用（3000=saixt / 8000=ynva / 8080=小龍虾 / 5432=PG）==="
for p in 3000 8000 8080 5432; do
  L=$(sudo ss -ltn 2>/dev/null | grep -c ":$p ")
  if [ "$L" -ge 1 ]; then ok "端口 $p 已监听"; else bad "端口 $p 未监听!"; fi
done
# 真冲突定义：同一端口被两个【不同】进程占用。
# nginx/sshd 同进程多 worker、多个容器各自的 docker-proxy（端口不同）均不算冲突。
DUP=$(sudo ss -ltnp 2>/dev/null | awk '/LISTEN/{
    port=$4; sub(/.*:/,"",port);
    if (match($0, /users:\(\("([^"]+)"/, m)) proc=m[1]; else proc="unknown";
    key=port; if (!(key in seen)) { seen[key]=proc; order[++n]=key }
    else if (seen[key] != proc) conflict[key]=seen[key] " vs " proc;
}
END { c=0; for (k in conflict) { print k": "conflict[k]; if (++c>=5) break } }')
[ -z "$DUP" ] && ok "无「同一端口被不同进程占用」的真冲突" || bad "真冲突 -> $(echo "$DUP" | tr '\n' '; ')"

echo ""
echo "=== 2) nginx 路由冲突（三站前缀是否用 ^~ 防劫持）==="
NG=/etc/nginx/nginx.conf
for p in /saixt/ /ynva/ /xiaolongxia/; do
  LINE=$(sudo grep -n "location \^~ ${p}" "$NG" 2>/dev/null | head -1 | cut -d: -f1)
  if [ -n "$LINE" ]; then ok "$p 使用 ^~ (第 $LINE 行)，不被静态正则劫持"
  else note "$p 未用 ^~，若出现静态资源 404 需检查正则优先级"; fi
done
# 实测最容易出事的三个静态资源
for u in /saixt/sw.js /saixt/assets/index-dyhT2Y1l.js /ynva/static/sw.js; do
  C=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$BASE$u")
  [ "$C" = "200" ] && ok "$u -> 200" || bad "$u -> $C (可能被同域其它站正则劫持)"
done

echo ""
echo "=== 3) 存储隔离（三站不得共用数据库文件/库）==="
SB=$(ls -la /opt/saixt/server/data/saixt.db 2>/dev/null | awk '{print $5}')
[ -n "$SB" ] && [ "$SB" -gt 100000 ] && ok "saixt SQLite 独立且有数据 ($SB bytes)" || bad "saixt SQLite 异常"
PG=$(sudo -u postgres psql -d yunzhixue -tAc "SELECT pg_size_pretty(pg_database_size('yunzhixue'));" 2>/dev/null)
[ -n "$PG" ] && ok "ynva PG 库 yunzhixue 独立 ($PG)" || bad "ynva PG 库不可用"
# 两站各自的核心表（saixt=questions 在 SQLite，ynva=questions 在 PG，二者同名属正常）
SST=$(node -e "const{DatabaseSync}=require('node:sqlite');const d=new DatabaseSync('/opt/saixt/server/data/saixt.db');console.log(d.prepare(\"SELECT count(*) c FROM sqlite_master WHERE type='table' AND name='questions'\").get().c)" 2>/dev/null)
[ "$SST" = "1" ] && ok "saixt SQLite 有 questions 表（职教PG同名表不冲突，各库独立）" || bad "saixt SQLite 缺 questions 表"

echo ""
echo "=== 4) localStorage 键名跨站冲突（同域共享，最易被忽略）==="
YL=$(curl -s --max-time 20 "$BASE/ynva/" | grep -oE "localStorage\.(get|set)Item\('[a-zA-Z_]+'" | grep -oE "'[a-zA-Z_]+'" | tr -d "'" | sort -u)
SL=$(grep -rhoE "localStorage\.(get|set)Item\('[a-zA-Z_]+'" /opt/saixt/web/src/ 2>/dev/null | grep -oE "'[a-zA-Z_]+'" | tr -d "'" | sort -u)
CLASH=$(comm -12 <(echo "$YL" | sort -u) <(echo "$SL" | sort -u) | tr '\n' ' ')
if [ -z "$CLASH" ]; then ok "saixt 与 ynva 的 localStorage 键无重叠"
else bad "键名冲突: $CLASH （同域会互相覆盖，需加站点前缀）"; fi

echo ""
echo "=== 5) Service Worker 作用域（越界会拦截其它站请求）==="
for u in /saixt/sw.js /ynva/static/sw.js; do
  H=$(curl -sI --max-time 15 "$BASE$u" | grep -i 'service-worker-allowed' | tr -d '\r')
  if [ -z "$H" ]; then ok "$u 未设 Service-Worker-Allowed（仅管自己目录，安全）"
  else note "$u 设置了 $H —— 确认未越界到根路径"; fi
done

echo ""
echo "=== 6) 资源争抢 ==="
MEM=$(free -g | awk '/Mem:/{print $7}')   # available GB
LOAD=$(awk '{print $1}' /proc/loadavg)
DISK=$(df -h / | awk 'NR==2{gsub("%","",$5); print $5}')
[ "$MEM" -ge 2 ] && ok "可用内存 ${MEM}G" || bad "可用内存仅 ${MEM}G，吃紧"
awk -v l="$LOAD" 'BEGIN{exit !(l<4)}' && ok "负载 $LOAD 正常" || bad "负载 $LOAD 偏高"
[ "$DISK" -lt 85 ] && ok "磁盘 ${DISK}%" || bad "磁盘 ${DISK}% 偏高，建议清理 /tmp 构建残留"
sudo du -sh /tmp 2>/dev/null | awk '{print "     /tmp 占用 " $1}' | grep -q . && sudo du -sh /tmp 2>/dev/null | awk '{if ($1 ~ /G/) print "  ⚠️  /tmp 占用 " $1 "（多为构建残留，可清理）"}'

echo ""
echo "=== 6b) 上传大小限制（nginx 未设则默认 1M，多站共用易被忽略）==="
BODY=$(sudo nginx -T 2>/dev/null | grep -c 'client_max_body_size')
if [ "$BODY" -eq 0 ]; then
  note "nginx 未设 client_max_body_size ⇒ 全局默认 1M；当前两站均无上传接口，暂不阻塞"
elif [ "$BODY" -gt 0 ]; then
  ok "已设置 client_max_body_size ($BODY 处)"
fi

echo ""
echo "=== 7) CORS 配置 ==="
CO=$(grep -E '^CORS_ORIGIN=' /opt/saixt/server/.env 2>/dev/null | cut -d= -f2)
[ -n "$CO" ] && ok "saixt CORS_ORIGIN=$CO" || bad "saixt CORS_ORIGIN 未配置"
YC=$(grep -E '^CORS_ORIGIN=' /opt/ynva/.env 2>/dev/null | cut -d= -f2)
[ -n "$YC" ] && ok "ynva CORS_ORIGIN=$YC" || note "ynva CORS_ORIGIN 为空（同源访问不受影响，仅跨源场景受限）"

echo ""
echo "=== 7b) JWT 密钥强度（三站共存下的串站/伪造风险）==="
# 1) SECRET_KEY 必须已配置：为空则回退代码里的开发默认密钥，任何人可伪造 token
YS=$(grep -E '^SECRET_KEY=' /opt/ynva/.env 2>/dev/null | cut -d= -f2-)
if [ -z "$YS" ]; then
  bad "ynva SECRET_KEY 为空！正在使用代码内开发默认密钥，可被伪造登录 token"
elif [ ${#YS} -lt 32 ]; then
  bad "ynva SECRET_KEY 过短 (${#YS} 字符)，建议 >= 32"
else
  ok "ynva SECRET_KEY 已配置且强度足够 (${#YS} 字符)"
fi
# 2) 两站密钥必须不同，否则可跨站伪造 token
SS=$(grep -E '^SAIXT_SECRET=' /opt/saixt/server/.env 2>/dev/null | cut -d= -f2-)
YS2=$(grep -E '^SECRET_KEY=' /opt/ynva/.env 2>/dev/null | cut -d= -f2-)
if [ -n "$SS" ] && [ -n "$YS2" ] && [ "$SS" = "$YS2" ]; then
  bad "两站 JWT 密钥相同！可互相伪造 token"
elif [ -n "$SS" ] && [ -n "$YS2" ]; then
  ok "两站 JWT 密钥互不相同（无跨站伪造风险）"
else
  note "无法比对两站密钥（至少一站未配置）"
fi
# 3) .env 文件权限不应全员可读
for f in /opt/ynva/.env /opt/saixt/server/.env; do
  if [ -f "$f" ]; then
    M=$(stat -c '%a' "$f" 2>/dev/null)
    case "$M" in
      600|640) ok "$(basename $(dirname $f))/$(basename $f) 权限 $M (安全)";;
      *) note "$(basename $(dirname $f))/$(basename $f) 权限 $M (建议收紧到 600)";;
    esac
  fi
done

echo ""
echo "=== 8) 并发互不干扰（各 10 并发）==="
for s in /xiaolongxia/ /saixt/ /ynva/; do
  R=$(for i in $(seq 1 10); do curl -s -o /dev/null -w '%{http_code}\n' --max-time 20 "$BASE$s" & done; wait)
  OKN=$(echo "$R" | grep -c 200)
  [ "$OKN" -eq 10 ] && ok "$s 并发 10/10 全 200" || bad "$s 并发仅 $OKN/10 成功"
done

echo ""
echo "=========================================="
if [ "$WARN" -eq 0 ]; then
  echo " 结论: ✅ 未发现三站共存冲突"
else
  echo " 结论: ⚠️  发现 $WARN 项问题（见上方 ❌）"
fi
echo "=========================================="
[ "$WARN" -eq 0 ] || exit 1