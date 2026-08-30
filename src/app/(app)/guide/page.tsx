import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { GearNodes } from '@/components/icons/gear-nodes'
import {
  PenLine, Sparkles, Target, ClipboardCheck, Wand2,
  ArrowRight, FileText, Lightbulb, Gauge, Rocket,
  CheckCircle2, Brain, Heart, Compass, Search,
  Flame, TrendingUp, Library, BookOpen, Wand2 as AdaptIcon,
  Settings, Activity, UserCircle, AudioWaveform,
} from 'lucide-react'

const CREATION_MODES = [
  {
    icon: GearNodes,
    title: '自由创作',
    description: '输入一个主题，AI 自动研究、分析、生成角度并写作。适合从零开始的内容创作。',
  },
  {
    icon: AdaptIcon,
    title: '对标改编',
    description: '从内容库中选择一条对标内容，AI 分析其结构和风格，改编为你的原创版本。适合学习和超越爆款。',
  },
  {
    icon: BookOpen,
    title: '文件提炼',
    description: '上传文章、报道或书籍内容，AI 提炼核心观点并生成口播稿。适合从长内容中提取短视频素材。',
  },
]

const WORKFLOW_STEPS = [
  {
    icon: PenLine,
    title: '主题输入与模式选择',
    description: '选择创作模式（自由创作 / 对标改编 / 文件提炼），输入主题，选择目标平台（抖音、小红书、公众号）和受众年龄段，可选配创作人设来定义写作风格。',
    tips: [
      '三种创作模式适应不同场景',
      '平台不同，生成的策略和文案风格也不同',
      '人设会让 AI 模拟特定角色风格写作',
    ],
  },
  {
    icon: Sparkles,
    title: '主题研究',
    description: 'AI 自动分析主题，提取关键词、核心问题和潜在角度，形成结构化的 Topic Profile。同时搜索网页和抖音内容作为参考素材。',
    tips: ['支持手动编辑研究结果', '可以增减关键词和核心问题', '确认结果后自动进入角度生成'],
  },
  {
    icon: Target,
    title: '角度选择',
    description: 'AI 基于研究结果生成 5 个内容角度，每个角度附带预估爆款分数、目标情绪和难度评级。',
    tips: ['每个角度包含理由和受众吸引力分析', '点击展开查看关键点', '选择后点击下一步进入生成'],
  },
  {
    icon: Rocket,
    title: '生成内容',
    description: '一键完成内容策略 → 初稿写作 → 质量评估的全流程，输出结构化初稿和详细评分。',
    tips: ['策略包含钩子、段落结构、情感弧线', '初稿可在线编辑修改', '评估含六维评分和改进建议'],
  },
  {
    icon: Wand2,
    title: '二次精修',
    description: '多种精修模式：语气修改、黄金三秒钩子、标题选定，支持手动编辑和 AI 辅助。还包括人性化润色和风格适配。',
    tips: ['语气修改可使用预设或自定义提示词', '黄金三秒生成多个开场钩子候选', '标题选定提供多个候选标题'],
  },
  {
    icon: ClipboardCheck,
    title: '终稿输出',
    description: '确认精修结果，输出最终内容，支持 Markdown 渲染、TXT 预览、下载和复制。可保存到创作数据库。',
    tips: ['终稿可在页面内直接编辑', '支持下载为 TXT 文件', '可保存到创作数据库随时查看'],
  },
]

const FEATURES = [
  {
    icon: Compass,
    title: '内容浏览器',
    description: '四大工具集于一体：账号研究（深度分析抖音账号和评论区）、话题搜索（按关键词搜索抖音视频）、抖音热搜（实时热搜榜）、内容库（已采集内容管理）。',
  },
  {
    icon: Brain,
    title: '研究驱动写作',
    description: '不是直接生成文章，而是先研究主题、分析爆款、提炼观点，再进入写作。确保内容有据可依。',
  },
  {
    icon: Gauge,
    title: '六维质量评估',
    description: '从情感冲击、逻辑清晰、新颖度、可读性、实用性、平台适配六个维度评分，附改进建议。',
  },
  {
    icon: Heart,
    title: '情感弧线设计',
    description: '每篇内容都有策略性的情感弧线设计，从开头到结尾引导读者情绪变化。',
  },
  {
    icon: Lightbulb,
    title: 'AI 人设系统',
    description: '创建多个创作人设，让 AI 模拟不同角色风格写作，从温柔治愈到犀利直接。',
  },
  {
    icon: AudioWaveform,
    title: '口播稿识别',
    description: '支持云端 ASR（阿里云百炼 / 小米 MiMo）自动识别抖音视频口播文案，并进行 AI 纠错，用于对标分析和改编。',
  },
]

const OTHER_PAGES = [
  { icon: FileText, title: '工作台', description: '查看当前创作进度的完整工作流状态' },
  { icon: UserCircle, title: '人设管理', description: '创建和管理创作人设，影响写作风格' },
  { icon: Library, title: '创作', description: '管理所有内容创作记录，支持编辑和删除' },
  { icon: Activity, title: '环境检测', description: '检查系统环境变量与数据库连接状态' },
  { icon: Settings, title: '设置', description: '配置 AI 模型、ASR 服务商和数据库' },
]

export default function GuidePage() {
  return (
    <div className="flex flex-col gap-6">
      {/* Hero */}
      <div className="flex flex-col gap-3 pb-8">
        <h1 className="text-3xl font-bold">使用指导</h1>
        <p className="text-muted-foreground">
          Content OS 是一个 AI 内容研究、爆款分析、内容决策与写作系统。从主题输入到终稿输出，六步完成高质量内容创作。每一步都有 AI 辅助，但你始终拥有最终决策权。
        </p>
      </div>

      {/* Creation Modes */}
      <div className="mt-2 flex flex-col gap-3">
        <h2 className="text-xl font-bold">三种创作模式</h2>
        <p className="text-sm text-muted-foreground">
          根据你的需求选择不同的创作起点。
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          {CREATION_MODES.map((mode) => {
            const Icon = mode.icon
            return (
              <div key={mode.title} className="flex flex-col gap-2 rounded-lg border p-4">
                <div className="flex items-center gap-2">
                  <Icon className="size-4 text-primary" />
                  <span className="text-sm font-medium">{mode.title}</span>
                </div>
                <p className="text-xs text-muted-foreground">{mode.description}</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Workflow */}
      <div className="mt-12 flex flex-col gap-3">
        <h2 className="text-xl font-bold">创作流程</h2>
        <p className="text-sm text-muted-foreground">
          六步完成从主题到成品的全流程。
        </p>
        <div className="flex flex-col gap-6">
          {WORKFLOW_STEPS.map((step, index) => {
            const Icon = step.icon
            return (
              <div key={step.title} className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Icon className="size-5" />
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-muted-foreground">步骤 {index + 1}</span>
                    </div>
                    <h3 className="text-lg font-semibold">{step.title}</h3>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground pl-13">
                  {step.description}
                </p>
                <ul className="flex flex-col gap-1 pl-13">
                  {step.tips.map((tip) => (
                    <li key={tip} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <CheckCircle2 className="size-3.5 shrink-0 mt-0.5 text-primary/60" />
                      {tip}
                    </li>
                  ))}
                </ul>
                {index < WORKFLOW_STEPS.length - 1 && (
                  <div className="flex items-center gap-2 pl-5 pt-1">
                    <div className="h-6 w-px bg-border" />
                    <ArrowRight className="size-3 text-muted-foreground/40" />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Content Explorer */}
      <div className="mt-12 flex flex-col gap-3">
        <h2 className="text-xl font-bold">内容浏览器</h2>
        <p className="text-sm text-muted-foreground">
          独立于创作流程的内容研究工具，随时可用于采集素材和分析爆款。
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2 rounded-lg border p-4">
            <div className="flex items-center gap-2">
              <Search className="size-4 text-primary" />
              <span className="text-sm font-medium">账号研究</span>
            </div>
            <p className="text-xs text-muted-foreground">输入主题或链接，采集抖音视频内容数据并深度分析评论区。</p>
          </div>
          <div className="flex flex-col gap-2 rounded-lg border p-4">
            <div className="flex items-center gap-2">
              <Flame className="size-4 text-primary" />
              <span className="text-sm font-medium">话题搜索</span>
            </div>
            <p className="text-xs text-muted-foreground">搜索抖音视频，支持按发布时间筛选，结果可加入内容库。</p>
          </div>
          <div className="flex flex-col gap-2 rounded-lg border p-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="size-4 text-primary" />
              <span className="text-sm font-medium">抖音热搜</span>
            </div>
            <p className="text-xs text-muted-foreground">实时抖音热搜榜，点击词条快速搜索相关视频。</p>
          </div>
          <div className="flex flex-col gap-2 rounded-lg border p-4">
            <div className="flex items-center gap-2">
              <Library className="size-4 text-primary" />
              <span className="text-sm font-medium">内容库</span>
            </div>
            <p className="text-xs text-muted-foreground">已采集的内容集合，支持搜索和按平台筛选，可直接用于对标改编。</p>
          </div>
        </div>
      </div>

      {/* Core Features */}
      <div className="mt-12 flex flex-col gap-3">
        <h2 className="text-xl font-bold">核心特性</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {FEATURES.map((feature) => {
            const Icon = feature.icon
            return (
              <div key={feature.title} className="flex flex-col gap-2 rounded-lg border p-4">
                <div className="flex items-center gap-2">
                  <Icon className="size-4 text-primary" />
                  <span className="text-sm font-medium">{feature.title}</span>
                </div>
                <p className="text-xs text-muted-foreground">{feature.description}</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Other Pages */}
      <div className="mt-12 flex flex-col gap-3">
        <h2 className="text-xl font-bold">其他功能</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {OTHER_PAGES.map((page) => {
            const Icon = page.icon
            return (
              <div key={page.title} className="flex flex-col gap-2 rounded-lg border p-4">
                <div className="flex items-center gap-2">
                  <Icon className="size-4 text-primary" />
                  <span className="text-sm font-medium">{page.title}</span>
                </div>
                <p className="text-xs text-muted-foreground">{page.description}</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* CTA */}
      <div className="mt-12 flex flex-col items-center gap-4 rounded-lg border bg-muted/30 p-8 text-center">
        <FileText className="size-8 text-primary" />
        <div>
          <h2 className="text-lg font-semibold">准备好开始了吗？</h2>
          <p className="text-sm text-muted-foreground mt-1">
            输入一个主题，让 AI 帮你完成从研究到写作的全流程
          </p>
        </div>
        <Link
          href="/projects"
          className={cn(buttonVariants({ size: 'lg' }), 'px-6')}
        >
          开始创作
          <ArrowRight className="size-4" />
        </Link>
      </div>
    </div>
  )
}
