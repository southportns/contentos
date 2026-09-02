import { NAME_DESENSITIZATION_RULE, AUDIENCE_PERSPECTIVE_RULE } from '@/lib/ai/shared-prompts'

export const REFINE_SYSTEM_PROMPT = `你是一个内容精修专家。你的任务是对短视频口播稿进行二次精修。

模式说明：
- tone_change：根据提示词局部调整内容
- hook_select：生成黄金三秒钩子候选
- title_select：生成短视频标题候选
- hook_and_title_select：同时生成钩子和标题候选（高效模式）

原则：保持核心观点不变、不增删实质内容、适合口播、避免AI味
- ${AUDIENCE_PERSPECTIVE_RULE}
- ${NAME_DESENSITIZATION_RULE}`

// 完整输出模式的系统提示词（tone_change 使用）
export const REFINE_FULL_OUTPUT_SYSTEM_PROMPT = REFINE_SYSTEM_PROMPT + '\n\n必须以 JSON 格式返回完整内容，包括 content、title、hook、wordCount、changes、summary 字段。'

// 紧凑输出模式的系统提示词（hook/title 候选生成使用）
export const REFINE_COMPACT_SYSTEM_PROMPT = REFINE_SYSTEM_PROMPT + '\n\n必须以 JSON 格式返回，仅包含 hookCandidates 和/或 titleCandidates 字段，不要返回 content、changes 等多余字段。'

export const REFINE_PROMPT = (
  mode: string,
  content: string,
  title: string,
  hook: string,
  toneChange?: { newTone: string },
  hookSelect?: { candidates: string[]; selectedIndex: number },
  titleSelect?: { candidates: string[]; selectedIndex: number },
  platform?: string,
  topic?: string,
  selectedAngleTitle?: string,
): string => {
  const contentStr =
    content.length > 4000 ? content.substring(0, 4000) + '...' : content

  switch (mode) {
    case 'tone_change':
      return `请根据用户的局部修改提示词，对以下口播稿进行局部调整，保持核心观点和结构不变。

${platform ? `目标平台：${platform}` : ''}
${topic ? `主题：${topic}` : ''}
${selectedAngleTitle ? `内容角度：${selectedAngleTitle}` : ''}

原文标题：${title}
原钩子：${hook}

局部修改提示词：${toneChange?.newTone}

原文内容：
${contentStr}

请根据以上提示词对内容进行局部调整。保持核心观点、信息量、结构不变，仅根据提示词修改相关部分，未提及的部分保持不变。提示词可能包含具体的修改方向、口语化要求、情绪色彩要求、局部改写要求等，请严格按照提示词执行。返回完整内容。`

    case 'hook_select':
      return `为以下口播稿生成 3-5 个黄金三秒钩子候选。

${platform ? `目标平台：${platform}` : ''}
${topic ? `主题：${topic}` : ''}

原文标题：${title}
原钩子：${hook}

内容：
${contentStr}

要求：
1. 每个钩子15字以内、3秒抓注意力
2. 类型多样：悬念、冲突、共鸣、反常识、利益
3. 与内容一致，适合口播开场
4. hookCandidates 必须是纯字符串数组`

    case 'title_select':
      return `为以下口播稿生成 3-5 个短视频标题候选。

${platform ? `目标平台：${platform}` : ''}
${topic ? `主题：${topic}` : ''}

原标题：${title}

内容：
${contentStr}

要求：
1. 适合${platform || '抖音'}
2. 兼顾吸引力和内容一致性
3. 避免标题党，10-25字
4. titleCandidates 必须是纯字符串数组`

    case 'hook_and_title_select':
      return `为以下口播稿同时生成：
1. 3-5 个黄金三秒钩子候选
2. 3-5 个短视频标题候选

${platform ? `目标平台：${platform}` : ''}
${topic ? `主题：${topic}` : ''}

原标题：${title}
原钩子：${hook}

内容：
${contentStr}

要求：
- 钩子：15字以内、3秒抓注意力、类型多样（悬念/冲突/共鸣/反常识/利益）
- 标题：适合${platform || '抖音'}、10-25字、兼顾吸引力和一致性
- hookCandidates 和 titleCandidates 都必须是纯字符串数组`

    default:
      return `未知模式：${mode}`
  }
}
