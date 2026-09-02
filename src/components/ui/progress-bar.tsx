'use client'

import { useEffect, useReducer, useCallback, useRef } from 'react'
import { cn } from '@/lib/utils'

interface ProgressBarProps {
  /** 当前进度 0-100 */
  progress: number
  /** 当前阶段描述 */
  stage?: string
  /** 是否显示百分比数字 */
  showPercentage?: boolean
  /** 自定义样式类名 */
  className?: string
  /** 进度条颜色色调 */
  variant?: 'default' | 'primary' | 'success'
}

/**
 * 进度条组件 — 显示任务执行进度
 */
export function ProgressBar({
  progress,
  stage,
  showPercentage = true,
  className,
  variant = 'primary',
}: ProgressBarProps) {
  const clampedProgress = Math.min(100, Math.max(0, progress))

  const variantStyles = {
    default: 'bg-muted-foreground/30',
    primary: 'bg-primary/20',
    success: 'bg-green-500/20',
  }

  const fillStyles = {
    default: 'bg-muted-foreground',
    primary: 'bg-primary',
    success: 'bg-green-500',
  }

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className={cn('h-1.5 w-full overflow-hidden rounded-full', variantStyles[variant])}>
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500 ease-out',
            fillStyles[variant],
          )}
          style={{ width: `${clampedProgress}%` }}
        />
      </div>
      {(stage || showPercentage) && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          {stage && <span>{stage}</span>}
          {showPercentage && <span className="tabular-nums">{Math.round(clampedProgress)}%</span>}
        </div>
      )}
    </div>
  )
}

interface ProgressState {
  progress: number
  stage: string
}

type ProgressAction =
  | { type: 'reset' }
  | { type: 'complete' }
  | { type: 'update'; progress: number; stage: string }

function progressReducer(_state: ProgressState, action: ProgressAction): ProgressState {
  switch (action.type) {
    case 'reset':
      return { progress: 0, stage: '' }
    case 'complete':
      return { progress: 100, stage: '完成' }
    case 'update':
      return { progress: action.progress, stage: action.stage }
  }
}

/**
 * 进度状态管理 Hook
 *
 * 模拟 LLM 生成进度，基于预估时间分阶段推进。
 * 由于 LLM API 不返回真实进度，使用阶段式模拟：
 * - 0-10%: 准备中
 * - 10-30%: 分析内容
 * - 30-85%: AI 生成中（与时间成正比）
 * - 85-99%: 即将完成
 * - 100%: 完成
 */
export function useProgress(isActive: boolean, estimatedDurationMs: number = 120_000) {
  const [state, dispatch] = useReducer(progressReducer, { progress: 0, stage: '' })
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number>(0)

  const reset = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    startTimeRef.current = 0
    dispatch({ type: 'reset' })
  }, [])

  const complete = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    dispatch({ type: 'complete' })
  }, [])

  useEffect(() => {
    if (!isActive) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }

    // Reset and start progress tracking when activated
    startTimeRef.current = Date.now()
    dispatch({ type: 'reset' })

    const updateProgress = () => {
      const elapsed = Date.now() - startTimeRef.current
      const ratio = elapsed / estimatedDurationMs

      let newProgress: number
      let newStage: string

      if (ratio < 0.05) {
        newProgress = ratio / 0.05 * 10
        newStage = '准备中...'
      } else if (ratio < 0.15) {
        newProgress = 10 + (ratio - 0.05) / 0.1 * 20
        newStage = '分析内容...'
      } else if (ratio < 0.9) {
        newProgress = 30 + (ratio - 0.15) / 0.75 * 55
        newStage = 'AI 生成中...'
      } else if (ratio < 1.0) {
        newProgress = 85 + (ratio - 0.9) / 0.1 * 14
        newStage = '即将完成...'
      } else {
        newProgress = 95
        newStage = '处理中...'
      }

      dispatch({ type: 'update', progress: newProgress, stage: newStage })
    }

    updateProgress()

    intervalRef.current = setInterval(updateProgress, 500)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [isActive, estimatedDurationMs])

  return { progress: state.progress, stage: state.stage, reset, complete }
}
