import { z } from 'zod'

export const distillationInputSchema = z.object({
  archives: z.array(
    z.object({
      topic: z.string(),
      platform: z.string().optional(),
      finalTitle: z.string(),
      finalContent: z.string(),
      finalHook: z.string().optional(),
      selectedAngleTitle: z.string().optional(),
      strategyTone: z.string().optional(),
      wordCount: z.number().optional(),
      refineChanges: z.array(
        z.object({
          type: z.string().optional(),
          original: z.string().optional(),
          revised: z.string().optional(),
          reason: z.string().optional(),
        }),
      ).optional(),
    }),
  ),
})

export const distillationOutputSchema = z.object({
  toneProfile: z.object({
    formality: z.number().min(0).max(100),
    energy: z.number().min(0).max(100),
    humor: z.number().min(0).max(100),
    directness: z.number().min(0).max(100),
    warmth: z.number().min(0).max(100),
    description: z.string(),
  }),
  personality: z.array(z.string()),
  languagePatterns: z.object({
    sentenceRhythm: z.string(),
    vocabularyTendency: z.string(),
    catchphrases: z.array(z.string()),
    openingStyle: z.string(),
    closingStyle: z.string(),
  }),
  preferredTopics: z.array(z.string()),
  preferredStructures: z.array(
    z.object({
      structure: z.string(),
      frequency: z.string(),
    }),
  ),
  hookStyles: z.array(z.string()),
  emotionalTendencies: z.object({
    primary: z.string(),
    secondary: z.string(),
    intensity: z.number().min(0).max(100),
  }),
  summary: z.string(),
})

export type DistillationInput = z.infer<typeof distillationInputSchema>
export type DistillationOutput = z.infer<typeof distillationOutputSchema>
