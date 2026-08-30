'use client'

import { useState, useCallback } from 'react'
import {
  UserCircle,
  Plus,
  Trash2,
  Loader2,
  Pencil,
  AlertTriangle,
  Lightbulb,
  ChevronDown,
  ChevronUp,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { usePersonas } from '@/hooks/use-personas'
import type { Persona } from '@/hooks/use-personas'

interface PersonaFormData {
  name: string
  description: string
}

const EMPTY_FORM: PersonaFormData = {
  name: '',
  description: '',
}

// 人设描述引导字段定义
interface GuideField {
  key: string
  label: string
  placeholder: string
  description: string
  examples: string[]
  required: boolean
}

const GUIDE_FIELDS: GuideField[] = [
  {
    key: 'name',
    label: '名字 / 昵称',
    placeholder: '例如：小林、小波波、小美',
    description: '你在社交平台上的账号名或昵称，也是你希望读者称呼你的名字',
    examples: ['小林', '波波姐', '老王说事'],
    required: true,
  },
  {
    key: 'age',
    label: '年龄',
    placeholder: '例如：25岁、30岁左右、90后',
    description: '你的真实年龄或年龄段，帮助 AI 调整语言成熟度',
    examples: ['25岁', '30岁', '90后', '00后'],
    required: true,
  },
  {
    key: 'accent',
    label: '口音（方言 / 普通话）',
    placeholder: '例如：四川话、东北话、普通话、广普',
    description: '你说话时带有的口音特征，决定用词和表达方式',
    examples: ['普通话', '四川话', '东北话', '广普', '带点湖南口音的普通话'],
    required: true,
  },
  {
    key: 'speechRate',
    label: '语速',
    placeholder: '例如：偏快、中等、偏慢、时快时慢',
    description: '你说话的节奏，影响内容句式长短和段落节奏',
    examples: ['偏快，干脆利落', '中等，娓娓道来', '偏慢，有停顿和思考', '时快时慢，情绪驱动'],
    required: true,
  },
  {
    key: 'speechStyle',
    label: '语感',
    placeholder: '例如：松弛、正式、活泼、大方、犀利、温柔',
    description: '你说话的整体感觉，决定内容的语气和氛围',
    examples: ['松弛自然，像和朋友聊天', '正式严谨，有逻辑', '活泼俏皮，爱用比喻', '大方得体，不卑不亢', '犀利直接，一针见血'],
    required: true,
  },
  {
    key: 'catchphrase',
    label: '口头禅',
    placeholder: '例如：说真的、我跟你说、其实吧、懂的都懂',
    description: '你经常挂在嘴边的话，让内容更有辨识度',
    examples: ['"说真的"', '"我跟你说"', '"其实吧"', '"懂的都懂"', '"怎么说呢"'],
    required: false,
  },
  {
    key: 'closingPhrase',
    label: '惯用结束语',
    placeholder: '例如：你觉得呢、欢迎留言讨论、点个关注不迷路',
    description: '你在内容结尾常用的收尾方式，形成个人风格',
    examples: ['"你觉得呢？"', '"欢迎在评论区聊聊"', '"点个关注，下期继续"', '"就这样，拜拜~"'],
    required: false,
  },
]

const GUIDE_TIPS = [
  '每个字段都填写你真实的说话习惯，不要编造不存在的特征',
  '口头禅和惯用结束语是可选的，没有可以不填',
  '语感可以自定义描述，不必局限于示例中的词汇',
  '描述越具体、越贴近真实的你，AI 生成的内容就越像你的风格',
  '这个结构化的信息将直接影响内容策略和最终写作的语气节奏',
]

const TEMPLATE = `名字：[填写名字/昵称]
年龄：[填写年龄]
口音：[填写口音/方言]
语速：[填写语速]
语感：[填写语感]
口头禅：[填写口头禅，没有可不填]
惯用结束语：[填写惯用结束语，没有可不填]`

export function PersonaManager() {
  const { personas, loading, error, createPersona, updatePersona, deletePersona } = usePersonas()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<PersonaFormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [guideOpen, setGuideOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Persona | null>(null)
  const [deleting, setDeleting] = useState(false)

  const handleOpenCreate = useCallback(() => {
    setForm(EMPTY_FORM)
    setEditingId(null)
    setSaveError(null)
    setDialogOpen(true)
  }, [])

  const handleOpenEdit = useCallback((persona: Persona) => {
    setForm({
      name: persona.name,
      description: persona.description || '',
    })
    setEditingId(persona.id)
    setSaveError(null)
    setDialogOpen(true)
  }, [])

  const handleToggleGuide = useCallback(() => {
    setGuideOpen((v) => !v)
  }, [])

  const handleApplyTemplate = useCallback(() => {
    // 根据当前名字预填模板
    const prefilled = TEMPLATE.replace('[填写名字/昵称]', form.name.trim() || '[填写名字/昵称]')
    setForm((f) => ({ ...f, description: prefilled }))
    setGuideOpen(false)
  }, [form.name])

  const handleSave = useCallback(async () => {
    if (!form.name.trim()) return
    setSaveError(null)
    setSaving(true)
    const data = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
    }

    try {
      const result = editingId
        ? await updatePersona(editingId, data)
        : await createPersona(data)

      if (result.success) {
        setDialogOpen(false)
        setForm(EMPTY_FORM)
        setEditingId(null)
        setGuideOpen(false)
      } else {
        setSaveError(result.error || '保存失败，请检查网络或数据库连接后重试')
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : '保存时发生未知错误')
    } finally {
      setSaving(false)
    }
  }, [form, editingId, createPersona, updatePersona])

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return
    setDeleting(true)
    const result = await deletePersona(deleteTarget.id)
    setDeleting(false)
    if (result.success) {
      setDeleteTarget(null)
    }
  }, [deleteTarget, deletePersona])

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <UserCircle className="size-5 text-primary" />
              创作人设
            </CardTitle>
            <CardDescription>
              管理你的创作人设，影响内容策略和写作风格
            </CardDescription>
          </div>
          <Button size="sm" onClick={handleOpenCreate}>
            <Plus className="size-4" />
            新建人设
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <p className="text-sm text-destructive py-4">{error}</p>
        ) : personas.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
            <UserCircle className="size-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              还没有创建人设
            </p>
            <p className="text-xs text-muted-foreground">
              创建人设后，在创作时选择使用，影响最终的文案风格
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {personas.map((persona) => (
              <div
                key={persona.id}
                className="group flex items-start justify-between gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{persona.name}</span>
                  </div>
                  {persona.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 whitespace-pre-line">
                      {persona.description}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground hover:text-foreground"
                    onClick={() => handleOpenEdit(persona)}
                    aria-label="编辑人设"
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    onClick={() => setDeleteTarget(persona)}
                    aria-label="删除人设"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? '编辑人设' : '新建人设'}</DialogTitle>
            <DialogDescription>
              人设将在创作时影响内容策略和写作风格，请按照固定结构如实填写
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 py-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="persona-name">
                账号名 / 昵称 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="persona-name"
                placeholder="例如：小林、小波波、心理学博主"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="persona-desc">人设描述</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 text-xs text-primary"
                  onClick={handleToggleGuide}
                >
                  <Lightbulb className="size-3" />
                  填写指引
                  {guideOpen ? (
                    <ChevronUp className="size-3" />
                  ) : (
                    <ChevronDown className="size-3" />
                  )}
                </Button>
              </div>

              {/* 填写指引面板 */}
              {guideOpen && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 mb-1">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-1.5 text-sm font-medium text-primary">
                      <Lightbulb className="size-4" />
                      人设描述填写指引
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-6 text-muted-foreground"
                      onClick={() => setGuideOpen(false)}
                    >
                      <X className="size-3" />
                    </Button>
                  </div>

                  <p className="text-xs text-muted-foreground mb-3">
                    人设描述不是让 AI 瞎编，而是按照以下固定结构如实填写你的真实说话特征。
                    这将直接影响 AI 生成内容的语气和节奏。
                  </p>

                  <div className="flex flex-col gap-2.5 mb-3">
                    {GUIDE_FIELDS.map((field) => (
                      <div key={field.key} className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium">{field.label}</span>
                          {field.required && (
                            <span className="text-[10px] text-destructive">必填</span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{field.description}</p>
                        <div className="flex flex-wrap gap-1">
                          {field.examples.map((ex) => (
                            <span
                              key={ex}
                              className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                            >
                              {ex}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-md bg-background border p-2.5 mb-3">
                    <p className="text-[10px] font-medium text-muted-foreground mb-1">
                      推荐模板
                    </p>
                    <pre className="text-xs whitespace-pre-wrap font-mono leading-relaxed">{TEMPLATE}</pre>
                  </div>

                  <div className="flex flex-col gap-1 mb-3">
                    {GUIDE_TIPS.map((tip, i) => (
                      <div key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                        <span className="text-primary shrink-0">•</span>
                        <span>{tip}</span>
                      </div>
                    ))}
                  </div>

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={handleApplyTemplate}
                  >
                    使用模板预填
                  </Button>
                </div>
              )}

              <Textarea
                id="persona-desc"
                placeholder="请按照固定结构填写：名字、年龄、口音、语速、语感、口头禅、惯用结束语。点击「填写指引」查看详细说明。"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={8}
                className="font-mono text-sm leading-relaxed"
              />
            </div>
          </div>

          {saveError && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              <AlertTriangle className="size-4 shrink-0" />
              <span>{saveError}</span>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)} disabled={saving}>
              取消
            </Button>
            <Button type="button" onClick={handleSave} disabled={!form.name.trim() || saving}>
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  保存中...
                </>
              ) : (
                '保存'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="size-5 text-destructive" />
              </div>
              <div>
                <DialogTitle>删除人设</DialogTitle>
                <DialogDescription>此操作不可撤销</DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            确定要删除人设「{deleteTarget?.name}」吗？
            <br />
            已关联此人设的创作将取消关联。
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  删除中...
                </>
              ) : (
                <>
                  <Trash2 className="size-4" />
                  确认删除
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
