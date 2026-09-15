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

## 全链路 E2E 后必须清理

E2E 会用临时手机号注册用户并写入练习/模考数据，跑完务必清理：

```bash
# E2E 输出末尾会打印 E2E_PHONE=xxx
# 清理方式（删除该手机号用户及其关联数据）
```

## 关键枚举（务必遵守）

题库 `questions.type` 仅 4 个合法值：`single` / `multiple` / `judge` / `subjective`。
- 客观题（single/multiple/judge）：可自动判分，进每日一练/复习计划/统计。
- 主观题（subjective）：不自动判分、不进复习计划、不计入正确率统计。
- 历史遗留脏值 `subj`（主观缩写）/`multi`（多选缩写）已由 `utils.js` 的 `normalizeType()` 在写入侧归一。
