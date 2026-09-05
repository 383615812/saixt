# 部署手册（生产环境）

## 生产环境信息

| 项 | 值 |
| --- | --- |
| 站点地址 | `http://62.234.79.165/saixt/` |
| 服务器 | 62.234.79.165 |
| SSH 用户 | `ubuntu` |
| SSH 密钥 | `~/.ssh/AIzjgk_123.pem` |
| 前端部署目录 | `/opt/saixt/web/dist/` |
| Web 服务器 | nginx（root `/opt/saixt/web`，location `/saixt/`） |
| 后端 | `/opt/saixt/server`（PM2，端口 3000） |

> 注意：`~/.ssh/config` 中的 `wyzb`（119.45.196.149）是**另一套旧站点**（/xiaolongxia），不是本项目的生产环境，勿混淆。

SSH 连接示例：

```powershell
ssh -i "$env:USERPROFILE\.ssh\AIzjgk_123.pem" ubuntu@62.234.79.165
```

## 前端部署流程

### 1. 构建（必须带 /saixt/ base）

```powershell
cd E:\saixt\web
npm run build    # 等价于 vite build --base=/saixt/ && node scripts/postbuild-sw.mjs
```

postbuild-sw.mjs 会把全部 JS/CSS 哈希清单注入 `dist/sw.js` 的 ASSETS 数组。

**硬约束**：修改前端后必须提升 `web/public/sw.js` 中的缓存版本号（如 `springzhaokao-v3` → `v4`），否则用户端 Service Worker 旧缓存不会刷新。

### 2. 服务器备份

```powershell
$KEY="$env:USERPROFILE\.ssh\AIzjgk_123.pem"
$ts = Get-Date -Format 'yyyyMMdd-HHmmss'
ssh -i $KEY ubuntu@62.234.79.165 "sudo cp -a /opt/saixt/web/dist /opt/saixt/web/dist.bak-$ts"
```

### 3. 上传 + 原子切换

```powershell
scp -i $KEY -r E:\saixt\web\dist ubuntu@62.234.79.165:/tmp/dist.new
ssh -i $KEY ubuntu@62.234.79.165 "sudo rm -rf /opt/saixt/web/dist.old; sudo mv /opt/saixt/web/dist /opt/saixt/web/dist.old && sudo mv /tmp/dist.new /opt/saixt/web/dist && sudo chown -R www-data:www-data /opt/saixt/web/dist"
```

先传到 `/tmp/dist.new` 再 mv 交换，保证切换瞬间无半新半旧状态。

### 4. 回滚

```powershell
ssh -i $KEY ubuntu@62.234.79.165 "sudo rm -rf /opt/saixt/web/dist && sudo cp -a /opt/saixt/web/dist.bak-<时间戳> /opt/saixt/web/dist"
```

备份列表：`ssh -i $KEY ubuntu@62.234.79.165 "sudo ls -d /opt/saixt/web/dist.bak-*"`

## 部署后验证

```powershell
# 1. 资源可达
curl.exe -s -o NUL -w "%{http_code}" http://62.234.79.165/saixt/
curl.exe -s http://62.234.79.165/saixt/sw.js | Select-String "const CACHE"

# 2. 多视口 UI 冒烟（真实登录）
cd E:\saixt\e2e
$env:CHECK_BASE='http://62.234.79.165/saixt/'
node viewport-check.mjs

# 3. 功能回归（10 页面渲染+交互）
node prod-functional.mjs

# 4. AI 刷题流程
node ai-practice.e2e.mjs
```

## 后端部署

后端由 **ubuntu 用户的 PM2** 管理（进程名 `saixt-server`）。注意：`sudo pm2 list` 看到的是 root 的空实例，必须用 ubuntu 身份：

```powershell
ssh -i $KEY ubuntu@62.234.79.165 "bash -lc 'pm2 list'"
```

更新后端代码（如 `server/src/index.js`）：

```powershell
# 1. 备份 + 上传
ssh -i $KEY ubuntu@62.234.79.165 "sudo cp /opt/saixt/server/src/index.js /opt/saixt/server/src/index.js.bak-`$(date +%Y%m%d-%H%M%S)"
scp -i $KEY E:\saixt\server\src\index.js ubuntu@62.234.79.165:/tmp/index.js.new
# 2. 应用 + 语法检查 + 重启
ssh -i $KEY ubuntu@62.234.79.165 "sudo cp /tmp/index.js.new /opt/saixt/server/src/index.js && node --check /opt/saixt/server/src/index.js && bash -lc 'pm2 restart saixt-server'"
```

> PowerShell 会把远程命令里的 `$(date ...)` 当本地表达式解析，含 `$()` 的命令需用单引号包裹整条 ssh 命令，或改用固定时间戳。

**开机自启**：已配置 `pm2-ubuntu.service`（systemd，enabled）。若需重建：`pm2 startup systemd -u ubuntu --hp /home/ubuntu` 后执行其输出的 sudo 命令，再 `pm2 save`。

## API 路径说明

生产 API 基础路径是 **`http://62.234.79.165/saixt/api`**（nginx `location /saixt/` 代理到 3000）。
直接访问 `http://62.234.79.165/api` 会被 `location /` 301 到 https（443 是另一个监控服务，无 /api），**勿用**。

## 推送网络波动应对

GitHub HTTPS 推送偶发 `connection reset`。项目自带后台补推脚本：

```powershell
Start-Process powershell -ArgumentList "-NoProfile","-File","E:\saixt\scripts\auto-push.ps1" -WindowStyle Hidden
# 成功后写入 $env:TEMP\push_ok.log（含时间戳）
```

SSH 推送（`git@github.com:...`）在本机无权限，勿用。

## CI

GitHub Actions「CI 冒烟」（`.github/workflows/smoke.yml`）在每次 push master 后运行：
- 数据一致性检查（db-integrity.cjs）
- API 健康门禁（api-health.mjs，39 项只读端点，对生产后端）
- Playwright e2e（ai-practice.e2e.mjs，对生产站点）
- 前端单测（vitest）
