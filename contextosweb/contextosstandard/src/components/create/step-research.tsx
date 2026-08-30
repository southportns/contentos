'use client'

import { useState, useCallback } from 'react'
import {
  FileText, Tag, HelpCircle, Lightbulb,
  Loader2, ArrowRight, AlertCircle,
  Edit3, Save, X, Plus, LightbulbIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { StepHeader } from './step-header'
import { cn } from '@/lib/utils'
import type { TopicProfile } from '@/hooks/use-workflow'

interface StepResearchProps {
  topicProfile: TopicProfile
  onContinue?: () => void | Promise<void>
  onUpdateTopicProfile?: (patch: Partial<TopicProfile>) => void
  generatingAngles?: boolean
  error: string | null
}

export function StepResearch({
  topicProfile,
  onContinue,
  onUpdateTopicProfile,
  generatingAngles = false,
  error,
}: StepResearchProps) {
  const [editing, setEditing] = useState(false)
  const [editCategory, setEditCategory] = useState(topicProfile.category)
  const [editKeywords, setEditKeywords] = useState<string[]>(topicProfile.keywords)
  const [editCoreQuestions, setEditCoreQuestions] = useState<string[]>(topicProfile.coreQuestions)
  const [editPotentialAngles, setEditPotentialAngles] = useState<string[]>(topicProfile.potentialAngles)
  const [newKeyword, setNewKeyword] = useState('')
  const [newQuestion, setNewQuestion] = useState('')
  const [newAngle, setNewAngle] = useState('')

  const handleStartEdit = useCallback(() => {
    setEditCategory(topicProfile.category)
    setEditKeywords([...topicProfile.keywords])
    setEditCoreQuestions([...topicProfile.coreQuestions])
    setEditPotentialAngles([...topicProfile.potentialAngles])
    setNewKeyword('')
    setNewQuestion('')
    setNewAngle('')
    setEditing(true)
  }, [topicProfile])

  const handleSaveEdit = useCallback(() => {
    onUpdateTopicProfile?.({
      category: editCategory,
      keywords: editKeywords,
      coreQuestions: editCoreQuestions,
      potentialAngles: editPotentialAngles,
    })
    setEditing(false)
  }, [editCategory, editKeywords, editCoreQuestions, editPotentialAngles, onUpdateTopicProfile])

  const handleCancelEdit = useCallback(() => {
    setEditing(false)
  }, [])

  // Keyword handlers
  const handleAddKeyword = useCallback(() => {
    const trimmed = newKeyword.trim()
    if (trimmed && !editKeywords.includes(trimmed)) {
      setEditKeywords((prev) => [...prev, trimmed])
      setNewKeyword('')
    }
  }, [newKeyword, editKeywords])

  const handleRemoveKeyword = useCallback((kw: string) => {
    setEditKeywords((prev) => prev.filter((k) => k !== kw))
  }, [])

  // Question handlers
  const handleAddQuestion = useCallback(() => {
    const trimmed = newQuestion.trim()
    if (trimmed && !editCoreQuestions.includes(trimmed)) {
      setEditCoreQuestions((prev) => [...prev, trimmed])
      setNewQuestion('')
    }
  }, [newQuestion, editCoreQuestions])

  const handleRemoveQuestion = useCallback((q: string) => {
    setEditCoreQuestions((prev) => prev.filter((item) => item !== q))
  }, [])

  // Angle handlers
  const handleAddAngle = useCallback(() => {
    const trimmed = newAngle.trim()
    if (trimmed && !editPotentialAngles.includes(trimmed)) {
      setEditPotentialAngles((prev) => [...prev, trimmed])
      setNewAngle('')
    }
  }, [newAngle, editPotentialAngles])

  const handleRemoveAngle = useCallback((a: string) => {
    setEditPotentialAngles((prev) => prev.filter((item) => item !== a))
  }, [])

  return (
    <Card>
      <StepHeader step={1} title="主题研究" active={false} done />
      <CardContent className="flex flex-col gap-4">
        {/* Profile summary */}
        <div className="flex flex-col gap-3">
          {/* Category */}
          <div className="flex items-center gap-2 text-sm">
            <FileText className="size-4 text-muted-foreground" />
            {editing ? (
              <Input
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value)}
                className="h-7 max-w-xs text-sm"
              />
            ) : (
              <span className="font-medium">{topicProfile.category}</span>
            )}
          </div>

          {/* Keywords */}
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Tag className="size-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">关键词</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(editing ? editKeywords : topicProfile.keywords).map((kw) => (
                <Badge
                  key={kw}
                  variant="secondary"
                  className={cn('text-xs', editing && 'pr-1.5')}
                >
                  {kw}
                  {editing && (
                    <button
                      onClick={() => handleRemoveKeyword(kw)}
                      className="ml-1 inline-flex shrink-0 rounded-full hover:bg-muted-foreground/20"
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </Badge>
              ))}
              {editing && (
                <div className="flex items-center gap-1">
                  <Input
                    value={newKeyword}
                    onChange={(e) => setNewKeyword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleAddKeyword()
                      }
                    }}
                    placeholder="添加关键词..."
                    className="h-6 w-28 text-xs"
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleAddKeyword}
                    disabled={!newKeyword.trim()}
                    className="h-6 px-1.5"
                  >
                    <Plus className="size-3" />
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Core Questions */}
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <HelpCircle className="size-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">核心问题</span>
            </div>
            <ul className="flex flex-col gap-0.5 text-sm text-muted-foreground">
              {(editing ? editCoreQuestions : topicProfile.coreQuestions).map((q) => (
                <li key={q} className="flex items-start gap-1">
                  <span className="mt-0.5">•</span>
                  <span className="flex-1">{q}</span>
                  {editing && (
                    <button
                      onClick={() => handleRemoveQuestion(q)}
                      className="inline-flex shrink-0 rounded-full p-0.5 hover:bg-muted-foreground/20"
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {editing && (
              <div className="mt-1.5 flex items-center gap-1">
                <Input
                  value={newQuestion}
                  onChange={(e) => setNewQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleAddQuestion()
                    }
                  }}
                  placeholder="添加核心问题..."
                  className="h-7 text-sm"
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleAddQuestion}
                  disabled={!newQuestion.trim()}
                  className="h-7 shrink-0 px-2"
                >
                  <Plus className="size-3.5" />
                </Button>
              </div>
            )}
          </div>

          {/* Potential Angles */}
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Lightbulb className="size-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">潜在角度</span>
            </div>
            <ul className="flex flex-col gap-0.5 text-sm text-muted-foreground">
              {(editing ? editPotentialAngles : topicProfile.potentialAngles).map((a) => (
                <li key={a} className="flex items-start gap-1">
                  <span className="mt-0.5">•</span>
                  <span className="flex-1">{a}</span>
                  {editing && (
                    <button
                      onClick={() => handleRemoveAngle(a)}
                      className="inline-flex shrink-0 rounded-full p-0.5 hover:bg-muted-foreground/20"
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {editing && (
              <div className="mt-1.5 flex items-center gap-1">
                <Input
                  value={newAngle}
                  onChange={(e) => setNewAngle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleAddAngle()
                    }
                  }}
                  placeholder="添加潜在角度..."
                  className="h-7 text-sm"
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleAddAngle}
                  disabled={!newAngle.trim()}
                  className="h-7 shrink-0 px-2"
                >
                  <Plus className="size-3.5" />
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Edit / Save controls */}
        <Separator />
        <div className="flex items-center justify-end gap-2">
          {editing ? (
            <>
              <Button size="sm" variant="ghost" onClick={handleCancelEdit}>
                <X className="size-3.5" />
                取消
              </Button>
              <Button size="sm" onClick={handleSaveEdit}>
                <Save className="size-3.5" />
                保存修改
              </Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" onClick={handleStartEdit}>
              <Edit3 className="size-3.5" />
              编辑研究结果
            </Button>
          )}
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="size-4" />{error}
          </div>
        )}

        {/* Next step button */}
        <Separator />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <LightbulbIcon className="size-4" />
            确认研究结果，进入角度生成
          </div>
          <Button
            onClick={onContinue}
            disabled={generatingAngles || editing}
            size="sm"
          >
            {generatingAngles ? (
              <><Loader2 className="size-4 animate-spin" />生成角度中...</>
            ) : (
              <>下一步<ArrowRight className="size-4" /></>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
