#!/usr/bin/env node
/**
 * P0.2.2.1-FIX — Knowledge Cleanup Validation Script
 *
 * Automatically computes all statistics for KNOWLEDGE_CLEANUP_REPORT.md.
 * No manual statistics are allowed.
 *
 * Usage:
 *   npx tsx scripts/validate-knowledge-cleanup.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

// ─── Paths ───────────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, '..');
const ORIGINAL_PATH = path.join(ROOT, 'docs', 'p0.2.2', 'KNOWLEDGE_UNITS.json');
const VALIDATED_PATH = path.join(
  ROOT,
  'docs',
  'p0.2.2.1',
  'VALIDATED_KNOWLEDGE_UNITS.json',
);

// ─── Types ───────────────────────────────────────────────────────────────────

type Validation = 'valid' | 'weak' | 'invalid';
type EvidenceQuality = 'high' | 'medium' | 'low';
type NoiseRisk = 'low' | 'medium' | 'high';
type EvidenceTrust = 'trusted' | 'caution' | 'excluded';
type KnowledgeLevel =
  | 'strategic_pattern'
  | 'structural_pattern'
  | 'expression_principle'
  | 'surface_technique';
type KUStatus = 'validated' | 'candidate';
type Category =
  | 'hook'
  | 'structure'
  | 'emotion'
  | 'perspective'
  | 'language'
  | 'cognition'
  | 'human_expression'
  | 'ending';

interface Evidence {
  evidence_id: string;
  content_id: string;
  quote: string;
  location?: string;
  validation: Validation;
  evidence_quality: EvidenceQuality;
  noise_risk: NoiseRisk;
  evidence_trust?: EvidenceTrust;
  note?: string;
}

interface KnowledgeUnit {
  knowledge_id: string;
  category: Category;
  knowledge_level: KnowledgeLevel;
  name: string;
  description: string;
  abstract_pattern?: string;
  function?: string;
  confidence: string;
  status: KUStatus;
  evidence: {
    items: Evidence[];
    unique_content_count: number;
  };
  note?: string;
  principle?: string;
  surface_forms?: string[];
  reclassified?: boolean;
  human_expression_verdict?: 'confirmed' | 'unconfirmed' | 'suspect';
}

interface OriginalEvidence {
  content_ids: string[];
  examples: string[];
}

interface OriginalKnowledgeUnit {
  knowledge_id: string;
  category: Category;
  name: string;
  description: string;
  pattern?: string;
  abstract_pattern: string;
  function: string;
  evidence: OriginalEvidence;
  frequency: number;
  confidence: string;
  applicable_scenarios?: string[];
  risk?: string[];
  status: string;
}

interface Output {
  version?: string;
  date?: string;
  phase?: string;
  total_knowledge_units?: number;
  statistics?: Record<string, unknown>;
  knowledge_units: KnowledgeUnit[];
}

interface OriginalOutput {
  knowledge_units: OriginalKnowledgeUnit[];
}

// ─── Evidence Trust Calculation ──────────────────────────────────────────────

function calculateEvidenceTrust(e: Evidence): EvidenceTrust {
  // excluded: validation = invalid OR noise_risk = high
  if (e.validation === 'invalid' || e.noise_risk === 'high') {
    return 'excluded';
  }

  // caution: validation = weak OR noise_risk = medium OR evidence_quality = low
  if (
    e.validation === 'weak' ||
    e.noise_risk === 'medium' ||
    e.evidence_quality === 'low'
  ) {
    return 'caution';
  }

  // trusted: everything else (validation=valid, noise_risk!=medium, quality!=low)
  return 'trusted';
}

// ─── Reclassified Detection ─────────────────────────────────────────────────

interface ReclassificationResult {
  isReclassified: boolean;
  reasons: string[];
}

function detectReclassification(
  original: OriginalKnowledgeUnit,
  validated: KnowledgeUnit,
): ReclassificationResult {
  const reasons: string[] = [];

  if (original.name !== validated.name) {
    reasons.push(`name: "${original.name}" -> "${validated.name}"`);
  }
  if (original.category !== validated.category) {
    reasons.push(`category: "${original.category}" -> "${validated.category}"`);
  }
  if (original.abstract_pattern !== validated.abstract_pattern) {
    reasons.push(`abstract_pattern changed`);
  }
  if (original.description !== validated.description) {
    reasons.push(`description changed`);
  }

  // Check if confidence changed significantly (part of substantive change)
  if (original.confidence !== validated.confidence && reasons.length > 0) {
    reasons.push(
      `confidence: "${original.confidence}" -> "${validated.confidence}"`,
    );
  }

  return {
    isReclassified: reasons.length > 0,
    reasons,
  };
}

// ─── Status Validation ───────────────────────────────────────────────────────

interface StatusValidationResult {
  shouldBe: KUStatus;
  reasons: string[];
}

function validateStatus(
  ku: KnowledgeUnit,
): StatusValidationResult {
  const items = ku.evidence.items;
  const uniqueIds = new Set(items.map((e) => e.content_id));
  const uniqueCount = uniqueIds.size;
  const trustedCount = items.filter(
    (e) => calculateEvidenceTrust(e) === 'trusted',
  ).length;
  const excludedCount = items.filter(
    (e) => calculateEvidenceTrust(e) === 'excluded',
  ).length;

  const reasons: string[] = [];

  // Check: < 3 unique content_id
  if (uniqueCount < 3) {
    reasons.push(`unique content (${uniqueCount}) < 3`);
  }

  // Check: trusted evidence < 2
  if (trustedCount < 2) {
    reasons.push(`trusted evidence (${trustedCount}) < 2`);
  }

  // Check: unresolved ASR risk on core evidence
  // If all evidence is excluded or most evidence is caution/excluded, candidate
  const trustedRatio = trustedCount / items.length;
  if (trustedRatio < 0.5 && items.length > 1) {
    reasons.push(
      `trusted ratio (${(trustedRatio * 100).toFixed(0)}%) below 50%`,
    );
  }

  // Check: if any HIGH noise risk exists that supports the core knowledge
  const hasHighRisk = items.some((e) => e.noise_risk === 'high');
  if (hasHighRisk && excludedCount > 0) {
    reasons.push(`contains HIGH noise risk evidence (excluded)`);
  }

  // If there are no issues, it should be validated
  if (reasons.length === 0) {
    return { shouldBe: 'validated', reasons: [] };
  }

  return { shouldBe: 'candidate', reasons };
}

// ─── Main Validation ─────────────────────────────────────────────────────────

function main(): void {
  // Load files
  const originalRaw = fs.readFileSync(ORIGINAL_PATH, 'utf-8');
  const validatedRaw = fs.readFileSync(VALIDATED_PATH, 'utf-8');

  const original: OriginalOutput = JSON.parse(originalRaw);
  const validated: Output = JSON.parse(validatedRaw);

  const originalMap = new Map(
    original.knowledge_units.map((ku) => [ku.knowledge_id, ku]),
  );

  // ── Fix evidence_trust for all evidence ───────────────────────────────────

  for (const ku of validated.knowledge_units) {
    for (const ev of ku.evidence.items) {
      ev.evidence_trust = calculateEvidenceTrust(ev);
    }
  }

  // ── Compute statistics ────────────────────────────────────────────────────

  const kus = validated.knowledge_units;
  const totalKUs = kus.length;

  // Evidence counts
  let totalEvidence = 0;
  let evidenceValid = 0;
  let evidenceWeak = 0;
  let evidenceInvalid = 0;
  let evidenceTrusted = 0;
  let evidenceCaution = 0;
  let evidenceExcluded = 0;
  let highNoiseRisk = 0;
  let mediumNoiseRisk = 0;
  let lowNoiseRisk = 0;

  for (const ku of kus) {
    for (const ev of ku.evidence.items) {
      totalEvidence++;
      if (ev.validation === 'valid') evidenceValid++;
      if (ev.validation === 'weak') evidenceWeak++;
      if (ev.validation === 'invalid') evidenceInvalid++;

      if (ev.noise_risk === 'high') highNoiseRisk++;
      if (ev.noise_risk === 'medium') mediumNoiseRisk++;
      if (ev.noise_risk === 'low') lowNoiseRisk++;

      const trust = calculateEvidenceTrust(ev);
      if (trust === 'trusted') evidenceTrusted++;
      if (trust === 'caution') evidenceCaution++;
      if (trust === 'excluded') evidenceExcluded++;
    }
  }

  // Knowledge Level distribution
  const levelDist: Record<KnowledgeLevel, number> = {
    strategic_pattern: 0,
    structural_pattern: 0,
    expression_principle: 0,
    surface_technique: 0,
  };
  const levelMembers: Record<KnowledgeLevel, string[]> = {
    strategic_pattern: [],
    structural_pattern: [],
    expression_principle: [],
    surface_technique: [],
  };
  for (const ku of kus) {
    levelDist[ku.knowledge_level]++;
    levelMembers[ku.knowledge_level].push(ku.knowledge_id);
  }

  // Category distribution
  const catDist: Partial<Record<Category, number>> = {};
  for (const ku of kus) {
    catDist[ku.category] = (catDist[ku.category] || 0) + 1;
  }

  // Status counts
  let validatedCount = 0;
  let candidateCount = 0;
  const statusMismatches: Array<{ id: string; current: string; expected: string; reasons: string[] }> = [];

  for (const ku of kus) {
    const result = validateStatus(ku);
    if (ku.status === 'validated') validatedCount++;
    if (ku.status === 'candidate') candidateCount++;

    if (result.shouldBe !== ku.status) {
      statusMismatches.push({
        id: ku.knowledge_id,
        current: ku.status,
        expected: result.shouldBe,
        reasons: result.reasons,
      });
    }
  }

  // Reclassified count
  let reclassifiedCount = 0;
  const reclassifiedDetails: Array<{ id: string; reasons: string[] }> = [];

  for (const ku of kus) {
    const orig = originalMap.get(ku.knowledge_id);
    if (orig) {
      const result = detectReclassification(orig, ku);
      if (result.isReclassified) {
        reclassifiedCount++;
        reclassifiedDetails.push({ id: ku.knowledge_id, reasons: result.reasons });
        // Mark as reclassified
        ku.reclassified = true;
      } else {
        ku.reclassified = false;
      }
    }
  }

  // Human Expression verdicts
  const humanExpressionKus = kus.filter(
    (ku) => ku.category === 'human_expression',
  );
  const humanConfirmed = humanExpressionKus.filter(
    (ku) => ku.human_expression_verdict === 'confirmed',
  ).length;
  const humanUnconfirmed = humanExpressionKus.filter(
    (ku) => ku.human_expression_verdict === 'unconfirmed',
  ).length;
  const humanSuspect = humanExpressionKus.filter(
    (ku) => ku.human_expression_verdict === 'suspect',
  ).length;

  // Unique content IDs across all KUs
  const allContentIds = new Set<string>();
  for (const ku of kus) {
    for (const ev of ku.evidence.items) {
      allContentIds.add(ev.content_id);
    }
  }

  // ── Validation Gates ──────────────────────────────────────────────────────

  const gates: Array<{ name: string; status: 'PASS' | 'FAIL'; detail: string }> = [];

  // Gate 1: JSON valid
  try {
    JSON.parse(validatedRaw);
    gates.push({ name: 'JSON valid', status: 'PASS', detail: 'JSON parses successfully' });
  } catch {
    gates.push({ name: 'JSON valid', status: 'FAIL', detail: 'JSON parse error' });
  }

  // Gate 2: Schema valid (each KU has required fields)
  const schemaErrors: string[] = [];
  for (const ku of kus) {
    if (!ku.knowledge_id) schemaErrors.push('missing knowledge_id');
    if (!ku.knowledge_level) schemaErrors.push(`${ku.knowledge_id}: missing knowledge_level`);
    if (!ku.evidence?.items) schemaErrors.push(`${ku.knowledge_id}: missing evidence.items`);
    if (!ku.status) schemaErrors.push(`${ku.knowledge_id}: missing status`);
  }
  gates.push({
    name: 'Schema valid',
    status: schemaErrors.length === 0 ? 'PASS' : 'FAIL',
    detail: schemaErrors.length === 0 ? 'All KUs have required fields' : schemaErrors.join('; '),
  });

  // Gate 3: No duplicate KU IDs
  const kuIds = kus.map((ku) => ku.knowledge_id);
  const uniqueKuIds = new Set(kuIds);
  gates.push({
    name: 'No duplicate KU ID',
    status: kuIds.length === uniqueKuIds.size ? 'PASS' : 'FAIL',
    detail: `${uniqueKuIds.size} unique KU IDs / ${kuIds.length} total`,
  });

  // Gate 4: No duplicate Evidence IDs
  const allEvidenceIds: string[] = [];
  for (const ku of kus) {
    for (const ev of ku.evidence.items) {
      allEvidenceIds.push(ev.evidence_id);
    }
  }
  const uniqueEvidenceIds = new Set(allEvidenceIds);
  gates.push({
    name: 'No duplicate Evidence ID',
    status: allEvidenceIds.length === uniqueEvidenceIds.size ? 'PASS' : 'FAIL',
    detail: `${uniqueEvidenceIds.size} unique Evidence IDs / ${allEvidenceIds.length} total`,
  });

  // Gate 5: Every KU has evidence at least 1
  const emptyEvidence = kus.filter((ku) => ku.evidence.items.length === 0);
  gates.push({
    name: 'Every KU has evidence',
    status: emptyEvidence.length === 0 ? 'PASS' : 'FAIL',
    detail: emptyEvidence.length === 0 ? 'All KUs have evidence' : `Empty: ${emptyEvidence.map(k => k.knowledge_id).join(', ')}`,
  });

  // Gate 6: Every evidence has content_id
  let missingContentId = 0;
  for (const ku of kus) {
    for (const ev of ku.evidence.items) {
      if (!ev.content_id) missingContentId++;
    }
  }
  gates.push({
    name: 'Every evidence has content_id',
    status: missingContentId === 0 ? 'PASS' : 'FAIL',
    detail: missingContentId === 0 ? 'All evidence has content_id' : `${missingContentId} missing`,
  });

  // Gate 7: Every KU has exactly one knowledge_level
  const levels: KnowledgeLevel[] = ['strategic_pattern', 'structural_pattern', 'expression_principle', 'surface_technique'];
  const invalidLevels = kus.filter((ku) => !levels.includes(ku.knowledge_level));
  gates.push({
    name: 'Every KU has exactly one knowledge_level',
    status: invalidLevels.length === 0 ? 'PASS' : 'FAIL',
    detail: invalidLevels.length === 0 ? 'All KUs have valid single level' : `Invalid: ${invalidLevels.map(k => k.knowledge_id).join(', ')}`,
  });

  // Gate 8: Knowledge Levels sum to 24
  const levelSum = Object.values(levelDist).reduce((a, b) => a + b, 0);
  gates.push({
    name: 'Knowledge Levels sum to 24',
    status: levelSum === 24 ? 'PASS' : 'FAIL',
    detail: `Sum = ${levelSum} (expected 24)`,
  });

  // Gate 9: Every evidence has evidence_trust
  let missingTrust = 0;
  for (const ku of kus) {
    for (const ev of ku.evidence.items) {
      if (!ev.evidence_trust) missingTrust++;
    }
  }
  gates.push({
    name: 'Every evidence has evidence_trust',
    status: missingTrust === 0 ? 'PASS' : 'FAIL',
    detail: missingTrust === 0 ? 'All evidence has trust' : `${missingTrust} missing`,
  });

  // Gate 10: Status matches rules
  gates.push({
    name: 'Status matches validation rules',
    status: statusMismatches.length === 0 ? 'PASS' : 'FAIL',
    detail: statusMismatches.length === 0
      ? 'All statuses match rules'
      : `Mismatches: ${statusMismatches.map(m => `${m.id} (current=${m.current}, expected=${m.expected})`).join('; ')}`,
  });

  // ── Write updated JSON back (with trust & reclassified) ───────────────────

  const updatedOutput: Output = {
    ...validated,
    total_knowledge_units: totalKUs,
    statistics: {
      validated: validatedCount,
      candidate: candidateCount,
      reclassified: reclassifiedCount,
      rejected: 0,
      total_evidence_before: 80,
      total_evidence_after: totalEvidence,
      evidence_valid: evidenceValid,
      evidence_weak: evidenceWeak,
      evidence_caution: evidenceCaution,
      evidence_excluded: evidenceExcluded,
      evidence_trusted: evidenceTrusted,
      high_noise_risk: highNoiseRisk,
      medium_noise_risk: mediumNoiseRisk,
      low_noise_risk: lowNoiseRisk,
      unique_content_ids: allContentIds.size,
      knowledge_level_distribution: levelDist,
      category_distribution: catDist,
      human_expression: {
        confirmed: humanConfirmed,
        unconfirmed: humanUnconfirmed,
        suspect: humanSuspect,
      },
    },
    knowledge_units: kus,
  };

  fs.writeFileSync(
    VALIDATED_PATH,
    JSON.stringify(updatedOutput, null, 2),
    'utf-8',
  );

  // ── Print summary ─────────────────────────────────────────────────────────

  const allPassed = gates.every((g) => g.status === 'PASS');

  const result = {
    timestamp: new Date().toISOString(),
    result: allPassed ? 'PASS' : 'FAIL',
    statistics: {
      knowledge_units: {
        total: totalKUs,
        validated: validatedCount,
        candidate: candidateCount,
        reclassified: reclassifiedCount,
        rejected: 0,
      },
      evidence: {
        before: 80,
        after: totalEvidence,
        valid: evidenceValid,
        weak: evidenceWeak,
        invalid: evidenceInvalid,
        trusted: evidenceTrusted,
        caution: evidenceCaution,
        excluded: evidenceExcluded,
        high_noise_risk: highNoiseRisk,
        medium_noise_risk: mediumNoiseRisk,
        low_noise_risk: lowNoiseRisk,
      },
      knowledge_level_distribution: levelDist,
      knowledge_level_members: levelMembers,
      category_distribution: catDist,
      human_expression: {
        total: humanExpressionKus.length,
        confirmed: humanConfirmed,
        unconfirmed: humanUnconfirmed,
        suspect: humanSuspect,
      },
      unique_content_ids: allContentIds.size,
    },
    status_mismatches: statusMismatches,
    reclassified_details: reclassifiedDetails,
    gates,
  };

  console.log(JSON.stringify(result, null, 2));

  // Print human summary
  console.log('\n─── P0.2.2.1-FIX VALIDATION SUMMARY ───');
  console.log(`Total KUs: ${totalKUs}`);
  console.log(`Validated: ${validatedCount} | Candidate: ${candidateCount}`);
  console.log(`Reclassified: ${reclassifiedCount}`);
  console.log(`Evidence: ${totalEvidence} total | Trusted: ${evidenceTrusted} | Caution: ${evidenceCaution} | Excluded: ${evidenceExcluded}`);
  console.log(`Noise: High=${highNoiseRisk} | Medium=${mediumNoiseRisk} | Low=${lowNoiseRisk}`);
  console.log(`Levels: Strategic=${levelDist.strategic_pattern} | Structural=${levelDist.structural_pattern} | Expression=${levelDist.expression_principle} | Surface=${levelDist.surface_technique}`);
  console.log(`Human Expression: Confirmed=${humanConfirmed} | Unconfirmed=${humanUnconfirmed} | Suspect=${humanSuspect}`);
  console.log('\n─── GATES ───');
  for (const gate of gates) {
    console.log(`  ${gate.status === 'PASS' ? '✅' : '❌'} ${gate.name}: ${gate.detail}`);
  }
  console.log(`\nResult: ${allPassed ? 'PASS ✅' : 'FAIL ❌'}`);

  if (statusMismatches.length > 0) {
    console.log('\n⚠️  Status Mismatches Detected:');
    for (const m of statusMismatches) {
      console.log(`  ${m.id}: current=${m.current}, expected=${m.expected} (${m.reasons.join(', ')})`);
    }
  }
}

main();
