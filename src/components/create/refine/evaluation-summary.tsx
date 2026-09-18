/**
 * P0.3.9.4-A — Evaluation Summary Panel (Read-only)
 *
 * Displays the EvaluationResult from Step 4 in Step 5 Refine page.
 * No API calls, no editing — purely presentational.
 */
import { useState } from 'react'
import { ChevronDown, ChevronRight, ClipboardCheck } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import type { EvaluationResult } from '@/hooks/use-workflow'

interface EvaluationSummaryProps {
  evaluation: EvaluationResult | null
}

const SCORE_LABELS: Array<{ key: keyof EvaluationResult['scores']; label: string }> = [
  { key: 'emotionalImpact', label: '情绪感染' },
  { key: 'logicalClarity', label: '逻辑清晰' },
  { key: 'novelty', label: '新颖性' },
  { key: 'readability', label: '可读性' },
  { key: 'utility', label: '实用性' },
  { key: 'platformFit', label: '平台适配' },
]

export function EvaluationSummary({ evaluation }: EvaluationSummaryProps) {
  const [expanded, setExpanded] = useState(true)

  if (!evaluation) return null

  return (
    <Card className="border-blue-200 bg-blue-50/30 dark:border-blue-800 dark:bg-blue-950/20">
      <CardContent className="p-3">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center gap-2 text-left"
        >
          {expanded
            ? <ChevronDown className="size-4 text-blue-600 dark:text-blue-400" />
            : <ChevronRight className="size-4 text-blue-600 dark:text-blue-400" />}
          <ClipboardCheck className="size-4 text-blue-600 dark:text-blue-400" />
          <span className="text-sm font-medium">AI 评估摘要</span>
          <span className="ml-auto text-sm font-bold text-blue-700 dark:text-blue-300">
            {evaluation.overallScore}
          </span>
        </button>

        {expanded && (
          <div className="mt-3 flex flex-col gap-3">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {SCORE_LABELS.map(({ key, label }) => (
                <div key={key} className="flex flex-col items-center rounded-lg border border-blue-200/50 bg-background p-2 dark:border-blue-800/50">
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <span className="text-sm font-semibold">{evaluation.scores[key] ?? '—'}</span>
                </div>
              ))}
            </div>
            {evaluation.weaknesses?.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">主要问题</span>
                <ul className="flex flex-col gap-0.5">
                  {evaluation.weaknesses.map((w, i) => (
                    <li key={i} className="text-xs text-muted-foreground">• {w}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
