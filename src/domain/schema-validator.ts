/**
 * B1 domain-and-state-schema: schema validation.
 *
 * Custom TypeScript type guards and runtime validators. No external runtime
 * dependency (Zod, JSON Schema) — per A1's no-runtime-dependency principle.
 *
 * Unknown main states are rejected. In particular `in-progress` is rejected as
 * a Run status (B1-RE-005); it belongs only to ExecutionStatus.
 */

import { FlowkitError } from '../shared/errors.js';
import { isFormalAction, isRoleAllowedForAction } from './actions.js';
import type {
  ChangeState,
  DeliveryState,
  ExecutionStatus,
  ResultRef,
  Run,
  RunStatus,
} from './types.js';

// ---------------------------------------------------------------------------
// Frozen value sets
// ---------------------------------------------------------------------------

const DELIVERY_STATES: readonly DeliveryState[] = [
  'active',
  'completed',
  'cancelled',
];

const CHANGE_STATES: readonly ChangeState[] = [
  'planned',
  'active',
  'completed',
  'cancelled',
];

const RUN_STATUSES: readonly RunStatus[] = [
  'pending',
  'completed',
  'failed',
  'cancelled',
];

const EXECUTION_STATUSES: readonly ExecutionStatus[] = [
  'in-progress',
  'completed',
  'failed',
  'blocked',
];

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

/**
 * Returns `true` when `value` is a recognized `DeliveryState`.
 */
export function isDeliveryState(value: unknown): value is DeliveryState {
  return typeof value === 'string' && (DELIVERY_STATES as readonly string[]).includes(value);
}

/**
 * Returns `true` when `value` is a recognized `ChangeState`.
 */
export function isChangeState(value: unknown): value is ChangeState {
  return typeof value === 'string' && (CHANGE_STATES as readonly string[]).includes(value);
}

/**
 * Returns `true` when `value` is a recognized `RunStatus`.
 * Note: `in-progress` is NOT a RunStatus and returns `false`.
 */
export function isRunStatus(value: unknown): value is RunStatus {
  return typeof value === 'string' && (RUN_STATUSES as readonly string[]).includes(value);
}

/**
 * Returns `true` when `value` is a recognized `ExecutionStatus`.
 */
export function isExecutionStatus(value: unknown): value is ExecutionStatus {
  return typeof value === 'string' && (EXECUTION_STATUSES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Rejection helper
// ---------------------------------------------------------------------------

/**
 * Reject an unknown state value by throwing a `FlowkitError`.
 *
 * @throws {FlowkitError} `UNKNOWN_STATE` always — this function never returns.
 */
export function rejectUnknownState(value: string, allowed: readonly string[]): never {
  throw new FlowkitError('UNKNOWN_STATE', `Unknown state: ${value}`, {
    value,
    allowed,
  });
}

// ---------------------------------------------------------------------------
// Object validators
// ---------------------------------------------------------------------------

/**
 * Required string field check on a record.
 */
function requireString(
  obj: Record<string, unknown>,
  field: string,
): string {
  const v = obj[field];
  if (typeof v !== 'string') {
    throw new FlowkitError('SCHEMA_VALIDATION_FAILED', `Field ${field} must be a string`, {
      field,
    });
  }
  return v;
}

/**
 * Validate an unknown value as a {@link ResultRef}.
 *
 * @throws {FlowkitError} `SCHEMA_VALIDATION_FAILED` when a required field is
 *   missing or has the wrong type.
 */
function validateResultRef(value: unknown): ResultRef {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new FlowkitError('SCHEMA_VALIDATION_FAILED', 'ResultRef must be an object', {
      value,
    });
  }
  const obj = value as Record<string, unknown>;
  const ref: ResultRef = {
    ref: requireString(obj, 'ref'),
    versionFingerprint: requireString(obj, 'versionFingerprint'),
    ...(obj['kind'] !== undefined && { kind: requireString(obj, 'kind') }),
  };
  return ref;
}

/**
 * Validate an unknown value as a {@link Run}.
 *
 * @throws {FlowkitError} `SCHEMA_VALIDATION_FAILED` when a required field is
 *   missing or has the wrong type.
 * @throws {FlowkitError} `UNKNOWN_STATE` when `status` is not a recognized
 *   RunStatus (in particular, `in-progress` is rejected — B1-RE-005).
 * @throws {FlowkitError} `UNKNOWN_ACTION` when `action` is not a recognized
 *   formal Action.
 */
export function validateRun(value: unknown): Run {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new FlowkitError('SCHEMA_VALIDATION_FAILED', 'Run must be an object', {
      value,
    });
  }
  const obj = value as Record<string, unknown>;

  const runId = requireString(obj, 'runId');
  const deliveryId = requireString(obj, 'deliveryId');
  const action = requireString(obj, 'action');
  const role = requireString(obj, 'role');
  const statusRaw = obj['status'];

  if (!isRunStatus(statusRaw)) {
    rejectUnknownState(
      typeof statusRaw === 'string' ? statusRaw : String(statusRaw),
      [...RUN_STATUSES],
    );
  }
  const status: RunStatus = statusRaw;

  if (role !== 'owner' && role !== 'author' && role !== 'reviewer') {
    throw new FlowkitError('SCHEMA_VALIDATION_FAILED', `Field role must be owner|author|reviewer: ${role}`, {
      role,
    });
  }

  if (!isFormalAction(action)) {
    throw new FlowkitError('UNKNOWN_ACTION', `Unknown action: ${action}`, {
      action,
    });
  }
  if (!isRoleAllowedForAction(action, role)) {
    throw new FlowkitError('SCHEMA_VALIDATION_FAILED', `Action ${action} has invalid role ${role}`, {
      action,
      role,
    });
  }

  const semanticInputFingerprintRaw = obj['semanticInputFingerprint'];
  let semanticInputFingerprint: string | undefined;
  if (semanticInputFingerprintRaw !== undefined) {
    if (
      typeof semanticInputFingerprintRaw !== 'string' ||
      !/^[0-9a-f]{64}$/.test(semanticInputFingerprintRaw)
    ) {
      throw new FlowkitError(
        'SCHEMA_VALIDATION_FAILED',
        'semanticInputFingerprint must be a lowercase SHA-256 hex string',
        { semanticInputFingerprint: semanticInputFingerprintRaw },
      );
    }
    semanticInputFingerprint = semanticInputFingerprintRaw;
  }

  const changeId = requireString(obj, 'changeId');
  const inputRef =
    obj['inputRef'] === undefined ? undefined : validateResultRef(obj['inputRef']);

  return {
    runId,
    deliveryId,
    changeId,
    action,
    role,
    status,
    ...(semanticInputFingerprint !== undefined && { semanticInputFingerprint }),
    inputRef,
  };
}
