import Link from 'next/link'
import Image from 'next/image'
import { buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import OrbWrapper from '@/components/backgrounds/OrbWrapper'

const GITHUB_REPO = 'southportns/contentos'
const GITHUB_URL = `https://github.com/${GITHUB_REPO}`

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  )
}

async function getGitHubStars() {
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}`, {
      next: { revalidate: 3600 },
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.stargazers_count as number
  } catch {
    return null
  }
}

export default async function Home() {
  const stars = await getGitHubStars()

  return (
    <div className="flex min-h-svh flex-col bg-background">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b">
        <Image
          src="/logo.png"
          alt="Content OS"
          width={120}
          height={36}
          className="h-8 w-auto object-contain"
          priority
        />
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants({ variant: 'outline' }))}
        >
          <GitHubIcon className="size-4" />
          {stars !== null ? (
            <span className="tabular-nums">{stars >= 1000 ? `${(stars / 1000).toFixed(1)}k` : stars}</span>
          ) : (
            <span>Star</span>
          )}
        </a>
      </header>

      {/* Hero */}
      <section className="relative flex flex-1 flex-col items-center justify-center gap-6 overflow-hidden px-6 py-24 text-center">
        <div className="absolute inset-0 z-0">
          <OrbWrapper
            hue={352}
            hoverIntensity={0.2}
            rotateOnHover
            forceHoverState={false}
            backgroundColor="#000000"
          />
        </div>
        <div className="relative z-10 flex flex-col items-center gap-6">
          <Badge variant="outline" className="border-black/20 text-black">AI 账号研究与写作操作系统</Badge>
          <h1 className="max-w-3xl text-4xl font-bold tracking-tight leading-relaxed text-black sm:text-5xl md:text-6xl">
            内容生产力提效工具
            <br />
            文案创作助手
          </h1>
          <p className="max-w-2xl text-lg text-black/60">
            选题  账号研究  爆款拆解  观点提炼  写作  评估
          </p>
          <div className="flex gap-3">
            <Link
              href="/projects"
              className={cn(buttonVariants({ variant: 'default', size: 'lg' }), 'px-6')}
            >
              开始创作
            </Link>
            <Link
              href="/guide"
              className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'px-6')}
            >
              了解更多
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
