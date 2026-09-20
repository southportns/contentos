/*
 * P0.4.1 — Draft Version History Pure Helpers
 *
 * Pure functions for version label determination and badge styling.
 * Separated from the React component for testability.
 */

/**
 * Determine the display label for a draft version.
 * - FINAL status → "FINAL"
 * - HUMANIZED status → "HUMANIZED"
 * - Version 1 → "ORIGINAL"
 * - Everything else → "DRAFT"
 */
export function getVersionLabel(version: number, status: string): string {
  if (status === 'FINAL') return 'FINAL'
  if (status === 'HUMANIZED') return 'HUMANIZED'
  if (version === 1) return 'ORIGINAL'
  return 'DRAFT'
}

/**
 * Determine the Badge variant based on draft status.
 * - FINAL → "default" (solid)
 * - HUMANIZED → "secondary"
 * - Everything else → "outline"
 */
export function getVersionBadgeVariant(status: string): 'default' | 'secondary' | 'outline' {
  if (status === 'FINAL') return 'default'
  if (status === 'HUMANIZED') return 'secondary'
  return 'outline'
}
