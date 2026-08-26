# Content OS

> AI 内容研究、爆款分析、内容决策与写作系统。

## 概述

Content OS 不是简单的 AI Writer，而是一套从选题 → 内容研究 → 爆款拆解 → 观点提炼 → 内容结构 → 写作 → 评估 → 优化的完整内容生产系统。

## 技术栈

- **前端**: Next.js + React + TypeScript + Tailwind CSS + shadcn/ui
- **AI 运行时**: Vercel AI SDK + LangGraph
- **数据库**: PostgreSQL + Prisma + pgvector
- **研究工具**: Firecrawl
- **编辑器**: Tiptap

## 快速开始

```bash
# 安装依赖
npm install

# 复制环境变量
cp .env.example .env.local

# 开发模式
npm run dev

# 构建
npm run build

# 代码检查
npm run lint
npm run typecheck
npm run format
```

## 项目结构

```
content-os/
├── src/
│   ├── app/            # Next.js App Router 页面
│   ├── components/     # React 组件
│   │   └── ui/         # shadcn/ui 组件
│   ├── hooks/          # React Hooks
│   └── lib/            # 核心库
│       ├── ai/         # AI 模型调用
│       ├── agents/     # Agent 编排
│       ├── services/   # 业务服务
│       ├── repositories/ # 数据访问
│       ├── tools/      # Agent 工具
│       └── utils/      # 工具函数
├── skills/             # AI Skill 层
├── prisma/             # 数据库 Schema
├── prompts/            # AI Prompt 模板
├── tests/              # 测试
├── docs/               # 项目文档
└── AGENTS.md           # AI Agent 开发规范
```

## 文档

- [项目概述](docs/PROJECT.md)
- [产品规格](docs/PRODUCT_SPEC.md)
- [系统架构](docs/ARCHITECTURE.md)
- [开发规范](docs/DEVELOPMENT.md)
- [Skill 规范](docs/SKILL_SPEC.md)
- [开发路线图](docs/ROADMAP.md)
- [技术选型](docs/TECH_STACK.md)

## 开发规范

详见 [AGENTS.md](AGENTS.md)
