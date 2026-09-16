#!/usr/bin/env bash
# 生产健康检查（只读）
# 用法: bash health-check.sh [appDir]  appDir 默认 /opt/saixt
set -u
APP="${1:-/opt/saixt}"

echo "===== [1/7] 系统信息 ====="
uptime
echo "-- 内存 --"; free -h | head -2
echo "-- 磁盘 --"; df -h / | tail -1

echo ""
echo "===== [2/7] Node / PM2 ====="
node -v
pm2 jlist 2>/dev/null | node -e '
let d = "";
process.stdin.on("data", c => d += c);
process.stdin.on("end", () => {
  try {
    const arr = JSON.parse(d);
    if (!arr.length) { console.log("  (无 PM2 进程)"); return; }
    for (const p of arr) {
      const st = p.pm2_env;
      const up = st.pm_uptime ? Math.round((Date.now() - st.pm_uptime) / 60000) : "?";
      console.log(`  ${p.name}: status=${st.status} restarts=${st.restart_time} uptime=${up}min mem=${Math.round(p.monit.memory / 1048576)}MB`);
    }
  } catch (e) { console.log("  pm2 jlist 解析失败: " + e.message); }
});
'

echo ""
echo "===== [3/7] 应用 HTTP 探测 ====="
PORT=$(pm2 jlist 2>/dev/null | node -e '
let d = ""; process.stdin.on("data", c => d += c); process.stdin.on("end", () => {
  try { const arr = JSON.parse(d); const p = arr.find(x => x.name === "saixt-server"); console.log(p?.pm2_env?.env?.PORT || ""); } catch (e) { console.log(""); }
});')
[ -z "$PORT" ] && PORT=3000
echo "  目标端口: $PORT"
echo "-- 监听端口 --"
ss -tlnp 2>/dev/null | grep -E ":(3000|8080|80|443)\b" | head -10
for ep in "/api/health" "/health" "/api/ping" "/"; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -m 5 "http://127.0.0.1:${PORT}${ep}" 2>/dev/null || echo 000)
  echo "  GET ${ep} -> HTTP $CODE"
done

echo ""
echo "===== [4/7] 部署版本 ====="
if [ -d "$APP/.git" ]; then
  cd "$APP" && echo "  HEAD: $(git log --oneline -1 2>/dev/null)" && git log --oneline -3 2>/dev/null
  echo "  工作区: $(git status --porcelain 2>/dev/null | wc -l) 个未提交变更"
else
  echo "  $APP 非 git 仓库"
fi

echo ""
echo "===== [5/7] 最近错误日志 ====="
pm2 logs saixt-server --lines 400 --nostream --err 2>/dev/null | grep -iE "error|exception|uncaught|ECONN|EADDR|SQLITE|ER_|failed" | tail -15 || echo "  无错误日志"

echo ""
echo "===== [6/7] 数据库只读体检 ====="
DB="$APP/server/data/saixt.db"
if [ ! -f "$DB" ]; then echo "  数据库不存在: $DB"; else
  if [ -f "$APP/server/scripts/audit-data.mjs" ]; then
    node "$APP/server/scripts/audit-data.mjs" "$DB" 2>&1 | tail -45
  else
    echo "  audit-data.mjs 未找到，仅做基础检查"
    node -e "const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync('$DB',{readOnly:true});console.log('  打开成功，users='+db.prepare('SELECT COUNT(*) c FROM users').get().c+', questions='+db.prepare('SELECT COUNT(*) c FROM questions').get().c)"
  fi
fi

echo ""
echo "===== [7/9] 支付渠道就绪探测 ====="
if [ -f "$APP/server/scripts/pay-probe.mjs" ]; then
  node "$APP/server/scripts/pay-probe.mjs" 2>&1 | tail -6
else
  echo "  pay-probe.mjs 未找到，跳过"
fi

echo ""
echo "===== [8/9] AI（DeepSeek）就绪探测 ====="
if [ -f "$APP/server/scripts/ai-probe.mjs" ]; then
  node "$APP/server/scripts/ai-probe.mjs" 2>&1 | tail -5
else
  echo "  ai-probe.mjs 未找到，跳过"
fi

echo ""
echo "===== [9/9] 结论 ====="
echo "  健康检查完成"
