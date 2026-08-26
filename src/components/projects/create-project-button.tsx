'use client'

import { useState, useTransition } from 'react'
import { Plus, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { createProject } from '@/lib/services/server-actions'

export function CreateProjectButton() {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      try {
        await createProject(formData)
        setOpen(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : '创建失败')
      }
    })
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm">
        <Plus className="size-4" />
        新建项目
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle>新建项目</CardTitle>
              <CardDescription>创建一个新的内容创作项目</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="name">项目名称</Label>
                  <Input id="name" name="name" placeholder="例如：情感类内容" required />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="description">项目描述（可选）</Label>
                  <Textarea id="description" name="description" placeholder="这个项目主要做什么..." rows={3} />
                </div>
                {error && (
                  <p className="text-sm text-destructive">{error}</p>
                )}
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                    取消
                  </Button>
                  <Button type="submit" disabled={isPending}>
                    {isPending ? (
                      <><Loader2 className="size-4 animate-spin" />创建中...</>
                    ) : (
                      '创建'
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  )
}
