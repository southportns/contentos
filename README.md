<p align="center">
  <img width="393" height="406" alt="Content OS Logo" src="https://github.com/user-attachments/assets/705376bc-ec76-4fe7-b59c-ca94ef8c0594" />
</p>

# Content OS

> AI 内容研究、爆款分析、内容决策与口播稿写作系统

Content OS 是一个从主题研究到终稿输出的全流程 AI 内容创作系统。不直接生成文章，而是先研究主题、分析爆款、提炼观点，再进入写作。每一步都有 AI 辅助，但用户始终拥有最终决策权。

## 核心能力

### 三种创作模式

- **自由创作** — 输入主题，AI 自动研究、分析、生成角度并写作
- **对标改编** — 从内容库选择对标内容，AI 分析结构和风格后改编为原创版本
- **文件提炼** — 上传文章、报道或书籍，AI 提炼核心观点并生成口播稿

### 内容浏览器

- **账号研究** — 输入主题或链接，采集抖音视频数据并深度分析评论区
- **话题搜索** — 按关键词搜索抖音视频，支持按发布时间筛选
- **抖音热搜** — 实时抖音热搜榜，点击词条快速搜索相关视频
- **内容库** — 已采集内容的管理，可直接用于对标改编

### 创作流程（六步）

1. **主题输入** — 选择模式，输入主题，选择平台（抖音/小红书/公众号）和受众
2. **主题研究** — AI 提取关键词、核心问题，形成结构化 Topic Profile
3. **角度选择** — AI 生成 5 个内容角度，附爆款分数和难度评级
4. **生成内容** — 一键完成策略→初稿→评估的全流程
5. **二次精修** — 语气修改、黄金三秒钩子、标题选定、人性化润色
6. **终稿输出** — Markdown 渲染、TXT 下载、保存到数据库

### 其他功能

- **AI 人设系统** — 创建多个创作人设，影响写作风格
- **六维质量评估** — 情感冲击、逻辑清晰、新颖度、可读性、实用性、平台适配
- **情感弧线设计** — 策略性引导读者情绪变化
- **口播稿识别** — 云端 ASR（阿里云百炼 / 小米 MiMo）自动识别抖音视频文案
- **运行环境检测** — 可视化检查环境变量和数据库连接状态
- **可视化设置** — 应用内直接配置 AI 模型和 ASR 服务商

## 技术栈

- **框架**: Next.js 16 (React 19)
- **语言**: TypeScript (strict)
- **数据库**: SQLite (via Prisma + better-sqlite3)
- **AI**: Vercel AI SDK (支持 DeepSeek / OpenAI / Anthropic / Google / GLM 等)
- **UI**: Tailwind CSS + shadcn/ui
- **ASR**: 阿里云百炼 / 小米 MiMo (OpenAI-compatible API)

## 快速开始

### 环境要求

- **Node.js 18+** (推荐 LTS 版本)
- **Git**
- **大模型 API Key** — 任意一家大模型服务商的 Key
- **(可选) Visual Studio Build Tools** — Windows 用户编译 better-sqlite3 需要

### 安装步骤

```bash
# 1. 克隆项目
git clone https://github.com/southportns/contextos.git content-os
cd content-os

# 2. 安装依赖
npm install

# 3. 配置环境变量
cp .env.example .env.local
# 编辑 .env.local 填入你的大模型 API Key

# 4. 初始化数据库
npx prisma migrate dev --name init

# 5. 启动应用
npm run dev
```

访问 http://localhost:3000 即可使用。

> 也可以在应用启动后，进入「设置」页面直接配置 AI 模型和 ASR 服务商。

### 生产模式

```bash
npm run build
npm run start
```

## 环境变量

| 变量 | 说明 | 必需 |
|------|------|------|
| `DATABASE_URL` | SQLite 数据库路径，默认 `file:./dev.db` | 是 |
| `AI_PROVIDER` | AI 服务商：deepseek / openai / anthropic / google / glm 等 | 是 |
| `AI_MODEL` | 模型名称，如 `deepseek-chat` | 是 |
| `大模型 API Key` | 任意一家大模型服务商的 API Key（DeepSeek / OpenAI / Anthropic / Google / 智谱 GLM / 通义千问 / Kimi 等） | 至少一个 |
| `ASR_MODE` | ASR 模式: cloud（当前版本仅支持云端） | 否 |
| `ASR_CLOUD_PROVIDER` | 云端 ASR: alibaba / xiaomi | 否 |
| `XIAOMI_ASR_API_KEY` | 小米 MiMo API Key | 使用 ASR 时 |
| `ALIBABA_ASR_API_KEY` | 阿里云百炼 API Key | 使用 ASR 时 |

完整配置参见 `.env.example`。

## 项目架构

```
UI (Next.js Pages)
  ↓
Application (API Routes)
  ↓
Agent (Workflow)
  ↓
Skill (AI 业务能力)
  ↓
Tool (数据采集)
  ↓
Infrastructure (数据库 / AI SDK)
```

所有 AI 业务能力封装为 Skill，不在组件或 API 中直接编写复杂 AI 逻辑。

## Skills

| Skill | 功能 |
|-------|------|
| topic-research | 主题研究，提取关键词和核心问题 |
| angle-generation | 内容角度生成，附爆款评分 |
| content-strategy | 内容策略设计（钩子、结构、情感弧线） |
| writing | 初稿写作 |
| evaluation | 六维质量评估 |
| refine | 二次精修（语气、钩子、标题） |
| humanization | 人性化润色 |
| content-adaptation | 对标改编 |
| content-distillation | 文件提炼 |
| viral-analysis | 爆款分析 |
| audience-analysis | 受众分析 |
| risk-analysis | 风险分析 |
| transcript-correction | 口播文案纠错 |
| content-search | 内容搜索 |

## License

MIT
