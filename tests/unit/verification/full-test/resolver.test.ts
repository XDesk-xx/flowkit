import assert from 'node:assert/strict';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { createTempDir } from '../../../fixtures/helpers.js';

import { FULL_TEST_HEAVY_OVERRIDE_FILES, resolveFullTestLogicalCheck } from '../../../../src/verification/full-test/resolver.js';


async function copyHeavyFixtures(root: string): Promise<void> {
  for (const file of FULL_TEST_HEAVY_OVERRIDE_FILES) {
    await mkdir(join(root, file, '..'), { recursive: true });
    await copyFile(join(process.cwd(), file), join(root, file));
  }
}

describe('I1 Full Test physical resolver closure', () => {
  it('covers the current checkout directly without recursive public Full Test wrappers', async () => {
    const resolved = await resolveFullTestLogicalCheck(process.cwd(), {
      id: 'full',
      resolverId: 'flowkit-full-tests',
      perTargetTimeoutMs: 120_000,
    }, process.env);
    try {
      assert.equal(resolved.targets.some((target) => target.args.includes('test:full')), false);
      assert.equal(resolved.targets.some((target) => target.args.includes('verify:step')), false);
      assert.equal(resolved.targets.filter((target) => target.physicalTargetId.startsWith('diagnostic:')).length, 3);
      assert.equal(resolved.targets.filter((target) => target.physicalTargetId.startsWith('g1-change:')).length, 7);
      assert.equal(resolved.targets.filter((target) => target.physicalTargetId.startsWith('g1-adapter:')).length, 3);
      assert.equal(resolved.targets.filter((target) => target.physicalTargetId.startsWith('b1:')).length, 29);
      const managedHomes = new Set(resolved.targets.map((target) => target.env['FLOWKIT_HOME']));
      assert.equal(managedHomes.size, 1);
      assert.ok([...managedHomes][0]);
      assert.equal(resolved.targets.some((target) => target.env['FLOWKIT_OPENSPEC_BIN'] !== undefined), false);
    } finally {
      await Promise.all(resolved.cleanupPaths.map((path) => rm(path, { recursive: true, force: true })));
    }
  });

  it('keeps the H1 installed-runner smoke independent from all 26 formal E2E phases', async () => {
    const resolved = await resolveFullTestLogicalCheck(process.cwd(), {
      id: 'full',
      resolverId: 'flowkit-full-tests',
      perTargetTimeoutMs: 120_000,
    }, process.env);
    try {
      const h1 = resolved.targets.filter((target) => target.physicalTargetId.startsWith('h1:'));
      assert.equal(h1.length, 27);
      const smoke = h1.filter((target) => target.physicalTargetId === 'h1:installed-runner-smoke');
      assert.equal(smoke.length, 1);
      assert.equal(smoke[0]!.env['FLOWKIT_H1_FORMAL_PHASE'], undefined);
      const phases = h1.filter((target) => target.physicalTargetId.startsWith('h1:e2e-phase-'));
      assert.deepEqual(phases.map((target) => Number(target.env['FLOWKIT_H1_FORMAL_PHASE'])), Array.from({ length: 26 }, (_, index) => index + 1));
      const roots = new Set(phases.map((target) => target.env['FLOWKIT_H1_FORMAL_STATE_ROOT']));
      assert.equal(roots.size, 1);
      assert.ok([...roots][0]);
    } finally {
      await Promise.all(resolved.cleanupPaths.map((path) => rm(path, { recursive: true, force: true })));
    }
  });

  it('splits typecheck into the two persisted physical compiler targets', async () => {
    const resolved = await resolveFullTestLogicalCheck(process.cwd(), {
      id: 'typecheck',
      resolverId: 'flowkit-typecheck',
      perTargetTimeoutMs: 120_000,
    }, process.env);
    assert.deepEqual(resolved.targets.map((target) => target.physicalTargetId), ['typecheck:source', 'typecheck:tests']);
    assert.match(resolved.targets[0]!.args.join(' '), /--noEmit/u);
    assert.match(resolved.targets[1]!.args.join(' '), /tsconfig\.test\.json/u);
  });

  it('automatically includes a newly discovered ordinary test while keeping all heavy files out of ordinary fallback', async () => {
    const root = await createTempDir();
    try {
      await copyHeavyFixtures(root);
      const synthetic = 'tests/unit/i1-synthetic-new-ordinary.test.ts';
      await mkdir(join(root, 'tests/unit'), { recursive: true });
      await writeFile(join(root, synthetic), "import { it } from 'node:test'; it('synthetic', () => {});\n", 'utf8');
      const resolved = await resolveFullTestLogicalCheck(root, { id: 'full', resolverId: 'flowkit-full-tests', perTargetTimeoutMs: 120000 }, process.env);
      try {
        assert.equal(resolved.targets.some((target) => target.physicalTargetId === `ordinary:${synthetic}`), true);
        for (const heavy of FULL_TEST_HEAVY_OVERRIDE_FILES) {
          assert.equal(resolved.targets.some((target) => target.physicalTargetId === `ordinary:${heavy}`), false, heavy);
        }
      } finally {
        await Promise.all(resolved.cleanupPaths.map((path) => rm(path, { recursive: true, force: true })));
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });


  it('fails closed when the H1 formal branch marker drifts even though the heavy file still exists', async () => {
    const root = await createTempDir();
    try {
      await copyHeavyFixtures(root);
      const h1 = FULL_TEST_HEAVY_OVERRIDE_FILES.find((file) => file.includes('h1-stable-runner-and-self-hosting-acceptance'))!;
      const h1Path = join(root, h1);
      const source = await readFile(h1Path, 'utf8');
      assert.match(source, /if \(Number\.isInteger\(formalPhase\)\)/u);
      await writeFile(h1Path, source.replace('if (Number.isInteger(formalPhase))', 'if (formalPhase !== undefined)'), 'utf8');

      await assert.rejects(
        () => resolveFullTestLogicalCheck(root, { id: 'full', resolverId: 'flowkit-full-tests', perTargetTimeoutMs: 120000 }, process.env),
        /H1 formal branch drifted/u,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });


});
