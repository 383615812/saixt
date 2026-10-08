#!/bin/bash
# ============================================================================
# 清理职教（云智学）巡检探测账号
#
# 背景：health-check-3sites.sh 第 6 段会真的注册一个探测账号
#       （用户名 zzprobe<epoch>），以便对 register/login/业务接口做**真实**回归。
#       探测账号每次新增一个，需要清理。
#
# 难点：users 表被约 20 张子表用外键引用，逐个手写 DELETE 既易漏又易错；
#       且外键没有 ON DELETE CASCADE 时直接删 users 会被挡住。
# 做法：**通用外键删除** —— 自动从 pg_constraint 查出所有引用 users 的表与列，
#       逐表删除该用户的行，最后删 users 本身。表名/列名用 %I 安全转义。
#       显式排除 users 自引用，避免误删「创建者」是探测账号的其它用户。
#
# 用法：
#   ynva-probe-cleanup.sh                # 清理用户名以 zzprobe 开头的账号
#   ynva-probe-cleanup.sh 'zzprobe%'     # 自定义 LIKE 模式
#   ynva-probe-cleanup.sh --dry-run      # 只列出将删除的行数，不实际删除
# ============================================================================
set -uo pipefail

# postgres 系统用户对 /home/ubuntu 无 x 权限，sudo 保留 cwd 时会报
# "could not change directory to /home/ubuntu: Permission denied"（无害但刷屏）。
cd /tmp || exit 2

PATTERN='zzprobe%'
DRY=0
for a in "$@"; do
  case "$a" in
    --dry-run) DRY=1 ;;
    -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
    *) PATTERN="$a" ;;
  esac
done

psql_q() { sudo -u postgres psql -d yunzhixue -qtAX -v ON_ERROR_STOP=1 -c "$1" 2>&1; }

CNT=$(psql_q "SELECT count(*) FROM users WHERE username LIKE '$PATTERN'")
echo "匹配探测账号: ${CNT:-0} 个（模式 '$PATTERN'）"
[ "${CNT:-0}" = "0" ] && { echo "无需清理"; exit 0; }

if [ "$DRY" = 1 ]; then
  echo "=== 各子表将删除的行数（dry-run）==="
  psql_q "
    DO \$\$
    DECLARE uid bigint; r record; n int;
    BEGIN
      FOR uid IN SELECT id FROM users WHERE username LIKE '$PATTERN' LOOP
        RAISE NOTICE '--- user id=% ---', uid;
        FOR r IN
          SELECT c.relname AS tbl, a.attname AS col
          FROM pg_constraint pc
          JOIN pg_class c     ON c.oid = pc.conrelid
          JOIN pg_attribute a ON a.attrelid = pc.conrelid AND a.attnum = pc.conkey[1]
          WHERE pc.contype='f' AND pc.confrelid='users'::regclass
            AND c.relname <> 'users'
        LOOP
          EXECUTE format('SELECT count(*) FROM %I WHERE %I = \$1', r.tbl, r.col) INTO n USING uid;
          IF n > 0 THEN RAISE NOTICE '  % -> %', r.tbl, n; END IF;
        END LOOP;
      END LOOP;
    END \$\$;
  " | grep -v '^DO$'
  echo "（dry-run 结束，未删除任何数据）"
  exit 0
fi

echo "=== 执行通用外键清理 ==="
psql_q "
  DO \$\$
  DECLARE uid bigint; r record; total int := 0; n int; usersDeleted int := 0;
  BEGIN
    FOR uid IN SELECT id FROM users WHERE username LIKE '$PATTERN' LOOP
      FOR r IN
        SELECT c.relname AS tbl, a.attname AS col
        FROM pg_constraint pc
        JOIN pg_class c     ON c.oid = pc.conrelid
        JOIN pg_attribute a ON a.attrelid = pc.conrelid AND a.attnum = pc.conkey[1]
        WHERE pc.contype='f' AND pc.confrelid='users'::regclass
          AND c.relname <> 'users'
      LOOP
        EXECUTE format('DELETE FROM %I WHERE %I = \$1', r.tbl, r.col) USING uid;
        GET DIAGNOSTICS n = ROW_COUNT;
        total := total + n;
      END LOOP;
      DELETE FROM users WHERE id = uid;
      usersDeleted := usersDeleted + 1;
    END LOOP;
    RAISE NOTICE '已删除子表行数=%, users 行数=%', total, usersDeleted;
  END \$\$;
" | grep -v '^DO$'

LEFT=$(psql_q "SELECT count(*) FROM users WHERE username LIKE '$PATTERN'")
if [ "${LEFT:-1}" = "0" ]; then
  echo "✓ 清理完成，剩余匹配账号 0 个"
else
  echo "⚠ 仍有 ${LEFT} 个账号残留，请检查外键（可能有复合外键未被覆盖）"
  exit 1
fi
