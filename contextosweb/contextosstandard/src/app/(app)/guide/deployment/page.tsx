import {
  Server,
  Terminal,
  Database,
  Key,
  PackageOpen,
  Lightbulb,
  CheckCircle2,
} from 'lucide-react'

export default function DeploymentPage() {
  return (
    <div className="flex flex-col gap-6">
      {/* Hero */}
      <div className="flex flex-col gap-3 pb-2">
        <h1 className="text-3xl font-bold">本地部署</h1>
        <p className="text-muted-foreground">
          Content OS Lite 支持完全本地部署，以下是从零开始的部署教程。无需 Docker，无需翻墙。
        </p>
      </div>

      {/* Prerequisites */}
      <div className="flex flex-col gap-3 rounded-lg border p-5">
        <div className="flex items-center gap-2">
          <PackageOpen className="size-4 text-primary" />
          <h3 className="text-sm font-semibold">环境准备</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          在开始之前，请确保你的系统已安装以下工具：
        </p>
        <ul className="flex flex-col gap-2">
          <li className="flex items-start gap-2 text-xs text-muted-foreground">
            <CheckCircle2 className="size-3.5 shrink-0 mt-0.5 text-primary/60" />
            <span>
              <strong className="text-foreground">Node.js 18+</strong> — 推荐使用 LTS 版本（<a href="https://nodejs.org" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">nodejs.org</a> 下载）
            </span>
          </li>
          <li className="flex items-start gap-2 text-xs text-muted-foreground">
            <CheckCircle2 className="size-3.5 shrink-0 mt-0.5 text-primary/60" />
            <span>
              <strong className="text-foreground">Git</strong> — 用于克隆项目代码
            </span>
          </li>
          <li className="flex items-start gap-2 text-xs text-muted-foreground">
            <CheckCircle2 className="size-3.5 shrink-0 mt-0.5 text-primary/60" />
            <span>
              <strong className="text-foreground">AI API Key</strong> — 至少需要一个 AI 服务商的 API Key（DeepSeek / OpenAI / Anthropic / Google / GLM）
            </span>
          </li>
        </ul>
        <div className="flex items-start gap-2 rounded-md bg-green-500/5 p-3">
          <CheckCircle2 className="size-3.5 shrink-0 mt-0.5 text-green-600" />
          <p className="text-xs text-muted-foreground">
            <strong className="text-foreground">无需 Docker</strong> — Lite 版使用 SQLite 嵌入式数据库，无需安装 Docker。无需 Firecrawl — 内置 DuckDuckGo 搜索和 Jina Reader 抓取，无需注册任何外部服务。
          </p>
        </div>
      </div>

      {/* Step 1: Clone */}
      <div className="flex flex-col gap-3 rounded-lg border p-5">
        <div className="flex items-center gap-2">
          <Terminal className="size-4 text-primary" />
          <h3 className="text-sm font-semibold">第一步：克隆项目</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          打开终端，执行以下命令克隆项目代码并进入项目目录：
        </p>
        <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs"><code>{`git clone <项目仓库地址> content-os
cd content-os`}</code></pre>
      </div>

      {/* Step 2: Install Dependencies */}
      <div className="flex flex-col gap-3 rounded-lg border p-5">
        <div className="flex items-center gap-2">
          <PackageOpen className="size-4 text-primary" />
          <h3 className="text-sm font-semibold">第二步：安装依赖</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          使用 npm 安装项目依赖：
        </p>
        <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs"><code>{`npm install`}</code></pre>
      </div>

      {/* Step 3: Environment */}
      <div className="flex flex-col gap-3 rounded-lg border p-5">
        <div className="flex items-center gap-2">
          <Key className="size-4 text-primary" />
          <h3 className="text-sm font-semibold">第三步：配置环境变量</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          复制环境变量模板并填写你的 API Key：
        </p>
        <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs"><code>{`cp .env.example .env.local`}</code></pre>
        <p className="text-xs text-muted-foreground">
          编辑 <code className="rounded bg-muted px-1 py-0.5">.env.local</code> 文件，填写以下关键配置：
        </p>
        <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs"><code>{`# 数据库（SQLite，无需外部服务）
DATABASE_URL="file:./dev.db"

# AI 服务商（至少填一个）
DEEPSEEK_API_KEY=你的 DeepSeek API Key
OPENAI_API_KEY=你的 OpenAI API Key
ANTHROPIC_API_KEY=你的 Anthropic API Key

# AI 模型配置
AI_PROVIDER=deepseek
AI_MODEL=deepseek-chat`}</code></pre>
        <div className="flex items-start gap-2 rounded-md bg-primary/5 p-3">
          <Lightbulb className="size-3.5 shrink-0 mt-0.5 text-primary" />
          <p className="text-xs text-muted-foreground">
            <strong className="text-foreground">AI 服务商选择建议：</strong>
            国内用户推荐使用 DeepSeek（性价比高、速度快）；需要更高质量可使用 Anthropic Claude 或 OpenAI GPT-4o。
            只需填写你使用的那一个服务商的 Key 即可。
          </p>
        </div>
      </div>

      {/* Step 4: Database Migration */}
      <div className="flex flex-col gap-3 rounded-lg border p-5">
        <div className="flex items-center gap-2">
          <Database className="size-4 text-primary" />
          <h3 className="text-sm font-semibold">第四步：初始化数据库</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          项目使用 SQLite 嵌入式数据库，执行 Prisma 迁移创建表结构：
        </p>
        <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs"><code>{`npx prisma migrate dev --name init`}</code></pre>
        <p className="text-xs text-muted-foreground">
          如果迁移成功，你会看到类似 <code className="rounded bg-muted px-1 py-0.5">&ldquo;Applied migration&rdquo;</code> 的输出。同时 Prisma Client 会自动生成。
        </p>
      </div>

      {/* Step 5: Start */}
      <div className="flex flex-col gap-3 rounded-lg border p-5">
        <div className="flex items-center gap-2">
          <Server className="size-4 text-primary" />
          <h3 className="text-sm font-semibold">第五步：启动应用</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          开发模式启动（支持热更新，推荐开发时使用）：
        </p>
        <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs"><code>{`npm run dev`}</code></pre>
        <p className="text-xs text-muted-foreground">
          生产模式启动（性能更优，部署时使用）：
        </p>
        <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs"><code>{`npm run build
npm run start`}</code></pre>
        <p className="text-xs text-muted-foreground">
          启动后访问 <a href="http://localhost:3000" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">http://localhost:3000</a> 即可使用 Content OS。
        </p>
      </div>

      {/* Troubleshooting */}
      <div className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/5 p-5">
        <div className="flex items-center gap-2">
          <Lightbulb className="size-4 text-primary" />
          <h3 className="text-sm font-semibold">常见问题</h3>
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium text-foreground">数据库报错？</p>
            <p className="text-xs text-muted-foreground">
              SQLite 是嵌入式数据库，无需启动外部服务。如果报错，尝试删除 <code className="rounded bg-muted px-1 py-0.5">dev.db</code> 文件后重新执行 <code className="rounded bg-muted px-1 py-0.5">npx prisma migrate dev</code>。
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium text-foreground">AI 生成报错？</p>
            <p className="text-xs text-muted-foreground">
              检查 <code className="rounded bg-muted px-1 py-0.5">.env.local</code> 中 AI_PROVIDER 和 AI_MODEL 是否匹配你填写的 API Key。例如使用 DeepSeek 时，确保 <code className="rounded bg-muted px-1 py-0.5">AI_PROVIDER=deepseek</code> 和 <code className="rounded bg-muted px-1 py-0.5">AI_MODEL=deepseek-chat</code>。
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium text-foreground">Prisma 迁移失败？</p>
            <p className="text-xs text-muted-foreground">
              确保 <code className="rounded bg-muted px-1 py-0.5">DATABASE_URL</code> 配置正确（格式：<code className="rounded bg-muted px-1 py-0.5">file:./dev.db</code>）。可尝试 <code className="rounded bg-muted px-1 py-0.5">npx prisma db push</code> 强制同步 schema。
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium text-foreground">网页搜索不工作？</p>
            <p className="text-xs text-muted-foreground">
              Lite 版使用 DuckDuckGo 搜索和 Jina Reader 抓取，无需配置 API Key。如果搜索结果为空，可能是网络问题——DuckDuckGo 和 Jina Reader 均为境外服务，如遇网络限制请检查网络连接。
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
