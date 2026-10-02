# P0.6.5.3 Outcome Alerting System Documentation Summary

## Overview
Complete alerting framework for monitoring Outcome metric values against configurable rules. Supports alert lifecycle management, owner-based isolation, optimistic concurrency control, and customizable message templates.

## Core Components
### 1. Domain Model (`src/memory/outcome-alert.ts`)
- `OutcomeAlert` interface: Core alert entity with OCC version, fingerprint, and all metadata
- `OutcomeAlertStatus`: Lifecycle status union (open/acknowledged/resolved/suppressed)
- `validateOutcomeAlert()`: Pre-write validation for alert entities

### 2. Rule Definitions (`src/memory/outcome-alert-rule.ts`)
- `OutcomeAlertRule` interface: Alert trigger template with filter conditions, metric thresholds, and message template
- `OutcomeAlertMetricCondition`: Single metric threshold definition (metricKey, operator, threshold)
- Constants: `OutcomeAlertOperator`, `OutcomeAlertSeverity` + valid value lists
- `validateAlertRule()`: Pre-evaluation validation for rules

### 3. Evaluation Logic (`src/memory/outcome-alert-evaluator.ts`)
- `evaluateOutcomeAgainstRule()`: Pure function to evaluate a single Outcome against a single rule
- `evaluateOutcomeAgainstRules()`: Batch evaluation for multiple rules
- `evaluateCondition()`: Single metric value vs threshold comparison
- `renderAlertMessage()`: Template-based or auto-generated alert message rendering

### 4. Service Layer (`src/memory/outcome-alert-service.ts`)
- `OutcomeAlertService` interface: Complete alert lifecycle contract
- `OutcomeAlertServiceImpl` implementation:
  - Upfront rule validation on evaluation
  - Fingerprint-based deduplication
  - Owner authorization for all operations
  - State machine transitions with `VALID_TRANSITIONS` map
- Error classes: `OutcomeAlertTransitionError`, `OutcomeAlertOwnerError`

### 5. Persistence Layer (`src/memory/persistence/outcome-alert-store.ts`)
- `OutcomeAlertStore` interface: Persistence contract with owner isolation guarantees
- `PrismaOutcomeAlertStore` implementation:
  - Prisma ORM with SQLite/PostgreSQL support
  - OCC via version field on update
  - All queries include ownerId WHERE clause for security
  - `listActionable()` convenience for open/acknowledged alerts

### 6. Barrel Export (`src/memory/index.ts`)
- Doxygen `@defgroup outcome_alert` grouping for all alert-related exports
- Exposes all public APIs from sub-modules for easy consumption

## Key Design Decisions
1. **Deterministic Alert Generation**: Alerts are generated purely from rule evaluation outcome, no external factors
2. **Fingerprint Deduplication**: `base64(ruleId:outcomeId)` unique constraint prevents duplicate alerts
3. **Owner Isolation**: All queries include ownerId WHERE clause, cross-user access blocked at DB level
4. **OCC Concurrency**: Version-based updateMany for conflict detection, no locks required
5. **State Machine**: Strict lifecycle transitions (open → acknowledged → resolved/suppressed) with terminal states
6. **Template Rendering**: Optional `{{placeholder}}` substitution for custom alert messages

## Usage Example
```typescript
import { 
  OutcomeAlertServiceImpl, 
  PrismaOutcomeAlertStore,
  validateAlertRule
} from '@/memory';

// Initialize service
const store = new PrismaOutcomeAlertStore();
const service = new OutcomeAlertServiceImpl(store);

// Create and validate rule
const rule = {
  id: 'rule_123',
  name: '高错误率告警',
  enabled: true,
  severity: 'critical',
  metricConditions: [
    { metricKey: 'error_rate', operator: 'gte', threshold: 0.05 }
  ],
  messageTemplate: '错误率{{actualValue}}超过阈值{{threshold}}'
};
validateAlertRule(rule);

// Evaluate outcome
const result = await service.evaluateOutcome(outcome, [rule], 'user_123');

// Acknowledge alert
if (result.results[0].alert) {
  await service.acknowledgeAlert(result.results[0].alert.id, 'user_123', 1);
}
```

## Test Coverage (86 total tests)
- 30 unit tests: Evaluation logic, message rendering, rule validation
- 22 unit tests: Service lifecycle, error handling, state transitions
- 7 DB integration tests: Real SQLite CRUD, OCC, owner isolation, deduplication
- 12 DB tests: Memory persistence regression
- 15 other: Alert-related integration tests

## Network & Compatibility
- Pure TypeScript, no platform-specific dependencies
- Supports Node.js and browser environments
- Works with SQLite (development) and PostgreSQL (production)
- 86/86 tests pass, lint clean, 0 new TypeScript errors

---
*Last updated: 2026-10-02*