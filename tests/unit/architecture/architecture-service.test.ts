import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  architectureJsonPath,
  resolveDeliveryArchitecturePaths,
} from '../../../src/architecture/architecture-service.js';

describe('D1 Architecture asset paths and authority boundary', () => {
  it('derives Delivery-scoped paths from arbitrary future delivery ids without 03 constants', () => {
    const root = join(process.cwd(), 'fixture-root');
    const paths = resolveDeliveryArchitecturePaths(root, '20990101-01-future-self-hosted-proof');
    assert.equal(paths.currentJson, join(root, 'architecture', '20990101-01-future-self-hosted-proof', 'json', 'current.architecture.json'));
    assert.equal(paths.plannedHtml, join(root, 'architecture', '20990101-01-future-self-hosted-proof', 'html', 'planned.html'));
    assert.equal(architectureJsonPath(paths, 'actual'), join(root, 'architecture', '20990101-01-future-self-hosted-proof', 'json', 'actual.architecture.json'));
    assert.equal(paths.currentJson.includes('20260817-01-delivery-execution-loop'), false);
  });

  it('keeps all durable reference views explicitly subordinate to formal facts and HTML disposable', async () => {
    const root = join(process.cwd(), 'architecture', 'reference', 'json');
    const contents = await Promise.all(
      [
        'change-lifecycle.workflow.json',
        'change-lifecycle.sequence.json',
        'delivery-lifecycle.workflow.json',
        'delivery-lifecycle.sequence.json',
      ].map((name) => readFile(join(root, name), 'utf8')),
    );
    const wording = contents.join('\n');
    assert.match(wording, /formal facts win/i);
    assert.match(wording, /never decides Policy|不决定 Policy|不成为 lifecycle authority/i);
    assert.equal(await readFile(join(process.cwd(), 'architecture', '.gitignore'), 'utf8'), '*/html/\n');
  });
});
