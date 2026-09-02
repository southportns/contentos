import { z } from 'zod'

export const refineInputSchema = z.object({
  // 原始初稿
  content: z.string().min(1, '内容不能为空'),
  title: z.string(),
  hook: z.string(),
  wordCount: z.number(),

  // 精修模式
  mode: z.enum(['tone_change', 'hook_select', 'title_select', 'hook_and_title_select']),

  // 语气修改
  toneChange: z
    .object({
      newTone: z.string().min(1),
    })
    .optional(),

  // 黄金三秒钩子
  hookSelect: z
    .object({
      candidates: z.array(z.string()),
      selectedIndex: z.number().int().min(0),
    })
    .optional(),

  // 标题选定
  titleSelect: z
    .object({
      candidates: z.array(z.string()),
      selectedIndex: z.number().int().min(0),
    })
    .optional(),

  // 上下文
  platform: z.string().optional(),
  topic: z.string().optional(),
  selectedAngleTitle: z.string().optional(),
})

export const refineOutputSchema = z.object({
  content: z.string(),
  title: z.string(),
  hook: z.string(),
  wordCount: z.number(),
  changes: z.array(
    z.object({
      type: z.string(),
      original: z.string(),
      revised: z.string(),
      reason: z.string(),
    }),
  ),
  hookCandidates: z.array(z.string()).optional(),
  titleCandidates: z.array(z.string()).optional(),
  summary: z.string(),
})

// 紧凑输出模式 — 用于 hook/title 候选生成，不返回完整内容
export const compactCandidateOutputSchema = z.object({
  hookCandidates: z.array(z.string()).optional(),
  titleCandidates: z.array(z.string()).optional(),
})

export type RefineInput = z.infer<typeof refineInputSchema>
export type RefineOutput = z.infer<typeof refineOutputSchema>
