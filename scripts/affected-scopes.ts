import { readdir, stat } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

export const AFFECTED_SCOPES = [
  'shared',
  'domain',
  'persistence',
  'facts',
  'policy',
  'cli',
  'verification',
] as const;

export type AffectedScope = (typeof AFFECTED_SCOPES)[number];

type Selector =
  | { kind: 'directory'; path: string }
  | { kind: 'file'; path: string }
  | { kind: 'all-unit' };

const SCOPE_SELECTORS: Readonly<Record<AffectedScope, readonly Selector[]>> = {
  shared: [
    { kind: 'all-unit' },
    { kind: 'file', path: 'tests/integration/execution-model-lifecycle.test.ts' },
    { kind: 'file', path: 'tests/integration/diagnostic-cli.test.ts' },
  ],
  domain: [
    { kind: 'directory', path: 'tests/unit/services' },
    { kind: 'directory', path: 'tests/unit/domain' },
    { kind: 'directory', path: 'tests/unit/persistence' },
    { kind: 'directory', path: 'tests/unit/facts' },
    { kind: 'directory', path: 'tests/unit/policy' },
    { kind: 'directory', path: 'tests/unit/diagnostics' },
    { kind: 'directory', path: 'tests/unit/cli' },
    { kind: 'file', path: 'tests/integration/execution-model-lifecycle.test.ts' },
    { kind: 'file', path: 'tests/integration/diagnostic-cli.test.ts' },
  ],
  persistence: [
    { kind: 'directory', path: 'tests/unit/services' },
    { kind: 'file', path: 'tests/unit/atomic-write.test.ts' },
    { kind: 'directory', path: 'tests/unit/persistence' },
    { kind: 'directory', path: 'tests/unit/facts' },
    { kind: 'file', path: 'tests/integration/execution-model-lifecycle.test.ts' },
  ],
  facts: [
    { kind: 'directory', path: 'tests/unit/services' },
    { kind: 'directory', path: 'tests/unit/facts' },
    { kind: 'directory', path: 'tests/unit/policy' },
    { kind: 'directory', path: 'tests/unit/diagnostics' },
    { kind: 'directory', path: 'tests/unit/cli' },
    { kind: 'file', path: 'tests/integration/execution-model-lifecycle.test.ts' },
    { kind: 'file', path: 'tests/integration/diagnostic-cli.test.ts' },
  ],
  policy: [
    { kind: 'directory', path: 'tests/unit/services' },
    { kind: 'directory', path: 'tests/unit/policy' },
    { kind: 'directory', path: 'tests/unit/diagnostics' },
    { kind: 'file', path: 'tests/integration/execution-model-lifecycle.test.ts' },
    { kind: 'file', path: 'tests/integration/diagnostic-cli.test.ts' },
  ],
  cli: [
    { kind: 'directory', path: 'tests/unit/services' },
    { kind: 'directory', path: 'tests/unit/cli' },
    { kind: 'directory', path: 'tests/unit/diagnostics' },
    { kind: 'file', path: 'tests/integration/diagnostic-cli.test.ts' },
    { kind: 'file', path: 'tests/integration/diagnostic-cli-process.test.ts' },
  ],
  verification: [
    { kind: 'directory', path: 'tests/unit/verification' },
    { kind: 'file', path: 'tests/unit/external-command.test.ts' },
    { kind: 'file', path: 'tests/integration/verification-commands.test.ts' },
  ],
};

async function collectTestFiles(root: string, relativeDirectory: string): Promise<string[]> {
  const absoluteDirectory = resolve(root, relativeDirectory);
  let entries;
  try {
    entries = await readdir(absoluteDirectory, { withFileTypes: true });
  } catch {
    return [];
  }

  const results: string[] = [];
  for (const entry of entries) {
    const childRelative = join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await collectTestFiles(root, childRelative)));
    } else if (entry.isFile() && entry.name.endsWith('.test.ts')) {
      results.push(childRelative.split(sep).join('/'));
    }
  }
  return results;
}

async function existingTestFile(root: string, path: string): Promise<string[]> {
  try {
    const info = await stat(resolve(root, path));
    return info.isFile() ? [path] : [];
  } catch {
    return [];
  }
}

export function isAffectedScope(value: string): value is AffectedScope {
  return (AFFECTED_SCOPES as readonly string[]).includes(value);
}

export async function resolveAffectedTests(root: string, scopes: readonly string[]): Promise<string[]> {
  if (scopes.length === 0) {
    throw new Error('at least one affected scope is required');
  }

  const selected = new Set<string>();
  for (const scope of scopes) {
    if (!isAffectedScope(scope)) {
      throw new Error(`unknown affected scope: ${scope}`);
    }
    for (const selector of SCOPE_SELECTORS[scope]) {
      const files = selector.kind === 'all-unit'
        ? await collectTestFiles(root, 'tests/unit')
        : selector.kind === 'directory'
          ? await collectTestFiles(root, selector.path)
          : await existingTestFile(root, selector.path);
      for (const file of files) selected.add(file);
    }
  }
  return [...selected].sort((a, b) => a.localeCompare(b));
}

export async function resolveAllTests(root: string): Promise<string[]> {
  const files = [
    ...(await collectTestFiles(root, 'tests/unit')),
    ...(await collectTestFiles(root, 'tests/integration')),
  ];
  return [...new Set(files)].sort((a, b) => a.localeCompare(b));
}

export function isInsideRoot(root: string, path: string): boolean {
  const rel = relative(resolve(root), resolve(root, path));
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !resolve(root, path).startsWith(`${resolve(root)}${sep}..${sep}`);
}
