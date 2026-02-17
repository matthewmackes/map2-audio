import type { AvbNode } from '../types';

/**
 * Deterministic node ordering for navigation surfaces.
 * Priority: local node, pinned nodes, online nodes, then name/id.
 */
export function sortNodesForNavigation(nodes: AvbNode[], localNodeId: string): AvbNode[] {
  return [...nodes].sort((a, b) => {
    if (a.node_id === localNodeId) return -1;
    if (b.node_id === localNodeId) return 1;
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    if (a.status === 'online' && b.status !== 'online') return -1;
    if (a.status !== 'online' && b.status === 'online') return 1;

    const byName = a.name.localeCompare(b.name);
    if (byName !== 0) return byName;
    return a.node_id.localeCompare(b.node_id);
  });
}
