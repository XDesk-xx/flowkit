import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readFormalFactSnapshot } from '../facts/formal-fact-reader.js';
import { next } from '../policy/next.js';
import { runCommand } from '../shared/external-command.js';
import { FlowkitError } from '../shared/errors.js';
import { atomicWriteFile } from '../shared/atomic-write.js';
import { DeliveryManifestDocument } from '../persistence/delivery-manifest-document.js';
import { deliveryFinalCandidateRefFor, type DeliveryFinalizationProjection } from '../domain/delivery-finalization.js';

function manifestPath(repoRoot: string, deliveryId: string): string { return join(repoRoot, 'openspec', 'delivery-groups', `${deliveryId}.yaml`); }
function sha(value: string | Buffer): string { return createHash('sha256').update(value).digest('hex'); }

async function snapshot(repoRoot: string, deliveryId: string) {
  return readFormalFactSnapshot({ repoRoot, deliveryId, runsPathPrefix: '.flowkit/runs', openspecChangesPath: 'openspec/changes', manifestPathPrefix: 'openspec/delivery-groups' });
}

async function head(repoRoot: string): Promise<string> {
  const r=await runCommand('git',['rev-parse','HEAD'],{cwd:repoRoot});
  if(r.kind!=='exited'||r.exitCode!==0) throw new FlowkitError('FINALIZE_GIT_PREFLIGHT_FAILED','cannot resolve current HEAD');
  return r.stdout.trim();
}

async function assertIndexEmpty(repoRoot: string): Promise<void> {
  const r=await runCommand('git',['diff','--cached','--name-only'],{cwd:repoRoot});
  if(r.kind!=='exited'||r.exitCode!==0||r.stdout.trim()!=='') throw new FlowkitError('FINALIZE_GIT_PREFLIGHT_FAILED','Finalize requires an empty Git index');
}

async function dirtyPaths(repoRoot: string): Promise<readonly string[]> {
  const r=await runCommand('git',['status','--porcelain=v1','--untracked-files=all'],{cwd:repoRoot});
  if(r.kind!=='exited'||r.exitCode!==0) throw new FlowkitError('FINALIZE_GIT_PREFLIGHT_FAILED','cannot inspect Git worktree');
  return r.stdout.split('\n').filter(Boolean).map((line)=>line.slice(3).trim().replace(/^"|"$/g,'').replace(/\\/g,'/'));
}

export async function boundedFinalCandidateFiles(repoRoot: string, deliveryId: string, architectureImpact: boolean, activeManifestBytes?: string): Promise<readonly {path:string;sha256:string}[]> {
  const manifestRel=`openspec/delivery-groups/${deliveryId}.yaml`;
  const manifestBytes=activeManifestBytes ?? await readFile(join(repoRoot,manifestRel),'utf8');
  const files=[{path:manifestRel,sha256:sha(manifestBytes)}];
  if(architectureImpact){
    const actualRel=`architecture/${deliveryId}/json/actual.architecture.json`;
    const bytes=await readFile(join(repoRoot,actualRel));
    files.push({path:actualRel,sha256:sha(bytes)});
  }
  return files;
}

export async function finalizeDelivery(repoRoot: string, deliveryId: string): Promise<{deliveryId:string; finalization:DeliveryFinalizationProjection; changed:true}> {
  const snap=await snapshot(repoRoot,deliveryId);
  if(snap.conflicts.length) throw new FlowkitError('FORMAL_FACT_CONFLICT','Finalize requires conflict-free formal facts');
  if(snap.deliveryState!=='active') throw new FlowkitError('DELIVERY_NOT_ACTIVE','Finalize requires delivery.state=active');
  if(snap.changes.some((c)=>c.state==='active')) throw new FlowkitError('FINALIZE_PRECONDITION_FAILED','Finalize requires no active Change');
  const qualification=snap.deliveryFinalizationQualification;
  if(!qualification) throw new FlowkitError('FINALIZATION_QUALIFICATION_UNAVAILABLE','current exact Finalize qualification is unavailable');
  const owner=snap.ownerAuthorizations.find((f)=>f.decision==='authorize-delivery-finalize'&&f.deliveryId===deliveryId&&f.finalizationQualificationRef===qualification.qualificationRef);
  if(!owner) throw new FlowkitError('FINALIZE_AUTHORIZATION_MISSING','matching qualification-bound Owner Finalize authorization is required');
  const policy=next(snap);
  if(policy.kind!=='delivery-behavior'||policy.behavior!=='delivery-finalize') throw new FlowkitError('FINALIZE_POLICY_MISMATCH','Policy is not requesting Delivery Finalize behavior');

  await assertIndexEmpty(repoRoot);
  const h1=await head(repoRoot);
  if(h1!==qualification.qualifiedBaseRevision) throw new FlowkitError('FINALIZE_QUALIFIED_BASE_MISMATCH',`current HEAD ${h1} does not match qualifiedBaseRevision ${qualification.qualifiedBaseRevision}`);
  const allowed=new Set([`openspec/delivery-groups/${deliveryId}.yaml`, ...(snap.deliveryArchitectureImpact===true?[`architecture/${deliveryId}/json/actual.architecture.json`]:[])]);
  const dirty=await dirtyPaths(repoRoot);
  const unrelated=dirty.filter((p)=>!allowed.has(p));
  if(unrelated.length) throw new FlowkitError('FINALIZE_UNRELATED_DRIFT','Finalize candidate contains unrelated Git drift',{paths:unrelated});
  const h2=await head(repoRoot);
  if(h2!==h1) throw new FlowkitError('FINALIZE_HEAD_DRIFT','HEAD changed during Finalize preflight');

  const path=manifestPath(repoRoot,deliveryId);
  const activeBytes=await readFile(path,'utf8');
  const files=await boundedFinalCandidateFiles(repoRoot,deliveryId,snap.deliveryArchitectureImpact===true,activeBytes);
  const candidateRef=deliveryFinalCandidateRefFor({deliveryId,qualifiedBaseRevision:qualification.qualifiedBaseRevision,files});
  const projection:DeliveryFinalizationProjection={schemaVersion:1,qualificationRef:qualification.qualificationRef,ownerAuthorizationRef:owner.ref,candidateRef};
  const doc=DeliveryManifestDocument.parse(activeBytes);
  doc.publishFinalization(projection);
  await atomicWriteFile(path,doc.toString());
  return {deliveryId,finalization:projection,changed:true};
}
