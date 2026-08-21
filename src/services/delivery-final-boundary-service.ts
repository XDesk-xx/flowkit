import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readFormalFactSnapshot } from '../facts/formal-fact-reader.js';
import { runCommand } from '../shared/external-command.js';
import { FlowkitError } from '../shared/errors.js';
import { DeliveryManifestDocument } from '../persistence/delivery-manifest-document.js';
import { deliveryFinalCandidateRefFor } from '../domain/delivery-finalization.js';
import { boundedFinalCandidateFiles } from './delivery-finalize-service.js';

async function snapshot(repoRoot:string,deliveryId:string){return readFormalFactSnapshot({repoRoot,deliveryId,runsPathPrefix:'.flowkit/runs',openspecChangesPath:'openspec/changes',manifestPathPrefix:'openspec/delivery-groups'});}
async function git(repoRoot:string,args:string[]){const r=await runCommand('git',args,{cwd:repoRoot}); if(r.kind!=='exited'||r.exitCode!==0) throw new FlowkitError('DELIVERY_FINAL_HANDOFF_GIT_FAILED',`git ${args.join(' ')} failed`); return r.stdout.trim();}
async function gitRaw(repoRoot:string,args:string[]){const r=await runCommand('git',args,{cwd:repoRoot}); if(r.kind!=='exited'||r.exitCode!==0) throw new FlowkitError('DELIVERY_FINAL_HANDOFF_GIT_FAILED',`git ${args.join(' ')} failed`); return r.stdout;}
export interface DeliveryFinalHandoff {readonly deliveryId:string;readonly subject:string;readonly trailers:readonly string[];readonly paths:readonly string[];readonly qualifiedBaseRevision:string;readonly candidateRef:string;}

export async function buildDeliveryFinalHandoff(repoRoot:string,deliveryId:string):Promise<DeliveryFinalHandoff>{
  const snap=await snapshot(repoRoot,deliveryId);
  if(snap.conflicts.length) throw new FlowkitError('FORMAL_FACT_CONFLICT','Delivery Final handoff requires conflict-free facts');
  if(snap.deliveryState!=='completed'||!snap.deliveryFinalization||!snap.deliveryFinalizationQualification) throw new FlowkitError('DELIVERY_FINALIZATION_MISSING','completed F1 finalization projection is required');
  const fin=snap.deliveryFinalization, qual=snap.deliveryFinalizationQualification;
  if(fin.qualificationRef!==qual.qualificationRef) throw new FlowkitError('DELIVERY_FINALIZATION_MISMATCH','stored finalization qualification is stale');
  const owner=snap.ownerAuthorizations.find((f)=>f.ref===fin.ownerAuthorizationRef&&f.decision==='authorize-delivery-finalize'&&f.finalizationQualificationRef===qual.qualificationRef);
  if(!owner) throw new FlowkitError('DELIVERY_FINALIZATION_MISMATCH','stored Owner Finalize authorization is stale');
  const head=await git(repoRoot,['rev-parse','HEAD']); if(head!==qual.qualifiedBaseRevision) throw new FlowkitError('DELIVERY_FINAL_HANDOFF_BASE_MISMATCH','current HEAD does not match qualifiedBaseRevision');
  if((await git(repoRoot,['diff','--cached','--name-only']))!=='') throw new FlowkitError('DELIVERY_FINAL_HANDOFF_INDEX_NOT_EMPTY','Delivery Final handoff requires empty index');
  const status=await gitRaw(repoRoot,['status','--porcelain=v1','--untracked-files=all']);
  const paths=status.split('\n').filter(Boolean).map((line)=>line.slice(3).trim().replace(/^"|"$/g,'').replace(/\\/g,'/'));
  const bounded=[`openspec/delivery-groups/${deliveryId}.yaml`,...(snap.deliveryArchitectureImpact===true?[`architecture/${deliveryId}/json/actual.architecture.json`]:[])];
  const unrelated=paths.filter((p)=>!bounded.includes(p)); if(unrelated.length) throw new FlowkitError('DELIVERY_FINAL_HANDOFF_UNRELATED_DRIFT','unrelated drift blocks Delivery Final handoff',{paths:unrelated});
  const completed=await readFile(join(repoRoot,'openspec','delivery-groups',`${deliveryId}.yaml`),'utf8');
  const active=DeliveryManifestDocument.parse(completed).inverseFinalization();
  const files=await boundedFinalCandidateFiles(repoRoot,deliveryId,snap.deliveryArchitectureImpact===true,active);
  const candidateRef=deliveryFinalCandidateRefFor({deliveryId,qualifiedBaseRevision:qual.qualifiedBaseRevision,files});
  if(candidateRef!==fin.candidateRef) throw new FlowkitError('DELIVERY_FINAL_CANDIDATE_MISMATCH','reconstructed candidateRef does not match completed finalization');
  return {deliveryId,subject:`chore(flowkit): finalize ${deliveryId}`,trailers:[`Flowkit-Delivery: ${deliveryId}`,'Flowkit-Boundary: delivery-final',`Owner-Authorization: ${owner.ref}`],paths:bounded,qualifiedBaseRevision:qual.qualifiedBaseRevision,candidateRef};
}
