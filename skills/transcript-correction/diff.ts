/**
 * Diff Computation for Transcript Correction
 *
 * 通过逐行对比原始文本和纠错后文本，计算纠错详情列表。
 * 使用简单的逐行比较策略，避免引入重型 diff 库。
 *
 * 架构位置: Skill Layer（transcript-correction 的内部工具）
 */

import type { TranscriptCorrection } from '@/modules/transcript/domain/transcript.types'

/**
 * 计算原始文本和纠错后文本之间的差异。
 *
 * 策略：
 *  1. 将两个文本按行分割
 *  2. 逐行比较，如果行不同则记录一条纠错
 *  3. 如果行数不同（LLM 增删了行），使用 LCS 对齐算法
 *
 * @param originalText 原始 ASR 文本
 * @param correctedText LLM 纠错后文本
 * @returns 纠错详情列表
 */
export function computeCorrections(
  originalText: string,
  correctedText: string,
): TranscriptCorrection[] {
  // 快速路径：文本完全相同，无纠错
  if (originalText.trim() === correctedText.trim()) {
    return []
  }

  const originalLines = originalText.split('\n').filter((l) => l.trim())
  const correctedLines = correctedText.split('\n').filter((l) => l.trim())

  // 行数相同：逐行比较
  if (originalLines.length === correctedLines.length) {
    return diffLineByLine(originalLines, correctedLines)
  }

  // 行数不同：使用 LCS 对齐后逐行比较
  const { alignedOriginal, alignedCorrected } = lcsAlign(
    originalLines,
    correctedLines,
  )
  return diffLineByLine(alignedOriginal, alignedCorrected)
}

/**
 * 逐行比较，生成纠错列表。
 * 使用 undefined 表示缺失的行（LCS 对齐后可能产生）。
 */
function diffLineByLine(
  originalLines: (string | undefined)[],
  correctedLines: (string | undefined)[],
): TranscriptCorrection[] {
  const corrections: TranscriptCorrection[] = []

  const maxLen = Math.max(originalLines.length, correctedLines.length)
  for (let i = 0; i < maxLen; i++) {
    const orig = originalLines[i]
    const corr = correctedLines[i]

    // 两行都缺失（不应发生但防御性处理）
    if (orig === undefined && corr === undefined) continue

    // 原始行缺失 → LLM 新增了行（保守原则：不记录为纠错）
    if (orig === undefined && corr !== undefined) continue

    // 纠错行缺失 → LLM 删除了行（保守原则：不记录为纠错）
    if (orig !== undefined && corr === undefined) continue

    // 两行都有但不同
    if (orig !== undefined && corr !== undefined && orig !== corr) {
      corrections.push({
        original: orig,
        corrected: corr,
        reason: inferCorrectionReason(orig, corr),
      })
    }
  }

  return corrections
}

/**
 * 使用 LCS（最长公共子序列）算法对齐两个行数组。
 * 对齐后的数组长度相同，用 undefined 填充缺失行。
 */
function lcsAlign(
  a: string[],
  b: string[],
): {
  alignedOriginal: (string | undefined)[]
  alignedCorrected: (string | undefined)[]
} {
  const m = a.length
  const n = b.length

  // 构建 LCS 表
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0),
  )
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  // 回溯构建对齐结果
  const alignedA: (string | undefined)[] = []
  const alignedB: (string | undefined)[] = []
  let i = m
  let j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      alignedA.unshift(a[i - 1])
      alignedB.unshift(b[j - 1])
      i--
      j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      alignedA.unshift(undefined)
      alignedB.unshift(b[j - 1])
      j--
    } else {
      alignedA.unshift(a[i - 1])
      alignedB.unshift(undefined)
      i--
    }
  }

  return { alignedOriginal: alignedA, alignedCorrected: alignedB }
}

/**
 * 推断纠错原因（简单启发式）。
 */
function inferCorrectionReason(original: string, corrected: string): string {
  // 检测同音/近音词
  if (hasSimilarPronunciation(original, corrected)) {
    return '同音/近音词纠错'
  }

  // 检测专有名词修正（包含英文/品牌名）
  if (/[A-Za-z]/.test(corrected) && !/[A-Za-z]/.test(original)) {
    return '专有名词/英文修正'
  }

  // 检测标点修正
  if (original.replace(/[，。！？、；：]/g, '') === corrected.replace(/[，。！？、；：]/g, '')) {
    return '标点符号修正'
  }

  // 默认
  return '语义纠错'
}

/**
 * 简单判断两行是否可能是同音/近音词混淆。
 * 如果两行长度相近且大部分字符相同，很可能是同音词替换。
 */
function hasSimilarPronunciation(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 2) return false
  let diffCount = 0
  const minLen = Math.min(a.length, b.length)
  for (let i = 0; i < minLen; i++) {
    if (a[i] !== b[i]) diffCount++
  }
  // 差异字符数 <= 行长的 30% 且 > 0
  return diffCount > 0 && diffCount <= Math.max(1, Math.floor(minLen * 0.3))
}
