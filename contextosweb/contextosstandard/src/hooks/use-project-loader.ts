'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { workflowActions } from '@/hooks/use-workflow'
import type {
  TopicProfile,
  ContentAngle,
  ContentStrategy,
  WritingDraft,
  EvaluationResult,
  StrategyEvaluationResult,
} from '@/hooks/use-workflow'

interface ProjectData {
  projectId: string
  projectName: string
  topicProfile: TopicProfile | null
  selectedAngle: ContentAngle | null
  strategy: ContentStrategy | null
  draft: WritingDraft | null
  evaluation: EvaluationResult | null
  strategyEvaluation: StrategyEvaluationResult | null
  platform: string | null
}

interface UseProjectLoaderResult {
  loading: boolean
  error: string | null
  loaded: boolean
  projectName: string | null
}

/**
 * Loads a project from the database by projectId and populates the workflow store.
 * Uses a ref to prevent duplicate loads in StrictMode / re-renders.
 *
 * @param projectId - The project ID from URL query params
 * @param options.force - Force reload even if already loaded
 */
export function useProjectLoader(
  projectId: string | null,
  options?: { force?: boolean },
): UseProjectLoaderResult {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [projectName, setProjectName] = useState<string | null>(null)
  const loadedIdRef = useRef<string | null>(null)

  const loadProject = useCallback(async (id: string) => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      })

      const data = await res.json()

      if (!data.success) {
        throw new Error(data.error || '加载创作失败')
      }

      const projectData = data.data as ProjectData

      // Populate workflow store with loaded data
      if (projectData.topicProfile) {
        workflowActions.setTopicProfile(projectData.topicProfile)
      }
      if (projectData.selectedAngle) {
        workflowActions.setSelectedAngle(projectData.selectedAngle)
      }
      if (projectData.strategy) {
        workflowActions.setStrategy(projectData.strategy)
      }
      if (projectData.draft) {
        workflowActions.setDraft(projectData.draft)
      }
      if (projectData.evaluation) {
        workflowActions.setEvaluation(projectData.evaluation)
      }
      if (projectData.strategyEvaluation) {
        workflowActions.setStrategyEvaluation(projectData.strategyEvaluation)
      }

      // Set project ID so save knows to update existing project
      workflowActions.setProjectId(projectData.projectId)

      setProjectName(projectData.projectName)
      setLoaded(true)
      loadedIdRef.current = id
    } catch (err) {
      const msg = err instanceof Error ? err.message : '加载创作失败'
      setError(msg)
      console.error('[useProjectLoader] Failed to load project:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!projectId) return
    // Skip if already loaded this project (unless force)
    if (loadedIdRef.current === projectId && !options?.force) return

    // Reset workflow state before loading a different project to avoid
    // stale data from a previous project bleeding into the new one.
    if (loadedIdRef.current !== null && loadedIdRef.current !== projectId) {
      workflowActions.reset()
      setProjectName(null)
      setLoaded(false)
    }

    loadProject(projectId)
  }, [projectId, options?.force, loadProject])

  return { loading, error, loaded, projectName }
}
