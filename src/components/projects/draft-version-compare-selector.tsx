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

export function DraftVersionCompareSelector({ drafts, versionA, versionB, onVersionAChange, onVersionBChange, onSwap }: DraftVersionCompareSelectorProps) {
  const isSameVersion = versionA === versionB
  return (
    <Card className="p-4">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="flex-1">
          <label className="text-xs text-muted-foreground mb-1 block">版本 A <span className="text-foreground font-medium">（当前版本）</span></label>
          <select value={versionA} onChange={(e) => onVersionAChange(Number(e.target.value))} className={cn('w-full rounded-md border border-input bg-background px-3 py-2 text-sm', 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', isSameVersion && 'border-destructive')}>
            {drafts.map((draft) => (<option key={draft.id} value={draft.version}>v{draft.version} — {getVersionLabel(draft.version, draft.status)}{draft.version === drafts[0]?.version ? ' (最新)' : ''}</option>))}
          </select>
        </div>
        <div className="flex items-end sm:items-center">
          <button onClick={onSwap} className={cn('rounded-md border border-input bg-background p-2 hover:bg-accent transition-colors', 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring')} title="交换版本" aria-label="交换对比版本"><ArrowLeftRight className="size-4" /></button>
        </div>
        <div className="flex-1">
          <label className="text-xs text-muted-foreground mb-1 block">版本 B <span className="text-foreground font-medium">（对比版本）</span></label>
          <select value={versionB} onChange={(e) => onVersionBChange(Number(e.target.value))} className={cn('w-full rounded-md border border-input bg-background px-3 py-2 text-sm', 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', isSameVersion && 'border-destructive')}>
            {drafts.map((draft) => (<option key={draft.id} value={draft.version}>v{draft.version} — {getVersionLabel(draft.version, draft.status)}{draft.version === drafts[0]?.version ? ' (最新)' : ''}</option>))}
          </select>
        </div>
      </div>
      {isSameVersion && <p className="mt-2 text-xs text-destructive">请选择两个不同的版本进行对比</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <Badge variant="outline" className="text-xs">A: v{versionA}</Badge>
        <Badge variant="outline" className="text-xs">B: v{versionB}</Badge>
        {versionA === drafts[0]?.version && <Badge variant="default" className="text-xs">A 为最新版本</Badge>}
      </div>
    </Card>
  )
}
