import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseYaml } from '../../../src/facts/yaml-parser.js';
import { DeliveryManifestDocument } from '../../../src/persistence/delivery-manifest-document.js';
import { FlowkitError } from '../../../src/shared/errors.js';

const manifest = [
  'id: D1',
  'delivery:',
  '  state: active',
  '  fullTestStatus: not-ready',
  'changes:',
  '  - key: A1',
  '    id: change-a',
  '    goal: "A"',
  '    required: true',
  '    dependsOn: []',
  '    state: active',
  '    architectureImpact: false',
  '    outputs: []',
  '',
].join('\n');

describe('DeliveryManifestDocument line-ending compatibility', () => {
  it('normalizes pure CRLF to canonical LF', () => {
    const doc = DeliveryManifestDocument.parse(manifest.replace(/\n/g, '\r\n'));
    assert.equal(doc.toString(), manifest);
    assert.equal(doc.toString().includes('\r'), false);
  });

  it('rejects mixed LF/CRLF and bare carriage returns', () => {
    const mixed = manifest.replace('\n', '\r\n');
    assert.throws(
      () => DeliveryManifestDocument.parse(mixed),
      (error: unknown) => error instanceof FlowkitError && error.code === 'MANIFEST_UNSUPPORTED_SHAPE',
    );
    assert.throws(
      () => DeliveryManifestDocument.parse(manifest.replace('id: D1', 'id: D1\r')),
      (error: unknown) => error instanceof FlowkitError && error.code === 'MANIFEST_UNSUPPORTED_SHAPE',
    );
  });
});


const fullTestManifest = [
  'id: D1',
  'delivery:',
  '  state: active',
  '  fullTestStatus: authorized',
  'changes:',
  '  - key: A1',
  '    id: change-a',
  '    goal: "A"',
  '    required: true',
  '    dependsOn: []',
  '    state: completed',
  '    architectureImpact: false',
  '    outputs: []',
  'verification:',
  '  fullTest:',
  '    requiresOwnerAuthorization: true',
  '',
].join('\n');

describe('A1 DeliveryManifestDocument Full Test owned blocks', () => {
  it('publishes a terminal result by atomically rendering status + closed result fields', () => {
    const doc = DeliveryManifestDocument.parse(fullTestManifest);
    doc.publishFullTestResult({
      schemaVersion: 1,
      status: 'passed',
      summary: 'all checks passed',
      totalDurationMs: 11,
      checks: [{ id: 'full', status: 'passed', durationMs: 11 }],
      resultRef: `verification:full-test:${'a'.repeat(64)}`,
    });
    const text = doc.toString();
    assert.match(text, /fullTestStatus: passed/);
    assert.match(text, /result:\n {6}schemaVersion: 1\n {6}status: passed/);
    assert.match(text, /resultRef: "verification:full-test:a{64}"/);
  });

  it('renders outcome-unknown as a bounded executionBlock without changing authorized status', () => {
    const doc = DeliveryManifestDocument.parse(fullTestManifest);
    doc.setFullTestExecutionBlock({ schemaVersion: 1, reason: 'outcome-unknown', summary: 'tree not proven terminal' });
    const text = doc.toString();
    assert.match(text, /fullTestStatus: authorized/);
    assert.match(text, /executionBlock:\n {6}schemaVersion: 1\n {6}reason: outcome-unknown/);
    assert.doesNotMatch(text, /\n {4}result:/);
  });

  it('replaces command execution with the closed bounded plan shape and no command-only fields', () => {
    const withCommand = fullTestManifest.replace(
      '    requiresOwnerAuthorization: true\n',
      [
        '    requiresOwnerAuthorization: true',
        '    execution:',
        '      id: "legacy"',
        '      kind: command',
        '      command: "npm"',
        '      args:',
        '        - "run"',
        '        - "verify:full"',
        '      launcherMode: npm-shim',
        '      scope: delivery',
        '      timeoutMs: 120000',
        '      resultProtocol: flowkit-full-test-result-v1',
        '      resultAuthority: verification',
        '      expectedTerminalStatuses:',
        '        - "passed"',
        '        - "failed"',
        '',
      ].join('\n'),
    );
    const doc = DeliveryManifestDocument.parse(withCommand);
    doc.replaceFullTestExecution({
      id: 'bounded',
      kind: 'bounded-command-plan',
      logicalChecks: [
        { id: 'quality', resolverId: 'flowkit-quality', perTargetTimeoutMs: 120000 },
        { id: 'full', resolverId: 'flowkit-full-tests', perTargetTimeoutMs: 120000 },
      ],
      scope: 'delivery',
      resultProtocol: 'flowkit-full-test-result-v1',
      resultAuthority: 'verification',
      expectedTerminalStatuses: ['passed', 'failed'],
    });
    const text = doc.toString();
    assert.match(text, /kind: bounded-command-plan/);
    assert.match(text, /logicalChecks:\n {8}- id: "quality"/);
    assert.doesNotMatch(text, /command: "npm"|launcherMode:|timeoutMs:/);
    assert.equal((text.match(/execution:/g) ?? []).length, 1);
  });

  it('round-trips writer-produced legacy command Windows-shaped values through the shared YAML parser exactly', () => {
    const command = String.raw`C:\nvm4w\nodejs\node.exe`;
    const args = [String.raw`D:\tools\target.exe`, String.raw`--literal=\n`, String.raw`--tab=\t`, 'quote="ok"', '中文'];
    const withCommand = fullTestManifest.replace(
      '    requiresOwnerAuthorization: true\n',
      [
        '    requiresOwnerAuthorization: true',
        '    execution:',
        '      id: "legacy"',
        '      kind: command',
        '      command: "node"',
        '      args:',
        '        - "fixture"',
        '      launcherMode: direct',
        '      scope: delivery',
        '      timeoutMs: 120000',
        '      resultProtocol: flowkit-full-test-result-v1',
        '      resultAuthority: verification',
        '      expectedTerminalStatuses:',
        '        - "passed"',
        '        - "failed"',
        '',
      ].join('\n'),
    );
    const doc = DeliveryManifestDocument.parse(withCommand);
    doc.replaceFullTestExecution({
      id: 'legacy-windows-shaped', kind: 'command', command, args, launcherMode: 'direct', scope: 'delivery', timeoutMs: 30000,
      resultProtocol: 'flowkit-full-test-result-v1', resultAuthority: 'verification', expectedTerminalStatuses: ['passed', 'failed'],
    });
    const parsed = parseYaml(doc.toString());
    assert.equal(parsed.ok, true);
    assert.ok(parsed.ok);
    if (!parsed.ok) return;
    const root = parsed.value as { verification: { fullTest: { execution: { command: string; args: string[] } } } };
    assert.equal(root.verification.fullTest.execution.command, command);
    assert.deepEqual(root.verification.fullTest.execution.args, args);
  });

});

const finalizableManifest = [
  'id: F1',
  'delivery:',
  '  state: active',
  '  fullTestStatus: passed',
  'architecture:',
  '  impact: false',
  '  archifyPlan: "not-required"',
  'changes:',
  '  - key: X1',
  '    id: completed-change',
  '    goal: "done"',
  '    required: true',
  '    dependsOn: []',
  '    state: completed',
  '    architectureImpact: false',
  '    outputs: []',
  '',
].join('\n');

describe('F1 DeliveryManifestDocument Finalize publication', () => {
  const projection = {
    schemaVersion: 1 as const,
    qualificationRef: `delivery-finalization-qualification:${'a'.repeat(64)}`,
    ownerAuthorizationRef: `owner:${'b'.repeat(64)}`,
    candidateRef: `delivery-final-candidate:${'c'.repeat(64)}`,
  };

  it('publishes completed + one closed finalization block and inverses to exact active bytes', () => {
    const doc = DeliveryManifestDocument.parse(finalizableManifest);
    doc.publishFinalization(projection);
    const completed = doc.toString();
    assert.match(completed, /delivery:\n {2}state: completed\n {2}fullTestStatus: passed\n {2}finalization:/);
    assert.match(completed, /qualificationRef: "delivery-finalization-qualification:a{64}"/);
    assert.equal(DeliveryManifestDocument.parse(completed).inverseFinalization(), finalizableManifest);
  });

  it('fails closed on duplicate publication or non-completed inverse shape', () => {
    const doc = DeliveryManifestDocument.parse(finalizableManifest);
    doc.publishFinalization(projection);
    assert.throws(() => doc.publishFinalization(projection), FlowkitError);
    assert.throws(() => DeliveryManifestDocument.parse(finalizableManifest).inverseFinalization(), FlowkitError);
  });
});
