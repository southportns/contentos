/**
 * Extract JSON object from LLM text response.
 * Handles markdown code blocks and raw JSON.
 */
export function extractJsonFromText(text: string): unknown {
  // Try to find JSON block in markdown code fence
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonMatch) {
    return JSON.parse(jsonMatch[1].trim())
  }

  // Try to find raw JSON object
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start !== -1 && end !== -1) {
    return JSON.parse(text.substring(start, end + 1))
  }

  throw new Error('No JSON found in response')
}

/**
 * Build a system prompt suffix that instructs the LLM to return
 * only a JSON object matching the given schema description.
 */
export function buildJsonInstruction(schemaDescription: string): string {
  return `\n\n重要：你必须返回一个合法的 JSON 对象，不要包含任何其他文本。${schemaDescription}`
}
