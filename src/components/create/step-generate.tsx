'use client'

import { useState } from 'react'
import {
  Rocket, Loader2, CheckCircle2, AlertCircle, FileText,
  ClipboardCheck, ChevronDown, ChevronRight, Sparkles,
  PenLine, ShieldAlert,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { ProgressBar } from '@/components/ui/progress-bar'
import { StepHeader } from './step-header'
import { cn } from '@/lib/utils'
import type {
  ContentAngle, ContentStrategy, WritingDraft, EvaluationResult, StrategyEvaluationResult, RiskAnalysisResult,
} from '@/hooks/use-workflow'

const scoreLabels: Record<string, string> = {
  emotionalImpact: '情感冲击', logicalClarity: '逻辑清晰', novelty: '新颖度',
  readability: '可读性', utility: '实用性', platformFit: '平台适配',
}
const priorityColors: Record<string, string> = {
  high: 'bg-red-50 text-red-600', medium: 'bg-yellow-50 text-yellow-600', low: 'bg-green-50 text-green-600',
}
const priorityLabels: Record<string, string> = { high: '高优先', medium: '中优先', low: '低优先' }

const riskCategoryLabels: Record<string, string> = {
  political_sensitive: '政治敏感',
  social_sensitive: '社会敏感',
  personal_privacy: '隐私侵权',
  misinformation: '虚假信息',
  hate_speech: '仇恨言论',
  commercial_compliance: '商业合规',
  platform_violation: '平台违规',
  legal_risk: '法律风险',
}
const riskSeverityColors: Record<string, string> = {
  high: 'bg-red-50 text-red-600',
  medium: 'bg-yellow-50 text-yellow-600',
  low: 'bg-blue-50 text-blue-600',
}
const riskSeverityLabels: Record<string, string> = {
  high: '高风险',
  medium: '中风险',
  low: '低风险',
}
const riskLevelConfig: Record<string, { label: string; color: string; icon: string }> = {
  safe: { label: '安全', color: 'text-green-600', icon: '✅' },
  low: { label: '低风险', color: 'text-blue-600', icon: 'ℹ️' },
  medium: { label: '中风险', color: 'text-yellow-600', icon: '⚠️' },
  high: { label: '高风险', color: 'text-red-600', icon: '🚫' },
}

function ScoreBar({ label, score }: { label: string; score: number }) {
  const color = score >= 80 ? 'bg-green-500' : score >= 60 ? 'bg-yellow-500' : 'bg-red-500'
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-bold">{score}</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${score}%` }} />
      </div>
    </div>
  )
}

interface StepGenerateProps {
  selectedAngle: ContentAngle
  strategy: ContentStrategy | null
  draft: WritingDraft | null
  evaluation: EvaluationResult | null
  strategyEvaluation?: StrategyEvaluationResult | null
  riskAnalysis?: RiskAnalysisResult | null
  onGenerate: () => void
  generating: boolean
  loadingLabel: string
  /** Progress 0-100, used to show progress bar during generation */
  progressPercent?: number
  duration: number
  setDuration: (v: number) => void
  wordCount: number
  error: string | null
  onUpdateDraft?: (patch: Partial<WritingDraft>) => void
}

export function StepGenerate({
  selectedAngle, strategy, draft, evaluation, strategyEvaluation, riskAnalysis,
  onGenerate, generating, loadingLabel, progressPercent,
  duration, setDuration, wordCount, error, onUpdateDraft,
}: StepGenerateProps) {
  const [expandedSuggestion, setExpandedSuggestion] = useState<string | null>(null)
  const [expandedRisk, setExpandedRisk] = useState<string | null>(null)
  const done = !!evaluation

  return (
    <Card>
      <StepHeader step={4} title="生成内容 + 评估" active={!done} done={done} />
      <CardContent className="flex flex-col gap-3">
        {/* Selected angle summary */}
        <div className="rounded-lg border bg-muted/30 p-3">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <span className="text-sm font-medium">{selectedAngle.title}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">{selectedAngle.angle}</p>
        </div>

        {/* Options */}
        {!draft && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="gen-duration" className="text-xs">目标时长（秒）</Label>
            <Input id="gen-duration" type="number" min={15} max={600} value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="w-28" />
          </div>
        )}
        {!draft && duration > 0 && (
          <div className="text-xs text-muted-foreground">
            预计约 {wordCount} 字（按 5.4 字/秒，含 20% 气口冗余）
          </div>
        )}

        {/* Action button */}
        {!draft && (
          <div className="flex justify-end">
            <Button onClick={onGenerate} disabled={generating}>
              {generating ? (
                <><Loader2 className="size-4 animate-spin" />{loadingLabel}</>
              ) : (
                <><Rocket className="size-4" />一键生成 + 评估</>
              )}
            </Button>
          </div>
        )}

        {/* Progress bar */}
        {generating && progressPercent != null && (
          <div className="flex flex-col gap-1.5 rounded-lg border border-primary/20 bg-primary/5 p-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Rocket className="size-3.5 text-primary" />
                {loadingLabel}
              </span>
              <span className="tabular-nums">{Math.round(progressPercent)}%</span>
            </div>
            <ProgressBar
              progress={progressPercent}
              variant="primary"
            />
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="size-4" />{error}
          </div>
        )}

        {/* Strategy preview */}
        {strategy && (
          <>
            <Separator />
            <div className="flex items-center gap-2">
              <FileText className="size-4 text-primary" />
              <span className="text-sm font-medium">内容策略</span>
            </div>
            <div className="rounded-lg border p-3 text-sm flex flex-col gap-2">
              <div className="font-medium">{strategy.title}</div>
              <div className="text-muted-foreground"><span className="font-medium text-foreground">钩子：</span> {strategy.hook}</div>
              <div className="flex flex-wrap gap-1.5">
                {strategy.structure.map((s, i) => (
                  <Badge key={i} variant="outline" className="text-xs">{s.section} ({s.estimatedWords}字)</Badge>
                ))}
              </div>
              <div className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">情感弧线：</span>
                {strategy.emotionalArc.start} → {strategy.emotionalArc.middle} → {strategy.emotionalArc.end}
              </div>
            </div>
          </>
        )}

        {/* Draft */}
        {draft && (
          <>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <PenLine className="size-4 text-primary" />
                <span className="text-sm font-medium">内容初稿</span>
              </div>
              <Badge variant="secondary" className="text-xs">{draft.wordCount} 字</Badge>
            </div>
            <div className="rounded-lg border p-4">
              <div className="text-sm font-medium mb-2">{draft.title}</div>
              <pre className="whitespace-pre-wrap font-sans text-sm">{draft.content}</pre>
            </div>
          </>
        )}

        {/* Evaluation */}
        {evaluation && (
          <>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="size-4 text-primary" />
                <span className="text-sm font-medium">评估结果</span>
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-1">
                <span className="text-xs text-muted-foreground">综合分</span>
                <span className="text-lg font-bold text-primary">{evaluation.overallScore}</span>
              </div>
            </div>

            {/* Score bars */}
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(evaluation.scores).map(([key, score]) => (
                <ScoreBar key={key} label={scoreLabels[key] || key} score={score} />
              ))}
            </div>

            {/* Emotional arc */}
            <div className="flex items-center gap-2">
              {evaluation.emotionalArcAnalysis.achieved ? (
                <CheckCircle2 className="size-4 text-green-600" />
              ) : (
                <AlertCircle className="size-4 text-yellow-600" />
              )}
              <span className="text-sm">
                情感弧线{evaluation.emotionalArcAnalysis.achieved ? '已达成' : '未完全达成'} — {evaluation.emotionalArcAnalysis.analysis}
              </span>
            </div>

            {/* Strengths & weaknesses */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs font-medium mb-1">✅ 优点</div>
                <ul className="flex flex-col gap-0.5 text-sm text-muted-foreground">
                  {evaluation.strengths.map((s) => <li key={s}>• {s}</li>)}
                </ul>
              </div>
              <div>
                <div className="text-xs font-medium mb-1">⚠️ 不足</div>
                <ul className="flex flex-col gap-0.5 text-sm text-muted-foreground">
                  {evaluation.weaknesses.map((w) => <li key={w}>• {w}</li>)}
                </ul>
              </div>
            </div>

            {/* Conclusion */}
            <div className="rounded-lg bg-muted/50 p-3 text-sm">
              <span className="font-medium">总结：</span> {evaluation.conclusion}
            </div>

            {/* Suggestions */}
            {evaluation.suggestions.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <div className="text-xs font-medium">改进建议</div>
                {evaluation.suggestions.map((sug, i) => (
                  <div key={`${sug.section}-${i}`} className="flex flex-col gap-1">
                    <button
                      className="flex items-center gap-2 text-left"
                      onClick={() => setExpandedSuggestion(expandedSuggestion === `${sug.section}-${i}` ? null : `${sug.section}-${i}`)}
                    >
                      {expandedSuggestion === `${sug.section}-${i}` ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                      <Badge variant="secondary" className={cn('text-xs', priorityColors[sug.priority])}>{priorityLabels[sug.priority]}</Badge>
                      <span className="text-sm">{sug.section}</span>
                    </button>
                    {expandedSuggestion === `${sug.section}-${i}` && (
                      <div className="ml-6 flex flex-col gap-0.5 text-xs text-muted-foreground">
                        <div><span className="font-medium text-foreground">问题：</span> {sug.issue}</div>
                        <div><span className="font-medium text-foreground">建议：</span> {sug.suggestion}</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Risk Analysis */}
        {riskAnalysis && (
          <>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldAlert className="size-4 text-primary" />
                <span className="text-sm font-medium">风险分析</span>
              </div>
              <div className={cn(
                'flex items-center gap-1 rounded-lg px-3 py-1',
                riskAnalysis.overallRiskLevel === 'safe' ? 'bg-green-50' :
                riskAnalysis.overallRiskLevel === 'low' ? 'bg-blue-50' :
                riskAnalysis.overallRiskLevel === 'medium' ? 'bg-yellow-50' : 'bg-red-50',
              )}>
                <span className="text-xs">
                  {riskLevelConfig[riskAnalysis.overallRiskLevel]?.icon}
                </span>
                <span className={cn('text-sm font-bold', riskLevelConfig[riskAnalysis.overallRiskLevel]?.color)}>
                  {riskLevelConfig[riskAnalysis.overallRiskLevel]?.label}
                </span>
              </div>
            </div>

            {/* Summary */}
            <div className="rounded-lg bg-muted/50 p-3 text-sm">
              <span className="font-medium">总结：</span> {riskAnalysis.summary}
            </div>

            {/* Risk items */}
            {riskAnalysis.risks.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-green-600">
                <CheckCircle2 className="size-4" />
                未发现明显风险，可以放心发布
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {riskAnalysis.risks.map((risk, i) => (
                  <div key={`risk-${i}`} className="flex flex-col gap-1">
                    <button
                      className="flex items-center gap-2 text-left"
                      onClick={() => setExpandedRisk(expandedRisk === `risk-${i}` ? null : `risk-${i}`)}
                    >
                      {expandedRisk === `risk-${i}` ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                      <Badge variant="secondary" className={cn('text-xs', riskSeverityColors[risk.severity])}>
                        {riskSeverityLabels[risk.severity]}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {riskCategoryLabels[risk.category] || risk.category}
                      </Badge>
                      <span className="text-sm line-clamp-1">{risk.description}</span>
                    </button>
                    {expandedRisk === `risk-${i}` && (
                      <div className="ml-6 flex flex-col gap-1 text-xs text-muted-foreground">
                        {risk.quote && (
                          <div className="rounded border-l-2 border-muted-foreground/30 bg-muted/30 p-2">
                            <span className="font-medium text-foreground">原文：</span> {risk.quote}
                          </div>
                        )}
                        <div><span className="font-medium text-foreground">说明：</span> {risk.description}</div>
                        <div><span className="font-medium text-foreground">建议：</span> {risk.suggestion}</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
