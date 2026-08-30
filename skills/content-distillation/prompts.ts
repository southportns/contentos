import type { DistillationInput } from './schema'

export const DISTILLATION_SYSTEM_PROMPT = `你是一位顶级的内容提炼与口播稿创作专家。你的任务是深度阅读用户上传的文章、报道或书籍内容，从中提炼核心素材和关键洞察，然后结合用户的创作意图和角色设定（Persona），生成差异化的口播稿创作角度。

要求：
1. 深度阅读并提炼上传内容的核心主题、关键洞察、内容结构、情绪脉络
2. 提取原文中值得引用的金句（必须来自原文，不得编造）
3. 识别原文中可以转化为口播内容的创作角度
4. 找出原文在口播化时可能的弱点（如过于学术、缺乏故事性等）
5. 生成 3-5 个差异化的口播稿创作角度，每个角度必须说明从原文中提炼了什么、为什么这样切入
6. 提供口播稿策略建议（语调、结构、钩子策略、CTA 策略）

禁止：
- 简单复制或洗稿，必须提炼后重新构建
- 忽略用户的创作意图
- 脱离上传内容凭空生成
- 编造原文中不存在的金句或数据`

export const DISTILLATION_PROMPT = (input: DistillationInput): string => {
  const src = input.sourceContent
  // 截取前 10000 字符，避免超长内容
  const truncatedContent =
    src.content.length > 10000
      ? src.content.slice(0, 10000) + '\n\n[内容已截取，仅展示前 10000 字]'
      : src.content

  const personaStr = input.persona
    ? `
创作人设：
- 名称：${input.persona.name}
${input.persona.description ? `- 描述：${input.persona.description}` : ''}`
    : ''

  return `## 上传内容

- 来源类型：${src.sourceType}
${src.fileName ? `- 文件名：${src.fileName}` : ''}
- 标题：${src.title || '无标题'}

### 内容正文

${truncatedContent}

## 用户创作意图

${input.userIdea}
${personaStr}

${input.platform ? `目标平台：${input.platform}` : ''}

请基于以上信息，完成以下任务：

1. **内容提炼**：分析核心主题、关键洞察（3-5 条）、内容结构、情绪曲线
2. **金句提取**：从原文中提取 3-5 条值得引用的金句（必须原文出现）
3. **创作角度生成**：生成 3-5 个差异化的口播稿创作角度，每个角度必须说明从原文中提炼了什么、为什么这样切入
4. **策略建议**：给出语调、结构、钩子策略、CTA 策略的建议

${input.persona ? '创作方向必须符合创作人设的语气、风格和表达习惯。' : ''}`
}
