import {
  Server,
  Terminal,
  Database,
  Key,
  PackageOpen,
  Lightbulb,
  CheckCircle2,
  Bot,
} from 'lucide-react'

export default function DeploymentPage() {
  return (
    <div className="flex flex-col gap-6">
      {/* Hero */}
      <div className="flex flex-col gap-3 pb-2">
        <h1 className="text-3xl font-bold">部署方法</h1>
        <p className="text-muted-foreground">
          Content OS 使用 SQLite 嵌入式数据库和云端 AI 服务，部署简单。以下是从零开始的部署指南。
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
              <strong className="text-foreground">大模型 API Key</strong> — 任意一家大模型服务商的 API Key 即可（DeepSeek / OpenAI / Anthropic / Google / 智谱 GLM / 通义千问 / Kimi / 腾讯混元 / 小米 MiMo / MiniMax / 字节豆包等）
            </span>
          </li>
        </ul>
      </div>

      {/* Step 1: Clone via Agent */}
      <div className="flex flex-col gap-3 rounded-lg border p-5">
        <div className="flex items-center gap-2">
          <Bot className="size-4 text-primary" />
          <h3 className="text-sm font-semibold">第一步：使用 Agent 工具克隆项目</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          如果你不熟悉 Git 命令，可以使用 AI Agent 工具来帮你完成部署。将以下命令发送给任意 Agent 工具（如 Trae、Qoder、Codex、Claude Code、WorkBuddy 等）：
        </p>
        <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs"><code>{`git clone https://github.com/southportns/contextos.git content-os
cd content-os`}</code></pre>
        <div className="flex items-start gap-2 rounded-md bg-primary/5 p-3">
          <Lightbulb className="size-3.5 shrink-0 mt-0.5 text-primary" />
          <p className="text-xs text-muted-foreground">
            <strong className="text-foreground">提示：</strong>
            告诉 Agent 这是一个基于 Next.js + SQLite + Prisma 的项目，让它执行克隆、安装依赖、配置环境变量、初始化数据库和启动应用。Agent 会自动完成后续步骤。
          </p>
        </div>
      </div>

      {/* Step 2: Install Dependencies */}
      <div className="flex flex-col gap-3 rounded-lg border p-5">
        <div className="flex items-center gap-2">
          <PackageOpen className="size-4 text-primary" />
          <h3 className="text-sm font-semibold">第二步：安装依赖</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          在项目目录中执行以下命令安装依赖：
        </p>
        <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs"><code>{`npm install`}</code></pre>
        <p className="text-xs text-muted-foreground">
          安装过程中会自动编译 better-sqlite3 原生模块，请确保系统已安装编译工具（Windows 需要 Visual Studio Build Tools）。
        </p>
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

# 任意一家大模型的 API Key 即可
# 支持的厂商：OpenAI / DeepSeek / Anthropic / Google / 智谱GLM / 通义千问 / Kimi / 腾讯混元 / 小米MiMo / MiniMax / 字节豆包
# 只需填写你使用的那个厂商的 Key

# AI 模型配置（以你选择的厂商为准）
AI_PROVIDER=deepseek
AI_MODEL=deepseek-chat`}</code></pre>
        <div className="flex items-start gap-2 rounded-md bg-primary/5 p-3">
          <Lightbulb className="size-3.5 shrink-0 mt-0.5 text-primary" />
          <p className="text-xs text-muted-foreground">
            <strong className="text-foreground">提示：</strong>
            也可以在应用启动后，进入「设置」页面直接配置 AI 模型，无需手动编辑文件。
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

        {/* SQLite Path Note */}
        <div className="flex flex-col gap-2 rounded-md bg-amber-500/5 p-3">
          <div className="flex items-start gap-2">
            <Database className="size-3.5 shrink-0 mt-0.5 text-amber-600" />
            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium text-foreground">
                关于 SQLite 数据库文件路径
              </p>
              <p className="text-xs text-muted-foreground">
                默认配置 <code className="rounded bg-muted px-1 py-0.5">DATABASE_URL="file:./dev.db"</code> 会将数据库文件放在项目根目录下。这在开发模式下完全可用。
              </p>
              <p className="text-xs text-muted-foreground">
                <strong className="text-foreground">为什么有时会建议放在项目目录外？</strong>
                主要原因是 Next.js 的文件监听（file watcher）在开发模式下可能触发 SQLite WAL 文件的锁冲突，以及生产环境打包时数据库文件不应被包含在构建产物中。但在当前版本中，我们已经通过 <code className="rounded bg-muted px-1 py-0.5">.gitignore</code> 排除了 <code className="rounded bg-muted px-1 py-0.5">*.db</code> 文件，并且 <code className="rounded bg-muted px-1 py-0.5">next.config.ts</code> 的 standalone 输出模式不会包含数据库文件，所以放在项目目录下是安全的。
              </p>
              <p className="text-xs text-muted-foreground">
                如果你希望将数据库放在项目目录外（例如避免文件监听干扰），可以修改 <code className="rounded bg-muted px-1 py-0.5">.env.local</code> 中的路径为绝对路径：
              </p>
              <pre className="overflow-x-auto rounded bg-muted p-2 text-xs"><code>{`# 使用绝对路径，将数据库放在项目目录外
DATABASE_URL="file:/path/to/your/data/contentos.db"`}</code></pre>
              <p className="text-xs text-muted-foreground">
                修改路径后需要重新执行 <code className="rounded bg-muted px-1 py-0.5">npx prisma migrate dev</code> 来创建新的数据库文件。
              </p>
            </div>
          </div>
        </div>
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

      {/* Optional: ASR Config */}
      <div className="flex flex-col gap-3 rounded-lg border p-5">
        <div className="flex items-center gap-2">
          <Lightbulb className="size-4 text-primary" />
          <h3 className="text-sm font-semibold">可选：口播稿识别配置</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          如果需要使用抖音视频口播文案提取功能，需要配置 ASR（语音识别）服务。当前版本仅支持云端模式，可选阿里云百炼或小米 MiMo。可在应用内「设置」页面配置，也可在 <code className="rounded bg-muted px-1 py-0.5">.env.local</code> 中添加：
        </p>
        <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs"><code>{`# ASR 模式（当前版本固定为 cloud）
ASR_MODE=cloud

# 云端 ASR 服务商: alibaba / xiaomi
ASR_CLOUD_PROVIDER=xiaomi
XIAOMI_ASR_API_KEY=你的小米 MiMo API Key

# 或使用阿里云百炼
# ASR_CLOUD_PROVIDER=alibaba
# ALIBABA_ASR_API_KEY=你的百炼 API Key`}</code></pre>
        <p className="text-xs text-muted-foreground">
          不配置 ASR 不影响其他功能的正常使用。
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
              检查 <code className="rounded bg-muted px-1 py-0.5">.env.local</code> 中 AI_PROVIDER 和 AI_MODEL 是否匹配你填写的 API Key。也可以在应用内「设置」页面修改。
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
              内置 DuckDuckGo 搜索和 Jina Reader 抓取，无需配置 API Key。如果搜索结果为空，可能是网络问题——DuckDuckGo 和 Jina Reader 均为境外服务，如遇网络限制请检查网络连接。
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium text-foreground">better-sqlite3 编译失败？</p>
            <p className="text-xs text-muted-foreground">
              Windows 系统需要安装 Visual Studio Build Tools（包含 C++ 桌面开发工具）。可在 Visual Studio Installer 中勾选「C++ 桌面开发」工作负载。
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
