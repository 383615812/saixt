#!/usr/bin/env bash
# 修复：让 /saixt/ 与 /qimages/ 前缀 location 优先于正则静态资源 location
set -e
CONF=/etc/nginx/nginx.conf
BAK="/etc/nginx/nginx.conf.bak-saixtfix-$(date +%Y%m%d_%H%M%S)"
sudo cp "$CONF" "$BAK"
echo "备份: $BAK"

# 用 ^~ 修饰符使前缀 location 优先于正则 location ~* \.(js|css|...)$
sudo sed -i 's#^[[:space:]]*location /saixt/ {#        location ^~ /saixt/ {#' "$CONF"
sudo sed -i 's#^[[:space:]]*location /qimages/ {#        location ^~ /qimages/ {#' "$CONF"

echo "=== 修改后的 saixt/qimages location ==="
sudo grep -nE 'location \^~ /saixt/|location \^~ /qimages/' "$CONF"

echo "=== nginx 语法校验 ==="
sudo nginx -t

echo "=== 重载 ==="
sudo systemctl reload nginx
echo "done"
