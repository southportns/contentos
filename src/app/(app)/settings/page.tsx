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
          <CardDescription>配置 Firecrawl API Key 用于网页研究</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="firecrawl-key">Firecrawl API Key</Label>
            <Input
              id="firecrawl-key"
              type="password"
              placeholder="fc-..."
              disabled
            />
          </div>
          <p className="text-xs text-muted-foreground">
            通过 .env.local 文件配置。
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>数据库配置</CardTitle>
          <CardDescription>PostgreSQL 连接配置</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="db-url">Database URL</Label>
            <Input
              id="db-url"
              type="password"
              placeholder="postgresql://..."
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
