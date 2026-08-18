import { ArchitectureService, type DeliveryArchitectureKind } from '../architecture/architecture-service.js';
import { discoverActiveDelivery } from './context-loader.js';

export async function runArchitectureCli(
  repoRoot: string,
  args: readonly string[],
): Promise<Record<string, unknown> | undefined> {
  if (args[0] !== 'architecture') return undefined;
  const deliveryId = await discoverActiveDelivery(repoRoot);
  const service = new ArchitectureService({ repoRoot, deliveryId });

  if (args[1] === 'render' && args.length === 3) {
    const kind = args[2];
    if (kind !== 'current' && kind !== 'planned' && kind !== 'actual') return undefined;
    return service.render(kind);
  }

  if (args[1] === 'compare' && args.length === 4) {
    const validKinds = new Set<DeliveryArchitectureKind>(['current', 'planned', 'actual']);
    const baseKind = args[2] as DeliveryArchitectureKind;
    const headKind = args[3] as DeliveryArchitectureKind;
    if (!validKinds.has(baseKind) || !validKinds.has(headKind)) return undefined;
    return service.compare(baseKind, headKind);
  }
  return undefined;
}
