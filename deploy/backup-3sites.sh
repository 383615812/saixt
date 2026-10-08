#!/usr/bin/env bash
# 三站数据库自动备份（隔离目录，避免与小龍虾的 backups 混用）
#   - 春招 saixt：SQLite，WAL checkpoint 后 .backup
#   - 职教 ynva：PostgreSQL，pg_dump -Fc（postgres 无权写 home，故经 /tmp 中转）
#   - 同时备份职教 .env（含密钥）
# 保留 14 天
set -u
BK=/home/ubuntu/backups-3sites
STAMP=$(date +%Y%m%d_%H%M%S)
TMPD=/tmp/pgbk-$$; mkdir -p "$TMPD"; chmod 777 "$TMPD"
mkdir -p "$BK"

# 1) 春招 SQLite
if [ -f /opt/saixt/server/data/saixt.db ]; then
  node -e "const{DatabaseSync}=require('node:sqlite');const d=new DatabaseSync('/opt/saixt/server/data/saixt.db');try{d.exec('PRAGMA wal_checkpoint(TRUNCATE)')}catch(e){};d.close()" 2>/dev/null
  if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 /opt/saixt/server/data/saixt.db ".backup '$BK/saixt-$STAMP.db'" 2>/dev/null \
      || cp /opt/saixt/server/data/saixt.db "$BK/saixt-$STAMP.db"
  else
    cp /opt/saixt/server/data/saixt.db "$BK/saixt-$STAMP.db"
  fi
  echo "[$(date '+%m-%d %H:%M')] saixt OK $(du -h "$BK/saixt-$STAMP.db" 2>/dev/null | cut -f1)"
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

# 4) 保留 14 天
find "$BK" -type f \( -name 'saixt-*.db' -o -name 'yunzhixue-*.dump' -o -name 'ynva-env-*' \) -mtime +14 -delete 2>/dev/null
chmod 600 "$BK"/* 2>/dev/null
rm -rf "$TMPD"
echo "[$(date '+%m-%d %H:%M')] 共 $(ls -1 "$BK" 2>/dev/null | wc -l) 个文件 / $(du -sh "$BK" 2>/dev/null | cut -f1)"
