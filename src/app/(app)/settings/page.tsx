import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">设置</h1>
        <p className="text-muted-foreground">管理你的 Content OS 配置</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>AI 模型配置</CardTitle>
          <CardDescription>
            配置 AI 提供商的 API Key（至少需要一个）
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="openai-key">OpenAI API Key</Label>
            <Input
              id="openai-key"
              type="password"
              placeholder="sk-..."
              disabled
            />
          </div>
          <Separator />
          <div className="flex flex-col gap-2">
            <Label htmlFor="anthropic-key">Anthropic API Key</Label>
            <Input
              id="anthropic-key"
              type="password"
              placeholder="sk-ant-..."
              disabled
            />
          </div>
          <Separator />
          <div className="flex flex-col gap-2">
            <Label htmlFor="deepseek-key">DeepSeek API Key</Label>
            <Input
              id="deepseek-key"
              type="password"
              placeholder="sk-..."
              disabled
            />
          </div>
          <p className="text-xs text-muted-foreground">
            API Key 通过 .env.local 文件配置，不会在前端修改。
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>研究工具配置</CardTitle>
          <CardDescription>网页搜索与内容抓取（内置 DuckDuckGo + Jina Reader，无需配置 API Key）</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="web-search">网页搜索</Label>
            <Input
              id="web-search"
              type="text"
              placeholder="内置 DuckDuckGo 搜索（无需配置）"
              disabled
            />
          </div>
          <Separator />
          <div className="flex flex-col gap-2">
            <Label htmlFor="web-scrape">网页抓取</Label>
            <Input
              id="web-scrape"
              type="text"
              placeholder="内置 Jina Reader 抓取（无需配置）"
              disabled
            />
          </div>
          <p className="text-xs text-muted-foreground">
            网页研究与内容抓取使用免费的 DuckDuckGo 搜索和 Jina Reader，无需配置任何 API Key。
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>数据库配置</CardTitle>
          <CardDescription>SQLite 数据库配置</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="db-url">Database URL</Label>
            <Input
              id="db-url"
              type="password"
              placeholder="file:./dev.db"
              disabled
            />
          </div>
          <p className="text-xs text-muted-foreground">
            通过 .env.local 文件配置。
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
