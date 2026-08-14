import { readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';

import type { MutationDeclaration, VersionedAuthorityRef } from '../../domain/types.js';
import { FlowkitError } from '../../shared/errors.js';
import { validateMutationDeclaration } from '../../persistence/serialization.js';

const SCOPE_HEADING = /^## flowkitMutationScope\s*$/gm;
const JSON_FENCE = /^```json\s*\r?\n([\s\S]*?)\r?\n```\s*$/m;

/**
 * Derive the persisted Apply boundary solely from the immutable approved
 * Design ResultRef. There is intentionally no caller fallback.
 */
export async function deriveMutationDeclaration(
  repoRoot: string,
  action: 'apply' | 'revise-apply',
  contractRefs: readonly VersionedAuthorityRef[],
): Promise<MutationDeclaration> {
  const designs = contractRefs.filter((ref) => ref.ref.endsWith('/design.md'));
  if (designs.length !== 1) {
    throw new FlowkitError('MUTATION_DECLARATION_SOURCE_MISSING', 'Apply requires exactly one approved Design authority ref', {
      action,
      designs: designs.map((ref) => ref.ref),
    });
  }
  const designRef = designs[0]!;
  if (designRef.ref.startsWith('/') || designRef.ref.includes('\\') || designRef.ref.split('/').some((part) => part === '' || part === '.' || part === '..')) {
    throw new FlowkitError('MUTATION_DECLARATION_SOURCE_INVALID', 'Design authority ref is not a normalized repository-relative path');
  }
  const design = await readFile(join(repoRoot, designRef.ref), 'utf8');
  const headings = [...design.matchAll(SCOPE_HEADING)];
  if (headings.length !== 1) {
    throw new FlowkitError('MUTATION_DECLARATION_INVALID', 'Design must contain exactly one flowkitMutationScope section', { count: headings.length });
  }
  const start = headings[0]!.index! + headings[0]![0].length;
  const followingHeading = /^##\s+/gm;
  followingHeading.lastIndex = start;
  const next = followingHeading.exec(design);
  const section = design.slice(start, next?.index).trim();
  const fence = section.match(JSON_FENCE);
  if (fence === null) {
    throw new FlowkitError('MUTATION_DECLARATION_INVALID', 'flowkitMutationScope must contain exactly one json fenced block');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(fence[1]!);
  } catch (error) {
    throw new FlowkitError('MUTATION_DECLARATION_INVALID', 'flowkitMutationScope JSON is invalid', {
      detail: error instanceof Error ? error.message : String(error),
    });
  }
  const source = asObject(parsed, 'flowkitMutationScope');
  if (source['schemaVersion'] !== 1 || Object.keys(source).length !== 2 || !('actions' in source)) {
    throw new FlowkitError('MUTATION_DECLARATION_INVALID', 'flowkitMutationScope must use the closed schemaVersion 1 shape');
  }
  const actions = asObject(source['actions'], 'flowkitMutationScope.actions');
  const keys = Object.keys(actions).sort();
  if (keys.length !== 2 || keys[0] !== 'apply' || keys[1] !== 'revise-apply') {
    throw new FlowkitError('MUTATION_DECLARATION_INVALID', 'flowkitMutationScope.actions must define apply and revise-apply only');
  }
  const entry = asObject(actions[action], `flowkitMutationScope.actions.${action}`);
  if (Object.keys(entry).length !== 1 || !Array.isArray(entry['selectors'])) {
    throw new FlowkitError('MUTATION_DECLARATION_INVALID', `flowkitMutationScope.actions.${action} must contain selectors only`);
  }
  const declaration = validateMutationDeclaration({
    schemaVersion: 1,
    action,
    designRef,
    selectors: entry['selectors'],
  }, action);
  await assertExistingSelectorsRemainWithinRepo(repoRoot, declaration.selectors.map((selector) => selector.path));
  return declaration;
}

async function assertExistingSelectorsRemainWithinRepo(repoRoot: string, paths: readonly string[]): Promise<void> {
  const physicalRoot = await realpath(repoRoot);
  for (const path of paths) {
    try {
      const physicalPath = await realpath(join(repoRoot, path));
      const fromRoot = relative(physicalRoot, physicalPath);
      if (fromRoot === '' || fromRoot === '..' || fromRoot.startsWith('../') || fromRoot.startsWith('..\\') || isAbsolute(fromRoot)) {
        throw new FlowkitError('MUTATION_DECLARATION_INVALID', 'mutation selector resolves outside the repository', { path });
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }
  }
}

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new FlowkitError('MUTATION_DECLARATION_INVALID', `${label} must be an object`);
  }
  return value as Record<string, unknown>;
}
