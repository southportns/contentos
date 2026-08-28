'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { workflowActions } from '@/hooks/use-workflow'

interface CreateProjectButtonProps {
  /** Optional callback invoked after a project is created successfully. */
  onCreated?: (project: { id: string }) => void
  /** Optional label override */
  label?: string
}

/**
 * One-click project creation button.
 * Creates a project in the database (recording start time) and
 * navigates directly to the content creation workflow.
 */
export function CreateProjectButton({
  onCreated,
  label = '新建创作',
}: CreateProjectButtonProps = {}) {
  const router = useRouter()
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleClick = useCallback(async () => {
    setError(null)
    setCreating(true)

    try {
      const res = await fetch('/api/projects/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      const data = await res.json()

      if (!data.success) {
        throw new Error(data.error || '创建失败')
      }

      const projectId = data.data.projectId as string

      // Reset workflow state so the new project starts fresh
      workflowActions.reset()

      if (onCreated) {
        onCreated({ id: projectId })
      } else {
        // Navigate directly to the content creation flow
        router.push(`/create/topic?projectId=${projectId}`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '创建失败'
      setError(msg)
    } finally {
      setCreating(false)
    }
  }, [onCreated, router])

  return (
    <>
      <Button onClick={handleClick} size="sm" disabled={creating}>
        {creating ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            创建中...
          </>
        ) : (
          <>
            <Plus className="size-4" />
            {label}
          </>
        )}
      </Button>
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
    </>
  )
}
