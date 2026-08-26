'use client'

import {
  Trophy, Flame, Heart, MessageCircle, Sparkles, Target,
  Loader2, AlertCircle, Check,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { StepHeader } from './step-header'
import type { ViralResult } from '@/hooks/use-workflow'

function ScoreBadge({ icon: Icon, label, score }: { icon: React.ElementType; label: string; score: number }) {
  const color = score >= 80 ? 'text-green-600 bg-green-50' : score >= 60 ? 'text-yellow-600 bg-yellow-50' : 'text-red-600 bg-red-50'
  return (
    <div className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 ${color}`}>
      <Icon className="size-3" />
      <span className="text-xs font-medium">{label}</span>
      <span className="text-xs font-bold">{score}</span>
    </div>
  )
}

interface StepViralProps {
  viralResult: ViralResult
  onGenerateAngles: () => void
  generatingAngles: boolean
  error: string | null
}

export function StepViral({ viralResult, onGenerateAngles, generatingAngles, error }: StepViralProps) {
  return (
    <Card>
      <StepHeader step={2} title="爆款分析" active={false} done />
      <CardContent className="flex flex-col gap-4">
        {/* Summary */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Trophy className="size-5 text-yellow-600" />
            <div>
              <div className="text-2xl font-bold">{viralResult.patterns.avgViralScore}</div>
              <div className="text-xs text-muted-foreground">平均爆款分</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {viralResult.patterns.topContents.map((c) => (
              <Badge key={c.url} variant="secondary" className="text-xs">
                <Flame className="size-3 mr-1" />{c.viralScore}
              </Badge>
            ))}
          </div>
        </div>

        {viralResult.patterns.viralFactors.length > 0 && (
          <div>
            <div className="text-xs font-medium mb-1.5">🔥 爆款关键因素</div>
            <div className="flex flex-wrap gap-1.5">
              {viralResult.patterns.viralFactors.map((f) => <Badge key={f} variant="default" className="text-xs">{f}</Badge>)}
            </div>
          </div>
        )}

        {viralResult.patterns.commonStrengths.length > 0 && (
          <div>
            <div className="text-xs font-medium mb-1.5">✅ 共同优点</div>
            <div className="flex flex-wrap gap-1.5">
              {viralResult.patterns.commonStrengths.map((s) => <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>)}
            </div>
          </div>
        )}

        {/* Individual analyses (collapsible summary) */}
        <Separator />
        <ScrollArea className="max-h-[300px]">
          <div className="flex flex-col gap-2">
            {viralResult.analyses.map((a) => (
              <div key={a.url} className="flex flex-col gap-1.5 rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{a.platform}</Badge>
                    <span className="text-sm font-medium truncate">{a.summary}</span>
                  </div>
                  <div className="flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5">
                    <Flame className="size-3 text-primary" />
                    <span className="text-sm font-bold text-primary">{a.viralScore}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  <ScoreBadge icon={Heart} label="情感" score={a.emotionScore} />
                  <ScoreBadge icon={MessageCircle} label="争议" score={a.controversyScore} />
                  <ScoreBadge icon={Sparkles} label="新颖" score={a.noveltyScore} />
                  <ScoreBadge icon={Target} label="实用" score={a.utilityScore} />
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* Next: generate angles */}
        <Separator />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Check className="size-4" />
            基于分析结果生成内容角度
          </div>
          <Button onClick={onGenerateAngles} disabled={generatingAngles} size="sm">
            {generatingAngles ? (
              <><Loader2 className="size-4 animate-spin" />生成中...</>
            ) : (
              <><Sparkles className="size-4" />生成角度</>
            )}
          </Button>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="size-4" />{error}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
