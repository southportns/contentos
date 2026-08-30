/**
 * Extract JSON object from LLM text response.
 * Handles markdown code blocks, raw JSON, and common LLM formatting issues:
 * - Unescaped control characters inside string values (real newlines, tabs)
 * - Trailing commas
 * - Chinese punctuation mixed into JSON (：→:, ，→,  ""→"")
 * - Markdown formatting inside string values
 * - Multiple JSON blocks (takes the largest valid one)
 */

/**
 * Attempt to parse JSON with progressive cleanup steps.
 * Each step is tried in order — the first one that succeeds wins.
 */
function tryParseJson(raw: string): unknown {
  const steps: Array<{ name: string; fn: (s: string) => string }> = [
    { name: 'raw', fn: (s) => s },
    { name: 'fix-chinese-punctuation', fn: fixChinesePunctuation },
    { name: 'fix-control-chars', fn: fixControlChars },
    { name: 'fix-trailing-commas', fn: fixTrailingCommas },
    { name: 'fix-unescaped-quotes', fn: fixUnescapedQuotes },
    { name: 'fix-all', fn: (s) => fixTrailingCommas(fixControlChars(fixChinesePunctuation(s))) },
    { name: 'fix-all-with-unescaped', fn: (s) => fixUnescapedQuotes(fixTrailingCommas(fixControlChars(fixChinesePunctuation(s)))) },
  ]

  let lastError: unknown = null
  for (const step of steps) {
    try {
      return JSON.parse(step.fn(raw))
    } catch (err) {
      lastError = err
    }
  }

  throw lastError instanceof Error
    ? new Error(`JSON parse failed after all cleanup steps: ${lastError.message}`)
    : new Error('JSON parse failed after all cleanup steps')
}

/**
 * Replace Chinese punctuation that LLMs sometimes emit inside JSON.
 * Only replaces structural punctuation, not punctuation inside string values
 * (that would corrupt content). We use a targeted approach: replace Chinese
 * colons/commas that appear as JSON structural delimiters.
 */
function fixChinesePunctuation(s: string): string {
  // Chinese colon → English colon (structural, e.g. "key"：→ "key":)
  let out = s.replace(/(["\]])\s*[:：]/g, '$1:')
  // Chinese comma between array elements or object properties
  out = out.replace(/(["\]\d])\s*[，]/g, '$1,')
  // Chinese quotes → English quotes
  out = out.replace(/\u201c/g, '"').replace(/\u201d/g, '"')
  out = out.replace(/\u2018/g, "'").replace(/\u2019/g, "'")
  return out
}

/**
 * Escape literal control characters inside JSON string values.
 * LLMs sometimes output raw newlines/tabs inside string values instead of \n/\t.
 */
function fixControlChars(s: string): string {
  // Process character by character, tracking whether we're inside a string
  let result = ''
  let inString = false
  let escaped = false

  for (let i = 0; i < s.length; i++) {
    const ch = s[i]

    if (escaped) {
      result += ch
      escaped = false
      continue
    }

    if (ch === '\\' && inString) {
      result += ch
      escaped = true
      continue
    }

    if (ch === '"') {
      inString = !inString
      result += ch
      continue
    }

    if (inString) {
      // Escape raw control characters inside string values
      if (ch === '\n') {
        result += '\\n'
        continue
      }
      if (ch === '\r') {
        result += '\\r'
        continue
      }
      if (ch === '\t') {
        result += '\\t'
        continue
      }
    }

    result += ch
  }

  return result
}

/**
 * Remove trailing commas before } and ] (common LLM mistake).
 */
function fixTrailingCommas(s: string): string {
  return s.replace(/,\s*([}\]])/g, '$1')
}

/**
 * Attempt to fix unescaped double quotes inside string values.
 * This is the hardest problem — we use a heuristic: if JSON.parse fails,
 * try to identify and escape quotes that are clearly inside string values
 * by analyzing the structure.
 *
 * Strategy: rebuild the JSON by tracking string boundaries more carefully.
 * If a string value contains an unescaped quote that breaks parsing, we try
 * to escape it by looking at context (e.g. "he said "hello"" → escape inner quotes).
 */
function fixUnescapedQuotes(s: string): string {
  // Simple heuristic: try to parse, and if it fails at a specific position,
  // attempt to escape quotes that appear to be inside string values.
  // This handles cases like: "reasoning": "分析"了"原因"
  // where the inner quotes aren't escaped.

  try {
    JSON.parse(s)
    return s // already valid
  } catch {
    // Fall through to repair logic
  }

  // Walk through and rebuild, escaping quotes that appear to be inside values
  let result = ''
  let inString = false
  let escaped = false

  for (let i = 0; i < s.length; i++) {
    const ch = s[i]

    if (escaped) {
      result += ch
      escaped = false
      continue
    }

    if (ch === '\\' && inString) {
      result += ch
      escaped = true
      continue
    }

    if (ch === '"') {
      if (!inString) {
        // Opening a string
        inString = true
        result += ch
      } else {
        // Could be closing the string or an unescaped quote inside
        // Look ahead to decide: if next non-space char is :, , }, ], or end → it's closing
        // Otherwise → it's an unescaped quote inside the value, escape it
        let j = i + 1
        while (j < s.length && /\s/.test(s[j])) j++

        const nextChar = s[j]
        const isClosing =
          nextChar === ':' ||
          nextChar === ',' ||
          nextChar === '}' ||
          nextChar === ']' ||
          nextChar === undefined

        if (isClosing) {
          inString = false
          result += ch
        } else {
          // Unescaped quote inside string — escape it
          result += '\\"'
        }
      }
    } else {
      result += ch
    }
  }

  return result
}

/**
 * Extract the JSON substring from text.
 * Tries markdown code blocks first, then raw JSON bounds.
 * If multiple code blocks exist, tries each until one parses.
 */
export function extractJsonFromText(text: string): unknown {
  // Collect all markdown code block matches
  const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)```/g
  const matches: string[] = []
  let m: RegExpExecArray | null
  while ((m = codeBlockRegex.exec(text)) !== null) {
    matches.push(m[1].trim())
  }

  // Try each code block
  for (const block of matches) {
    try {
      return tryParseJson(block)
    } catch {
      // try next block
    }
  }

  // Try raw JSON — find the outermost { ... } pair
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start !== -1 && end !== -1 && end > start) {
    const substr = text.substring(start, end + 1)
    try {
      return tryParseJson(substr)
    } catch {
      // Try to find a valid subset — progressively trim from the end
      // This handles trailing prose after the JSON
      for (let trimEnd = end; trimEnd > start + 10; trimEnd--) {
        if (text[trimEnd] !== '}') continue
        const candidate = text.substring(start, trimEnd + 1)
        try {
          return tryParseJson(candidate)
        } catch {
          // continue trimming
        }
      }
    }
  }

  // Last resort: try the full text
  try {
    return tryParseJson(text)
  } catch {
    // Collect error info for debugging
    const preview = text.substring(0, 200)
    throw new Error(
      `No valid JSON found in LLM response. Preview: ${preview}...`,
    )
  }
}

/**
 * Build a system prompt suffix that instructs the LLM to return
 * only a JSON object matching the given schema description.
 */
export function buildJsonInstruction(schemaDescription: string): string {
  return `\n\n重要：你必须返回一个合法的 JSON 对象，不要包含任何其他文本。

JSON 格式要求：
1. 所有字符串值中的双引号必须转义为 \\"（例如 "他说\\"你好\\""）
2. 所有字符串值中的换行必须转义为 \\n
3. 不要在 JSON 值中使用中文引号（""''），一律使用转义的双引号
4. 不要有尾随逗号
5. 只返回 JSON，不要包含 \`\`\`json 标记或任何解释文字

${schemaDescription}`
}
