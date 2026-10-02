// ─── Outcome Alert Types (P0.6.5.3) ─────────────────────────────────────────
/**
 * @defgroup outcome_alert P0.6.5.3 Outcome Alerting System
 * @brief Complete alerting framework for Outcome metric monitoring
 * @details Supports:
 * - Rule-based alerting with metric threshold conditions
 * - Alert lifecycle management (open → acknowledged → resolved/suppressed)
 * - Owner-based data isolation for multi-tenant security
 * - Optimistic concurrency control for concurrent updates
 * - Fingerprint-based deduplication to prevent duplicate alerts
 * - Custom message template rendering with {{placeholder}} substitution
 */

/** @ingroup outcome_alert */ export type { OutcomeAlert } from './outcome-alert';
/** @ingroup outcome_alert */ export { OUTCOME_ALERT_STATUSES } from './outcome-alert';
/** @ingroup outcome_alert */ export type { OutcomeAlertOperator, OutcomeAlertSeverity } from './outcome-alert-rule';
/** @ingroup outcome_alert */ export { OUTCOME_ALERT_OPERATORS, OUTCOME_ALERT_SEVERITIES, validateAlertRule } from './outcome-alert-rule';
/** @ingroup outcome_alert */ export type { OutcomeAlertMetricCondition, OutcomeAlertRule } from './outcome-alert-rule';
/** @ingroup outcome_alert */ export type { OutcomeAlertMatchedCondition, OutcomeAlertEvaluation } from './outcome-alert-evaluator';
/** @ingroup outcome_alert */ export { evaluateOutcomeAgainstRule, evaluateOutcomeAgainstRules, evaluateCondition, renderAlertMessage } from './outcome-alert-evaluator';
/** @ingroup outcome_alert */ export type { OutcomeAlertService } from './outcome-alert-service';
/** @ingroup outcome_alert */ export { OutcomeAlertServiceImpl } from './outcome-alert-service';
/** @ingroup outcome_alert */ export { OutcomeAlertTransitionError, OutcomeAlertOwnerError } from './outcome-alert-service';
/** @ingroup outcome_alert */ export type { OutcomeAlertEvaluateResult, OutcomeAlertEvaluateItem, OutcomeAlertBatchResult, OutcomeAlertLifecycleResult } from './outcome-alert-service';
/** @ingroup outcome_alert */ export type { OutcomeAlertStore, OutcomeAlertListFilters } from './persistence/outcome-alert-store';
/** @ingroup outcome_alert */ export { PrismaOutcomeAlertStore } from './persistence/outcome-alert-store';