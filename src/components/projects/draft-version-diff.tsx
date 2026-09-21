import { cn } from '@/lib/utils'
import type { DiffLine } from './draft-version-utils'

interface DraftVersionDiffProps {
  diffLines: DiffLine[]
}

export function DraftVersionDiff({ diffLines }: DraftVersionDiffProps) {
  if (diffLines.length === 0) {
    return (<div className="rounded-lg bg-muted/30 p-4 text-sm text-muted-foreground">两个版本内容完全相同</div>)
  }
  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="font-mono text-sm leading-relaxed">
        {diffLines.map((line, index) => (
          <div key={index} className={cn('px-3 py-0.5 border-l-2 whitespace-pre-wrap break-words', line.type === 'added' && 'bg-green-50 border-l-green-500 text-green-900 dark:bg-green-950/30 dark:border-l-green-600 dark:text-green-200', line.type === 'removed' && 'bg-red-50 border-l-red-500 text-red-900 dark:bg-red-950/30 dark:border-l-red-600 dark:text-red-200', line.type === 'unchanged' && 'border-l-transparent text-foreground')}>
            <span className="inline-block w-4 select-none text-muted-foreground/60">{line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}</span>
            {line.content}
          </div>
        ))}
      </div>
    </div>
  )
}
