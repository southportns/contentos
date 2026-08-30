import { z } from 'zod'

export const contentSearchInputSchema = z.object({
  queries: z.array(z.string()).min(1, '搜索词不能为空'),
  topicId: z.string().optional(),
  limit: z.number().int().positive().default(10),
  publishTime: z
    .enum(['none', '1d', '7d', '14d', '30d'])
    .default('none'),
})

export const contentSearchOutputSchema = z.object({
  contents: z.array(
    z.object({
      platform: z.string(),
      url: z.string(),
      title: z.string().nullable(),
      author: z.string().nullable(),
      content: z.string().nullable(),
      cover: z.string().nullable().optional(),
      publishedAt: z.string().nullable(),
      metrics: z
        .object({
          likes: z.number().nullable(),
          comments: z.number().nullable(),
          shares: z.number().nullable(),
          favorites: z.number().nullable(),
          views: z.number().nullable(),
        })
        .nullable(),
    }),
  ),
  /** 搜索状态消息（如错误提示、风控提示等），用于在前端展示给用户 */
  message: z.string().optional(),
})

export type ContentSearchInput = z.infer<typeof contentSearchInputSchema>
export type ContentSearchOutput = z.infer<typeof contentSearchOutputSchema>
export type SearchedContent = ContentSearchOutput['contents'][number]
