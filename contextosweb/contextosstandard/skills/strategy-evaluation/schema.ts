import { z } from 'zod'

// ─── Input ────────────────────────────────────────────

export const platformSchema = z.enum(['douyin', 'xiaohongshu', 'wechat'])

export const strategyEvaluationInputSchema = z.object({
  platform: platformSchema,
  topic: z.string().min(1, '主题不能为空'),
  audienceDescription: z.string().optional(),
  angle: z
    .object({
      title: z.string(),
      angle: z.string(),
      targetEmotion: z.string(),
      keyPoints: z.array(z.string()),
    })
    .optional(),
  strategy: z
    .object({
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
      emotionalArc: z.object({
        start: z.string(),
        middle: z.string(),
        end: z.string(),
      }),
      callToAction: z.string(),
      tone: z.string(),
    })
    .optional(),
  draft: z.object({
    title: z.string(),
    content: z.string().min(1, '内容不能为空'),
    wordCount: z.number().optional(),
  }),
  researchData: z
    .object({
      contents: z.array(
        z.object({
          platform: z.string(),
          title: z.string().nullable(),
          viralScore: z.number().optional(),
        }),
      ),
      audienceInsights: z
        .object({
          needs: z.array(z.string()),
          painPoints: z.array(z.string()),
        })
        .optional(),
    })
    .optional(),
})

// ─── Output ────────────────────────────────────────────

export const gradeSchema = z.enum([
  'exceptional', // 90-100
  'strong', // 80-89
  'good', // 70-79
  'average', // 60-69
  'poor', // 0-59
])

export const strategyEvaluationOutputSchema = z.object({
  platform: z.string(),
  overallScore: z.number().min(0).max(100),
  grade: gradeSchema,
  scores: z.record(z.string(), z.number()),
  platformFit: z.number().min(0).max(100),
  strategyConsistency: z.number().min(0).max(100),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  criticalIssues: z.array(z.string()),
  improvementPriorities: z.array(
    z.object({
      priority: z.number(),
      problem: z.string(),
      reason: z.string(),
      suggestion: z.string(),
    }),
  ),
  shareAnalysis: z.object({
    motivation: z.string(),
    target: z.string(),
    context: z.string(),
  }),
  aiStyleRisk: z.number().min(0).max(100),
  authenticityScore: z.number().min(0).max(100),
  evidenceQuality: z.number().min(0).max(100),
  confidence: z.number().min(0).max(1),
  verdict: z.string(),
})

// ─── Types ────────────────────────────────────────────

export type Platform = z.infer<typeof platformSchema>
export type Grade = z.infer<typeof gradeSchema>
export type StrategyEvaluationInput = z.infer<typeof strategyEvaluationInputSchema>
export type StrategyEvaluationOutput = z.infer<typeof strategyEvaluationOutputSchema>

// ─── Platform Scoring Config ─────────────────────────

export interface PlatformScoringConfig {
  name: string
  displayName: string
  coreGoals: string[]
  weights: Record<string, number>
  dimensionDetails: Record<
    string,
    { description: string; evaluationPoints: string[] }
  >
}

export const platformConfigs: Record<Platform, PlatformScoringConfig> = {
  douyin: {
    name: 'douyin',
    displayName: '抖音短视频',
    coreGoals: [
      'Attention',
      'Retention',
      'Emotion',
      'Interaction',
      'Shareability',
    ],
    weights: {
      hook: 0.25,
      retention: 0.25,
      emotion: 0.20,
      interaction: 0.15,
      shareability: 0.10,
      novelty: 0.05,
    },
    dimensionDetails: {
      hook: {
        description: '前1-3秒是否建立兴趣',
        evaluationPoints: [
          '是否存在强烈问题',
          '是否存在认知冲突',
          '是否有明确悬念',
          '是否避免冗长背景',
        ],
      },
      retention: {
        description: '用户为什么会继续看下去',
        evaluationPoints: [
          '是否持续产生新的信息或情绪',
          '是否存在递进',
          '是否存在转折',
          '是否存在期待',
          '是否避免中段失速',
          '是否有清晰 payoff',
        ],
      },
      emotion: {
        description: '情绪是否服务于内容表达',
        evaluationPoints: [
          '情绪强度',
          '情绪变化',
          '情绪递进',
          '情绪转折',
          '情绪释放',
        ],
      },
      interaction: {
        description: '是否自然产生评论欲望',
        evaluationPoints: [
          '是否存在可讨论的问题',
          '是否存在观点分歧',
          '是否容易引发用户讲述自己的经历',
        ],
      },
      shareability: {
        description: '用户是否存在分享理由',
        evaluationPoints: [
          '"这说的就是我"',
          '"想发给某个人看"',
          '"这句话很值得保存"',
          '"我的朋友应该会有共鸣"',
        ],
      },
      novelty: {
        description: '用户是否能获得新的角度',
        evaluationPoints: [
          '观点新颖度',
          '表达新颖度',
          '结构新颖度',
          '切入角度新颖度',
        ],
      },
    },
  },

  xiaohongshu: {
    name: 'xiaohongshu',
    displayName: '小红书',
    coreGoals: [
      'Discoverability',
      'Searchability',
      'Relatability',
      'Saveability',
      'Usefulness',
      'Trust',
      'Interaction',
    ],
    weights: {
      searchability: 0.20,
      relatability: 0.20,
      saveability: 0.20,
      usefulness: 0.15,
      trust: 0.10,
      interaction: 0.10,
      novelty: 0.05,
    },
    dimensionDetails: {
      searchability: {
        description: '是否对应明确用户需求',
        evaluationPoints: [
          '标题是否符合搜索意图',
          '核心关键词是否自然出现',
          '内容是否解决具体问题',
          '是否具有长期搜索价值',
        ],
      },
      relatability: {
        description: '用户能否快速代入',
        evaluationPoints: [
          '是否存在具体生活场景',
          '是否存在真实体验感',
          '是否避免空泛表达',
        ],
      },
      saveability: {
        description: '用户为什么要收藏这条内容',
        evaluationPoints: [
          '可以以后回看',
          '可以参考',
          '可以复用',
          '可以提醒自己',
          '可以转给别人',
        ],
      },
      usefulness: {
        description: '是否提供实际帮助',
        evaluationPoints: [
          '是否提供新的认知',
          '是否提供解决方法',
          '是否提供判断框架',
          '是否让用户获得明确收益',
        ],
      },
      trust: {
        description: '是否存在真实经验',
        evaluationPoints: [
          '是否提供具体依据',
          '是否避免虚假身份',
          '是否避免夸大',
          '是否避免伪造数据',
          '是否明确区分事实与观点',
        ],
      },
      interaction: {
        description: '是否自然产生互动',
        evaluationPoints: [
          '是否存在可讨论的问题',
          '是否容易引发用户分享自己的经验',
        ],
      },
      novelty: {
        description: '用户是否能获得新的角度',
        evaluationPoints: [
          '观点新颖度',
          '表达新颖度',
          '结构新颖度',
        ],
      },
    },
  },

  wechat: {
    name: 'wechat',
    displayName: '公众号',
    coreGoals: [
      'Clickability',
      'Readability',
      'Depth',
      'Trust',
      'Emotional Resonance',
      'Shareability',
    ],
    weights: {
      titleClickability: 0.20,
      depth: 0.20,
      readability: 0.15,
      trust: 0.15,
      emotionalResonance: 0.15,
      shareability: 0.15,
    },
    dimensionDetails: {
      titleClickability: {
        description: '是否有明确阅读理由',
        evaluationPoints: [
          '是否存在认知张力',
          '是否与正文高度一致',
          '是否避免低级标题党',
          '是否针对明确受众',
        ],
      },
      depth: {
        description: '是否有完整观点和论证',
        evaluationPoints: [
          '是否有论证',
          '是否有案例',
          '是否有故事',
          '是否存在思想推进',
          '是否能让读者产生新的理解',
        ],
      },
      readability: {
        description: '是否流畅易于阅读',
        evaluationPoints: [
          '段落长度',
          '阅读节奏',
          '结构层次',
          '语言自然度',
          '信息密度',
          '是否存在重复',
        ],
      },
      trust: {
        description: '内容是否可靠',
        evaluationPoints: [
          '论据是否充分',
          '是否存在逻辑跳跃',
          '是否把个人经验冒充普遍事实',
        ],
      },
      emotionalResonance: {
        description: '情绪+故事+观点+认知是否形成完整体验',
        evaluationPoints: [
          '情绪是否服务于内容表达',
          '是否有故事支撑',
          '是否有观点收束',
          '是否有认知推进',
        ],
      },
      shareability: {
        description: '谁会把这篇文章分享给谁',
        evaluationPoints: [
          '潜在分享者',
          '潜在接收者',
          '分享动机',
          '分享场景',
        ],
      },
    },
  },
}
