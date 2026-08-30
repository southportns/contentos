export const REFINE_SYSTEM_PROMPT = `你是一个内容精修专家。你的任务是对初稿进行二次精修，不改变总体内容方向。

精修模式说明：

1. tone_change（语气修改）
   - 根据用户提供的语气修改提示词重新生成口播稿
   - 提示词可能包含详细的风格描述、口语化要求、情绪色彩要求等
   - 保持核心观点、结构、信息量不变
   - 不增加或删除实质性内容
   - 返回完整内容和变更清单

2. hook_select（黄金三秒钩子）
   - 分析内容核心吸引力
   - 生成 3-5 个黄金三秒钩子候选
   - 每个钩子必须在3秒内（约15字以内）抓住注意力
   - 类型包括：悬念钩子、冲突钩子、共鸣钩子、反常识钩子、利益钩子
   - 返回候选列表

3. title_select（标题选定）
   - 基于内容生成 3-5 个短视频标题候选
   - 标题要适合短视频平台（抖音/小红书等）
   - 兼顾吸引力和内容一致性
   - 避免标题党

改写原则：
- 保持原文核心观点和结构不变
- 不增加或删除实质性内容
- 修改后内容要自然流畅
- 适合口播节奏
- 避免AI味
- 观众视角表达：口播稿面向的是短视频观众，当内容使用第二人称对话式表达时，应使用"大家"而非"你"来拉近距离感（如"你有没有发现"改为"大家有没有发现"，"你怎么看待"改为"大家怎么看待"）。但此约束仅在适合对话感、互动感的内容上使用，不适用于叙事性、知识科普等不需要第二人称的内容，避免生搬硬套`

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
      return `请根据用户的语气修改提示词，重新生成以下口播稿，保持核心观点和结构不变。

${platform ? `目标平台：${platform}` : ''}
${topic ? `主题：${topic}` : ''}
${selectedAngleTitle ? `内容角度：${selectedAngleTitle}` : ''}

原文标题：${title}
原钩子：${hook}

语气修改提示词：${toneChange?.newTone}

原文内容：
${contentStr}

请根据以上提示词重新生成口播稿。保持核心观点、信息量、结构不变，仅改变表达方式和语气。提示词可能包含详细的风格描述、口语化要求、情绪色彩要求等，请严格按照提示词执行。返回完整内容。`

    case 'hook_select':
      return `请为以下内容生成 3-5 个黄金三秒钩子候选。

${platform ? `目标平台：${platform}` : ''}
${topic ? `主题：${topic}` : ''}

原文标题：${title}
原钩子：${hook}

内容：
${contentStr}

要求：
1. 生成 3-5 个不同的黄金三秒钩子
2. 每个钩子必须在前3秒（约15字以内）抓住注意力
3. 钩子类型多样：悬念、冲突、共鸣、反常识、利益
4. 钩子要与内容高度一致，不做标题党
5. 适合口播开场

请以 JSON 格式返回，hookCandidates 必须是纯字符串数组，例如：
{"hookCandidates": ["钩子候选1", "钩子候选2", "钩子候选3"], "content": "保持原文不变", "title": "保持原标题不变", "hook": "保持原钩子不变", "wordCount": 100, "changes": [{"type": "hook_generated", "original": "原钩子", "revised": "生成的新钩子", "reason": "生成钩子候选"}], "summary": "生成钩子候选"}

重要：hookCandidates 中每一项必须是纯字符串，不能是对象。`

    case 'title_select':
      return `请为以下内容生成 3-5 个短视频标题候选。

${platform ? `目标平台：${platform}` : ''}
${topic ? `主题：${topic}` : ''}

原标题：${title}

内容：
${contentStr}

要求：
1. 生成 3-5 个不同的短视频标题
2. 标题要适合短视频平台（${platform || '抖音'}）
3. 兼顾吸引力和内容一致性
4. 避免标题党，但要有点击欲望
5. 长度适中（10-25字）

请以 JSON 格式返回，titleCandidates 必须是纯字符串数组，例如：
{"titleCandidates": ["标题候选1", "标题候选2", "标题候选3"], "content": "保持原文不变", "title": "保持原标题不变", "hook": "保持原钩子不变", "wordCount": 100, "changes": [{"type": "title_generated", "original": "原标题", "revised": "生成的新标题", "reason": "生成标题候选"}], "summary": "生成标题候选"}

重要：titleCandidates 中每一项必须是纯字符串，不能是对象。`

    default:
      return `未知模式：${mode}`
  }
}
