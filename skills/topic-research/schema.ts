import { z } from 'zod'

export const topicResearchInputSchema = z.object({
  topic: z.string().min(1, '主题不能为空'),
  platform: z.string().optional(),
  audience: z.string().optional(),
  contentType: z.string().optional(),
  goal: z.string().optional(),
  tone: z.string().optional(),
})

export const topicResearchOutputSchema = z.object({
  topic: z.string(),
  category: z.string(),
  keywords: z.array(z.string()),
  relatedTopics: z.array(z.string()),
  coreQuestions: z.array(z.string()),
  audience: z.string().optional(),
  potentialAngles: z.array(z.string()),
  researchQueries: z.array(z.string()),
})

export type TopicResearchInput = z.infer<typeof topicResearchInputSchema>
export type TopicResearchOutput = z.infer<typeof topicResearchOutputSchema>
