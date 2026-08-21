import assert from 'node:assert/strict';
import { access, mkdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

import { ArchitectureService } from '../../src/architecture/architecture-service.js';
import { ArchifyCliAdapter } from '../../src/integrations/archify/archify-cli-adapter.js';
import { createTempDir } from '../fixtures/helpers.js';

const generated: string[] = [];
after(async () =>
  Promise.all(
    generated
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  ),
);

const deliveryId = '20260817-01-delivery-execution-loop';
const deliveryJsonRoot = join(
  process.cwd(),
  'architecture',
  deliveryId,
  'json',
);
const referenceJsonRoot = join(
  process.cwd(),
  'architecture',
  'reference',
  'json',
);

function recordsOf(
  value: unknown,
  key: string,
): Array<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return [];
  const candidate = (value as Record<string, unknown>)[key];
  if (!Array.isArray(candidate)) return [];
  return candidate.filter(
    (entry): entry is Record<string, unknown> =>
      typeof entry === 'object' && entry !== null && !Array.isArray(entry),
  );
}

function idsOf(value: unknown, key: string): Set<string> {
  return new Set(
    recordsOf(value, key)
      .map((entry) => entry['id'])
      .filter((id): id is string => typeof id === 'string'),
  );
}

function transitionsOf(value: unknown): Set<string> {
  return new Set(
    recordsOf(value, 'edges')
      .map((entry) => {
        const from = entry['from'];
        const to = entry['to'];
        return typeof from === 'string' && typeof to === 'string'
          ? `${from}->${to}`
          : undefined;
      })
      .filter((entry): entry is string => entry !== undefined),
  );
}

function labelsOf(value: unknown): string[] {
  return recordsOf(value, 'messages')
    .map((entry) => entry['label'])
    .filter((label): label is string => typeof label === 'string');
}

function revisionOf(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return undefined;
  const meta = (value as Record<string, unknown>)['meta'];
  if (typeof meta !== 'object' || meta === null || Array.isArray(meta))
    return undefined;
  const repository = (meta as Record<string, unknown>)['repository'];
  if (
    typeof repository !== 'object' ||
    repository === null ||
    Array.isArray(repository)
  )
    return undefined;
  return (repository as Record<string, unknown>)['revision'] as
    string | undefined;
}

describe('D1 durable Architecture assets', { concurrency: false }, () => {
  it('physically validates/delivers all four reference views and Current/Planned through exact managed Archify', async () => {
    const outputRoot = await createTempDir();
    generated.push(outputRoot);
    await mkdir(outputRoot, { recursive: true });
    const adapter = new ArchifyCliAdapter({
      repoRoot: process.cwd(),
      env: process.env,
    });

    for (const [type, name] of [
      ['workflow', 'change-lifecycle.workflow.json'],
      ['sequence', 'change-lifecycle.sequence.json'],
      ['workflow', 'delivery-lifecycle.workflow.json'],
      ['sequence', 'delivery-lifecycle.sequence.json'],
    ] as const) {
      const input = join(referenceJsonRoot, name);
      assert.equal((await adapter.validate(type, input))['ok'], true);
      assert.equal(
        (await adapter.deliver(type, input, join(outputRoot, `${name}.html`)))[
          'ok'
        ],
        true,
      );
    }

    const currentPath = join(deliveryJsonRoot, 'current.architecture.json');
    const plannedPath = join(deliveryJsonRoot, 'planned.architecture.json');
    const current = JSON.parse(await readFile(currentPath, 'utf8')) as unknown;
    const planned = JSON.parse(await readFile(plannedPath, 'utf8')) as unknown;
    assert.equal(
      revisionOf(current),
      '74d46f0920c0dfc6f19b5b264cf9de138f4c2bec',
    );
    assert.equal(
      revisionOf(planned),
      'f132db761bd209e6aff72411108b8e3e1c9801f5',
    );
    for (const [name, input] of [
      ['current', currentPath],
      ['planned', plannedPath],
    ] as const) {
      assert.equal(
        (
          await adapter.validate('architecture', input, {
            repositoryRoot: process.cwd(),
          })
        )['ok'],
        true,
      );
      assert.equal(
        (
          await adapter.deliver(
            'architecture',
            input,
            join(outputRoot, `${name}.html`),
            { repositoryRoot: process.cwd() },
          )
        )['ok'],
        true,
      );
    }
  });

  it('keeps complete Change Workflow structure plus complementary Sequence interactions visible', async () => {
    const workflow = JSON.parse(
      await readFile(
        join(referenceJsonRoot, 'change-lifecycle.workflow.json'),
        'utf8',
      ),
    ) as unknown;
    const sequence = JSON.parse(
      await readFile(
        join(referenceJsonRoot, 'change-lifecycle.sequence.json'),
        'utf8',
      ),
    ) as unknown;

    assert.equal((workflow as Record<string, unknown>)['diagram_type'], 'workflow');
    const nodeIds = idsOf(workflow, 'nodes');
    for (const id of [
      'explore',
      'review_explore',
      'revise_explore',
      'explore_authority_stop',
      'propose',
      'review_propose',
      'revise_propose',
      'propose_authority_stop',
      'authorize_apply',
      'apply',
      'change_verification',
      'review_apply',
      'revise_apply',
      'apply_authority_stop',
      'authorize_archive',
      'archive',
      'completed',
      'authorize_checkpoint',
      'checkpoint',
    ]) {
      assert.equal(nodeIds.has(id), true, `missing Change workflow node ${id}`);
    }
    const edges = transitionsOf(workflow);
    for (const edge of [
      'review_explore->revise_explore',
      'revise_explore->review_explore',
      'review_explore->explore_authority_stop',
      'review_propose->revise_propose',
      'revise_propose->review_propose',
      'review_propose->propose_authority_stop',
      'review_apply->revise_apply',
      'revise_apply->change_verification',
      'review_apply->apply_authority_stop',
      'archive->completed',
      'completed->authorize_checkpoint',
      'authorize_checkpoint->checkpoint',
    ]) {
      assert.equal(edges.has(edge), true, `missing Change workflow edge ${edge}`);
    }

    assert.equal((sequence as Record<string, unknown>)['diagram_type'], 'sequence');
    const participantIds = idsOf(sequence, 'participants');
    for (const id of [
      'owner',
      'policy',
      'author',
      'reviewer',
      'verification',
      'openspec',
      'git',
    ]) {
      assert.equal(participantIds.has(id), true, `missing Change sequence participant ${id}`);
    }
    const labels = labelsOf(sequence).join('\n');
    for (const pattern of [
      /review-explore/,
      /revise-explore/,
      /review-propose/,
      /revise-propose/,
      /Owner 授权 apply/,
      /review-apply/,
      /blockingAuthority/,
      /revise-apply/,
      /Owner 授权 archive/,
      /Change Checkpoint/,
    ]) {
      assert.match(labels, pattern);
    }
  });

  it('keeps complete Delivery Workflow branches plus complementary Sequence authority ordering visible', async () => {
    const workflow = JSON.parse(
      await readFile(
        join(referenceJsonRoot, 'delivery-lifecycle.workflow.json'),
        'utf8',
      ),
    ) as unknown;
    const sequence = JSON.parse(
      await readFile(
        join(referenceJsonRoot, 'delivery-lifecycle.sequence.json'),
        'utf8',
      ),
    ) as unknown;

    assert.equal((workflow as Record<string, unknown>)['diagram_type'], 'workflow');
    const nodeIds = idsOf(workflow, 'nodes');
    for (const id of [
      'delivery_start',
      'current',
      'planned',
      'activate',
      'change',
      'checkpoint',
      'changes_done',
      'ready',
      'full_test_auth',
      'full_test',
      'test_result',
      'finding',
      'owner_decision',
      'corrective_change',
      'corrective_cp',
      'fresh_ready',
      'actual',
      'compare',
      'arch_ok',
      'finalize_auth',
      'delivery_final',
      'merge',
      'next_current',
    ]) {
      assert.equal(nodeIds.has(id), true, `missing Delivery workflow node ${id}`);
    }
    const edges = transitionsOf(workflow);
    for (const edge of [
      'changes_done->activate',
      'changes_done->ready',
      'test_result->finding',
      'owner_decision->corrective_change',
      'corrective_change->corrective_cp',
      'corrective_cp->fresh_ready',
      'fresh_ready->ready',
      'test_result->actual',
      'actual->compare',
      'compare->arch_ok',
      'arch_ok->finalize_auth',
      'finalize_auth->delivery_final',
      'delivery_final->merge',
      'merge->next_current',
    ]) {
      assert.equal(edges.has(edge), true, `missing Delivery workflow edge ${edge}`);
    }

    assert.equal((sequence as Record<string, unknown>)['diagram_type'], 'sequence');
    const participantIds = idsOf(sequence, 'participants');
    for (const id of [
      'owner',
      'policy',
      'change-loop',
      'verification',
      'archify',
      'assets',
      'git',
    ]) {
      assert.equal(participantIds.has(id), true, `missing Delivery sequence participant ${id}`);
    }
    const labels = labelsOf(sequence).join('\n');
    for (const pattern of [
      /Delivery Start/,
      /Current Architecture JSON/,
      /Planned Architecture JSON/,
      /required Changes/,
      /authorize-full-test/,
      /passed \/ failed/,
      /Delivery Finding/,
      /Actual JSON/,
      /compare Planned vs Actual/,
      /authorize-finalize/,
      /Delivery Final/,
      /Merge Commit/,
      /下一 Delivery Current/,
    ]) {
      assert.match(labels, pattern);
    }
  });

  it('keeps reference projection subordinate and excludes superseded/E1/HTML authority files', async () => {
    const contents = await Promise.all(
      [
        'change-lifecycle.workflow.json',
        'change-lifecycle.sequence.json',
        'delivery-lifecycle.workflow.json',
        'delivery-lifecycle.sequence.json',
      ].map((name) => readFile(join(referenceJsonRoot, name), 'utf8')),
    );
    const wording = contents.join('\n');
    assert.match(wording, /formal facts win/i);
    assert.match(wording, /不决定|never decides|不成为 lifecycle authority/i);

    for (const path of [
      join(referenceJsonRoot, 'delivery-lifecycle.lifecycle.json'),
      join(referenceJsonRoot, 'full-test-lifecycle.lifecycle.json'),
      join(deliveryJsonRoot, 'actual.architecture.json'),
      join(process.cwd(), 'architecture', 'system.architecture.json'),
    ]) {
      await assert.rejects(() => access(path), `unexpected D1 durable file ${path}`);
    }
  });

  it('renders Delivery-scoped Current/Planned without creating lifecycle authority and fails closed for missing Actual', async () => {
    const service = new ArchitectureService({
      repoRoot: process.cwd(),
      deliveryId,
      env: process.env,
    });
    const htmlRoot = service.paths.htmlRoot;
    generated.push(htmlRoot);
    assert.equal((await service.render('current'))['ok'], true);
    assert.equal((await service.render('planned'))['ok'], true);
    await assert.rejects(
      () => service.compare('current', 'actual'),
      /actual Architecture JSON is unavailable/,
    );
  });
});
