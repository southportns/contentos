import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

export const runtime = 'nodejs'
export const maxDuration = 10

const inputSchema = z.object({
  name: z.string().min(1, '账号名/昵称不能为空'),
  description: z.string().optional(),
})

/**
 * 人设描述优化提示引导
 *
 * 核心理念：不是让 AI 瞎编人设，而是引导用户按照固定结构填写真实信息。
 * 固定结构：名字 + 年龄 + 口音 + 语速 + 语感 + 口头禅 + 惯用结束语
 */

export interface PersonaGuideField {
  key: string
  label: string
  placeholder: string
  description: string
  examples: string[]
  required: boolean
}

export interface PersonaOptimizeGuide {
  fields: PersonaGuideField[]
  template: string
  tips: string[]
}

const GUIDE_FIELDS: PersonaGuideField[] = [
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

const TEMPLATE = `名字：[填写名字/昵称]
年龄：[填写年龄]
口音：[填写口音/方言]
语速：[填写语速]
语感：[填写语感]
口头禅：[填写口头禅，没有可不填]
惯用结束语：[填写惯用结束语，没有可不填]`

const TIPS = [
  '每个字段都填写你真实的说话习惯，不要编造不存在的特征',
  '口头禅和惯用结束语是可选的，没有可以不填',
  '语感可以自定义描述，不必局限于示例中的词汇',
  '描述越具体、越贴近真实的你，AI 生成的内容就越像你的风格',
  '这个结构化的信息将直接影响内容策略和最终写作的语气节奏',
]

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const input = inputSchema.parse(body)

    // 根据用户已填写的内容，生成个性化引导
    const filledParts: string[] = []
    const existingDesc = input.description?.trim() || ''

    if (existingDesc) {
      // 尝试从已有描述中提取已有信息
      const lowerDesc = existingDesc.toLowerCase()

      for (const field of GUIDE_FIELDS) {
        const matchedExample = field.examples.find((ex) =>
          lowerDesc.includes(ex.toLowerCase()),
        )
        if (matchedExample) {
          filledParts.push(`${field.label}：已检测到「${matchedExample}」`)
        }
      }
    }

    const guide: PersonaOptimizeGuide = {
      fields: GUIDE_FIELDS,
      template: TEMPLATE,
      tips: TIPS,
    }

    return NextResponse.json({
      success: true,
      data: {
        guide,
        name: input.name,
        detectedFields: filledParts,
        // 返回一个预填模板，方便用户直接编辑
        prefilledTemplate: buildPrefilledTemplate(input.name, existingDesc),
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: error.issues }, { status: 400 })
    }
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    )
  }
}

/**
 * 根据用户输入的名字和已有描述，构建一个预填模板
 */
function buildPrefilledTemplate(name: string, existingDescription: string): string {
  const lines = [
    `名字：${name}`,
    '年龄：',
    '口音：',
    '语速：',
    '语感：',
    '口头禅：',
    '惯用结束语：',
  ]

  // 如果用户已有描述，在模板下方附加备注
  if (existingDescription) {
    lines.push('', '# 你之前的描述（参考）：', existingDescription)
  }

  return lines.join('\n')
}
