'use client'

import { Suspense, useCallback, useMemo } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { RotateCcw, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ProgressSteps } from '@/components/create/progress-steps'
import type { ProgressStep } from '@/components/create/progress-steps'
import { useWorkflow, workflowActions } from '@/hooks/use-workflow'
import { useProjectLoader } from '@/hooks/use-project-loader'

const STEPS = [
  { id: 1, label: '主题输入', path: '/create/topic' },
  { id: 2, label: '主题研究', path: '/create/research' },
  { id: 3, label: '角度选择', path: '/create/angles' },
  { id: 4, label: '生成内容', path: '/create/generate' },
  { id: 5, label: '二次精修', path: '/create/refine' },
  { id: 6, label: '终稿输出', path: '/create/final' },
] as const

function CreateLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const projectId = searchParams.get('projectId')

  const ws = useWorkflow()
  const { loading: projectLoading, error: projectError, projectName } = useProjectLoader(projectId)

  const progressSteps: ProgressStep[] = useMemo(() => {
    const currentIndex = STEPS.findIndex((s) => pathname.startsWith(s.path))
    const activeStepId = currentIndex >= 0 ? STEPS[currentIndex].id : 1

    return STEPS.map((step) => {
      let status: ProgressStep['status'] = 'pending'

      // Step 1: Topic input — done once topicProfile exists
      if (step.id === 1) {
        status = activeStepId === 1 ? 'active' : 'done'
      }
      // Step 2: Research — done once topicProfile exists (same as step 1 completion)
      else if (step.id === 2) {
        if (activeStepId <= 2 && !ws.topicProfile) {
          status = activeStepId === 2 ? 'active' : 'pending'
        } else {
          status = activeStepId === 2 ? 'active' : 'done'
        }
      }
      // Step 3: Angles — done once selectedAngle exists
      else if (step.id === 3) {
        if (ws.selectedAngle) {
          status = activeStepId === 3 ? 'active' : 'done'
        } else if (activeStepId === 3) {
          status = 'active'
        }
      }
      // Step 4: Generate — done once draft exists
      else if (step.id === 4) {
        if (ws.draft) {
          status = activeStepId === 4 ? 'active' : 'done'
        } else if (activeStepId === 4) {
          status = 'active'
        }
      }
      // Step 5: Refine — done once refineData exists or user moved to step 6
      else if (step.id === 5) {
        if (ws.refineData || ws.finalOutput || activeStepId > 5) {
          status = activeStepId === 5 ? 'active' : 'done'
        } else if (activeStepId === 5) {
          status = 'active'
        }
      }
      // Step 6: Final output — done once finalOutput exists
      else if (step.id === 6) {
        if (ws.finalOutput) {
          status = activeStepId === 6 ? 'active' : 'done'
        } else if (activeStepId === 6) {
          status = 'active'
        }
      }

      return { id: step.id, label: step.label, status }
    })
  }, [pathname, ws.topicProfile, ws.selectedAngle, ws.draft, ws.refineData, ws.finalOutput])

  const handleStepClick = useCallback(
    (stepId: number) => {
      const step = STEPS.find((s) => s.id === stepId)
      if (!step) return

      // Navigation guards
      if (stepId === 1) {
        router.push(step.path)
      } else if (stepId === 2 && ws.topicProfile) {
        router.push(step.path)
      } else if (stepId === 3 && ws.angles.length > 0) {
        router.push(step.path)
      } else if (stepId === 4 && ws.selectedAngle) {
        router.push(step.path)
      } else if (stepId === 5 && ws.draft) {
        router.push(step.path)
      } else if (stepId === 6 && (ws.refineData || ws.draft)) {
        router.push(step.path)
      }
    },
    [router, ws.topicProfile, ws.angles.length, ws.selectedAngle, ws.draft, ws.refineData],
  )

  const handleReset = useCallback(() => {
    workflowActions.reset()
    // Navigate to projects page
    router.push('/projects')
  }, [router])

  const currentIndex = STEPS.findIndex((s) => pathname.startsWith(s.path))
  const showHeader = currentIndex >= 0

  // Show loading overlay while loading project data
  if (projectId && projectLoading) {
    return (
      <div className="mx-auto flex h-[calc(100svh-3.5rem)] max-w-3xl flex-col items-center justify-center gap-4 overflow-hidden p-6">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">正在加载创作数据...</p>
      </div>
    )
  }

  // Show error if project loading failed
  if (projectId && projectError) {
    return (
      <div className="mx-auto flex h-[calc(100svh-3.5rem)] max-w-3xl flex-col items-center justify-center gap-4 overflow-hidden p-6">
        <p className="text-sm text-destructive">{projectError}</p>
        <Button variant="outline" onClick={() => router.push('/projects')}>
          返回创作列表
        </Button>
      </div>
    )
  }

  if (!showHeader) {
    return <>{children}</>
  }

  return (
    <div className="mx-auto flex h-[calc(100svh-3.5rem)] max-w-3xl flex-col overflow-hidden p-6">
      {/* Fixed header: title + progress bar (no scroll) */}
      <div className="shrink-0 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">
              {projectName || ws.projectId ? (projectName || '编辑创作') : '创建内容'}
            </h1>
            <p className="text-sm text-muted-foreground">
              {projectName || ws.projectId ? '编辑模式' : '从主题到成品，一气呵成'}
            </p>
          </div>
          {currentIndex > 0 && (
            <Button variant="ghost" size="sm" onClick={handleReset}>
              <RotateCcw className="size-4" />
              重新开始
            </Button>
          )}
        </div>
      </div>

      {/* Progress bar (fixed, no scroll) */}
      <div className="shrink-0 border-b py-3">
        <ProgressSteps steps={progressSteps} onStepClick={handleStepClick} />
      </div>

      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto pt-4">
        {children}
      </div>
    </div>
  )
}

function CreateLayoutLoading() {
  return (
    <div className="mx-auto flex h-[calc(100svh-3.5rem)] max-w-3xl flex-col items-center justify-center gap-4 overflow-hidden p-6">
      <Loader2 className="size-8 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">正在加载...</p>
    </div>
  )
}

export default function CreateLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<CreateLayoutLoading />}>
      <CreateLayoutInner>{children}</CreateLayoutInner>
    </Suspense>
  )
}
