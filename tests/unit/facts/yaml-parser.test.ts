import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseYaml } from '../../../src/facts/yaml-parser.js';

describe('parseYaml', () => {
  it('parses an empty document as null', () => {
    assert.deepEqual(parseYaml(''), { ok: true, value: null });
    assert.deepEqual(parseYaml('\n\n  \n'), { ok: true, value: null });
  });

  it('parses a block mapping (task 9.2)', () => {
    const yaml = [
      'deliveryId: 20260806-01-deterministic-core',
      'state: active',
      'fullTestStatus: not-ready',
    ].join('\n');
    const result = parseYaml(yaml);
    assert.equal(result.ok, true);
    assert.deepEqual(result.ok ? result.value : null, {
      deliveryId: '20260806-01-deterministic-core',
      state: 'active',
      fullTestStatus: 'not-ready',
    });
  });

  it('parses a block sequence (task 9.2)', () => {
    const yaml = '- explore\n- propose\n- apply';
    const result = parseYaml(yaml);
    assert.equal(result.ok, true);
    assert.deepEqual(result.ok ? result.value : null, ['explore', 'propose', 'apply']);
  });

  it('parses a flow sequence (task 9.2)', () => {
    const yaml = 'actions: [explore, propose, apply]';
    const result = parseYaml(yaml);
    assert.equal(result.ok, true);
    assert.deepEqual(result.ok ? result.value : null, {
      actions: ['explore', 'propose', 'apply'],
    });
  });

  it('parses single-quoted scalars', () => {
    const yaml = "key: 'value with # hash'";
    const result = parseYaml(yaml);
    assert.equal(result.ok, true);
    assert.equal(result.ok ? (result.value as Record<string, unknown>).key : null, 'value with # hash');
  });

  it('parses double-quoted scalars with escapes', () => {
    const yaml = 'key: "line\\nbreak"';
    const result = parseYaml(yaml);
    assert.equal(result.ok, true);
    assert.equal(result.ok ? (result.value as Record<string, unknown>).key : null, 'line\nbreak');
  });

  it('parses nested mapping inside mapping (task 9.2)', () => {
    const yaml = [
      'delivery:',
      '  id: D1',
      '  state: active',
    ].join('\n');
    const result = parseYaml(yaml);
    assert.equal(result.ok, true);
    assert.deepEqual(result.ok ? result.value : null, {
      delivery: { id: 'D1', state: 'active' },
    });
  });

  it('parses sequence inside mapping (task 9.2)', () => {
    const yaml = [
      'changes:',
      '  - key: C1',
      '    id: c1-id',
      '  - key: C2',
      '    id: c2-id',
    ].join('\n');
    const result = parseYaml(yaml);
    assert.equal(result.ok, true);
    assert.deepEqual(result.ok ? result.value : null, {
      changes: [
        { key: 'C1', id: 'c1-id' },
        { key: 'C2', id: 'c2-id' },
      ],
    });
  });

  it('parses null/bool/int basic types (task 9.2)', () => {
    const yaml = [
      'nullVal: null',
      'tildeVal: ~',
      'trueVal: true',
      'falseVal: false',
      'intVal: 42',
      'negInt: -7',
    ].join('\n');
    const result = parseYaml(yaml);
    assert.equal(result.ok, true);
    assert.deepEqual(result.ok ? result.value : null, {
      nullVal: null,
      tildeVal: null,
      trueVal: true,
      falseVal: false,
      intVal: 42,
      negInt: -7,
    });
  });

  it('strips comments (task 9.2)', () => {
    const yaml = [
      '# top comment',
      'key: value  # inline comment',
      '  # indented comment',
    ].join('\n');
    const result = parseYaml(yaml);
    assert.equal(result.ok, true);
    assert.equal(result.ok ? (result.value as Record<string, unknown>).key : null, 'value');
  });

  it('parses literal block scalar | (task 9.2)', () => {
    const yaml = ['text: |', '  line one', '  line two'].join('\n');
    const result = parseYaml(yaml);
    assert.equal(result.ok, true);
    assert.equal(result.ok ? (result.value as Record<string, unknown>).text : null, 'line one\nline two\n');
  });

  it('parses folded block scalar > (task 9.2)', () => {
    const yaml = ['text: >', '  word one', '  word two'].join('\n');
    const result = parseYaml(yaml);
    assert.equal(result.ok, true);
    assert.equal(result.ok ? (result.value as Record<string, unknown>).text : null, 'word one word two\n');
  });

  it('parses an empty flow sequence', () => {
    const result = parseYaml('items: []');
    assert.equal(result.ok, true);
    assert.deepEqual(result.ok ? result.value : null, { items: [] });
  });

  it('does not throw on parse failure (task 9.4)', () => {
    // Anchor/alias is unsupported.
    const result = parseYaml('key: &anchor value\nref: *anchor');
    assert.equal(result.ok, false);
    assert.ok(result.ok === false && result.error.length > 0);
  });

  it('rejects anchor/alias (task 9.3)', () => {
    assert.equal(parseYaml('key: &a value').ok, false);
    assert.equal(parseYaml('key: *a').ok, false);
  });

  it('rejects multi-document marker (task 9.3)', () => {
    assert.equal(parseYaml('---\nkey: value').ok, false);
  });

  it('rejects tag (task 9.3)', () => {
    assert.equal(parseYaml('key: !!str value').ok, false);
  });

  it('returns an error result (not throw) for malformed input (task 9.4)', () => {
    const result = parseYaml('key: [unclosed');
    assert.equal(result.ok, false);
  });

  it('parses a realistic delivery manifest snippet', () => {
    const yaml = [
      'deliveryId: 20260806-01-deterministic-core',
      'state: active',
      'fullTestStatus: not-ready',
      'changes:',
      '  - key: C1',
      '    id: formal-fact-reader-and-persistence',
      '    state: active',
      '    required: true',
      '    dependsOn: []',
      '  - key: B1',
      '    id: domain-and-state-schema',
      '    state: completed',
      '    required: true',
      '    dependsOn: [A1]',
    ].join('\n');
    const result = parseYaml(yaml);
    assert.equal(result.ok, true);
    const value = result.ok ? (result.value as Record<string, unknown>) : null;
    assert.equal(value?.deliveryId, '20260806-01-deterministic-core');
    assert.equal(value?.state, 'active');
    const changes = value?.changes as Array<Record<string, unknown>>;
    assert.equal(changes.length, 2);
    assert.equal(changes[0]?.key, 'C1');
    assert.deepEqual(changes[1]?.dependsOn, ['A1']);
  });
});
