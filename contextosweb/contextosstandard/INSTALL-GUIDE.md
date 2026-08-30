# Content OS Lite — 用户安装指南

## 概述

Content OS Lite 是简化免翻墙版，无需 Docker、无需 Firecrawl、无需翻墙注册外部服务。
只需要 **Node.js** 和一个 **AI API Key** 即可在本地运行。

---

## 环境要求

| 项目 | 要求 | 说明 |
|------|------|------|
| 操作系统 | Windows 10/11、macOS、Linux | 推荐 Windows |
| Node.js | 18.0 或更高版本 | 推荐 LTS 版本 |
| AI API Key | 至少一个 | DeepSeek（推荐）/ OpenAI / Anthropic / Google / GLM |

### 获取 AI API Key（以 DeepSeek 为例，推荐国内用户）

1. 访问 https://platform.deepseek.com
2. 注册账号（手机号即可，无需翻墙）
3. 在 API Keys 页面创建 Key，复制保存
4. DeepSeek 新用户有免费额度，价格也很便宜

---

## 安装步骤

### 第一步：解压项目

将 `contentos-lite.zip` 解压到你想放置的目录，例如：

```
D:\contentos-lite\
```

### 第二步：打开终端

在解压后的项目根目录（能看到 `package.json` 的目录）打开终端。

**Windows 方式**：在文件夹地址栏输入 `powershell` 回车，或右键 → "在终端中打开"

### 第三步：一键安装（推荐）

```powershell
.\install.ps1
```

安装脚本会自动完成：
1. ✅ 检查 Node.js
2. ✅ 安装项目依赖（`npm install`）
3. ✅ 创建 `.env.local` 配置文件
4. ✅ 初始化 SQLite 数据库
5. ✅ 生成 Prisma Client

### 手动安装（如果脚本失败）

如果一键安装不成功，可以手动执行：

```bash
# 1. 安装依赖
npm install

# 2. 复制环境变量模板
cp .env.example .env.local
# Windows PowerShell: Copy-Item .env.example .env.local

# 3. 初始化数据库
$env:DATABASE_URL = "file:./dev.db"
npx prisma migrate dev --name init

# 4. 生成 Prisma Client
npx prisma generate
```

### 第四步：配置 AI API Key

打开 `.env.local` 文件（用记事本或 VS Code），找到以下行：

```env
# AI 服务商（填你使用的）
AI_PROVIDER=deepseek
AI_MODEL=deepseek-chat

# DeepSeek API Key（替换为你的真实 Key）
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx
```

填入你的 DeepSeek API Key。如果用其他服务商，修改 `AI_PROVIDER` 和对应的 Key 即可。

**完整的 AI 配置选项：**

| 服务商 | AI_PROVIDER | AI_MODEL | 需要的 Key |
|--------|-------------|----------|------------|
| DeepSeek（推荐） | `deepseek` | `deepseek-chat` | `DEEPSEEK_API_KEY` |
| OpenAI | `openai` | `gpt-4o` | `OPENAI_API_KEY` |
| Anthropic | `anthropic` | `claude-3-5-sonnet-20241022` | `ANTHROPIC_API_KEY` |
| Google | `google` | `gemini-2.0-flash` | `GOOGLE_GENERATIVE_AI_API_KEY` |
| GLM（智谱） | `glm` | `glm-4-flash` | `GLM_API_KEY` |

### 第五步：启动应用

```bash
npm run dev
```

看到类似以下输出即表示启动成功：

```
  ▲ Next.js 16.3.2
  - Local:   http://localhost:3000
  ✓ Ready in 2.3s
```

### 第六步：访问应用

浏览器打开 http://localhost:3000

---

## 验证安装是否成功

1. 打开 http://localhost:3000
2. 点击左侧导航的 **"运行环境检测"**（或访问 http://localhost:3000/diagnostics）
3. 确认以下项目全部为绿色 ✓：
   - ✅ AI 模型配置 — 至少一个 API Key 已配置
   - ✅ 研究工具配置 — DuckDuckGo + Jina Reader（内置，无需配置）
   - ✅ 数据库状态 — SQLite 已连接

---

## 常见问题

### Q: `npm install` 很慢怎么办？

使用国内镜像：
```bash
npm config set registry https://registry.npmmirror.com
npm install
```

### Q: `npx prisma migrate dev` 报错？

尝试：
```bash
# 确保环境变量已设置
$env:DATABASE_URL = "file:./dev.db"

# 如果迁移失败，用 db push 代替
npx prisma db push
```

### Q: 启动后页面报 "数据库未配置"？

检查 `.env.local` 文件中是否有：
```env
DATABASE_URL="file:./dev.db"
```

### Q: AI 生成报错？

1. 检查 `.env.local` 中 `AI_PROVIDER` 和 `AI_MODEL` 是否匹配你填的 Key
2. 例如用 DeepSeek：确保 `AI_PROVIDER=deepseek` 和 `AI_MODEL=deepseek-chat`
3. 确认 Key 没有多余的空格

### Q: 网页搜索没有结果？

Lite 版使用 DuckDuckGo 搜索和 Jina Reader 抓取，这两个都是境外服务。
如果网络无法访问，搜索功能会不可用，但其他功能（AI 写作、分析等）不受影响。

### Q: 如何更新到新版本？

直接用新版本的 zip 覆盖安装目录（保留 `.env.local` 和 `dev.db`），然后：
```bash
npm install
npx prisma migrate dev
```

---

## 与标准版的区别

如果你未来需要更强的功能，可以迁移到标准版（Standard）：

| 特性 | Lite（当前版本） | Standard |
|------|-----------------|----------|
| 数据库 | SQLite（文件级） | PostgreSQL + pgvector |
| 搜索工具 | DuckDuckGo + Jina Reader | Firecrawl（专业级） |
| Docker | 不需要 | 需要 |
| 翻墙 | 不需要 | 需要（注册 Firecrawl） |
| 性能 | 够用（单用户） | 更强（多用户/团队） |

---

## 技术支持

- 部署指南页面：应用内 → 左侧导航 → "部署指南"
- 运行环境检测：应用内 → 左侧导航 → "运行环境检测"
