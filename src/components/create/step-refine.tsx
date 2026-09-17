'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import {
  Loader2, AlertCircle, PenLine, Sparkles, Wand2, Target,
  ChevronDown, ChevronRight, Check, Save, X, Edit3, RotateCcw,
  ArrowUp, ClipboardCheck, CircleCheck, CircleAlert, Circle,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { ProgressBar, useProgress } from '@/components/ui/progress-bar'
import { StepHeader } from './step-header'
import { MarkdownRenderer } from './markdown-renderer'
import { cn } from '@/lib/utils'
import type { WritingDraft, RefineResult, EvaluationResult, RefineIssue } from '@/hooks/use-workflow'

type RefineMode = 'tone_change' | 'hook_select' | 'title_select' | 'issue_fix'

/** Risk context passed to the Refine API alongside issue_fix */
interface RefineRiskContext {
  overallRiskLevel?: 'safe' | 'low' | 'medium' | 'high'
  risks: Array<{
    id?: string
    category: string
    description?: string
    suggestion?: string
    severity?: 'high' | 'medium' | 'low'
  }>
}

/** Approved strategy context for the Refine API */
interface RefineApprovedStrategyContext {
  title?: string
  keyArguments?: string[]
  emotionalArc?: { start?: string; middle?: string; end?: string }
  callToAction?: string
  tone?: string
  selectedAngleTitle?: string
}

/** Evaluation context for issue_fix mode */
interface IssueFixEvaluationContext {
  suggestions: Array<{
    id?: string
    section: string
    issue: string
    suggestion: string
    priority: 'high' | 'medium' | 'low'
  }>
  weaknesses: string[]
  scores?: {
    emotionalImpact?: number
    logicalClarity?: number
    novelty?: number
    readability?: number
    utility?: number
    platformFit?: number
  }
}

interface StepRefineProps {
  draft: WritingDraft
  refineData: RefineResult | null
  /** P0.3.9.2: Evaluation result for issue display */
  evaluation: EvaluationResult | null
  /** P0.3.9.2: Structured issues from evaluation */
  refineIssues: RefineIssue[]
  /** P0.3.9.2: Risk context for issue_fix */
  riskContext?: RefineRiskContext | null
  /** P0.3.9.2: Approved strategy context for issue_fix */
  approvedStrategy?: RefineApprovedStrategyContext
  onRefine: (input: {
    content: string
    title: string
    hook: string
    wordCount: number
    mode: RefineMode
    toneChange?: { newTone: string }
    hookSelect?: { candidates: string[]; selectedIndex: number }
    titleSelect?: { candidates: string[]; selectedIndex: number }
    platform?: string
    topic?: string
    selectedAngleTitle?: string
    evaluationContext?: IssueFixEvaluationContext
    riskContext?: RefineRiskContext
    approvedStrategy?: RefineApprovedStrategyContext
  }) => Promise<RefineResult | null>
  onApplyRefine: (data: RefineResult) => void
  /** P0.3.9.2: Toggle issue selection */
  onToggleIssue: (id: string) => void
  /** P0.3.9.2: Reset issue selections */
  onResetIssueSelections: () => void
  loading: boolean
  error: string | null
  platform?: string
  topic?: string
  selectedAngleTitle?: string
}

/**
 * 局部调整快捷提示词预设
 */
const LOCAL_EDIT_PRESETS = [
  '开头再吸引人一点',
  '结尾加点行动号召',
  '把第二段改得更口语化',
  '精简掉冗余表达',
  '加点情绪色彩',
  '节奏感更强一些',
  '把数据部分说得更通俗',
]

/**
 * 防御性处理：LLM 可能返回对象数组而非字符串数组