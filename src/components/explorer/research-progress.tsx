'use client'

import { Check, Loader2, AlertCircle, Circle } from 'lucide-react'
import type { ResearchStep, ResearchStepStatus } from '@/hooks/use-douyin-search'

const STATUS_CONFIG: Record<
  ResearchStepStatus,
  { icon: typeof Check; className: string }
> = {
  pending: {
    icon: Circle,
    className: 'text-muted-foreground',
  },
  active: {
    icon: Loader2,
    className: 'text-primary animate-spin',
  },
  done: {
    icon: Check,
    className: 'text-green-600 dark:text-green-400',
  },
  error: {
    icon: AlertCircle,
    className: 'text-destructive',
  },
}

export function ResearchProgress({ steps }: { steps: ResearchStep[] }) {
  if (steps.length === 0) return null

  const allDone = steps.every((s) => s.status === 'done' || s.status === 'error')
  const activeCount = steps.filter((s) => s.status === 'active').length
  const doneCount = steps.filter((s) => s.status === 'done').length
  const progress = allDone ? 100 : Math.round((doneCount / steps.length) * 100)

  return (
    <div className="rounded-lg border bg-muted/30 p-4">
      {/* Progress bar */}
      <div className="mb-3 flex items-center gap-3">
        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-xs font-medium text-muted-foreground tabular-nums">
          {doneCount}/{steps.length}
        </span>
      </div>

      {/* Steps list */}
      <div className="flex flex-col gap-2.5">
        {steps.map((step, i) => {
          const config = STATUS_CONFIG[step.status]
          const Icon = config.icon
          const isLast = i === steps.length - 1

          return (
            <div key={step.id} className="flex items-start gap-3">
              {/* Icon + connector */}
              <div className="flex flex-col items-center">
                <div className="flex size-5 items-center justify-center shrink-0">
                  <Icon className={`size-4 ${config.className}`} />
                </div>
                {!isLast && (
                  <div
                    className={`w-px h-4 mt-0.5 ${
                      step.status === 'done'
                        ? 'bg-green-500/40'
                        : 'bg-border'
                    }`}
                  />
                )}
              </div>

              {/* Label + detail */}
              <div className="flex flex-col gap-0.5 min-w-0 pb-1 flex-1">
                <span
                  className={`text-sm ${
                    step.status === 'pending'
                      ? 'text-muted-foreground'
                      : step.status === 'active'
                        ? 'text-foreground font-medium'
                        : step.status === 'done'
                          ? 'text-foreground'
                          : 'text-destructive'
                  }`}
                >
                  {step.label}
                </span>
                {step.detail && (
                  <span
                    className={`text-xs ${
                      step.status === 'error'
                        ? 'text-destructive'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {step.detail}
                  </span>
                )}
                {/* Sub-progress bar for active steps */}
                {step.status === 'active' && step.progress !== undefined && step.progress > 0 && (
                  <div className="mt-1 flex items-center gap-2">
                    <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary/60 transition-all duration-1000 ease-out"
                        style={{ width: `${step.progress}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium text-muted-foreground tabular-nums">
                      {step.progress}%
                    </span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Status message */}
      {allDone && (
        <div className="mt-2 pt-2 border-t text-xs text-muted-foreground">
          {steps.some((s) => s.status === 'error')
            ? '部分步骤失败，结果可能不完整'
            : '所有步骤完成'}
          {activeCount > 0 && ` · ${activeCount} 个步骤进行中`}
        </div>
      )}
    </div>
  )
}
