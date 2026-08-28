# Style Distillation Skill

> 分析用户过往终稿，蒸馏写作风格画像

## 输入

- `archives`: 用户终稿列表，每条包含 topic、finalContent、finalHook、refineChanges 等

## 输出

- `toneProfile`: 语调特征（formality/energy/humor/directness/warmth + description）
- `personality`: 性格标签数组
- `languagePatterns`: 语言模式（sentenceRhythm/vocabularyTendency/catchphrases/openingStyle/closingStyle）
- `preferredTopics`: 偏好主题方向
- `preferredStructures`: 偏好内容结构 + 出现频率
- `hookStyles`: 偏好钩子风格
- `emotionalTendencies`: 情绪倾向（primary/secondary/intensity）
- `summary`: 200-300 字综合风格描述

## 调用方

- API: `/api/analysis/distill-style`
- 触发时机：用户累积终稿后手动触发，或每次保存终稿后自动检查是否需要更新

## 依赖

- AI Model（通过 `getModel()` 获取）
- 用户终稿数据（来自 `UserContentArchive` 表）
