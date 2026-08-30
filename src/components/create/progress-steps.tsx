'use client'

import { Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ProgressStep {
  id: number
  label: string
  status: 'pending' | 'active' | 'loading' | 'done' | 'skipped'
}

interface ProgressStepsProps {
  steps: ProgressStep[]
  onStepClick?: (stepId: number) => void
}

// Arrow shape: left side is rounded (except first), right side has a V notch
// First step: left rounded, right pointed
// Middle steps: left notch (to fit prev's point), right pointed
// Last step: left notch, right rounded
const arrowClipFirst = 'polygon(0 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 0 100%)'
const arrowClipMiddle = 'polygon(0 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 0 100%, 10px 50%)'
const arrowClipLast = 'polygon(0 0, 100% 0, 100% 100%, 0 100%, 10px 50%)'

export function ProgressSteps({ steps, onStepClick }: ProgressStepsProps) {
  return (
    <div className="flex h-[30px] items-center">
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1
        const isFirst = i === 0
        const clickable = step.status !== 'pending' && step.status !== 'loading' && onStepClick

        const clipPath = isLast
          ? arrowClipLast
          : isFirst
            ? arrowClipFirst
            : arrowClipMiddle

        return (
          <button
            key={step.id}
            disabled={!clickable}
            onClick={() => clickable && onStepClick?.(step.id)}
            style={{ clipPath }}
            className={cn(
              'flex h-[30px] flex-1 items-center justify-center gap-1 text-xs font-medium transition-all',
              // Padding: left has extra to account for notch, right has extra for point
              isLast
                ? 'pl-4 pr-3'
                : 'pl-4 pr-4',
              step.status === 'done' && 'bg-primary text-primary-foreground',
              step.status === 'active' && 'bg-primary/10 text-primary ring-2 ring-primary/20',
              step.status === 'loading' && 'bg-primary/10 text-primary ring-2 ring-primary/20',
              step.status === 'skipped' && 'bg-muted text-muted-foreground line-through',
              step.status === 'pending' && 'bg-muted/50 text-muted-foreground',
              clickable && 'cursor-pointer hover:brightness-110',
              !clickable && 'cursor-default',
            )}
          >
            <span className="flex size-4 items-center justify-center">
              {step.status === 'done' ? (
                <Check className="size-3.5" />
              ) : step.status === 'loading' ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : step.status === 'active' ? (
                <span className="text-[10px] font-bold leading-none">{step.id}</span>
              ) : null}
            </span>
            <span className="truncate">{step.label}</span>
          </button>
        )
      })}
    </div>
  )
}
