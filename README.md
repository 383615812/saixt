# 云南春招智能学习平台

面向云南省春季招生（单招）考生的智能学习平台，提供**在线刷题、AI 智能练习、题库浏览、AI 答疑、志愿推荐、排行榜、院校库查询、总分测算与学习报告**一体化服务。

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | Vue 3 + Vite + Vue Router（响应式，适配手机/平板/电脑） |
| 后端 | Node.js + Express |
| 数据库 | SQLite（`node:sqlite` 内置模块，零配置） |
| 认证 | JWT Token + SHA-256 密码哈希 |

## 目录结构

```
E:\saixt
├── server                  # 后端服务
│   ├── data                # 数据文件（SQLite 题库 + 院校/计划种子数据）
│   │   ├── saixt.db        # SQLite 题库（28278 道真题，11 科目）
│   │   ├── schools.json    # 院校库（65 所）
│   │   └── plans.json      # 招生专业计划（1351 条）
│   ├── .env.example        # AI 密钥配置示例（复制为 .env 并填入密钥）
│   ├── src
│   │   ├── index.js        # 服务入口（端口 3000）
│   │   ├── db.js           # 建表 + 种子数据导入
│   │   ├── auth.js         # JWT 签发/校验/密码哈希
│   │   ├── config.js       # 读取 .env 配置（DeepSeek 密钥）
│   │   └── routes          # 接口路由
│   │       ├── auth.js     # 注册/登录/资料
│   │       ├── questions.js# 题库查询
│   │       ├── practice.js # 刷题提交/模拟考试/错题本
│   │       ├── schools.js  # 院校与专业计划
│   │       ├── stats.js    # 学习统计与得分预测
│   │       ├── ai.js       # AI 智能答疑 / 错题讲解 / 生成练习题 / 学习计划（DeepSeek）
│   │       ├── recommend.js# 智能志愿推荐（冲/稳/保）
│   │       ├── ranking.js  # 学习排行榜
│   │       ├── checkin.js  # 学习打卡（连续天数/热力图）
│   │       └── favorites.js# 题目收藏
│   └── package.json
├── web                     # 前端应用
│   └── src
│       ├── api.js          # API 客户端（自动携带 Token）
│       ├── router.js       # 路由（含登录守卫）
│       ├── App.vue         # 布局（顶栏导航 + 页脚）
│       ├── assets/main.css # 全局主题样式
│       ├── components
│       │   └── TierBlock.vue # 志愿推荐梯队卡片
│       └── views
│           ├── Home.vue        # 首页
│           ├── Login.vue       # 登录/注册
│           ├── Practice.vue    # 在线刷题（专项练习/模拟考试）
│           ├── QuestionBank.vue# 题库中心
│           ├── AiChat.vue      # AI 智能答疑
│           ├── AiPractice.vue  # AI 智能练习（生成题作答）
│           ├── Recommend.vue   # 智能志愿推荐
│           ├── Ranking.vue     # 学习排行榜
│           ├── Schools.vue     # 院校库
│           ├── SchoolDetail.vue# 院校详情与专业计划
│           └── Dashboard.vue   # 个人中心（统计/预测/错题本/目标）
└── scripts                 # 数据解析脚本
    ├── parse_questions.py  # 试卷文本 → questions.json
    └── parse_schools.py    # 院校专业文本 → schools.json / plans.json
```

## 启动方式

### 1. 启动后端（含前端页面托管）

```bash
cd E:\saixt\server
npm install        # 首次运行需要
node src/index.js
```

服务启动后：
- 接口地址：`http://localhost:3000/api`
- 健康检查：`http://localhost:3000/api/health`
- 前端页面：`http://localhost:3000`（生产构建产物，若 `web/dist` 存在则自动托管）

### 2. 前端开发模式（可选，热更新）

```bash
cd E:\saixt\web
npm install        # 首次运行需要
npm run dev        # 开发服务器，默认 http://localhost:5173，已配置代理到 3000
```

### 3. 前端生产构建

```bash
cd E:\saixt\web
npm run build      # 产物输出到 web/dist，后端启动时自动托管
```

### 4. 启用 AI 智能答疑（可选）

在 `E:\saixt\server` 目录下创建 `.env` 文件（可参考 `.env.example`），填入 DeepSeek 密钥：

```
DEEPSEEK_API_KEY=sk-你的密钥
```

保存后重启后端服务即可。未配置密钥时，AI 答疑页面会给出配置提示，不影响其他功能。

## 核心功能

- **每日一练**：首页智能推荐 5 道题，优先覆盖薄弱知识点，一键开始今日练习
- **在线刷题**：按科目（信息技术/通用技术）选择，支持专项练习（逐题即时解析）、模拟考试（限时 30 分钟、自动交卷、整卷判分）与错题重练（答对即从错题本移除）
- **AI 智能练习**：让 AI 按科目/章节生成练习题，作答后即时判分与讲解，可针对性巩固薄弱知识点
- **题库中心**：按科目/章节筛选、关键词搜索、查看答案与解析，支持收藏题目
- **题目收藏**：刷题与题库中一键收藏重要题目，个人中心集中查看
- **AI 智能答疑**：DeepSeek 驱动的 AI 老师，解答学科知识、考试政策与备考规划
- **AI 错题讲解**：错题本一键生成 AI 深度讲解（正确思路、错误分析、知识点、举一反三）
- **AI 学习计划**：根据刷题正确率与薄弱知识点，AI 生成个性化 4 周备考计划
- **学习打卡**：每日打卡、连续天数、10 周学习热力图，激励坚持备考
- **知识点掌握度**：按章节统计正确率，自动识别薄弱章节，支持一键直达该章节专项练习
- **智能志愿推荐**：根据预估总分 + 真实院校数据，生成「冲 / 稳 / 保」志愿方案
- **学习排行榜**：按累计答对题数排名，展示个人实时排名
- **院校库**：65 所招生院校，支持搜索、排序，查看专业计划与学费
- **个人中心**：累计答题/正确率统计、总分测算（会考折算 + 职业技能预测）、学习趋势（近 14 天柱状图）、模拟考试历史、错题本（一键错题重练）、收藏、目标设置
- **考试倒计时**：首页实时显示距离 2027 春招考试的天数，登录用户展示学习概览

## 数据说明

- 题库数据整理自全国各省高中学业水平合格性考试真题、好题汇编与总复习资料，覆盖 11 个科目
- 院校与招生计划整理自云南省高职院校春季招生历年公布数据
- 所有数据仅作学习参考，实际招生政策与计划以云南省招生考试院当年官方公布为准

## 题库统计（当前）

题库总量 **28641 题**，覆盖 11 个科目：

| 科目 | 题数 | 章节数 |
| --- | --- | --- |
| 历史 | 5785 | 140 |
| 生物 | 4070 | 28 |
| 物理 | 2954 | 46 |
| 化学 | 2731 | 44 |
| 通用技术 | 2755 | 11 |
| 地理 | 2136 | 40 |
| 数学 | 1923 | 17 |
| 语文 | 1729 | 43 |
| 英语 | 1540 | 39 |
| 信息技术 | 1730 | 19 |
| 政治 | 1288 | 23 |

题型分布：单选 23235、主观 4136、多选 641、填空 373、判断 256。难度分布：基础 7238、中等 20177、较难 1226。

## 接口一览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | /api/auth/register | 注册 |
| POST | /api/auth/login | 登录 |
| GET | /api/auth/me | 当前用户与资料 |
| PUT | /api/auth/profile | 更新目标资料 |
| GET | /api/questions | 题库列表（筛选/分页） |
| GET | /api/questions/meta | 科目/章节统计 |
| GET | /api/questions/:id | 题目详情（含答案） |
| POST | /api/practice/submit | 提交单题作答 |
| POST | /api/practice/session | 提交整卷（模拟考试） |
| GET | /api/practice/records | 我的练习记录 |
| GET | /api/practice/wrong | 我的错题本（排除已掌握） |
| POST | /api/practice/mastered | 标记错题已掌握（错题重练答对后调用） |
| GET | /api/practice/sessions | 我的模拟考试记录 |
| GET | /api/stats/trend | 学习趋势（近 14 天每日答题量与正确率） |
| GET | /api/daily | 每日推荐题目（登录用户优先薄弱章节） |
| POST | /api/ai/chat | AI 智能答疑 |
| POST | /api/ai/explain | AI 错题讲解 |
| POST | /api/ai/generate | AI 生成练习题 |
| POST | /api/ai/plan | AI 个性化学习计划 |
| GET | /api/ai/quick | 常见问题列表 |
| POST | /api/checkin | 今日学习打卡 |
| GET | /api/checkin/me | 打卡记录（连续天数/热力图） |
| GET | /api/stats/mastery | 知识点掌握度 |
| POST | /api/favorites/toggle | 收藏 / 取消收藏 |
| GET | /api/favorites | 我的收藏列表 |
| GET | /api/recommend | 智能志愿推荐（冲/稳/保） |
| GET | /api/ranking | 学习排行榜 |
| GET | /api/schools | 院校列表 |
| GET | /api/schools/:code | 院校详情 + 专业计划 |
| GET | /api/schools/plans/search | 专业计划检索 |
| GET | /api/stats/me | 学习统计与得分预测 |

## 版本记录

- **V1.8（当前）**：题库扩充至 28641 题，AI 补强通用技术（+169）与信息技术（+194）薄弱章节
- **V1.7**：题库扩充至 28278 题（新增 2026 好题汇编 547 题），完善题库统计文档
- **V1.6**：新增每日一练（首页智能推荐薄弱知识点）、知识点掌握度一键章节练习
- **V1.5**：新增错题重练模式（答对即从错题本移除）、学习趋势（近 14 天柱状图）、模拟考试历史
- **V1.4**：新增题目收藏、模拟考试限时（30 分钟自动交卷）、首页考试倒计时与学习概览
- **V1.3**：新增学习打卡（连续天数/热力图）、知识点掌握度分析、AI 个性化学习计划
- **V1.2**：新增 AI 智能练习、AI 错题讲解、会考成绩录入与总分测算
- **V1.1**：新增 AI 智能答疑（DeepSeek）、智能志愿推荐（冲/稳/保）、学习排行榜
- **V1.0**：刷题 + 题库 + 院校库 + 个人中心核心功能，真实数据入库，前后端联调通过
