#!/usr/bin/env bash
set -e
CONF=/etc/nginx/nginx.conf
# 恢复到本次编辑前的备份
BAK=$(ls -1 /etc/nginx/nginx.conf.bak.saixt-* 2>/dev/null | sort | tail -1)
echo "==> 还原到备份: $BAK"
sudo cp -a "$BAK" "$CONF"

echo "==> 将 /saixt 与 /qimages 反代插入到【最后一个(真443) server 块】"
sudo python3 - "$CONF" <<'PY'
import sys
path = sys.argv[1]
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

marker = "# 其他所有路径重定向到 /xiaolongxia/"
idx = text.rfind(marker)          # 最后一个出现 -> 真正的 443 server 块
assert idx != -1, "未找到插入锚点"

block = """        # ===== 研途AI (saixt) 子系统 - 子路径 /saixt（剥离前缀反代到 3000）=====
        location /saixt/ {
            proxy_pass http://127.0.0.1:3000/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_http_version 1.1;
            proxy_read_timeout 120s;
            proxy_send_timeout 120s;
        }

        # saixt 题目图片（隔离反代到 3000）
        location /qimages/ {
            proxy_pass http://127.0.0.1:3000;
            expires 7d;
            add_header Cache-Control "public, max-age=604800";
        }

"""
assert "location /saixt/" not in text, "已存在 /saixt，中止"
text = text[:idx] + block + text[idx:]
with open(path, 'w', encoding='utf-8') as f:
    f.write(text)
print("插入成功")
PY

echo "==> 校验"
sudo nginx -t 2>&1
echo "==> 重载"
sudo nginx -s reload 2>&1
echo "==> DONE"
