'use client'

import { useState, useCallback } from 'react'
import {
  FileText, Download, Copy, Check, CheckCircle2,
  Eye, Edit3,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { StepHeader } from './step-header'
import { MarkdownRenderer } from './markdown-renderer'
import type { WritingDraft, RefineResult, FinalOutput } from '@/hooks/use-workflow'

interface StepFinalProps {
  draft: WritingDraft
  refineData: RefineResult | null
  finalOutput: FinalOutput | null
  onSetFinalOutput: (output: FinalOutput) => void
  platform?: string
  topic?: string
}

export function StepFinal({
  draft,
  refineData,
  finalOutput,
  onSetFinalOutput,
  platform,
  topic,
}: StepFinalProps) {
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [copied, setCopied] = useState(false)

  // Use refined content if available, otherwise use draft
  const sourceData = refineData || draft
  const finalTitle = finalOutput?.title || editTitle || sourceData.title
  const finalContent = finalOutput?.content || editContent || sourceData.content
  const finalHook = finalOutput?.hook || sourceData.hook
  const finalWordCount = finalContent.length

  const handleStartEdit = useCallback(() => {
    setEditTitle(finalTitle)
    setEditContent(finalContent)
    setEditing(true)
  }, [finalTitle, finalContent])

  const handleSaveEdit = useCallback(() => {
    onSetFinalOutput({
      title: editTitle,
      content: editContent,
      hook: finalHook,
      wordCount: editContent.length,
      platform,
    })
    setEditing(false)
  }, [editTitle, editContent, finalHook, platform, onSetFinalOutput])

  const handleConfirm = useCallback(() => {
    onSetFinalOutput({
      title: finalTitle,
      content: finalContent,
      hook: finalHook,
      wordCount: finalWordCount,
      platform,
    })
  }, [finalTitle, finalContent, finalHook, finalWordCount, platform, onSetFinalOutput])

  const generateTxtContent = useCallback(() => {
    const lines: string[] = []

    // Title
    lines.push('═══════════════════════════════════════')
    lines.push(`  ${finalTitle}`)
    lines.push('═══════════════════════════════════════')
    lines.push('')

    // Meta info
    if (platform || topic) {
      if (topic) {
        lines.push(`主题：${topic}`)
      }
      if (platform) {
        lines.push(`平台：${platform}`)
      }
      lines.push(`字数：${finalWordCount}`)
      lines.push('───────────────────────────────────────')
      lines.push('')
    }

    // Hook
    if (finalHook) {
      lines.push('【黄金三秒钩子】')
      lines.push(finalHook)
      lines.push('───────────────────────────────────────')
      lines.push('')
    }

    // Content
    lines.push('【口播稿正文】')
    lines.push(finalContent)
    lines.push('')

    // Footer
    lines.push('───────────────────────────────────────')
    lines.push('由 Content OS 生成')

    return lines.join('\n')
  }, [finalTitle, finalHook, finalContent, finalWordCount, platform, topic])

  const handleDownload = useCallback(() => {
    const txtContent = generateTxtContent()
    const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${finalTitle.slice(0, 20)}_口播稿.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [generateTxtContent, finalTitle])

  const handleCopy = useCallback(async () => {
    const txtContent = generateTxtContent()
    try {
      await navigator.clipboard.writeText(txtContent)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback: create temporary textarea
      const textarea = document.createElement('textarea')
      textarea.value = txtContent
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [generateTxtContent])

  return (
    <Card>
      <StepHeader step={6} title="终稿输出" active={true} done={!!finalOutput} />
      <CardContent className="flex flex-col gap-3">
        {/* Actions bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="size-4 text-primary" />
            <span className="text-sm font-medium">终稿预览</span>
            <Badge variant="secondary" className="text-xs">
              {finalWordCount} 字
            </Badge>
            {platform && (
              <Badge variant="outline" className="text-xs">{platform}</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {editing ? (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditing(false)}
                >
                  取消
                </Button>
                <Button size="sm" onClick={handleSaveEdit}>
                  <Check className="size-3.5" />
                  保存
                </Button>
              </>
            ) : (
              <Button size="sm" variant="ghost" onClick={handleStartEdit}>
                <Edit3 className="size-3.5" />
                编辑
              </Button>
            )}
          </div>
        </div>

        {/* Final content preview / editor */}
        {editing ? (
          <div className="flex flex-col gap-2 rounded-lg border p-4">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">标题</Label>
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="text-sm font-medium"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">正文</Label>
              <Textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="min-h-[300px] text-sm font-sans"
              />
            </div>
            <div className="text-xs text-muted-foreground text-right">
              {editContent.length} 字
            </div>
          </div>
        ) : (
          <div className="rounded-lg border p-4">
            <div className="text-sm font-medium mb-2">{finalTitle}</div>
            <MarkdownRenderer content={finalContent} className="text-sm" />
          </div>
        )}

        {/* Download / Copy buttons */}
        <Separator />
        <div className="flex items-center gap-2">
          <Button
            onClick={handleDownload}
            disabled={editing}
            className="flex-1"
          >
            <Download className="size-4" />
            下载 TXT 文档
          </Button>
          <Button
            onClick={handleCopy}
            disabled={editing}
            variant="outline"
            className="flex-1"
          >
            {copied ? (
              <><CheckCircle2 className="size-4 text-green-600" />已复制</>
            ) : (
              <><Copy className="size-4" />复制全部</>
            )}
          </Button>
        </div>

        {/* TXT format preview */}
        <Separator />
        <div className="flex items-center gap-2">
          <Eye className="size-4 text-primary" />
          <span className="text-sm font-medium">TXT 格式预览</span>
        </div>
        <div className="rounded-lg border bg-muted/30 p-4">
          <pre className="whitespace-pre-wrap break-words font-mono text-xs text-muted-foreground">
            {generateTxtContent()}
          </pre>
        </div>

        {/* Confirm button */}
        <Separator />
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            确认终稿后可保存为创作
          </div>
          <Button
            onClick={handleConfirm}
            disabled={editing || !!finalOutput}
            size="sm"
          >
            <CheckCircle2 className="size-3.5" />
            {finalOutput ? '终稿已确认' : '确认终稿'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
