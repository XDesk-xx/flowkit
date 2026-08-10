import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { analyzeTypeScriptSource, inspectQuality } from '../../../scripts/quality.js';
import { createTempDir } from '../../fixtures/helpers.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('F1 quality guard', () => {
  it('freezes deterministic maintainability metrics with a fixture', async () => {
    const path = join(root, 'tests/fixtures/quality/metric-sample.ts');
    const metric = analyzeTypeScriptSource(
      'tests/fixtures/quality/metric-sample.ts',
      await readFile(path, 'utf-8'),
    );
    assert.equal(metric.loc, 8);
    assert.deepEqual(metric.functions, [{
      name: 'metricSample',
      line: 1,
      loc: 8,
      complexity: 5,
      nesting: 3,
      parameters: 6,
    }]);
  });

  it('reports current legacy maintainability debt without hard failure', async () => {
    const report = await inspectQuality(root);
    assert.deepEqual(report.hardFailures, []);
    assert.ok(report.warnings.length > 0);
    assert.ok(report.warnings.some((warning) => warning.includes('file-loc src/')));
  });

  it('rejects TypeScript import-equals for every forbidden filesystem module', async () => {
    const temp = await createTempDir();
    await mkdir(join(temp, 'src/bin'), { recursive: true });
    await mkdir(join(temp, 'src/domain'), { recursive: true });
    await mkdir(join(temp, 'src/policy'), { recursive: true });
    await mkdir(join(temp, 'tests'), { recursive: true });
    await writeFile(join(temp, 'package.json'), '{"bin":{"flowkit":"dist/bin/flowkit.js"}}\n');
    await writeFile(join(temp, 'src/bin/flowkit.ts'), '#!/usr/bin/env node\nexport {};\n');

    const modules = ['node:fs', 'node:fs/promises', 'fs', 'fs/promises'] as const;
    for (const [index, moduleName] of modules.entries()) {
      const area = index % 2 === 0 ? 'domain' : 'policy';
      await writeFile(
        join(temp, `src/${area}/import-equals-${index}.ts`),
        `import filesystem = require('${moduleName}');\nvoid filesystem;\n`,
      );
    }

    const report = await inspectQuality(temp);
    for (const moduleName of modules) {
      assert.ok(
        report.hardFailures.some((failure) => failure.includes(`imports ${moduleName}`)),
        `expected filesystem hard failure for ${moduleName}`,
      );
    }
  });

  it('fails hard invariants deterministically', async () => {
    const temp = await createTempDir();
    await mkdir(join(temp, 'src/bin'), { recursive: true });
    await mkdir(join(temp, 'src/domain'), { recursive: true });
    await mkdir(join(temp, 'src/policy'), { recursive: true });
    await mkdir(join(temp, 'tests'), { recursive: true });
    await writeFile(join(temp, 'package.json'), '{"bin":{"flowkit":"wrong.js"}}\n');
    await writeFile(join(temp, 'src/bin/flowkit.ts'), 'console.log("no shebang");\n');
    await writeFile(join(temp, 'src/domain/bad.ts'), "import { readFile } from 'node:fs/promises';\nvoid readFile;\n");
    await writeFile(join(temp, 'src/policy/ok.ts'), 'export const ok = true;\n');
    await writeFile(join(temp, 'tests/bad.mjs'), 'export {};\n');

    const report = await inspectQuality(temp);
    assert.ok(report.hardFailures.some((failure) => failure.startsWith('forbidden-mjs:')));
    assert.ok(report.hardFailures.some((failure) => failure.startsWith('bin-contract:')));
    assert.ok(report.hardFailures.some((failure) => failure.startsWith('bin-shebang:')));
    assert.ok(report.hardFailures.some((failure) => failure.startsWith('filesystem-boundary:')));
  });
});
