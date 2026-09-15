# 运维脚本（ops）

面向生产的可复用诊断/验证脚本。**只读优先**，涉及写操作必须先备份。

## 使用方式

生产库在服务器 `/opt/saixt/server/data/saixt.db`，需在服务器上执行：

```bash
scp -i ~/.ssh/AIzjgk_123.pem scripts/ops/<脚本> ubuntu@62.234.79.165:/tmp/x.mjs
ssh -i ~/.ssh/AIzjgk_123.pem ubuntu@62.234.79.165 "node /tmp/x.mjs && rm -f /tmp/x.mjs"
```

## 脚本清单

| 脚本 | 用途 | 写操作 |
|---|---|---|
| `audit-data.mjs` | 生产库全量健康度体检（表行数/题库质量/字段可解析性/孤儿外键/非法值） | 否（readOnly） |
| `e2e-flow.mjs` | 全链路真实业务流程 E2E（注册→每日一练→提交→错题本→收藏→复习→模考→统计→排行→签到→积分→周报） | 是（用临时用户，需清理） |
| `clean-user.mjs <phone>` | 删除指定手机号用户及其 20+ 关联表数据，输出 `USERS_TOTAL=` 便于复核 | 是（删除） |
| `edge-attack.mjs [baseUrl]` | 边界/异常路径攻击测试：畸形 body、Infinity/科学计数、畸形 ID、注入、超长、12 路并发 | 是（用临时用户，需清理） |

## 边界攻击测试的判据（重要）

`edge-attack.mjs` 的核心断言是**「有响应」**（`!aborted && status > 0`），**不是** `status < 500`：

- 真正的缺陷是**请求完全无响应 / 超时挂起**。曾实测 `POST /membership/order` 空 body 时
  因 async 路由异常未被 Express 4 捕获，响应从未写出 → nginx 报 504、且请求日志里查不到该条记录。
- 部分接口 5xx 属**协议要求**：微信支付回调的故障应答必须是「非 JSON + 5xx」才能触发平台重试，
  因此 `/membership/pay/notify/wechat` 返回 `500 FAIL` 是**预期行为**，不要断言 `<500`。
- AI 接口 5xx 可能是上游问题（如 DeepSeek `402 Insufficient Balance`），非应用缺陷。
- 注入类入参的正确预期是**安全参数化**：返回 `200` + 空结果，既不 500 也不真正执行注入。

## 全链路 E2E / 边界测试后必须清理

这些脚本会用临时手机号注册用户并写入练习/模考数据，跑完务必清理：

```bash
# 脚本输出末尾会打印 PHONE=xxx / E2E_PHONE=xxx
ssh -i ~/.ssh/AIzjgk_123.pem ubuntu@62.234.79.165 \
  "cd /opt/saixt && node scripts/ops/clean-user.mjs <phone>"
# 确认输出 USERS_TOTAL= 与预期一致，且体检无「测试号残留」
```

## 关键枚举（务必遵守）

题库 `questions.type` 仅 4 个合法值：`single` / `multiple` / `judge` / `subjective`。
- 客观题（single/multiple/judge）：可自动判分，进每日一练/复习计划/统计。
- 主观题（subjective）：不自动判分、不进复习计划、不计入正确率统计。
- 历史遗留脏值 `subj`（主观缩写）/`multi`（多选缩写）已由 `utils.js` 的 `normalizeType()` 在写入侧归一。

## 关键防护（新增代码请遵守）

- 数值入参（limit/offset/size/count…）一律走 `utils.clampInt(v, min, max, fallback)`。
  裸用 `Math.max(Number(x) || 0, 0)` 会让 `1e309` 变成 `Infinity` 绑进 SQLite 抛错。
- 进 SQL 的非数字入参一律走 `utils.safeStr(v)`。`node:sqlite` 只接受
  `null/number/string/bigint/Buffer`，**`undefined` 与对象会抛 `ERR_INVALID_ARG_TYPE`**。
  可空列记得落 `null` 而不是 `undefined`。
- **所有 `async` 路由处理器必须用 `utils.asyncHandler(fn)` 包裹**。Express 4 不捕获
  Promise 拒绝，未包裹时异常会导致响应永不写出 → 网关 504。
