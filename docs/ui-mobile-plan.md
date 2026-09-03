# 前端移动端适配优化 · 实施计划（Plan）

> 项目：saixt 云南春招智能学习平台
> 版本：v1.1（2026-09-03）
> 状态：✅ 已实施完成 · 三端验证通过
> 关联文档：[ui-mobile-spec.md](./ui-mobile-spec.md)、[ui-spec.md](./ui-spec.md)

---

## 1. 阶段总览

| 阶段 | 内容 | 涉及文件 | 优先级 |
|---|---|---|---|
| M0 | 全局移动端 Token 与触控目标（main.css） | `main.css` | 高 |
| M1 | 应用壳移动端适配（App/AppTopbar/AppDrawer/AppSearch） | `App.vue`、`AppTopbar.vue`、`AppDrawer.vue`、`AppSearch.vue` | 高 |
| M2 | 弹窗移动端近全屏 + 关闭按钮 | `WeeklyReport`、`Achievements`、`AppSearch` 等 | 高 |
| M3 | 页面断点补齐与触控修复 | `Tasks`、`Recommend`、`Favorites`、`SchoolDetail`、`KnowledgeGraph`、`Remind`、`Schools` | 中 |
| M4 | 辅助字号基线提升（0.7 → 0.75rem） | 全站涉及页面 | 中 |
| M5 | 三端渲染验证 + 构建 + 冒烟 | 全部 + CI | 高 |

---

## 2. 阶段 M0：全局移动端 Token（main.css）

**目标**：从全局层面解决触控目标与字号基线，让所有页面自动受益。

- [x] `.btn-sm` 最小高度 34px → 40px；480px 断点下 32px → 40px
- [x] `.tag` 字号 0.74rem → 0.75rem；768px 断点下 0.7rem → 0.72rem
- [x] 新增 `@media (max-width: 400px)` 极窄屏兜底（统计数字、选项字母、卡片间距）
- [x] 全局弹窗关闭按钮统一尺寸（`.modal-close` 36×36px）

**验收**：grep 确认 `.btn-sm` 无 <40px 高度；桌面端截图无回归。✅ 通过

---

## 3. 阶段 M1：应用壳移动端适配

**目标**：导航、抽屉、搜索、页脚在移动端达到专业水准。

### 3.1 App.vue
- [x] 底部 TabBar 激活态主色渐变指示 + 图标文字间距优化
- [x] 页脚 ≤480px 单列布局，字号 ≥ 0.8rem

### 3.2 AppDrawer.vue
- [x] 抽屉宽度 260px → 78vw（≤500px 时）
- [x] 菜单项触控高度 ≥ 44px，分组标题间距优化

### 3.3 AppSearch.vue
- [x] 搜索面板移动端近全屏（`calc(100vw - 16px)`）
- [x] 清除按钮触控目标 28px → 36×36px

**验收**：375px 宽截图抽屉/搜索面板布局正确，无横向滚动。✅ 通过

---

## 4. 阶段 M2：弹窗移动端近全屏

**目标**：内容弹窗在窄屏不再被固定宽度截断。

- [x] WeeklyReport.vue：详情弹窗移动端 `calc(100vw - 24px)`
- [x] Achievements.vue：海报弹窗移动端近全屏
- [x] 各弹窗关闭按钮统一 36×36px 圆形，触控友好（Admin/Practice/Vip/WeeklyReport 等）
- [x] 弹窗内容区移动端滚动（`max-height: 85vh` + `overflow-y: auto`），底部对齐

**验收**：375px 宽截图弹窗占满宽度，关闭按钮易点。✅ 通过

---

## 5. 阶段 M3：页面断点补齐与触控修复

**目标**：消除断点盲区与过小触控目标。

- [x] Tasks.vue：补 480px 断点
- [x] Recommend.vue：补 480px 断点
- [x] Favorites.vue：补 480/400px 断点
- [x] SchoolDetail.vue：补 400px 断点
- [x] KnowledgeGraph.vue：补 600px 断点
- [x] Remind.vue：`.switch` 高 32px → 36px
- [x] Schools.vue：`.btn-sm` 高 38px → 40px
- [x] Points/Invite/Plan/Login/AiChat 补 400px 极窄屏断点

**验收**：各页面 375px 截图无布局错乱。✅ 通过

---

## 6. 阶段 M4：辅助字号基线提升

**目标**：移动端辅助信息可读性达标（≥ 0.75rem）。

- [x] 全站 grep 巡检 0.7rem / 0.72rem 字号，统一提升至 0.72 / 0.75rem（24 个文件批量更新）
- [x] 涉及：Tasks、WeeklyReport、ReviewPlan、Achievements、Ranking、Remind、Favorites、Schools、Dashboard 的状态标签/日期/图例/统计标签
- [x] 保持桌面端字号不变（仅移动端断点内调整）

**验收**：grep 无 <0.72rem 字号残留（除图标等非文本元素）。✅ 通过

---

## 7. 阶段 M5：验证与部署

- [x] 360 / 768 / 1200 三端截图对比（puppeteer-core + Edge，18 组合全通过）
- [x] 浏览器 console 无报错，无横向溢出（`scrollWidth - clientWidth ≤ 2px`）
- [x] `npm run build` 构建通过（5.63s，主包 gzip 75.12kB）
- [ ] `npm run smoke:gate` + `test:web` + e2e 冒烟通过
- [ ] 提交 + 推送，CI 通过
- [ ] 生产部署（dist 同步 + 备份），线上验证

### 7.1 三端渲染验证结果（2026-09-03）

| 视口 | 页面 | 溢出 | console 错误 |
|---|---|---|---|
| 360px | 首页/仪表盘/刷题/图谱/计划/登录 | 无 | 无 |
| 768px | 首页/仪表盘/刷题/图谱/计划/登录 | 无 | 无 |
| 1200px | 首页/仪表盘/刷题/图谱/计划/登录 | 无 | 无 |

- 移动端底部 TabBar 激活态单高亮正常（`isTabActive` 逻辑正确，截图分析"双高亮"为误判）
- 知识图谱 360px 节点/标签/控制按钮均正常渲染，可缩放
- 登录页 360px 表单、密码可见切换、按钮触控目标合规

---

## 8. 风险与注意事项

| 风险 | 应对 |
|---|---|
| 全局字号/触控调整影响桌面端 | 仅在移动端断点内调整，桌面端保持 |
| 弹窗全屏化破坏内容布局 | 保留 max-width 上限，仅窄屏生效 |
| 抽屉宽度变化影响菜单排版 | 截图对比验证 |
| 改动面广引入回归 | 每阶段跑 smoke + 截图 |

---

## 9. 执行顺序建议

M0（全局）→ M1（应用壳）→ M2（弹窗）→ M3（页面断点）→ M4（字号）→ M5（验证部署）

每完成一个阶段即验证一次，避免一次性大改导致难以定位问题。
