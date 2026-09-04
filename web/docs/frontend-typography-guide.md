# 前端字号规范

适用于云南春招智能学习平台 Web 前端（`E:\saixt\web`）全部 Vue 页面、组件、全局样式与动态绘制文本。本文档的字号下限经过三轮全量审计（CSS 声明、媒体查询覆盖、canvas/图表绘制、JS 动态注入、em/% 相对单位），并已按此标准修复全部存量问题。

## 1. 硬性下限

任何场景不得低于下表数值：

| 场景 | 下限 | 实际换算（根字号 16px） |
|---|---|---|
| 辅助 / 次要文本（tag、small、tab、badge、徽章） | `0.78rem` | 12.48px |
| 正文（段落、空状态、toast、题目正文、AI 气泡） | `0.9rem` | 14.4px |
| 图表与 canvas 绘制文本（echarts、Chart.js、`ctx.font`） | `13px` | 13px |
| 表单输入控件 | `16px` | 16px |

`html` 与 `:root` 均未设置 font-size，根字号恒为浏览器默认 16px；因此所有 rem 值在桌面与移动端换算恒定，不受 `body` 字号变化影响。

## 2. 全局基数

```css
html { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; } /* 禁止 iOS 聚焦自动放大 */

body {
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', 'Segoe UI', sans-serif;
  font-size: 16px;
  line-height: 1.7;
  font-variant-numeric: tabular-nums;
}

input, select, textarea { font-size: 16px; }
```

要点：

- 输入控件固定 16px，否则 iOS 聚焦时页面会被强制放大。
- `tabular-nums` 保证数字（积分、题量、掌握度）等宽对齐。
- `body` 在 `≤768px` 断点降为 15px，但 rem 阈值不变（见第 4 节）。

## 3. 字号阶梯

全项目统一采用以下阶梯值，跨模块保持一致，禁止自造新值：

| 层级 | 桌面 | ≤600px | ≤480px | ≤400px |
|---|---|---|---|---|
| 页面标题 `.page-head h2` | 1.55rem | 1.3rem | 1.3rem | 1.2rem |
| 页头副标题 `.page-head p` | 0.92rem | 0.86rem | 0.86rem | 0.82rem |
| 主按钮 `.btn` | 0.95rem | 0.95rem | 0.88rem | 0.88rem |
| 小按钮 `.btn-sm` | 0.88rem | 0.88rem | 0.8rem | 0.8rem |
| 标签 `.tag` | 0.78rem | 0.78rem | 0.78rem | 0.78rem |
| 轻提示 `.toast` | 0.9rem | 0.86rem（≤768px 生效） | — | — |
| AI 消息正文 `.msg-bubble` | 1rem | 1rem | 1rem | 1rem |
| 品牌副标题 / 菜单描述 `.brand-text small`、`.mp-text small` | 0.78rem | 0.78rem | 0.78rem | 隐藏 |

## 4. 断点规则

字号只在四个断点收敛，不允许在其他宽度单独微调：

| 断点 | 字号调整 |
|---|---|
| `≤768px` | `body` 15px；`.toast` 0.86rem |
| `≤600px` | `.page-head` 缩放；`.brand-text` 溢出省略 |
| `≤480px` | `.btn` 0.88rem、`.btn-sm` 0.8rem 并保证 `min-height: 44px` |
| `≤400px` | `.page-head h2` 1.2rem、`.page-head p` 0.82rem |

## 5. 模块场景最佳实践

### 5.1 文本溢出

固定宽度容器内的品牌名、标题、列表项一律加省略，禁止换行撑破布局：

```css
.brand-text strong { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
```

长内容（AI 回答、院校介绍）使用 `overflow-wrap: anywhere` 防止单词撑破气泡。

### 5.2 AI 对话（AiChat）

- 消息正文 `1rem`，行高 `1.8`，气泡内边距 `10px 12px`。
- AI 气泡宽度上限 96%、用户气泡 90%（`≤400px`），并设 `min-width: 60px` 防止过窄。
- 头像文字 `0.78rem`，头像尺寸 36–40px。

### 5.3 题目选项

- 选项高度统一 48px（Practice / AiPractice / PaperPractice / WrongBook），文字 16px。
- 选项文字不得换行省略，须完整可读。

### 5.4 空状态

- 主文案 `.empty p` 0.9rem 加粗；补充说明 `.empty-sub` 0.82rem。
- 空状态与加载失败文案必须区分（见项目工程约定），字号同样受上限约束——即不得低于第 1 节下限。

### 5.5 进度与统计

- 进度类比值（`3 / 20 题`、`第 2 / 5 页`）保留阿拉伯数字，字号 ≥0.9rem。
- 掌握度百分比文案字号 ≥0.9rem；0% 显示「待提升」而非数字。

## 6. 动态绘制文本

图表与 canvas 一律使用 px 单位，下限 13px：

| 位置 | 实现 | 字号 |
|---|---|---|
| Achievements 徽章 canvas | `ctx.font` | 22–92px（按徽章等级） |
| DataScreen 大屏各图表 | Chart.js `font: { size: 13 }` | 13px |
| DataScreen 雷达图轴标签 | `pointLabels: { font: { size: 13 } }` | 13px |
| KnowledgeGraph 图谱节点 / 轴标签 | echarts `fontSize: 13` | 13px |
| RadarChart 组件 | 图表配置 `font.size` | 13px |

移动端与桌面绘制字号一致（13px），不因断点缩小。`echarts` / `Chart.js` 配置中的字号须写成数值常量，不要依赖默认值（部分默认仅 12px）。

## 7. 相关工程约定

- 中文数字：界面中「前 N 节/轮/天」「第 X 节/轮」「近 N 天」等序数、倍数文案一律用 `utils/num.js` 的 `numToCn()` / `ordinalCn()` / `toCn()` 转中文数字；进度类比值保留阿拉伯数字。
- 触控目标：按钮、标签类元素 `min-height ≥ 44px`（极窄屏也保持），与字号规范联动保证可点性与可读性。
- 对比度：暗色背景上的文字须保证足够对比度；图表文字用 `#e2e8f0` 等级别亮色，不用低透明度叠暗底。
- 品牌色：UI 主色为品牌靛蓝 `#4f5ff0`；`#8b5cf6`（薰衣草紫）仅限语义场景（史诗盲盒、通用技术科目），字号规范不因配色改变。

## 8. 验收方法

新增或修改页面后，用以下命令核对全仓库无超限字号：

```powershell
# 低于 0.78rem 或低于 13px 的 CSS 字号
rg -n "font-size\s*:\s*(0\.(7[0-7])rem|1[0-2]px|9px|8px|7px)" src

# 动态绘制文本中的数值字号
rg -n "fontSize\s*:\s*[0-9]+" src

# canvas 文本
rg -n "ctx\.font" src
```

人工核对点：

- 页面在 400px / 480px / 600px / 768px 四个视口宽度下均无低于下限的字号。
- 图表标签、雷达图轴文字在移动端不缩小。
- `<small>`、`<sub>` 等语义元素必须显式声明字号，不得依赖浏览器默认缩小。
- 新增断点字号一律从第 3 节阶梯取值，不另造数值。
