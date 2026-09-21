import { ArrowLeftRight } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { Draft } from '@/generated/prisma'
import { getVersionLabel } from './draft-version-utils'

interface DraftVersionCompareSelectorProps {
  drafts: Draft[]
  versionA: number
  versionB: number
  onVersionAChange: (version: number) => void
  onVersionBChange: (version: number) => void
  onSwap: () => void
}

export function DraftVersionCompareSelector({
  drafts,
  versionA,
  versionB,
  onVersionAChange,
  onVersionBChange,
  onSwap,
}: DraftVersionCompareSelectorProps) {
  return (
    <Card className="p-3">
      <div className="flex items-center gap-3">
        {/* Version A Selector */}
        <div className="flex-1">
          <label className="text-xs text-muted-foreground mb-1 block">版本 A</label>
          <select
            value={versionA}
            onChange={(e) => onVersionAChange(Number(e.target.value))}
            className={cn(
              'w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            )}
          >
            {drafts.map((d) => (
              <option key={d.id} value={d.version}>
                v{d.version} ({getVersionLabel(d.version, d.status)})
              </option>
            ))}
          </select>
        </div>

        {/* Swap Button */}
        <button
          onClick={onSwap}
          className={cn(
            'mt-4 shrink-0 rounded-md p-2 transition-colors',
            'bg-secondary text-secondary-foreground hover:bg-secondary/80'
          )}
          title="交换 A/B"
        >
          <ArrowLeftRight className="size-4" />
        </button>

        {/* Version B Selector */}
        <div className="flex-1">
          <label className="text-xs text-muted-foreground mb-1 block">版本 B</label>
          <select
            value={versionB}
            onChange={(e) => onVersionBChange(Number(e.target.value))}
            className={cn(
              'w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            )}
          >
            {drafts.map((d) => (
              <option key={d.id} value={d.version}>
                v{d.version} ({getVersionLabel(d.version, d.status)})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Same version warning */}
      {versionA === versionB && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
          <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-600">
            提示
          </Badge>
          请选择两个不同的版本进行对比
        </div>
      )}
    </Card>
  )
}
