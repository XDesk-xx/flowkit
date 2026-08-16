export const OPENSPEC_SUPPORTED_ARTIFACT_IDS = ['proposal', 'specs', 'design', 'tasks'] as const;
export type OpenSpecArtifactId = (typeof OPENSPEC_SUPPORTED_ARTIFACT_IDS)[number];

export interface OpenSpecStatusEntry {
  readonly severity: string;
  readonly code?: string;
  readonly message?: string;
}

export interface OpenSpecRootView {
  readonly path: string;
}

export interface OpenSpecPlanningHomeView {
  readonly kind: 'repo';
  readonly root: string;
  readonly changesDir: string;
}

export interface OpenSpecActionContextView {
  readonly mode: 'repo-local';
  readonly sourceOfTruth: 'repo';
  readonly allowedEditRoots: readonly string[];
}

export interface OpenSpecArtifactPathView {
  readonly artifactId: OpenSpecArtifactId;
  readonly logicalPaths: readonly string[];
  readonly physicalPaths: readonly string[];
}

export interface OpenSpecChangeStatusView {
  readonly changeId: string;
  readonly schemaName: 'spec-driven';
  readonly root: OpenSpecRootView;
  readonly planningHome: OpenSpecPlanningHomeView;
  readonly changeRoot: string;
  readonly changeRootLogical: string;
  readonly archiveNamespaceRoot: string;
  readonly archiveNamespaceRootLogical: string;
  readonly actionContext: OpenSpecActionContextView;
  readonly artifactPaths: Readonly<Record<OpenSpecArtifactId, OpenSpecArtifactPathView>>;
  readonly status: readonly OpenSpecStatusEntry[];
}

export interface OpenSpecArtifactInstructionsView {
  readonly changeId: string;
  readonly artifactId: OpenSpecArtifactId;
  readonly schemaName: 'spec-driven';
  readonly resolvedOutputLogicalPath: string;
  readonly existingOutputLogicalPaths: readonly string[];
  readonly dependencies: readonly string[];
  readonly unlocks: readonly string[];
  readonly instruction: string;
  readonly template: string;
}

export interface OpenSpecApplyInstructionsView {
  readonly changeId: string;
  readonly schemaName: 'spec-driven';
  readonly contextFiles: Readonly<Record<OpenSpecArtifactId, readonly string[]>>;
  readonly progress: {
    readonly total: number;
    readonly complete: number;
    readonly remaining: number;
  };
  readonly state?: string;
}


export interface OpenSpecPreparedActionContextView {
  readonly version: string;
  readonly changeId: string;
  readonly changeRootLogical: string;
  readonly artifactPaths: Readonly<Record<OpenSpecArtifactId, readonly string[]>>;
  readonly artifactInstructions?: Readonly<Record<OpenSpecArtifactId, OpenSpecArtifactInstructionsView>>;
  readonly applyInstructions?: OpenSpecApplyInstructionsView;
}

/**
 * A read-only OpenSpec snapshot scoped to one formal Flowkit operation.
 * It is intentionally not persisted or reused after an action mutates the
 * working tree.
 */
export interface OpenSpecOperationProjection {
  readonly projectionVersion: 1;
  readonly version: string;
  readonly changeId: string;
  readonly status: OpenSpecChangeStatusView;
  readonly artifactInstructions?: Readonly<Record<OpenSpecArtifactId, OpenSpecArtifactInstructionsView>>;
  readonly applyInstructions?: OpenSpecApplyInstructionsView;
  readonly validation?: OpenSpecValidationView;
  readonly invocationDiagnostics: readonly string[];
}

/**
 * D2 archive-only persisted entry projection. It deliberately preserves only
 * the OpenSpec keyed identity needed to reconstruct the archive Action's
 * external semantic context after the active Change has been relocated.
 */
export interface ArchiveEntryOpenSpecProjection {
  readonly projectionVersion: 1;
  readonly version: string;
  readonly changeId: string;
  readonly changeRootLogical: string;
  readonly artifactPaths: Readonly<Record<OpenSpecArtifactId, readonly string[]>>;
}

export interface OpenSpecValidationIssue {
  readonly severity?: string;
  readonly path?: string;
  readonly message?: string;
  readonly code?: string;
}

export interface OpenSpecValidationView {
  readonly changeId: string;
  readonly valid: boolean;
  readonly issues: readonly OpenSpecValidationIssue[];
  readonly status: readonly OpenSpecStatusEntry[];
  readonly exitCode: number;
}

export interface OpenSpecArchiveTotals {
  readonly added: number;
  readonly modified: number;
  readonly removed: number;
  readonly renamed: number;
}

export interface OpenSpecArchiveSuccessObservation {
  readonly kind: 'success';
  readonly change: string;
  readonly archivedAs: string;
  readonly path: string;
  readonly specsUpdated: boolean;
  readonly totals?: OpenSpecArchiveTotals;
}

export interface OpenSpecArchiveFailureObservation {
  readonly kind: 'failure';
  readonly exitCode: number;
  readonly status: readonly {
    readonly severity: string;
    readonly code?: string;
  }[];
}

export type OpenSpecArchiveTerminalObservation =
  | OpenSpecArchiveSuccessObservation
  | OpenSpecArchiveFailureObservation;

export interface OpenSpecArchiveInvocation {
  readonly spawned: boolean;
  readonly timedOut: boolean;
  readonly exitCode: number;
  readonly observation?: OpenSpecArchiveTerminalObservation;
  readonly transportDiagnosis?: string;
}

export const OPENSPEC_ARCHIVE_SURFACE_VERSION = 'openspec-archive-mutation-v1' as const;

export interface ArchiveMutationGuardTerminalObservation {
  readonly kind: 'success' | 'failure';
  readonly resultFingerprint: string;
  readonly normalized: OpenSpecArchiveTerminalObservation;
}

export interface ArchiveMutationGuard {
  readonly state: 'armed' | 'recovery-admitted';
  readonly surfaceVersion: typeof OPENSPEC_ARCHIVE_SURFACE_VERSION;
  readonly changeRoot: string;
  readonly canonicalSpecsRoot: 'openspec/specs';
  readonly archiveNamespaceRoot: string;
  readonly preArchiveGenerationFingerprint: string;
  readonly terminalObservation?: ArchiveMutationGuardTerminalObservation;
}
