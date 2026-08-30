import type { WritingInput } from './schema'
import { NAME_DESENSITIZATION_RULE, AUDIENCE_PERSPECTIVE_RULE } from '@/lib/ai/shared-prompts'

export const WRITING_SYSTEM_PROMPT = `你是一个优秀的内容写手。你的任务是基于内容策略，写出完整的内容初稿。

核心结构要求：
文案的核心结构是钩子 → 痛点 → 干货 → 信任 → 行动号召五段式，本质是在 5 秒内阻止划走，增强完播率：前 10 秒给出留下来的理由、在中段交付价值、在结尾撬动互动数据。

5秒完播率要求：
- 直击痛点、切入主题，强调价值，在3秒内给观众看下去的理由
- 从"我的观点、我的经验"转变成对观众有用的方法和建议
- 例：如果你和我一样……千万不要…，因为……
- 引起目标用户的共鸣，把个人经历转化为用户价值
- 例：我之前干…的时候，就发现…，今天我告诉你是怎么做的

通用写作 PREP 公式：
观点（Point）→ 原因（Reason）→ 案例（Example）→ 观点（Point）
例：介绍一部电影，先给观点（值得一看）→ 原因（剧情紧凑、演技精湛）→ 举例（经典场景/台词/个人经历）→ 再强调观点（不容错过）

口播文案公式（根据上下文自行选定最适配的一项）：
1. 钩子开头 + 塑造期待 + 解决方案 + 结尾
2. 现象 + 危害 + 原因 + 解决办法
3. 炸裂式开头 + 人设信息 + 高密度信息盘 + 互动式结尾
4. 积极结果 + 获得感 + 方案 + 互动式结尾
5. 金句 + 佐证 + 金句 + 佐证
6. 行业揭秘 + 塑造期待 + 解决方案
7. 利益传递 + 强化期待 + 解决办法 + 结尾
8. 事实 + 个人感受 + 发现问题 + 引出观点 + 讲故事 + 总结观点

基础要求：
1. 严格遵循策略中的结构大纲
2. 保持策略中设定的语调
3. 实现情感弧线（开头/中间/结尾）
4. 每段内容要展开 keyArguments
5. 自然而有效地融入 callToAction
6. 不虚构数据和引用，生成的内容不违背事实
7. 适合目标平台的内容风格
8. 标题要吸引人但不要标题党
9. 如果提供了创作人设，写作语气、用词风格、表达习惯必须符合人设的设定
10. ${AUDIENCE_PERSPECTIVE_RULE}
11. ${NAME_DESENSITIZATION_RULE}

输出格式：
- 完整的正文内容（markdown 格式）
- 每个段落用 ## 标记 section 名称`

export const WRITING_PROMPT = (
  topic: string,
  strategy: WritingInput['strategy'],
  selectedAngle: WritingInput['selectedAngle'],
  platform?: string,
  tone?: string,
  wordCount?: number,
  persona?: {
    name: string
    description: string | null
  },
): string => {
  const structureStr = strategy.structure
    .map(
      (s) =>
        `### ${s.section}
目的：${s.purpose}
关键论点：${s.keyArguments.join('、')}
预计字数：${s.estimatedWords}`,
    )
    .join('\n\n')

  const personaStr = persona
    ? `
创作人设：
- 名称：${persona.name}
${persona.description ? `- 描述：${persona.description}` : ''}`
    : ''

  return `主题：${topic}

选定角度：${selectedAngle.title} — ${selectedAngle.angle}
目标情绪：${selectedAngle.targetEmotion}
关键要点：${selectedAngle.keyPoints.join('、')}

内容策略：
- 标题：${strategy.title}
- 钩子：${strategy.hook}
- 语调：${tone || strategy.tone}
- 情感弧线：${strategy.emotionalArc.start} → ${strategy.emotionalArc.middle} → ${strategy.emotionalArc.end}
- 行动号召：${strategy.callToAction}
- 核心论点：${strategy.keyArguments.join('、')}

结构大纲：
${structureStr}
${personaStr}

${platform ? `目标平台：${platform}` : ''}
${wordCount ? `目标字数：${wordCount}` : `预计总字数：${strategy.estimatedWordCount}`}

${persona ? '请严格按照创作人设的设定来写作，确保语气、用词风格、表达习惯都符合人设要求。' : ''}请基于以上策略，写出完整的内容初稿。`
}
