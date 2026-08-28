# Content OS — Lite Edition

> AI 内容研究、爆款分析、内容决策与写作系统（简化免翻墙版）

## 特点

- **SQLite 嵌入式数据库** — 无需 Docker，无需安装外部数据库
- **DuckDuckGo + Jina Reader** — 免费网页搜索与内容抓取，无需注册 Firecrawl
- **零外部依赖** — 只需 Node.js 18+ 和一个 AI API Key

## 快速开始

### 方式一：使用安装脚本

```bash
.\install.ps1
```

### 方式二：手动安装

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env.local
# 编辑 .env.local 填入你的 AI API Key

# 3. 初始化数据库
npx prisma migrate dev --name init

# 4. 启动应用
npm run dev
```

访问 http://localhost:3000 即可使用。

## 环境变量

| 变量 | 说明 | 必需 |
|------|------|------|
| `DATABASE_URL` | SQLite 数据库路径，默认 `file:./dev.db` | 是 |
| `AI_PROVIDER` | AI 服务商：deepseek / openai / anthropic / google / glm | 是 |
| `AI_MODEL` | 模型名称，如 `deepseek-chat` | 是 |
| `DEEPSEEK_API_KEY` | DeepSeek API Key | 至少一个 |
| `OPENAI_API_KEY` | OpenAI API Key | 至少一个 |
| `ANTHROPIC_API_KEY` | Anthropic API Key | 至少一个 |

## 与标准版的区别

| 特性 | Lite（本版本） | Standard |
|------|---------------|----------|
| 数据库 | SQLite | PostgreSQL + pgvector |
| 搜索 | DuckDuckGo + Jina Reader | Firecrawl |
| Docker | 不需要 | 需要 |
| 翻墙 | 不需要 | 需要注册 Firecrawl |

## License

MIT
