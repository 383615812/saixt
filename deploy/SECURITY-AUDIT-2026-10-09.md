# 服务器安全审计报告

- **主机**：119.45.196.149（Ubuntu 22.04，主域 www.xlxzb.com）
- **范围**：同机四站（文华门户 / 小龙虾 docker / 春招 PM2:3000 / 职教 FastAPI:8000）
- **方式**：**只读**探测（不改任何配置、不重启容器）；可复跑脚本见 `deploy/security-audit.sh`
- **日期**：2026-10-09

---

## 一、风险分级（按可入侵性实测定级）

| 级别 | 问题 | 证据 | 处置 |
|---|---|---|---|
| **P1** | **Nacos 8848 鉴权关闭** | 未登录 `GET /nacos/v1/auth/users?...&search=blur` = **200**；`/nacos/v1/ns/catalog/services` = 200 | 若 8848 公网可达 ⇒ 配置/注册中心免鉴权可读可写。**主修=重绑 172.17.0.1**（harden 脚本）；纵深=启用 `nacos.core.auth.enabled=true` + token 密钥 |
| **P1** | **MySQL `root@%` 远程账户** | `mysql.user` 中 `root@%` 存在（`authentication_string` 长度 70，**非空口令**）；`3306` 绑 `0.0.0.0` 且宿主 TCP 可达 | 若 SG 放行 3306 ⇒ 可远程 root 爆破。建议删 `root@%`、保留 `root@localhost`，另建最小权限应用账户 |
| **P2** | **基础设施端口绑 0.0.0.0** | 3306/6379/5672/15672/7474/7687/8848/9848/9849/9411 均在 `0.0.0.0` | 一律重绑 172.17.0.1（harden 脚本）。Redis（`-NOAUTH`）、RabbitMQ（401）**已鉴权缓解**；Neo4j/Zipkin 鉴权本轮未测，按暴露处理 |
| **P3** | **微服务 8082–8098 宿主映射不可用** | 宿主直连 `127.0.0.1:8082` 立即 RST（curl 000 / exit 56，0.0007s）；经网关 8080 健康 200；容器内 `/proc/net/tcp` 未在 8082 监听（疑应用绑 `:::8082` IPv6，docker-proxy IPv4 DNAT 够不到） | **不可直接利用**（映射损坏），仍是配置债；统一重绑 172.17.0.1 不影响 |

> 说明：上一轮初判"14 个微服务端口暴露"，本轮实测**下修**——映射实际不可达，风险等级由"暴露"降为"配置缺陷"。

## 二、已确认的安全控制（正向）

- **SSH**：仅密钥登录（`PasswordAuthentication no` / `PermitEmptyPasswords no`），失败登录 **0** 次。
- **敏感文件**：`/opt/saixt/server/.env`、`/opt/ynva/.env` 权限 **600**。
- **nginx 安全响应头**：HSTS / X-Frame-Options / X-Content-Type-Options / X-XSS-Protection / Referrer-Policy / Permissions-Policy **六项全绿**（活跃 `nginx.conf` 17 处 include 正常；此前 grep 仅命中 `.bak` 系 `head` 截断误判）。
- **TLS 证书**：有效，剩余 **69 天**（Certbot 自动续期）。
- **docker.sock**：`srw-rw---- root:docker`（权限正确）。
- **账户**：仅 `root / ubuntu / postgres`，无异常账户。
- **Redis / RabbitMQ**：均需鉴权（`-NOAUTH` / HTTP 401）。

## 三、根本问题

`ufw` **未启用**（inactive），iptables DOCKER 链无有效限制 ⇒ **公网暴露与否完全依赖腾讯云安全组**。容器把大量本应仅内网互访的服务端口发布到 `0.0.0.0`，一旦安全组被放宽即裸露。**应在主机侧收口**，不依赖单点 SG。

## 四、处置方案

### 1) 主修：容器端口重绑（已备脚本，`--dry-run` 验证通过，**未执行**）
`deploy/harden-docker-ports.sh`：把 `0.0.0.0` 绑定改写为宿主桥网关 `172.17.0.1`
- 公网（119.45.196.149）不可达（DNAT 不匹配公网目的 IP）；容器内仍经宿主路由访问 `172.17.0.1`；**零行为变化**。
- 规避两个致命坑：①`docker inspect` 键是 `PortBindings`（复数，写错会重建出无端口容器）；②部分容器启动命令硬编码 `jdbc:mysql://172.17.0.1:3306`，故绑 `172.17.0.1` 而非 `127.0.0.1`。
- 执行前置：**先核腾讯云安全组仅放 22/80/443**；建议维护窗口、逐组重建（脚本内置 rename→健康回滚）。

### 2) 纵深：Nacos 鉴权 + MySQL 账户收敛（需维护窗口，未做）
- Nacos：`NACOS_AUTH_ENABLE=true` + `nacos.core.auth.plugin.nacos.token.secret.key`（≥32 字节 base64）重启；**须同步给所有微服务配 nacos 用户名/口令**，否则注册失败 ⇒ 平台不可达。
- MySQL：`DROP USER 'root'@'%'`，保留 `'root'@'localhost'`，另建应用专用远程账户。

### 3) 可选：启用 ufw
明确仅放 22/80/443，与腾讯云安全组形成双保险。

## 五、待用户拍板（本轮未动）

1. 腾讯云删 `3000` 入站规则（应用已只听回环）
2. 微信支付 `WECHAT_*`（下单现 `pay_error`）
3. 公安网备号 / 正式落款
4. 职教独立 DeepSeek key
5. **是否执行 `harden-docker-ports.sh --apply`**（需先核云安全组 + 维护窗口）

## 六、复跑方式

```bash
sudo bash deploy/security-audit.sh        # 只读，输出分级态势
```
