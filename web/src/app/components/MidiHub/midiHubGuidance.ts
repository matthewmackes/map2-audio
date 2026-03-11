export type MidiHubCapabilityFamily =
  | 'setup_connectivity'
  | 'control_automation'
  | 'capture_analysis'
  | 'advanced_experimental'

export type MidiHubPanelId =
  | 'routing'
  | 'presets'
  | 'scripts'
  | 'macros'
  | 'recorder'
  | 'scheduler'
  | 'clock'
  | 'network'
  | 'midi2'
  | 'innovation'
  | 'traffic'

export type MidiHubValidationKey =
  | 'has_ports'
  | 'has_route'
  | 'has_preset'
  | 'clock_running'
  | 'traffic_active'
  | 'network_session'

export interface MidiHubPanelGuidance {
  id: MidiHubPanelId
  title: string
  family: MidiHubCapabilityFamily
  summary: string
  whyItMatters: string
  prerequisites: string[]
  inlineHints: string[]
  example: string
  recovery: string[]
  advanced?: boolean
}

export interface MidiHubFlowStep {
  id: string
  title: string
  instruction: string
  successCriteria: string
  panel: MidiHubPanelId
  validationKey?: MidiHubValidationKey
}

export interface MidiHubGuidedFlow {
  id: string
  title: string
  objective: string
  riskNote: string
  steps: MidiHubFlowStep[]
}

export interface MidiHubOnboardingStep {
  id: string
  title: string
  detail: string
  anchorId: string
}

export const MIDI_HUB_FAMILY_LABELS: Record<MidiHubCapabilityFamily, string> = {
  setup_connectivity: 'Setup & Connectivity',
  control_automation: 'Control & Automation',
  capture_analysis: 'Capture & Analysis',
  advanced_experimental: 'Advanced & Experimental',
}

export const MIDI_HUB_PANEL_GUIDANCE: Record<MidiHubPanelId, MidiHubPanelGuidance> = {
  routing: {
    id: 'routing',
    title: 'Routing Workspace',
    family: 'setup_connectivity',
    summary: 'Build source-to-destination MIDI routes and inspect path behavior in matrix or graph mode.',
    whyItMatters: 'Routes are the foundation for every preset, automation step, and troubleshooting workflow.',
    prerequisites: ['At least one MIDI input/output port visible in status', 'Destination policy agreed (which device receives which channel)'],
    inlineHints: [
      'Start in Matrix mode for first route creation, then switch to Patchbay for topology reasoning.',
      'Use route type pass-through first; add filters/transforms only after baseline signal flow is stable.',
    ],
    example: 'Example: USB keyboard input -> DIN synth output, channel filter = 1, route enabled.',
    recovery: [
      'If no ports appear, check MIDI Hub status and physical device power before editing routes.',
      'If route exists but no signal passes, disable filters and transform chain to isolate the path.',
    ],
  },
  presets: {
    id: 'presets',
    title: 'Preset Manager',
    family: 'setup_connectivity',
    summary: 'Snapshot, compare, and recall complete MIDI Hub states with default startup and program-slot mapping.',
    whyItMatters: 'Presets turn repeatable show or studio configurations into one-action recalls.',
    prerequisites: ['Base routes created and validated', 'Naming convention for reusable scenes'],
    inlineHints: [
      'Use compare before overwriting a working preset.',
      'Map program-change slots only after preset IDs are stable.',
    ],
    example: 'Example: Save "rehearsal_a", map PC12 to it, set as startup default for cold boot consistency.',
    recovery: [
      'If recall fails, refresh presets and verify preset file integrity.',
      'If startup default is wrong, clear default and reapply after manual recall verification.',
    ],
  },
  scripts: {
    id: 'scripts',
    title: 'Script Engine',
    family: 'control_automation',
    summary: 'Run event-driven script logic for custom MIDI behavior and rapid automation experiments.',
    whyItMatters: 'Scripts reduce repetitive manual routing and unlock custom workflows without backend redeploys.',
    prerequisites: ['Known event payload shape', 'Safe fallback route when script errors occur'],
    inlineHints: ['Start from a provided example script and run against a minimal event payload first.', 'Keep one script per focused behavior to simplify debugging.'],
    example: 'Example: Convert incoming CC1 sweep into multiple CC destinations with scaled output.',
    recovery: [
      'If script output is unexpected, stop timers and inspect the console panel first.',
      'Keep a disabled safe script copy before experimenting with risky logic.',
    ],
  },
  macros: {
    id: 'macros',
    title: 'Cross-Device Macros',
    family: 'control_automation',
    summary: 'Bundle multiple MIDI actions under one trigger across hardware and software destinations.',
    whyItMatters: 'Macros coordinate multi-device scene changes with deterministic timing.',
    prerequisites: ['Validated route IDs', 'Trigger source and destination devices confirmed'],
    inlineHints: ['Name macros by outcome (not by source message).', 'Test each action in isolation before bundling.'],
    example: 'Example: One CC trigger changes synth patch, starts MIDI clock, and recalls a routing preset.',
    recovery: [
      'If macro trigger works partially, inspect action order and destination reachability.',
      'Disable macro quickly if it causes repeated loops during live operation.',
    ],
  },
  recorder: {
    id: 'recorder',
    title: 'Performance Recorder',
    family: 'capture_analysis',
    summary: 'Capture MIDI sessions for playback, export, and regression verification.',
    whyItMatters: 'Recorded event streams provide reproducible evidence for route and timing validation.',
    prerequisites: ['Destination route active', 'Session naming convention and storage path prepared'],
    inlineHints: ['Use short, named takes for faster troubleshooting.', 'Export immediately after a successful capture to avoid accidental data loss.'],
    example: 'Example: Record 30-second phrase, loop playback to confirm transform chain behavior.',
    recovery: [
      'If recording appears empty, confirm input route activity in Traffic Monitor first.',
      'If playback destination is wrong, use destination override before re-recording.',
    ],
  },
  scheduler: {
    id: 'scheduler',
    title: 'Message Scheduler',
    family: 'control_automation',
    summary: 'Queue one-shot or delayed MIDI messages with cancellation and finished-entry hygiene.',
    whyItMatters: 'Schedulers enable deterministic timed control for show automation and integration testing.',
    prerequisites: ['Destination port known', 'Message bytes validated'],
    inlineHints: ['Prefer explicit schedule IDs so cancel actions are predictable.', 'Clear finished entries regularly to keep operational visibility.'],
    example: 'Example: Send PC change 250ms after scene recall to avoid load transients.',
    recovery: [
      'If scheduled message misses target, verify destination connectivity and run_at timing assumptions.',
      'Cancel stale entries before retrying to avoid double-firing.',
    ],
  },
  clock: {
    id: 'clock',
    title: 'Clock Engine',
    family: 'control_automation',
    summary: 'Drive or follow MIDI clock with tap tempo and selectable distribution outputs.',
    whyItMatters: 'Clock stability is required for synchronized delays, sequencers, and arpeggiators.',
    prerequisites: ['Clock source mode decided (internal or external)', 'Output ports selected for distribution'],
    inlineHints: ['Confirm BPM source before enabling running state.', 'Use tap tempo only when external clock lock is not required.'],
    example: 'Example: Internal 120 BPM clock distributed to drum machine and delay pedal ports.',
    recovery: [
      'If tempo drifts, verify source mode and disable conflicting external providers.',
      'Stop and restart clock after port routing changes.',
    ],
  },
  network: {
    id: 'network',
    title: 'Network MIDI + OSC',
    family: 'setup_connectivity',
    summary: 'Manage RTP/UDP sessions and OSC bridge endpoints for remote MIDI interoperability.',
    whyItMatters: 'Network routing expands MIDI Hub beyond local interfaces and enables distributed rigs.',
    prerequisites: ['Reachable host and firewall policy confirmed', 'Session naming standard'],
    inlineHints: ['Create one session and send test data before adding more peers.', 'Keep OSC addresses namespaced by subsystem.'],
    example: 'Example: RTP session to remote synth host with OSC value bridge for automation.',
    recovery: [
      'If network sends fail, verify host reachability and listening mode on the peer.',
      'Delete and recreate stale sessions after network topology changes.',
    ],
  },
  midi2: {
    id: 'midi2',
    title: 'MIDI 2.0 Readiness',
    family: 'advanced_experimental',
    summary: 'Experiment with MIDI-CI discovery, profile/property control, and MIDI1/UMP translation.',
    whyItMatters: 'MIDI 2.0 tools prepare future compatibility and protocol transition testing.',
    prerequisites: ['Device supports MIDI-CI or UMP tests', 'Operator understands protocol fallback boundaries'],
    inlineHints: ['Treat this panel as advanced until target devices are fully validated.', 'Use translator tools to verify message integrity before live use.'],
    example: 'Example: Translate MIDI1 note-on to UMP and verify round-trip conversion.',
    recovery: [
      'If device discovery fails, confirm endpoint protocol support before retrying.',
      'Fallback to MIDI1 mode if profile/property exchange is unstable.',
    ],
    advanced: true,
  },
  innovation: {
    id: 'innovation',
    title: 'Innovation Controls',
    family: 'advanced_experimental',
    summary: 'Access AI learn suggestions, mesh route publication, and shadow-state drift diagnostics.',
    whyItMatters: 'Innovation tools accelerate complex workflows but require careful operator intent.',
    prerequisites: ['Core routing stable', 'Advanced operator supervision available'],
    inlineHints: ['Use in isolated sessions first; avoid production changes without rollback plan.', 'Review generated suggestions before applying automatically.'],
    example: 'Example: Generate learn suggestions for a filter cutoff parameter using chain context.',
    recovery: [
      'If mesh behavior is unexpected, disable forwarding before further edits.',
      'Clear stale shadow events to re-establish accurate drift baselines.',
    ],
    advanced: true,
  },
  traffic: {
    id: 'traffic',
    title: 'Traffic Monitor',
    family: 'capture_analysis',
    summary: 'Inspect live MIDI traffic with filtering, sorting, export, and forensic row inspection.',
    whyItMatters: 'Traffic visibility is the fastest way to confirm signal presence and diagnose no-signal paths.',
    prerequisites: ['Routes enabled and active source input', 'Expected message type known'],
    inlineHints: ['Pause before deep inspection to freeze a deterministic snapshot.', 'Use source+destination filters before regex for faster triage.'],
    example: 'Example: Filter to program_change events on stage keyboard destination and export CSV evidence.',
    recovery: [
      'If no traffic appears, verify physical input activity and route enable state.',
      'If volume is too high, narrow by source and message type before analysis.',
    ],
  },
}

export const MIDI_HUB_GUIDED_FLOWS: MidiHubGuidedFlow[] = [
  {
    id: 'connect_device',
    title: 'Connect a New Device',
    objective: 'Verify a newly connected MIDI interface appears and is routable.',
    riskNote: 'Do not configure scripts/macros before basic signal visibility is confirmed.',
    steps: [
      {
        id: 'connect_device_ports',
        title: 'Confirm MIDI ports are visible',
        instruction: 'Open Routing Workspace and verify source/destination counts are non-zero.',
        successCriteria: 'At least one source and one destination are listed.',
        panel: 'routing',
        validationKey: 'has_ports',
      },
      {
        id: 'connect_device_route',
        title: 'Create baseline pass-through route',
        instruction: 'Create a single route without filters or transforms.',
        successCriteria: 'Route count increments and route is enabled.',
        panel: 'routing',
        validationKey: 'has_route',
      },
      {
        id: 'connect_device_traffic',
        title: 'Confirm incoming events',
        instruction: 'Use Traffic Monitor while pressing notes/controls on the device.',
        successCriteria: 'Traffic Monitor shows messages per second above zero.',
        panel: 'traffic',
        validationKey: 'traffic_active',
      },
    ],
  },
  {
    id: 'save_and_recall',
    title: 'Save and Recall a Working Configuration',
    objective: 'Persist a known-good state and map it for quick access.',
    riskNote: 'Do not set startup default until recall has been tested at least once.',
    steps: [
      {
        id: 'save_and_recall_save',
        title: 'Save current state as preset',
        instruction: 'Create a new preset with a descriptive name and summary.',
        successCriteria: 'Preset appears in list.',
        panel: 'presets',
        validationKey: 'has_preset',
      },
      {
        id: 'save_and_recall_recall',
        title: 'Recall and verify route behavior',
        instruction: 'Recall the preset and confirm critical routes remain active.',
        successCriteria: 'Manual verification complete.',
        panel: 'presets',
      },
      {
        id: 'save_and_recall_slot',
        title: 'Map optional program slot',
        instruction: 'Assign a PC slot after successful recall for footswitch access.',
        successCriteria: 'Program slot assignment appears in slot list.',
        panel: 'presets',
      },
    ],
  },
  {
    id: 'clock_and_sync',
    title: 'Run Clock and Validate Sync',
    objective: 'Bring up MIDI clock and verify synced destinations respond.',
    riskNote: 'Only one clock master should be active at a time.',
    steps: [
      {
        id: 'clock_and_sync_mode',
        title: 'Set source mode and outputs',
        instruction: 'Configure internal/external source and destination output ports.',
        successCriteria: 'Configuration saved without error.',
        panel: 'clock',
      },
      {
        id: 'clock_and_sync_start',
        title: 'Start clock',
        instruction: 'Start the clock and verify running status.',
        successCriteria: 'Clock status reports running=true.',
        panel: 'clock',
        validationKey: 'clock_running',
      },
      {
        id: 'clock_and_sync_observe',
        title: 'Observe traffic for timing events',
        instruction: 'Inspect Traffic Monitor for system realtime/clock messages.',
        successCriteria: 'Traffic activity is visible while clock runs.',
        panel: 'traffic',
        validationKey: 'traffic_active',
      },
    ],
  },
  {
    id: 'network_midi',
    title: 'Configure Network MIDI Session',
    objective: 'Create and validate one RTP/UDP session before scaling out.',
    riskNote: 'Avoid parallel multi-peer setup until a single peer path is healthy.',
    steps: [
      {
        id: 'network_midi_create',
        title: 'Create one network session',
        instruction: 'Create a send or listen session with reachable host/port.',
        successCriteria: 'Session appears in network list.',
        panel: 'network',
        validationKey: 'network_session',
      },
      {
        id: 'network_midi_test',
        title: 'Send test payload',
        instruction: 'Send one test MIDI message to validate path direction.',
        successCriteria: 'Manual verification complete.',
        panel: 'network',
      },
      {
        id: 'network_midi_route',
        title: 'Tie session into route plan',
        instruction: 'Create or update routes that include the network endpoint.',
        successCriteria: 'At least one active route exists with expected source/destination.',
        panel: 'routing',
        validationKey: 'has_route',
      },
    ],
  },
  {
    id: 'troubleshoot_no_signal',
    title: 'Troubleshoot No-Signal State',
    objective: 'Restore signal quickly using a deterministic triage order.',
    riskNote: 'Do not edit transforms first; confirm physical/link-layer status before deep changes.',
    steps: [
      {
        id: 'troubleshoot_no_signal_ports',
        title: 'Validate port visibility',
        instruction: 'Confirm expected source and destination ports are listed.',
        successCriteria: 'Ports are visible in routing workspace.',
        panel: 'routing',
        validationKey: 'has_ports',
      },
      {
        id: 'troubleshoot_no_signal_routes',
        title: 'Check route enable and filters',
        instruction: 'Inspect route state; temporarily remove filters/transforms to isolate path.',
        successCriteria: 'At least one enabled route exists.',
        panel: 'routing',
        validationKey: 'has_route',
      },
      {
        id: 'troubleshoot_no_signal_traffic',
        title: 'Confirm event ingress',
        instruction: 'Use Traffic Monitor to verify whether messages enter the system.',
        successCriteria: 'Traffic appears or ingress absence is confirmed.',
        panel: 'traffic',
      },
      {
        id: 'troubleshoot_no_signal_recall',
        title: 'Rollback to known-good preset',
        instruction: 'Recall a baseline preset if available.',
        successCriteria: 'Preset list includes at least one recoverable snapshot.',
        panel: 'presets',
        validationKey: 'has_preset',
      },
    ],
  },
]

export const MIDI_HUB_ONBOARDING_STEPS: MidiHubOnboardingStep[] = [
  {
    id: 'tour-overview',
    title: 'Capability families first',
    detail: 'The page is grouped by setup, control, capture, and advanced families so users can learn in order.',
    anchorId: 'midi-hub-hero',
  },
  {
    id: 'tour-routing',
    title: 'Routing is the primary workspace',
    detail: 'Build and verify core routes before touching scripts or advanced controls.',
    anchorId: 'midi-hub-routing',
  },
  {
    id: 'tour-flows',
    title: 'Use guided task flows',
    detail: 'Task flows provide step order, success criteria, and pause/resume behavior for common goals.',
    anchorId: 'midi-hub-task-flows',
  },
  {
    id: 'tour-panels',
    title: 'Every panel has contextual help',
    detail: 'Each panel includes inline hints and a deep help drawer with prerequisites, examples, and recovery steps.',
    anchorId: 'midi-hub-control-section',
  },
]
