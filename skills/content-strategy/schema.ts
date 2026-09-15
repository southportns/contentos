import { z } from 'zod'
import type { StrategyKnowledgeContext } from '@/knowledge/context'

export const contentStrategyInputSchema = z.object({
  topic: z.string().min(1, '主题不能为空'),
  selectedAngle: z.object({
    id: z.string(),
    title: z.string(),
    angle: z.string(),
    targetEmotion: z.string(),
    keyPoints: z.array(z.string()),
  }),
  topicProfile: z
    .object({
      keywords: z.array(z.string()),
      coreQuestions: z.array(z.string()),
    })
    .optional(),
  /**
   * 原始素材内容（来自上传文件或提取的洞察）。
   * 提供时，策略必须基于这些事实，不得虚构数据。
   */
  sourceContent: z
    .object({
      content: z.string().optional(),
      keyInsights: z.array(z.string()).optional(),
      memorableQuotes: z.array(z.string()).optional(),
    })
    .optional(),
  audienceInsights: z
    .object({
      needs: z.array(z.string()),
      painPoints: z.array(z.string()),
    })
    .optional(),
  platform: z.string().optional(),
  contentType: z.string().optional(),
  tone: z.string().optional(),
  wordCount: z.number().int().optional(),
  persona: z
    .object({
      name: z.string(),
      description: z.string().nullable(),
    })
    .optional(),
  /**
   * P0.3.8.3 — Strategy Knowledge Context（由编排层通过 P0.3.8.2 检索构建）。
   * 提供时，Prompt Assembly 会通过 serializeStrategyKnowledgeContext()
   * 将其作为独立 Strategy Knowledge Context Block 注入 user prompt。
   * 不提供时，行为与之前完全一致（纯 LLM 策略生成）。
   */
  strategyKnowledge: z.custom<StrategyKnowledgeContext>().optional(),
})

export const contentStrategyOutputSchema = z.object({
  title: z.string(),
  hook: z.string(),
  structure: z.array(
    z.object({
      section: z.string(),
      purpose: z.string(),
      keyArguments: z.array(z.string()),
      estimatedWords: z.number(),
    }),
  ),
  keyArguments: z.array(z.string()),
  emotionalArc: z.object({
    start: z.string(),
    middle: z.string(),
    end: z.string(),
  }),
  callToAction: z.string(),
  suggestedReferences: z.array(z.string()),
  tone: z.string(),
  estimatedWordCount: z.number(),
})

export type ContentStrategyInput = z.infer<typeof contentStrategyInputSchema>
export type ContentStrategyOutput = z.infer<typeof contentStrategyOutputSchema>
