import type { FactConflict } from '../facts/formal-fact-snapshot.js';
import type { PolicyResult } from '../policy/types.js';
import { next } from '../policy/next.js';
import type { FormalFactSnapshot } from '../facts/formal-fact-snapshot.js';
import { escapeScalar, line } from './shared.js';

function listOrNone(values: readonly string[] | undefined): string {
  return values === undefined || values.length === 0 ? 'none' : values.join(',');
}

function compareConflicts(a: FactConflict, b: FactConflict): number {
  return (
    a.dimension.localeCompare(b.dimension) ||
    a.authority.localeCompare(b.authority) ||
    a.message.localeCompare(b.message)
  );
}

export function formatPolicyResult(result: PolicyResult): string {
  const lines: string[] = [];
  switch (result.kind) {
    case 'action':
      lines.push(line('kind', 'action'), line('action', result.action));
      break;
    case 'owner-decision':
      lines.push(
        line('kind', 'owner-decision'),
        line('decision', result.decision),
        line('context-change', result.context.changeKey ?? 'none'),
        line('context-eligible-changes', listOrNone(result.context.eligibleChangeKeys)),
        line('context-full-test', result.context.deliveryFullTestStatus ?? 'none'),
        line('context-detail', result.context.detail ?? 'none'),
      );
      break;
    case 'blocked': {
      const conflicts = [...result.diagnosis.conflicts].sort(compareConflicts);
      lines.push(
        line('kind', 'blocked'),
        line('reason', result.diagnosis.reason),
        line('unmet', listOrNone(result.diagnosis.unmetPreconditions)),
        line('conflicts', conflicts.length),
      );
      conflicts.forEach((conflict, index) => {
        lines.push(
          `conflict[${index}]: dimension=${escapeScalar(conflict.dimension)}; authority=${escapeScalar(conflict.authority)}; message=${escapeScalar(conflict.message)}`,
        );
      });
      lines.push(line('owner-actions', listOrNone(result.diagnosis.suggestedOwnerActions)));
      break;
    }
  }
  return `${lines.join('\n')}\n`;
}

export function renderNext(snapshot: FormalFactSnapshot): string {
  return formatPolicyResult(next(snapshot));
}
