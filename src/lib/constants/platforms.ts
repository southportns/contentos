/** Supported content publishing platforms */
export const PLATFORMS = [
  '抖音短视频',
  '小红书',
  '公众号',
] as const

export type Platform = (typeof PLATFORMS)[number]
