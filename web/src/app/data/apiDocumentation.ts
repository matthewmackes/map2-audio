export interface ApiEndpointDocumentation {
  title: string
  purpose: string
  whenToUse: string
  useCases: string[]
  exampleRequest: string
  exampleResponse: string
  related: string[]
  gotchas: string[]
  performance?: string
  deprecated?: { reason: string; migration: string }
  sequenceDiagramId?: string
}

export interface ApiDomainDocumentation {
  title: string
  description: string
  keyCapabilities: string[]
}

export interface ApiSequenceDiagram {
  id: string
  title: string
  mermaid: string
}

const doc = (
  title: string,
  purpose: string,
  whenToUse: string,
  related: string[],
  performance?: string,
): ApiEndpointDocumentation => ({
  title,
  purpose,
  whenToUse,
  useCases: [
    `Integrate ${title.toLowerCase()} into operator workflows.`,
    `Use ${title.toLowerCase()} during troubleshooting and scripted automation.`,
  ],
  exampleRequest: '{"method":"GET","path":"/api/..."}',
  exampleResponse: '{"status":"ok"}',
  related,
  gotchas: ['Node-targeted calls should include node selection in cluster mode.', 'Check permission/feature flags for development-only routes.'],
  performance,
})

export const API_DOMAIN_DOCS: Record<string, ApiDomainDocumentation> = {
  audio: {
    title: 'Audio Engine',
    description: 'Controls the JUCE-based real-time processing engine, transport state, health checks, and runtime diagnostics.',
    keyCapabilities: ['Start/stop/restart engine', 'Inspect latency, xruns, and signal health', 'Read source-of-truth synchronization status'],
  },
  midi: {
    title: 'MIDI',
    description: 'Core MIDI control surface for routing, mappings, learn workflows, and distributed node MIDI operations.',
    keyCapabilities: ['Manage MIDI devices and mappings', 'Operate MIDI Hub routing graph', 'Observe cluster clock and node links'],
  },
  avb: {
    title: 'AVB/TSN',
    description: 'IEEE 1722 routing and AVDECC management for talker/listener topology, stream status, and PTP alignment.',
    keyCapabilities: ['Discover AVB endpoints', 'Create/tear down routes', 'Track PTP lock and stream ownership'],
  },
  cluster: {
    title: 'Cluster',
    description: 'Multi-node orchestration APIs covering peer discovery, cluster health, admin operations, update controls, and failover readiness.',
    keyCapabilities: ['Peer discovery and summary', 'Admin reboot/reset/update operations', 'Cross-node health aggregation'],
  },
  mpx1: {
    title: 'MPX-1',
    description: 'Lexicon MPX-1 control APIs for program management, parameter edits, diagnostics, and SysEx-driven workflows.',
    keyCapabilities: ['Program and patch control', 'Diagnostics and state reporting', 'Library and mapping operations'],
  },
  tesira: {
    title: 'Tesira',
    description: 'Biamp Tesira fleet management for discovery, device status, DSP block operations, deployment and AVB bridge visibility.',
    keyCapabilities: ['Fleet discovery and detail', 'DSP block edits and compile', 'Deployment and diagnostics'],
  },
  health: {
    title: 'Health',
    description: 'Liveness/readiness and dependency diagnostics used by operators and automation to validate platform uptime.',
    keyCapabilities: ['Health checks', 'Status rollups', 'Readiness gate checks'],
  },
  config: {
    title: 'Config',
    description: 'Configuration model APIs for reading/updating runtime settings with schema-aware validation and restart semantics.',
    keyCapabilities: ['Read config keys', 'Write config keys', 'Track distributed config propagation'],
  },
  observatory: {
    title: 'API Observatory',
    description: 'Developer workbench APIs for proxying requests, traffic capture, and session export/import for diagnostics.',
    keyCapabilities: ['Dev proxy requests', 'Traffic timeline and stats', 'Session recording/export'],
  },
}

export const API_SEQUENCE_DIAGRAMS: ApiSequenceDiagram[] = [
  {
    id: 'avb-stream-connect',
    title: 'AVB Stream Connection',
    mermaid: `sequenceDiagram\n  participant UI\n  participant API as /api/avb/*\n  participant AVDECC\n  UI->>API: Discover entities\n  API->>AVDECC: Enumerate talkers/listeners\n  UI->>API: Connect route\n  API->>AVDECC: ACMP connect\n  AVDECC-->>API: Connection result\n  API-->>UI: Stream state + verification`,
  },
  {
    id: 'cluster-node-join',
    title: 'Cluster Node Join',
    mermaid: `sequenceDiagram\n  participant Node\n  participant mDNS\n  participant Leader\n  participant Registry\n  Node->>mDNS: announce service\n  Leader->>Node: handshake\n  Leader->>Registry: register node\n  Registry-->>Leader: replicated state\n  Leader-->>Node: ready`,
  },
  {
    id: 'mpx1-program-change',
    title: 'MPX-1 Program Change',
    mermaid: `sequenceDiagram\n  participant UI\n  participant MAP2\n  participant MPX1\n  UI->>MAP2: POST /api/mpx1/program\n  MAP2->>MPX1: MIDI Program Change\n  MPX1-->>MAP2: SysEx state echo\n  MAP2-->>UI: updated program payload`,
  },
  {
    id: 'audio-engine-restart',
    title: 'Audio Engine Restart',
    mermaid: `sequenceDiagram\n  participant UI\n  participant API as /api/audio/restart\n  participant Engine\n  UI->>API: restart request\n  API->>Engine: stop\n  API->>Engine: apply runtime config\n  API->>Engine: start\n  Engine-->>API: health status\n  API-->>UI: restart result`,
  },
  {
    id: 'snapshot-save-load',
    title: 'Snapshot Save / Load Cycle',
    mermaid: `sequenceDiagram\n  participant UI\n  participant SnapshotsAPI\n  participant Storage\n  participant Engine\n  UI->>SnapshotsAPI: save snapshot\n  SnapshotsAPI->>Storage: persist blob\n  UI->>SnapshotsAPI: update snapshot\n  SnapshotsAPI->>Engine: apply state\n  Engine-->>UI: confirmation + health`,
  },
]

export const API_ENDPOINT_CHANGELOG: Array<{ path: string; method: string; date: string; description: string }> = []

export const API_DEPRECATION_REGISTRY: Array<{ path: string; method: string; migration: string; reason: string }> = []

export const API_PERFORMANCE_NOTES: Record<string, string> = {
  'GET /api/cluster/health/extended/overview': 'Queries all cluster nodes. Latency scales with node count (O(n)).',
  'POST /api/audio/restart': 'Triggers engine restart and can take 500ms+ depending on backend availability.',
  'POST /api/dev/proxy': 'Remote target timing depends on network path and target node load.',
  'GET /api/observatory/traffic/stats': 'Aggregation is computed from in-memory ring buffer; cheap up to configured buffer size.',
}

export const API_ENDPOINT_DOCS: Record<string, ApiEndpointDocumentation> = {
  'GET /api/health': doc('Health Check', 'Returns service liveness for probes and deployment guards.', 'Use for readiness and heartbeat checks.', ['GET /api/system/status']),
  'GET /api/system/info': doc('System Info', 'Returns host and runtime info used in support diagnostics.', 'Use when identifying host capabilities and runtime metadata.', ['GET /api/health', 'GET /api/system/status']),
  'GET /api/system/status': doc('System Status', 'Returns summarized system state.', 'Use in dashboards and node overviews.', ['GET /api/system/info', 'GET /api/audio/status']),
  'GET /api/audio/status': doc('Audio Status', 'Returns engine run-state, device, and active graph summary.', 'Use for UI banners and health gating.', ['POST /api/audio/start', 'POST /api/audio/stop']),
  'POST /api/audio/start': doc('Audio Start', 'Starts the audio engine if stopped.', 'Use during startup orchestration.', ['GET /api/audio/status', 'POST /api/audio/stop']),
  'POST /api/audio/stop': doc('Audio Stop', 'Stops the audio engine safely.', 'Use before hardware changes or controlled shutdown.', ['GET /api/audio/status', 'POST /api/audio/start']),
  'POST /api/audio/restart': doc('Audio Restart', 'Restarts the audio engine and re-applies runtime settings.', 'Use after backend or device changes.', ['GET /api/audio/status', 'GET /api/audio/source-of-truth'], API_PERFORMANCE_NOTES['POST /api/audio/restart']),
  'GET /api/audio/source-of-truth': doc('Audio Source Of Truth', 'Reports profile/runtime alignment across engine, PipeWire, SPDIF, and AVB.', 'Use to diagnose lock drift and profile mismatches.', ['GET /api/audio/status', 'GET /api/pipewire/status']),
  'GET /api/audio/health': doc('Audio Health', 'Returns xruns, alerts, and signal integrity summaries.', 'Use for live monitoring and alerting.', ['GET /api/audio/status', 'GET /api/audio/health/xruns']),
  'GET /api/audio/health/xruns': doc('Audio Xruns', 'Returns xrun counters and history for callback stability tracking.', 'Use in soak testing and production telemetry.', ['GET /api/audio/health']),
  'GET /api/plugins': doc('Plugin Inventory', 'Returns available plugins and metadata.', 'Use to populate plugin browser UIs.', ['POST /api/plugins/load', 'GET /api/plugins/tags']),
  'POST /api/plugins/load': doc('Plugin Load', 'Loads a plugin into graph context.', 'Use when building or mutating chains.', ['GET /api/plugins', 'POST /api/chains']),
  'GET /api/chains': doc('Chain List', 'Returns chain inventory and active chain references.', 'Use in chain management pages.', ['POST /api/chains', 'POST /api/chains/deploy']),
  'POST /api/chains': doc('Chain Create', 'Creates a new chain model.', 'Use for first-time rig setup or templating.', ['GET /api/chains', 'POST /api/chains/deploy']),
  'POST /api/chains/deploy': doc('Chain Deploy', 'Deploys chain configuration to selected node(s).', 'Use to push validated chains across cluster nodes.', ['GET /api/chains', 'GET /api/cluster/health/extended/overview']),
  'GET /api/snapshots': doc('Snapshot List', 'Returns saved snapshot inventory.', 'Use in snapshot browser and quick-load UI.', ['POST /api/snapshots', 'PATCH /api/snapshots/{snapshot_id}']),
  'POST /api/snapshots': doc('Snapshot Save', 'Persists current engine state into snapshot storage.', 'Use after dial-in or during scene programming.', ['GET /api/snapshots', 'PATCH /api/snapshots/{snapshot_id}']),
  'PATCH /api/snapshots/{snapshot_id}': doc('Snapshot Update', 'Updates snapshot metadata such as naming, categorization, and favorites.', 'Use when curating snapshot libraries.', ['GET /api/snapshots', 'POST /api/snapshots/{snapshot_id}/favorite']),
  'POST /api/snapshots/{snapshot_id}/favorite': doc('Snapshot Favorite Toggle', 'Toggles snapshot favorite status.', 'Use to mark known-good or frequently recalled states.', ['GET /api/snapshots', 'PATCH /api/snapshots/{snapshot_id}']),
  'GET /api/midi/status': doc('MIDI Status', 'Returns MIDI service status and active devices.', 'Use for readiness and troubleshooting.', ['GET /api/midi/devices', 'GET /api/midi-hub/status']),
  'GET /api/midi/devices': doc('MIDI Devices', 'Returns discovered MIDI input/output devices.', 'Use in controller mapping and health views.', ['GET /api/midi/status', 'POST /api/midi/routes']),
  'POST /api/midi/routes': doc('MIDI Route Create', 'Creates a MIDI routing rule.', 'Use when wiring controller inputs to targets.', ['GET /api/midi/routes', 'GET /api/midi/status']),
  'GET /api/midi/routes': doc('MIDI Routes', 'Returns current MIDI route table.', 'Use in routing matrix UI and automation.', ['POST /api/midi/routes', 'DELETE /api/midi/routes/{route_id}']),
  'GET /api/midi-hub/status': doc('MIDI Hub Status', 'Returns native MIDI hub engine status and queue stats.', 'Use when validating MIDI hub runtime health.', ['GET /api/midi-hub/routes', 'POST /api/midi-hub/learn/start']),
  'GET /api/midi-hub/routes': doc('MIDI Hub Routes', 'Returns MIDI hub routing graph edges and route metadata.', 'Use in detailed routing pages.', ['POST /api/midi-hub/routes', 'GET /api/midi-hub/status']),
  'POST /api/midi-hub/learn/start': doc('MIDI Learn Start', 'Starts MIDI learn capture window.', 'Use when mapping controls without manual CC entry.', ['POST /api/midi-hub/learn/stop', 'GET /api/midi-hub/status']),
  'GET /api/midi-cluster/nodes': doc('MIDI Cluster Nodes', 'Returns discovered MIDI-capable nodes.', 'Use for cluster routing and transport checks.', ['GET /api/midi-cluster/connections', 'GET /api/midi-cluster/clock']),
  'GET /api/midi-cluster/connections': doc('MIDI Cluster Connections', 'Returns cross-node MIDI link state.', 'Use for distributed route troubleshooting.', ['GET /api/midi-cluster/nodes', 'GET /api/midi-cluster/clock']),
  'GET /api/midi-cluster/clock': doc('MIDI Cluster Clock', 'Returns distributed MIDI clock health and source.', 'Use for tempo synchronization checks.', ['GET /api/midi-cluster/nodes', 'GET /api/midi-cluster/connections']),
  'GET /api/avb/health': doc('AVB Health', 'Returns AVB subsystem readiness summary.', 'Use for AVB preflight and deployment checks.', ['GET /api/avb/devices', 'GET /api/avb/streams']),
  'GET /api/avb/devices': doc('AVB Devices', 'Returns discovered AVB entities.', 'Use for route selection and diagnostics.', ['GET /api/avb/streams', 'POST /api/avb/routes']),
  'GET /api/avb/streams': doc('AVB Streams', 'Returns active and discovered AVB streams.', 'Use in route/stream inspectors.', ['GET /api/avb/devices', 'POST /api/avb/routes']),
  'POST /api/avb/routes': doc('AVB Route Connect', 'Connects AVB talker/listener endpoints.', 'Use for networked audio route control.', ['GET /api/avb/streams', 'DELETE /api/avb/routes/{route_id}'], 'Can block while remote entity negotiation completes.'),
  'GET /api/cluster/admin/summary': doc('Cluster Admin Summary', 'Returns quick cluster health counts and aggregate health.', 'Use in top-level operator dashboards.', ['GET /api/cluster/health/extended/overview', 'GET /api/peers']),
  'GET /api/cluster/health/extended/overview': doc('Cluster Extended Overview', 'Returns cross-node aggregated overview metrics.', 'Use in fleet-level dashboards and observability tools.', ['GET /api/cluster/admin/summary', 'GET /api/cluster/health/extended/audio'], API_PERFORMANCE_NOTES['GET /api/cluster/health/extended/overview']),
  'GET /api/cluster/health/extended/audio': doc('Cluster Audio Aggregation', 'Returns per-node audio status and health snapshot.', 'Use for distributed audio incident triage.', ['GET /api/cluster/health/extended/overview', 'GET /api/audio/status']),
  'GET /api/cluster/health/extended/dsp': doc('Cluster DSP Aggregation', 'Returns per-node DSP status rollups.', 'Use for cluster CPU/DSP capacity checks.', ['GET /api/dsp/status', 'GET /api/cluster/health/extended/overview']),
  'GET /api/cluster/health/extended/devices': doc('Cluster Hardware Inventory', 'Returns per-node hardware inventory summary.', 'Use when mapping hardware across nodes.', ['GET /api/peers', 'GET /api/system/info']),
  'GET /api/cluster/nodes': doc('Cluster Nodes', 'Returns cluster node list and state details.', 'Use to populate node selectors and admin tables.', ['GET /api/cluster/admin/summary', 'GET /api/peers']),
  'POST /api/cluster/node/reset-default-rejoin': doc('Clone Reset + Rejoin', 'Resets clone identity artifacts and rejoins node into cluster.', 'Use when onboarding cloned hosts.', ['POST /api/cluster/node/reset-default-rejoin/preview', 'GET /api/cluster/nodes']),
  'POST /api/cluster/node/reset-default-rejoin/preview': doc('Clone Reset Preview', 'Previews reset operations without applying changes.', 'Use to validate intended reset side effects.', ['POST /api/cluster/node/reset-default-rejoin']),
  'GET /api/peers': doc('Peer Discovery', 'Returns discovered peers with latency and trust metadata.', 'Use in topology and target selection views.', ['POST /api/peers/{peer_id}/ping', 'GET /api/peers/{peer_id}/latency']),
  'POST /api/peers/{peer_id}/ping': doc('Peer Ping', 'Measures peer connectivity and latency.', 'Use before routing heavy traffic to a peer node.', ['GET /api/peers']),
  'GET /api/tesira/fleet': doc('Tesira Fleet', 'Returns fleet-level Tesira status and devices.', 'Use in Tesira overview dashboards.', ['GET /api/tesira/devices/{device_id}', 'POST /api/tesira/deploy']),
  'GET /api/tesira/devices/{device_id}': doc('Tesira Device Detail', 'Returns detailed info for one Tesira device.', 'Use for per-device diagnostics and controls.', ['GET /api/tesira/fleet', 'POST /api/tesira/design/compile']),
  'POST /api/tesira/design/compile': doc('Tesira Design Compile', 'Compiles design workspace changes.', 'Use after editing graph/workspace resources.', ['GET /api/tesira/design/workspaces', 'POST /api/tesira/deploy']),
  'POST /api/tesira/deploy': doc('Tesira Deploy', 'Deploys compiled design or profile to selected devices.', 'Use during staged deployment flows.', ['POST /api/tesira/design/compile', 'GET /api/tesira/fleet']),
  'GET /api/mpx1/status': doc('MPX-1 Status', 'Returns MPX-1 connection and runtime state.', 'Use for hardware status indicators and diagnostics.', ['POST /api/mpx1/program', 'GET /api/mpx1/library']),
  'POST /api/mpx1/program': doc('MPX-1 Program Change', 'Requests MPX-1 program update.', 'Use for scene changes and show control.', ['GET /api/mpx1/status', 'GET /api/mpx1/library'], undefined),
  'GET /api/mpx1/library': doc('MPX-1 Library', 'Returns MPX-1 preset/library metadata.', 'Use in librarian and editor pages.', ['GET /api/mpx1/status', 'POST /api/mpx1/program']),
  'GET /api/dev/proxy': doc('Dev Proxy (Info)', 'Reserved path for observatory proxy operations.', 'Use POST on this endpoint for request forwarding.', ['POST /api/dev/proxy']),
  'POST /api/dev/proxy': doc('Dev Proxy Request', 'Proxies HTTP requests to local or cluster targets with timing metadata.', 'Use from API Observatory Request Builder.', ['GET /api/observatory/traffic', 'GET /api/peers'], API_PERFORMANCE_NOTES['POST /api/dev/proxy']),
  'GET /api/observatory/traffic': doc('Traffic Feed', 'Returns captured traffic events from bounded buffer.', 'Use in Traffic Monitor list/waterfall rendering.', ['GET /api/observatory/traffic/stats', 'POST /api/observatory/traffic/recording/start']),
  'GET /api/observatory/traffic/stats': doc('Traffic Stats', 'Returns aggregate latency/error/rate statistics from captured traffic.', 'Use in observability KPI cards.', ['GET /api/observatory/traffic', 'GET /api/observatory/traffic/sessions'], API_PERFORMANCE_NOTES['GET /api/observatory/traffic/stats']),
  'POST /api/observatory/traffic/recording/start': doc('Traffic Recording Start', 'Starts named traffic recording session.', 'Use before reproducing issues or performance regressions.', ['POST /api/observatory/traffic/recording/stop', 'GET /api/observatory/traffic/sessions']),
  'POST /api/observatory/traffic/recording/stop': doc('Traffic Recording Stop', 'Stops active traffic recording session.', 'Use when capture window is complete.', ['POST /api/observatory/traffic/recording/start', 'GET /api/observatory/traffic/sessions']),
  'GET /api/observatory/traffic/sessions': doc('Traffic Session List', 'Returns saved traffic recording sessions.', 'Use to replay and compare capture runs.', ['GET /api/observatory/traffic/sessions/{session_id}']),
  'GET /api/observatory/traffic/sessions/{session_id}': doc('Traffic Session Detail', 'Returns one traffic recording session payload and stats.', 'Use for replay/diff workflows.', ['GET /api/observatory/traffic/sessions', 'GET /api/observatory/traffic/sessions/{session_id}/export']),
  'GET /api/observatory/traffic/sessions/{session_id}/export': doc('Traffic Session Export', 'Exports recording session as JSON or HAR.', 'Use for external sharing and archival.', ['GET /api/observatory/traffic/sessions/{session_id}']),
  'POST /api/observatory/traffic/sessions/import': doc('Traffic Session Import', 'Imports a recording session payload.', 'Use for cross-env replay comparisons.', ['GET /api/observatory/traffic/sessions']),
}

export function getEndpointDoc(method: string, path: string): ApiEndpointDocumentation | null {
  const key = `${method.toUpperCase()} ${path}`
  return API_ENDPOINT_DOCS[key] ?? null
}
