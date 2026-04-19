export interface ClusterTestRequest {
  id: string
  name: string
  method: string
  url: string
  nodeTarget: 'leader' | 'any' | 'all'
  body?: string
}

export interface ClusterTestCollectionTemplate {
  id: string
  name: string
  description: string
  requests: ClusterTestRequest[]
}

export const CLUSTER_TEST_COLLECTIONS: ClusterTestCollectionTemplate[] = [
  {
    id: 'cluster-health-check',
    name: 'Full cluster health check',
    description: 'Validates peer discovery, cluster summary, and cross-node audio/health endpoints.',
    requests: [
      { id: 'r1', name: 'Peers', method: 'GET', url: '/api/peers', nodeTarget: 'leader' },
      { id: 'r2', name: 'Admin summary', method: 'GET', url: '/api/cluster/admin/summary', nodeTarget: 'leader' },
      { id: 'r3', name: 'Extended overview', method: 'GET', url: '/api/cluster/health/extended/overview', nodeTarget: 'leader' },
      { id: 'r4', name: 'Audio status fanout', method: 'GET', url: '/api/audio/status?node_id=all', nodeTarget: 'all' },
    ],
  },
  {
    id: 'node-join-leave-cycle',
    name: 'Node join/leave cycle',
    description: 'Exercises peer discovery and node health transitions around join/leave behavior.',
    requests: [
      { id: 'r1', name: 'List peers', method: 'GET', url: '/api/peers', nodeTarget: 'leader' },
      { id: 'r2', name: 'Cluster nodes', method: 'GET', url: '/api/cluster/nodes', nodeTarget: 'leader' },
      { id: 'r3', name: 'Cluster summary', method: 'GET', url: '/api/cluster/admin/summary', nodeTarget: 'leader' },
    ],
  },
  {
    id: 'leader-election-verification',
    name: 'Leader election verification',
    description: 'Checks control-plane continuity through leadership-sensitive endpoints.',
    requests: [
      { id: 'r1', name: 'Raft status', method: 'GET', url: '/api/raft/status', nodeTarget: 'leader' },
      { id: 'r2', name: 'Config status', method: 'GET', url: '/api/config/status', nodeTarget: 'leader' },
      { id: 'r3', name: 'Peer list', method: 'GET', url: '/api/peers', nodeTarget: 'any' },
    ],
  },
  {
    id: 'config-sync-validation',
    name: 'Config sync validation',
    description: 'Verifies config endpoint consistency and health propagation across nodes.',
    requests: [
      { id: 'r1', name: 'Config read', method: 'GET', url: '/api/config', nodeTarget: 'leader' },
      { id: 'r2', name: 'Cluster summary', method: 'GET', url: '/api/cluster/admin/summary', nodeTarget: 'all' },
      { id: 'r3', name: 'Audio source-of-truth', method: 'GET', url: '/api/audio/source-of-truth?node_id=all', nodeTarget: 'all' },
    ],
  },
]

export default CLUSTER_TEST_COLLECTIONS
