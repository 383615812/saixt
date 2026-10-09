#!/usr/bin/env bash
# 三站数据库自动备份（隔离目录，避免与小龍虾的 backups 混用）
#   - 春招 saixt：SQLite，WAL checkpoint 后 .backup
#   - 职教 ynva：PostgreSQL，pg_dump -Fc（postgres 无权写 home，故经 /tmp 中转）
#   - 同时备份职教 .env（含密钥）
# 保留 14 天
set -u
cd /tmp || exit 2   # postgres 用户对 /home/ubuntu 无 x 权限，避免 sudo -u postgres 打印 cwd 警告
BK=/home/ubuntu/backups-3sites
STAMP=$(date +%Y%m%d_%H%M%S)
TMPD=/tmp/pgbk-$$; mkdir -p "$TMPD"; chmod 777 "$TMPD"
mkdir -p "$BK"

# 1) 春招 SQLite —— 必须是「一致性快照」，不能裸 cp。
#    saixt.db 跑在 WAL 模式：拷贝期间只要有一次写入，裸 cp 就可能得到半截/撕裂的库
#    （文件能生成、大小看着正常、日志显示 OK，直到真去还原才发现坏）。
#    本机没装 sqlite3 CLI，所以此前一直走的是 cp 回退路径 —— 现已改为 node:sqlite 的 VACUUM INTO。
if [ -f /opt/saixt/server/data/saixt.db ]; then
  BKFILE="$BK/saixt-$STAMP.db"
  rm -f "$BKFILE"
  SNAP_OK=0
  if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 /opt/saixt/server/data/saixt.db ".backup '$BKFILE'" 2>/dev/null && SNAP_OK=1
  fi
  if [ "$SNAP_OK" -eq 0 ] && command -v node >/dev/null 2>&1; then
    cat > /tmp/_snap_sqlite.mjs <<'JSEOF'
import { DatabaseSync } from 'node:sqlite';
const [src, dst] = process.argv.slice(2);
const db = new DatabaseSync(src);
try { db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); } catch {}
db.exec("VACUUM INTO '" + String(dst).replace(/'/g, "''") + "'");
db.close();
JSEOF
    node /tmp/_snap_sqlite.mjs /opt/saixt/server/data/saixt.db "$BKFILE" 2>/dev/null && SNAP_OK=1
    rm -f /tmp/_snap_sqlite.mjs
  fi
  if [ "$SNAP_OK" -eq 1 ]; then
    echo "[$(date '+%m-%d %H:%M')] saixt OK(一致性快照) $(du -h "$BKFILE" 2>/dev/null | cut -f1)"
  else
    # 两个方案都不可用才回退裸 cp，并显式标记，便于事后识别风险副本
    cp /opt/saixt/server/data/saixt.db "$BKFILE" 2>/dev/null && \
      echo "[$(date '+%m-%d %H:%M')] saixt OK(!!回退裸cp,非一致快照) $(du -h "$BKFILE" 2>/dev/null | cut -f1)"
  fi
else
  echo "[$(date '+%m-%d %H:%M')] saixt 跳过：源库不存在"
fi

# 2) 职教 PostgreSQL（经 /tmp 中转解决 postgres 写权限）
if sudo -u postgres pg_isready -q 2>/dev/null; then
  if sudo -u postgres pg_dump -Fc -d yunzhixue 2>/dev/null > "$BK/yunzhixue-$STAMP.dump.tmp"; then
    mv "$BK/yunzhixue-$STAMP.dump.tmp" "$BK/yunzhixue-$STAMP.dump" 2>/dev/null
    echo "[$(date '+%m-%d %H:%M')] ynva OK $(du -h "$BK/yunzhixue-$STAMP.dump" 2>/dev/null | cut -f1)"
  else
    echo "[$(date '+%m-%d %H:%M')] ynva 失败(pg_dump)"
  fi
else
  echo "[$(date '+%m-%d %H:%M')] ynva 跳过：PG 未运行"
fi

# 3) 职教 .env（密钥，改密后需重新备份）
sudo cp /opt/ynva/.env "$BK/ynva-env-$STAMP" 2>/dev/null

# 4) 保留 14 天（并清掉 pg_dump 失败可能留下的半截 .tmp）
find "$BK" -type f \( -name 'saixt-*.db' -o -name 'yunzhixue-*.dump' -o -name 'ynva-env-*' -o -name '*.tmp' \) -mtime +14 -delete 2>/dev/null
find "$BK" -type f -name '*.dump.tmp' -o -type f -name '*.db.tmp' -delete 2>/dev/null
# 清掉外部（校验/恢复演练）打开备份库时产生的 WAL/SHM 副文件：它们不在上面的 -mtime 名单内，
# 否则会永久残留；而 VACUUM INTO 产出的 .db 是自带完整数据的独立库，不需要这两个副文件。
find "$BK" -type f \( -name '*.db-wal' -o -name '*.db-shm' \) -delete 2>/dev/null
chmod 600 "$BK"/* 2>/dev/null
rm -rf "$TMPD"
echo "[$(date '+%m-%d %H:%M')] 共 $(ls -1 "$BK" 2>/dev/null | wc -l) 个文件 / $(du -sh "$BK" 2>/dev/null | cut -f1)"
