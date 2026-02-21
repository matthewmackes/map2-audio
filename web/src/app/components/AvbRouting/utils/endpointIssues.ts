import type { AvbNode, Endpoint } from '../types';

type EndpointIssueCandidate = Pick<Endpoint, 'available' | 'node_id'>;
type EndpointIssueNodeLookup = Record<string, Pick<AvbNode, 'status'> | undefined>;

/**
 * Endpoint-level issues used by operator-facing quick filters and counters.
 * Mirrors the current "issuesOnly" semantics in filtering logic.
 */
export function hasEndpointOperationalIssue(
  endpoint: EndpointIssueCandidate,
  nodes: EndpointIssueNodeLookup
): boolean {
  const nodeStatus = nodes[endpoint.node_id]?.status;
  return !endpoint.available || nodeStatus === 'degraded' || nodeStatus === 'offline';
}

export function countEndpointsWithOperationalIssues(
  endpoints: EndpointIssueCandidate[],
  nodes: EndpointIssueNodeLookup
): number {
  return endpoints.filter((endpoint) => hasEndpointOperationalIssue(endpoint, nodes)).length;
}
