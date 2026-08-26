'use client'

import {
  Target, Check, Flame, Gauge, Heart, Loader2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { StepHeader } from './step-header'
import { cn } from '@/lib/utils'
import type { ContentAngle } from '@/hooks/use-workflow'

const difficultyLabels: Record<string, string> = { low: '低难度', medium: '中难度', high: '高难度' }
const difficultyColors: Record<string, string> = { low: 'bg-green-50 text-green-600', medium: 'bg-yellow-50 text-yellow-600', high: 'bg-red-50 text-red-600' }

interface StepAnglesProps {
  angles: ContentAngle[]
  selectedAngle: ContentAngle | null
  onSelect: (angle: ContentAngle | null) => void
}

export function StepAngles({ angles, selectedAngle, onSelect }: StepAnglesProps) {
  return (
    <Card>
      <StepHeader step={3} title="选择角度" active={!selectedAngle} done={!!selectedAngle} />
      <CardContent className="flex flex-col gap-3">
        <ScrollArea className="max-h-[400px]">
          <div className="flex flex-col gap-2">
            {angles.map((angle) => {
              const isSelected = selectedAngle?.id === angle.id
              return (
                <div
                  key={angle.id}
                  className={cn(
                    'flex flex-col gap-2 rounded-lg border p-3 transition-colors cursor-pointer',
                    isSelected ? 'border-primary bg-primary/5' : 'hover:border-muted-foreground/40',
                  )}
                  onClick={() => onSelect(isSelected ? null : angle)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {isSelected ? (
                        <div className="flex size-5 items-center justify-center rounded-full bg-primary">
                          <Check className="size-3 text-primary-foreground" />
                        </div>
                      ) : (
                        <div className="flex size-5 items-center justify-center rounded-full border" />
                      )}
                      <span className="font-medium text-sm">{angle.title}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5">
                        <Flame className="size-3 text-primary" />
                        <span className="text-sm font-bold text-primary">{angle.estimatedViralScore}</span>
                      </div>
                      <Badge variant="secondary" className={cn('text-xs', difficultyColors[angle.difficulty])}>
                        <Gauge className="size-3 mr-1" />{difficultyLabels[angle.difficulty]}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">{angle.angle}</p>
                  <div className="flex items-center gap-2">
                    <Heart className="size-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">目标情绪：{angle.targetEmotion}</span>
                  </div>
                  {isSelected && (
                    <>
                      <Separator />
                      <div className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">理由：</span> {angle.reasoning}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">受众吸引力：</span> {angle.audienceAppeal}
                      </div>
                      {angle.keyPoints.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {angle.keyPoints.map((p) => <Badge key={p} variant="outline" className="text-xs">{p}</Badge>)}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
