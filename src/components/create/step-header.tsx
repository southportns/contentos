'use client'

import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CardHeader } from '@/components/ui/card'

interface StepHeaderProps {
  step: number
  title: string
  active: boolean
  done: boolean
}

export function StepHeader({ step, title, active, done }: StepHeaderProps) {
  return (
    <CardHeader className="pb-3">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'flex size-7 items-center justify-center rounded-full text-xs font-bold transition-colors',
            done
              ? 'bg-primary text-primary-foreground'
              : active
                ? 'bg-primary/10 text-primary ring-2 ring-primary/20'
                : 'bg-muted text-muted-foreground',
          )}
        >
          {done ? <Check className="size-4" /> : step}
        </div>
        <h2 className={cn('text-base font-semibold', active ? 'text-foreground' : 'text-muted-foreground')}>
          {title}
        </h2>
        {done && (
          <ChevronDown className="size-4 text-muted-foreground ml-auto" />
        )}
      </div>
    </CardHeader>
  )
}
