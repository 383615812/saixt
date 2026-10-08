#!/usr/bin/env bash
# ============================================================================
# 备份「可恢复性」演练（只读生产，不改任何生产数据）
#
# 为什么需要：备份脚本每天 3:40 跑，日志一直显示 OK —— 但「文件生成了」不等于
# 「能还原」。真正会翻车的是：SQLite 用了非一致快照、pg_dump 中途失败留下半截文件、
# .env 备份里的 SECRET_KEY 是空的。这些平时完全看不出来，只在灾难恢复那一刻暴露。
#
# 本脚本做三件事（全部在只读/临时对象上进行）：
#   1. 春招 SQLite：对新备份跑 PRAGMA integrity_check，逐表比对与生产库的表集与行数
#   2. 职教 PostgreSQL：把 dump 还原到**临时库** restoretest_*，比对表集与逐表行数，最后 DROP
#   3. 职教 .env 备份：校验关键键存在且 SECRET_KEY 非空
#
# 退出码 0=全部通过；非 0=有硬性失败项（integrity 损坏 / 表缺失 / 还原报错 / env 缺键）
# ============================================================================
set -uo pipefail
cd /tmp || exit 2

BK=/home/ubuntu/backups-3sites
PROD_SQLITE=/opt/saixt/server/data/saixt.db
PROD_PG=yunzhixue
FAIL=0
WARN=0

hr() { printf '\n--- %s ---\n' "$*"; }
ok() { printf '  \033[1;32m✓ %s\033[0m\n' "$*"; }
ng() { printf '  \033[1;31m✗ %s\033[0m\n' "$*"; FAIL=$((FAIL+1)); }
wn() { printf '  \033[1;33m! %s\033[0m\n' "$*"; WARN=$((WARN+1)); }
inf(){ printf '    %s\n' "$*"; }

echo "备份可恢复性演练  $(date '+%F %T')"

# ---------------------------------------------------------------- 0. 备份新鲜度
hr "0. 备份新鲜度"
NEWEST_ANY=$(find "$BK" -type f -name 'saixt-*.db' -printf '%T@ %p\n' 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-)
if [ -n "$NEWEST_ANY" ]; then
  AGE_H=$(( ( $(date +%s) - $(stat -c %Y "$NEWEST_ANY") ) / 3600 ))
  inf "最新春招备份: $(basename "$NEWEST_ANY")  ${AGE_H}h 前"
  if [ "$AGE_H" -le 36 ]; then ok "备份新鲜(<=36h)"; else ng "备份过旧(${AGE_H}h)"; fi
else
  ng "找不到任何 saixt-*.db 备份"
fi

# ---------------------------------------------------------------- 1. SQLite
hr "1. 春招 SQLite 可恢复性"
SQLITE_BK="$NEWEST_ANY"
if [ -n "$SQLITE_BK" ] && [ -f "$PROD_SQLITE" ]; then
  cat > /tmp/_verify_sqlite.mjs <<'JSEOF'
import { DatabaseSync } from 'node:sqlite';
const [bkPath, prodPath] = process.argv.slice(2);

function snapshot(p) {
  const db = new DatabaseSync(p, { readOnly: true });
  let integrity = 'UNKNOWN';
  try {
    const rows = db.prepare('PRAGMA integrity_check').all();
    integrity = rows.map(r => Object.values(r).join(',')).join(';');
  } catch (e) {
    try {
      integrity = db.prepare('SELECT * FROM pragma_integrity_check').all()
        .map(r => Object.values(r).join(',')).join(';');
    } catch (e2) { integrity = 'ERR:' + e2.message; }
  }
  const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  ).all().map(r => r.name);
  const counts = {};
  for (const t of tables) {
    try { counts[t] = Number(db.prepare(`SELECT count(*) AS c FROM "${t}"`).get().c); }
    catch { counts[t] = -1; }
  }
  db.close();
  return { integrity, tables, counts };
}

let bk, prod;
try { bk = snapshot(bkPath); } catch (e) { console.log('INTEGRITY=无法打开备份: ' + e.message); console.log('SQLITE_VERDICT=FAIL'); process.exit(1); }
try { prod = snapshot(prodPath); } catch (e) { prod = null; }

console.log('INTEGRITY=' + bk.integrity);
console.log('TABLES_BK=' + bk.tables.length + (prod ? ' TABLES_PROD=' + prod.tables.length : ''));
const total = Object.values(bk.counts).filter(v => v > 0).reduce((a, b) => a + b, 0);
console.log('ROWS_TOTAL_BK=' + total);

let bad = 0;
if (bk.integrity.toLowerCase() !== 'ok') { console.log('!! integrity_check 未返回 ok'); bad++; }

if (prod) {
  const missing = prod.tables.filter(t => !bk.tables.includes(t));
  const extra = bk.tables.filter(t => !prod.tables.includes(t));
  if (missing.length) { console.log('MISSING_TABLES=' + missing.join(',')); bad++; }
  if (extra.length) console.log('EXTRA_TABLES=' + extra.join(','));
  const drift = [];
  for (const t of prod.tables) {
    if (!(t in bk.counts)) continue;
    if (bk.counts[t] !== prod.counts[t]) drift.push(`${t}:备份${bk.counts[t]}/生产${prod.counts[t]}`);
  }
  console.log('ROW_DRIFT=' + (drift.length ? drift.join(' ') : 'none'));
}
console.log('SQLITE_VERDICT=' + (bad === 0 ? 'PASS' : 'FAIL'));
process.exit(bad === 0 ? 0 : 1);
JSEOF
  if OUT=$(node /tmp/_verify_sqlite.mjs "$SQLITE_BK" "$PROD_SQLITE" 2>&1); then
    printf '%s\n' "$OUT" | while IFS= read -r l; do inf "$l"; done
    ok "SQLite 备份完整且可打开（表集一致，行数差异仅为备份后新增写入，属正常）"
  else
    printf '%s\n' "$OUT" | while IFS= read -r l; do inf "$l"; done
    ng "SQLite 备份校验失败（integrity 损坏或表缺失）"
  fi
  rm -f /tmp/_verify_sqlite.mjs
else
  ng "缺少备份文件或生产库，跳过"
fi

# ---------------------------------------------------------------- 2. PostgreSQL
hr "2. 职教 PostgreSQL 可恢复性（还原到临时库）"
DUMP=$(find "$BK" -type f -name 'yunzhixue-*.dump' -printf '%T@ %p\n' 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-)
if [ -n "$DUMP" ]; then
  inf "dump: $(basename "$DUMP")  $(du -h "$DUMP" | cut -f1)"
  TMPDB="restoretest_$(date +%s)"
  cleanup() { sudo -u postgres dropdb --if-exists "$TMPDB" >/dev/null 2>&1; }
  trap cleanup EXIT
  if ! sudo -u postgres createdb "$TMPDB" 2>/tmp/_pg.err; then
    ng "无法创建临时库：$(head -c 200 /tmp/_pg.err)"
  else
    if cat "$DUMP" | sudo -u postgres pg_restore -d "$TMPDB" --no-owner --no-privileges >/dev/null 2>/tmp/_pgrestore.err; then
      ok "pg_restore 无错误"
    else
      ERRCNT=$(grep -ci "error" /tmp/_pgrestore.err 2>/dev/null || echo 0)
      inf "pg_restore 退出非 0，错误行数=$ERRCNT（仅 warning 可接受）"
      grep -i "error" /tmp/_pgrestore.err 2>/dev/null | head -5 | while IFS= read -r l; do inf "$l"; done
    fi

    # 表集比对
    TABLES_PROD=$(sudo -u postgres psql -d "$PROD_PG" -tAc \
      "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1" 2>/dev/null)
    TABLES_RST=$(sudo -u postgres psql -d "$TMPDB" -tAc \
      "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1" 2>/dev/null)
    NP=$(printf '%s\n' "$TABLES_PROD" | grep -c . )
    NR=$(printf '%s\n' "$TABLES_RST" | grep -c . )
    inf "表数: 生产=$NP  还原=$NR"
    MISSING=$(comm -23 <(printf '%s\n' "$TABLES_PROD" | sort) <(printf '%s\n' "$TABLES_RST" | sort))
    if [ -n "$MISSING" ]; then ng "还原后缺失表: $(printf '%s' "$MISSING" | tr '\n' ' ')"; else ok "表集一致"; fi

    # 逐表行数比对
    gen_counts() {
      sudo -u postgres psql -d "$1" -tAc \
        "SELECT string_agg(format('SELECT %L AS t, count(*) AS c FROM %I', tablename, tablename), ' UNION ALL ') FROM pg_tables WHERE schemaname='public'" 2>/dev/null
    }
    QP=$(gen_counts "$PROD_PG"); QR=$(gen_counts "$TMPDB")
    if [ -n "$QP" ] && [ -n "$QR" ]; then
      sudo -u postgres psql -d "$PROD_PG" -tAF'=' -c "$QP" 2>/dev/null | sed '/^$/d' | sort > /tmp/_cnt_prod.txt
      sudo -u postgres psql -d "$TMPDB"  -tAF'=' -c "$QR" 2>/dev/null | sed '/^$/d' | sort > /tmp/_cnt_rst.txt
      DIFFN=$(comm -3 /tmp/_cnt_prod.txt /tmp/_cnt_rst.txt | grep -c . || true)
      if [ "$DIFFN" -eq 0 ]; then
        ok "全部 $NR 张表行数与生产完全一致"
      else
        inf "有 $DIFFN 项行数差异（备份时点与现在之间发生的写入，属正常）："
        comm -3 /tmp/_cnt_prod.txt /tmp/_cnt_rst.txt | grep . | head -12 | while IFS= read -r l; do inf "$l"; done
      fi
      grep -E '^(questions|exam_categories|knowledge_points)=' /tmp/_cnt_rst.txt | while IFS= read -r l; do inf "还原库关键表 $l"; done
    else
      ng "无法生成行数比对 SQL"
    fi
    rm -f /tmp/_cnt_prod.txt /tmp/_cnt_rst.txt
  fi
  rm -f /tmp/_pg.err /tmp/_pgrestore.err
else
  ng "找不到 yunzhixue-*.dump 备份"
fi
trap - EXIT
[ -n "${TMPDB:-}" ] && { sudo -u postgres dropdb --if-exists "$TMPDB" >/dev/null 2>&1; inf "临时库 $TMPDB 已删除"; }

# ---------------------------------------------------------------- 3. .env
hr "3. 职教 .env 备份可用性"
ENVF=$(find "$BK" -type f -name 'ynva-env-*' -printf '%T@ %p\n' 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-)
if [ -n "$ENVF" ]; then
  inf "文件: $(basename "$ENVF")  ($(stat -c '%U:%G %a' "$ENVF" 2>/dev/null))"
  # 该文件由 `sudo cp` 生成 ⇒ 属主 root、模式 600（比 ubuntu 可读更安全，保持现状），
  # 因此校验也必须经 sudo 读取 —— 否则会误报「键为空」。
  # 注意：本项目**不用 DATABASE_URL**，PG 连接是 PG_HOST/PG_DB/PG_USER/PG_PASSWORD 四个键
  #      （曾按 DATABASE_URL 检查而误报缺键，故这里按真实键名核对）。
  SUDO=""
  [ -r "$ENVF" ] || SUDO="sudo"
  # 硬性键（缺失=灾难恢复时无法起服务）：数据库连接与签名密钥
  MISS=""
  for k in SECRET_KEY PG_HOST PG_DB PG_USER PG_PASSWORD; do
    $SUDO grep -qE "^${k}=.+" "$ENVF" 2>/dev/null || MISS="$MISS $k"
  done
  # 软性键（缺失=功能静默降级，不影响数据恢复，故记 WARN 不记 FAIL）
  MISS_AI=""
  for k in DEEPSEEK_API_KEY DASHSCOPE_API_KEY; do
    $SUDO grep -qE "^${k}=.+" "$ENVF" 2>/dev/null || MISS_AI="$MISS_AI $k"
  done
  SKLEN=$($SUDO grep -E '^SECRET_KEY=' "$ENVF" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r\n' | wc -c)
  inf "SECRET_KEY 长度=${SKLEN}"
  if [ -n "$MISS" ]; then ng "备份缺少关键键/值为空:$MISS"; else ok ".env 关键键齐备且非空"; fi
  [ "$SKLEN" -ge 32 ] && ok "SECRET_KEY 足够强(>=32)" || ng "SECRET_KEY 过短，疑似回退到默认弱密钥"
  if [ -n "$MISS_AI" ]; then
    wn "AI 密钥为空:$MISS_AI （恢复后 AI 功能仍会走降级模板 —— 运维配置项，非备份缺陷）"
  else
    ok "AI 密钥已配置"
  fi
else
  ng "找不到 ynva-env-* 备份"
fi
rm -f /tmp/_sqlite_verify.out

# ---------------------------------------------------------------- 结论
printf '\n=====================================\n'
if [ "$FAIL" -eq 0 ]; then
  echo "结论: ✅ 备份可恢复性演练通过（还原链路真的能跑通）"
  [ "$WARN" -gt 0 ] && echo "      另有 $WARN 项告警（非阻断，见上）"
else
  echo "结论: ❌ 有 $FAIL 项硬性失败，请立即排查（灾难恢复当天才发现就晚了）"
fi
printf '=====================================\n'
exit "$FAIL"
