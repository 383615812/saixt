# 事件复盘：小龙虾微服务集群崩溃重启循环（宿主网关不可达）

- **主机**：119.45.196.149（Ubuntu 22.04）
- **发现时间**：2026-10-09 10:00（端口加固复验时发现）
- **影响**：`/xiaolongxia/` 全部 17 个微服务中 **15 个崩溃重启循环**；网关 `/actuator/health` **503**；系统负载 **15+**（8 核，长期过载）。首页静态资源仍 200，故未触发业务告警。
- **严重级**：P0（核心业务微服务不可用 / 资源持续空转）
- **处置**：已修复并验收（详见下文）

---

## 一、现象

| 指标 | 值 |
|---|---|
| 容器状态 | 15/17 微服务 `Up X seconds`（持续重启），`RestartCount` 最高 **184**（user-service） |
| 退出码 | `exitCode=1`，每次存活约 75–87 秒 |
| 网关 | `http://127.0.0.1:8080/actuator/health` = **503** |
| 负载 | `load average: 15.74 17.39 17.72`（8 核） |
| 内存 | 30G 总 / 可用 20G，**无 OOM**（排除内存因素） |
| 四站首页 | 全部 200（**掩盖了故障**） |

## 二、根因

微服务容器 env 中**硬编码宿主网关地址** `172.17.0.1` 作为基础设施入口：

```
DB_HOST=172.17.0.1        REDIS_HOST=172.17.0.1
NACOS_SERVER=172.17.0.1:8848
SPRING_CLOUD_NACOS_SERVER_ADDR=172.17.0.1:8848
SPRING_CLOUD_NACOS_DISCOVERY_SERVER_ADDR=172.17.0.1:8848
```

但这些微服务与 `mysql/redis/nacos` **同在用户自定义网络 `172.19.0.0/16`**（网关 `172.19.0.1`），
基础设施容器 IP 分别为 mysql `172.19.0.2`、redis `172.19.0.6`、nacos `172.19.0.3`。

Docker 在 `nat/DOCKER` 链为发布端口生成的 DNAT 规则**带有入接口排除约束**：

```
-A DOCKER -d 172.17.0.1/32 ! -i br-5ec21009ea58 -p tcp --dport 3306 -j DNAT --to-destination 172.19.0.2:3306
```

`! -i br-5ec21009ea58` 表示"**不是从该网桥进来的**"才做 DNAT。而微服务与该网桥**同网段**，
其发往 `172.17.0.1:3306` 的报文恰因该约束**不匹配任何 DNAT 规则** → 报文被丢弃
→ 应用侧表现为 `java.net.SocketTimeoutException: Connect timed out`（注意是 **超时** 而非 refused）
→ HikariCP 连接池初始化失败 → Spring 上下文启动失败 → `exitCode=1` → `restart:always` 重启 → 无限循环。

### 决定性证据

| 探测点 | 目标 | 结果 |
|---|---|---|
| 宿主(host) | `172.17.0.1:3306` | **OPEN**（docker-proxy 在宿主命名空间监听） |
| mysql 容器内 | `172.17.0.1:3306` | **FAIL（超时）** |
| mysql 容器内 | `mysql:3306` / `172.19.0.2:3306` | **OPEN** |
| 微服务日志 | — | `Connect timed out` → `Communications link failure` → `Started ... in 748 seconds`（超时重试拖长启动） |

**旁证**：唯二使用 DNS 名（`DB_HOST=mysql` / `REDIS_HOST=redis`）的 `notification-service` 与
`crawler-service` **全程稳定运行**，从未崩溃 —— 反证问题出在 IP 硬编码而非服务本身。

> **是否端口加固引入？**
> 端口加固把发布地址从 `0.0.0.0` 收窄到 `172.17.0.1`，规则同样带 `! -i br-<net>` 约束；
> 该约束对同网段来源的排除在加固前后**均存在**（既有隐患）。加固只是让"基础设施端口只在
> `172.17.0.1` 发布"变得确定，使问题暴露得更彻底。**根因是应用配置（IP 硬编码），非加固本身。**

## 三、处置

### 1) 即时修复（脚本化、幂等、可回滚）

新增 `deploy/fix-xiaolongxia-hostgw-reach.sh`：

- 从 `docker inspect` **实时解析**基础设施容器 IP；
- 为每个基础设施端口**补一条不带 `-i` 约束的同目标 DNAT 规则**，插到 `nat/DOCKER` 链首；
- 仅匹配**目的地址 `172.17.0.1`**（宿主 docker0 网关，**公网不可达**）⇒ **不新增任何对外暴露面**；
- 幂等（`iptables -C` 检查后再加）；`--remove` 可完整回滚。

覆盖端口：`3306`(mysql)、`6379`(redis)、`8848/9848/9849`(nacos)、`5672/15672`(rabbitmq)、`7474/7687`(neo4j)、`9411`(zipkin)。

### 2) 持久化（防重启/防 IP 漂移）

`/etc/cron.d/xiaolongxia-hostgw-dnat`：

```
@reboot  root sleep 45; /bin/bash /home/ubuntu/fix-xiaolongxia-hostgw-reach.sh --apply
*/5 * * * * root      /bin/bash /home/ubuntu/fix-xiaolongxia-hostgw-reach.sh --apply
```

启动后补齐 + 每 5 分钟幂等 reconcile（容器重建换 IP 后自动自愈）。

### 3) 错峰复位

按 3 个一组间隔 4s 复位 15 个故障容器，避免 15 个 JVM 同时启动造成二次负载尖峰。

## 四、验收

| 项目 | 结果 |
|---|---|
| 网关健康 | `200` ✅ |
| 微服务稳定性 | 17/17 `Up`，**无任一处于重启态** ✅ |
| Nacos 注册 | **16 个**业务服务全部注册 ✅ |
| 系统负载 | **15.74 → 1.70** ✅ |
| 四站公网 | `/` `/xiaolongxia/` `/saixt/` `/ynva/` 全 **200** ✅ |
| 综合验收 | `health-check-3sites.sh` **71/71 通过** ✅ |

## 五、遗留建议（未执行，待拍板）

**根治方案**：将这 15 个容器的 `DB_HOST` / `REDIS_HOST` / `NACOS_*` 由 `172.17.0.1`
改为 Docker DNS 名 `mysql` / `redis` / `nacos`（与 notification/crawler 一致），
彻底摆脱对宿主网关路由的依赖。需重建 15 个容器（有停机窗口），建议维护期执行。
在此之前，本 DNAT 补丁 + cron reconcile 已可稳定支撑。

## 六、复跑 / 回滚

```bash
sudo bash /home/ubuntu/fix-xiaolongxia-hostgw-reach.sh            # dry-run
sudo bash /home/ubuntu/fix-xiaolongxia-hostgw-reach.sh --apply    # 应用
sudo bash /home/ubuntu/fix-xiaolongxia-hostgw-reach.sh --remove --apply   # 回滚
```
