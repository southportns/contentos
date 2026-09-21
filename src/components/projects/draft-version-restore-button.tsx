'use client'

import { useState } from 'react'
import { RotateCcw, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { restoreDraftVersion } from '@/lib/services/server-actions'
import { toast } from 'sonner'

interface DraftVersionRestoreButtonProps {
  draftId: string
  version: number
  onRestoreSuccess?: (newVersion: number) => void
}

export function DraftVersionRestoreButton({
  draftId,
  version,
  onRestoreSuccess,
}: DraftVersionRestoreButtonProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isRestoring, setIsRestoring] = useState(false)

  const handleRestoreClick = () => {
    setIsDialogOpen(true)
  }

  const handleConfirmRestore = async () => {
    setIsRestoring(true)
    try {
      const result = await restoreDraftVersion(draftId)

      if (result.success && result.draft) {
        toast.success(`已创建新版本 v${result.draft.version}`)
        setIsDialogOpen(false)
        onRestoreSuccess?.(result.draft.version)
      } else {
        toast.error(result.error ?? '恢复失败，请稍后重试')
      }
    } catch {
      toast.error('恢复失败，请稍后重试')
    } finally {
      setIsRestoring(false)
    }
  }

  const handleCancel = () => {
    setIsDialogOpen(false)
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={handleRestoreClick}
        disabled={isRestoring}
        className="gap-1.5"
      >
        <RotateCcw className="size-3.5" />
        恢复此版本
      </Button>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>恢复版本 v{version}？</DialogTitle>
            <DialogDescription>
              系统将根据 v{version} 创建一个新的 Draft 版本。原有版本不会被删除或修改。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={isRestoring}
            >
              取消
            </Button>
            <Button
              onClick={handleConfirmRestore}
              disabled={isRestoring}
              className="gap-1.5"
            >
              {isRestoring && <Loader2 className="size-3.5 animate-spin" />}
              创建新版本
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
