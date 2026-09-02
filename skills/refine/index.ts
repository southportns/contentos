import { generateObject, generateText } from 'ai'
import { getModel } from '@/lib/ai/models'
import { extractJsonFromText, buildJsonInstruction } from '@/lib/ai/json-helper'
import {
  refineInputSchema,
  refineOutputSchema,
  compactCandidateOutputSchema,
} from './schema'
import {
  REFINE_FULL_OUTPUT_SYSTEM_PROMPT,
  REFINE_COMPACT_SYSTEM_PROMPT,
  REFINE_PROMPT,
} from './prompts'
import type { RefineInput, RefineOutput } from './schema'

const JSON_INSTRUCTION = buildJsonInstruction(`
JSON 对象格式：
{
  "content": "精修后的完整内容",
  "title": "精修后的标题",
  "hook": "精修后的钩子",
  "wordCount": 字数（数字）,
  "changes": [
    {
      "type": "修改类型",
      "original": "原文片段",
      "revised": "修改后片段",
      "reason": "修改原因"
    }
  ],
  "hookCandidates": ["钩子候选1", "钩子候选2"],
  "titleCandidates": ["标题候选1", "标题候选2"],
  "summary": "本次精修的总结说明"
}

重要约束：
- hookCandidates 和 titleCandidates 必须是纯字符串数组，例如 ["文案1", "文案2"]
- 绝对不能是对象数组，例如 [{"text": "文案1"}] 是错误的
- hookCandidates 仅在 hook_select 模式下需要返回
- titleCandidates 仅在 title_select 模式下需要返回
- 其他模式不需要返回这两个字段
- changes 至少 1 条`)

// 紧凑 JSON 指令 — 用于 hook/title 候选生成
const COMPACT_JSON_INSTRUCTION = `
你必须返回一个合法的 JSON 对象，只包含以下字段：
- hookCandidates?: string[] （钩子候选，纯字符串数组）
- titleCandidates?: string[] （标题候选，纯字符串数组）

不要返回 content、changes、summary 等多余字段。
示例：{"hookCandidates": ["钩子1", "钩子2"], "titleCandidates": ["标题1", "标题2"]}`

export async function runRefine(
  input: RefineInput,
): Promise<RefineOutput> {
  const validated = refineInputSchema.parse(input)

  // Fast path: applying a selected hook or title doesn't need an LLM call.
  if (
    (validated.mode === 'hook_select' && validated.hookSelect) ||
    (validated.mode === 'title_select' && validated.titleSelect)
  ) {
    const changes: RefineOutput['changes'] = []
    let content = validated.content
    let title = validated.title
    let hook = validated.hook

    if (validated.mode === 'hook_select' && validated.hookSelect) {
      const selectedHook = validated.hookSelect.candidates[validated.hookSelect.selectedIndex]
      if (selectedHook) {
        hook = selectedHook
        content = `${selectedHook}\n\n${validated.content}`
        changes.push({
          type: 'hook_replaced',
          original: validated.hook,
          revised: selectedHook,
          reason: '用户选择的黄金三秒钩子',
        })
      }
    }

    if (validated.mode === 'title_select' && validated.titleSelect) {
      const selectedTitle = validated.titleSelect.candidates[validated.titleSelect.selectedIndex]
      if (selectedTitle) {
        title = selectedTitle
        changes.push({
          type: 'title_replaced',
          original: validated.title,
          revised: selectedTitle,
          reason: '用户选择的短视频标题',
        })
      }
    }

    return {
      content,
      title,
      hook,
      wordCount: content.length,
      changes,
      summary: validated.mode === 'hook_select' ? '应用选中的黄金三秒钩子' : '应用选中的短视频标题',
    }
  }

  // LLM path: generate candidates or rewrite content
  const model = getModel()

  // ── 合并模式：同时生成钩子和标题 ──
  if (validated.mode === 'hook_and_title_select') {
    const { object } = await generateObject({
      model,
      schema: compactCandidateOutputSchema,
      system: REFINE_COMPACT_SYSTEM_PROMPT + COMPACT_JSON_INSTRUCTION,
      prompt: REFINE_PROMPT(
        'hook_and_title_select',
        validated.content,
        validated.title,
        validated.hook,
        validated.toneChange,
        validated.hookSelect,
        validated.titleSelect,
        validated.platform,
        validated.topic,
        validated.selectedAngleTitle,
      ),
    })

    return {
      content: validated.content,
      title: validated.title,
      hook: validated.hook,
      wordCount: validated.content.length,
      changes: [{
        type: 'candidates_generated',
        original: '无',
        revised: `生成 ${object.hookCandidates?.length ?? 0} 个钩子 + ${object.titleCandidates?.length ?? 0} 个标题`,
        reason: 'AI 生成钩子和标题候选',
      }],
      hookCandidates: object.hookCandidates,
      titleCandidates: object.titleCandidates,
      summary: 'AI 智能生成钩子和标题候选',
    }
  }

  // ── 紧凑模式：单独的 hook_select 或 title_select ──
  if (validated.mode === 'hook_select' || validated.mode === 'title_select') {
    const { object } = await generateObject({
      model,
      schema: compactCandidateOutputSchema,
      system: REFINE_COMPACT_SYSTEM_PROMPT + COMPACT_JSON_INSTRUCTION,
      prompt: REFINE_PROMPT(
        validated.mode,
        validated.content,
        validated.title,
        validated.hook,
        validated.toneChange,
        validated.hookSelect,
        validated.titleSelect,
        validated.platform,
        validated.topic,
        validated.selectedAngleTitle,
      ),
    })

    return {
      content: validated.content,
      title: validated.title,
      hook: validated.hook,
      wordCount: validated.content.length,
      changes: [{
        type: validated.mode === 'hook_select' ? 'hook_generated' : 'title_generated',
        original: validated.mode === 'hook_select' ? validated.hook : validated.title,
        revised: `生成 ${validated.mode === 'hook_select' ? (object.hookCandidates?.length ?? 0) : (object.titleCandidates?.length ?? 0)} 个候选`,
        reason: validated.mode === 'hook_select' ? '生成黄金三秒钩子候选' : '生成标题候选',
      }],
      hookCandidates: object.hookCandidates,
      titleCandidates: object.titleCandidates,
      summary: validated.mode === 'hook_select' ? '生成钩子候选' : '生成标题候选',
    }
  }

  // ── 完整模式：tone_change 需要返回完整内容 ──
  const { text } = await generateText({
    model,
    system: REFINE_FULL_OUTPUT_SYSTEM_PROMPT + JSON_INSTRUCTION,
    prompt: REFINE_PROMPT(
      validated.mode,
      validated.content,
      validated.title,
      validated.hook,
      validated.toneChange,
      validated.hookSelect,
      validated.titleSelect,
      validated.platform,
      validated.topic,
      validated.selectedAngleTitle,
    ),
  })

  const json = extractJsonFromText(text)

  // 防御性处理：LLM 可能返回对象数组而非字符串数组
  const rawJson = json as Record<string, unknown>
  if (rawJson.hookCandidates && Array.isArray(rawJson.hookCandidates)) {
    rawJson.hookCandidates = (rawJson.hookCandidates as unknown[]).map((item) => {
      if (typeof item === 'string') return item
      if (item != null && typeof item === 'object') {
        const obj = item as Record<string, unknown>
        if (typeof obj.text === 'string') return obj.text
        if (typeof obj.content === 'string') return obj.content
        if (typeof obj.hook === 'string') return obj.hook
        if (typeof obj.value === 'string') return obj.value
        if (typeof obj.title === 'string') return obj.title
        try {
          return JSON.stringify(obj)
        } catch {
          return String(item)
        }
      }
      return String(item)
    })
  }
  if (rawJson.titleCandidates && Array.isArray(rawJson.titleCandidates)) {
    rawJson.titleCandidates = (rawJson.titleCandidates as unknown[]).map((item) => {
      if (typeof item === 'string') return item
      if (item != null && typeof item === 'object') {
        const obj = item as Record<string, unknown>
        if (typeof obj.text === 'string') return obj.text
        if (typeof obj.title === 'string') return obj.title
        if (typeof obj.content === 'string') return obj.content
        if (typeof obj.value === 'string') return obj.value
        if (typeof obj.hook === 'string') return obj.hook
        try {
          return JSON.stringify(obj)
        } catch {
          return String(item)
        }
      }
      return String(item)
    })
  }

  const result = refineOutputSchema.parse(rawJson)

  // Recalculate word count
  result.wordCount = result.content.length

  return result
}
