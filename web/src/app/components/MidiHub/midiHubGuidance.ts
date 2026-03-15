export type MidiHubCapabilityFamily =
  | 'discover_connect'
  | 'route_transform'
  | 'sync_validate'
  | 'automation_management'
  | 'future_readiness'

export type MidiHubPanelId =
  | 'routing'
  | 'presets'
  | 'network'
  | 'filters'
  | 'mapper'
  | 'scripts'
  | 'macros'
  | 'scheduler'
  | 'clock'
  | 'recorder'
  | 'traffic'
  | 'settings'
  | 'midi2'
  | 'innovation'

export type MidiHubValidationKey =
  | 'has_ports'
  | 'has_route'
  | 'has_preset'
  | 'clock_running'
  | 'traffic_active'
  | 'network_session'
  | 'midi2_ready'

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

export interface MidiHubWizardStep {
  id: string
  label: string
  title: string
  description: string
  guidance: string
  motionCue: string
  recommendations: string[]
  pitfalls: string[]
  relatedPanels: MidiHubPanelId[]
  validationKeys?: MidiHubValidationKey[]
}

export interface MidiHubTransportBrief {
  id: string
  title: string
  summary: string
  interfaces: string[]
  bestFor: string
  watchFor: string
  mapRecommendation: string
}

export interface MidiHubCapabilityBrief {
  id: string
  title: string
  summary: string
  highlights: string[]
}

export const MIDI_HUB_FAMILY_LABELS: Record<MidiHubCapabilityFamily, string> = {
  discover_connect: 'Discover & Connect',
  route_transform: 'Route & Transform',
  sync_validate: 'Sync & Validate',
  automation_management: 'Automation & Management',
  future_readiness: 'MIDI 2.0 & Future Readiness',
}

export const MIDI_HUB_PANEL_GUIDANCE: Record<MidiHubPanelId, MidiHubPanelGuidance> = {
  routing: {
    id: 'routing',
    title: 'Routing Workspace',
    family: 'route_transform',
    summary: 'Build the first deterministic path, then graduate into multi-destination splits, merges, and topology inspection.',
    whyItMatters: 'A stable baseline route is the fastest way to prove the transport layer, channel plan, and endpoint direction are all correct.',
    prerequisites: [
      'At least one expected source and one expected destination are visible in MIDI Hub status.',
      'You know which endpoint should own clock master, preset recall, and performance-critical traffic.',
    ],
    inlineHints: [
      'Start with one input and one output. Add merges, broadcast, or transforms only after the single route is proven.',
      'Use the matrix to create the route and the patchbay view to explain it to yourself or another operator.',
    ],
    example: 'Example: USB keyboard input -> DIN synth output with pass-through routing first, then add per-channel filtering after traffic is verified.',
    recovery: [
      'If the route exists but nothing plays, bypass transforms and verify direction, cable type, and power before editing deeper.',
      'If multiple routes compete, reduce to the minimum viable route and reintroduce branches one change at a time.',
    ],
  },
  presets: {
    id: 'presets',
    title: 'Preset Publishing',
    family: 'automation_management',
    summary: 'Snapshot working states, compare revisions, assign program slots, and prepare safe recall paths for live or studio operation.',
    whyItMatters: 'Presets turn a validated routing design into a repeatable operating state that can survive restarts, handoffs, and rehearsals.',
    prerequisites: [
      'Critical routes and destination behavior have been confirmed manually.',
      'Preset naming is based on outcome, show state, or device role rather than temporary experiments.',
    ],
    inlineHints: [
      'Do not set a startup default until one manual recall has been validated end-to-end.',
      'Use compare before overwriting a trusted preset so routing and slot drift is obvious.',
    ],
    example: 'Example: Save "stage-rig-main", compare against last rehearsal version, then map the approved preset to one program change slot.',
    recovery: [
      'If recall behaves unexpectedly, inspect active routes and slot targets before changing preset metadata.',
      'Keep one known-good rollback preset that contains only baseline routing and clock choices.',
    ],
  },
  network: {
    id: 'network',
    title: 'Network MIDI & OSC',
    family: 'discover_connect',
    summary: 'Bring up RTP/UDP sessions and OSC bridging for multi-host rigs, browser tooling, and remote automation links.',
    whyItMatters: 'Network transports expand MIDI beyond a single chassis, but they need explicit session ownership, host reachability, and clock discipline.',
    prerequisites: [
      'The peer host is reachable and the transport mode is known before creating the session.',
      'You have decided whether the session is performance-critical, utility-only, or control-only traffic.',
    ],
    inlineHints: [
      'Create one wired RTP session first; scale to more peers only after latency and direction are proven.',
      'Treat OSC and Web MIDI as control surfaces first, not as the only path for a timing-critical master clock.',
    ],
    example: 'Example: One wired RTP-MIDI session to a laptop soft-synth plus an OSC bridge for browser-based parameter nudges.',
    recovery: [
      'If network sends fail, verify addressing, firewalls, and whether the peer expects send or listen mode.',
      'Delete stale sessions after IP or topology changes instead of assuming the cached state is still valid.',
    ],
  },
  filters: {
    id: 'filters',
    title: 'Filtering Strategy',
    family: 'route_transform',
    summary: 'Design message, channel, note, velocity, and clock filters before they are encoded into routes, scripts, or macros.',
    whyItMatters: 'Filtering is where runaway clocks, duplicate program changes, noise, and unintended controller data are usually eliminated.',
    prerequisites: [
      'You have already captured example traffic from the source device.',
      'The target destination behavior is known so you can decide what must pass and what must be blocked.',
    ],
    inlineHints: [
      'Block the smallest possible surface: per-port or per-route before considering global suppression.',
      'If you are chasing a no-signal issue, remove filters first and add them back after the baseline route is healthy.',
    ],
    example: 'Example: Block clock and active sensing on a legacy DIN module while allowing Note On/Off and Program Change on channel 2 only.',
    recovery: [
      'If a device appears silent, verify you did not accidentally block its required message family.',
      'Keep clock and SysEx filters easy to disable during troubleshooting because they often hide the real fault domain.',
    ],
  },
  mapper: {
    id: 'mapper',
    title: 'Mapper & Transformation Blueprint',
    family: 'route_transform',
    summary: 'Define how notes, CCs, aftertouch, pitch, and higher-resolution control data should be reshaped for the destination rig.',
    whyItMatters: 'Transformation planning makes it possible to bridge old hardware, expressive controllers, and mixed MIDI 1.0/MIDI 2.0 ecosystems cleanly.',
    prerequisites: [
      'Source event ranges are known from live traffic or documentation.',
      'You know whether the destination expects note, CC, program, pitch, per-note, or property-based control.',
    ],
    inlineHints: [
      'Document the desired before-and-after message shape before implementing the transform path.',
      'Treat scaling, inversion, clamp, and smoothing as separate decisions so each can be validated independently.',
    ],
    example: 'Example: Convert channel aftertouch into CC74 with scaled output for a synth that lacks native aftertouch support.',
    recovery: [
      'If expression feels wrong, validate the raw source range before changing curves or inversion.',
      'Avoid stacking multiple transforms until one transform path has been proven against live traffic.',
    ],
  },
  scripts: {
    id: 'scripts',
    title: 'Script Engine',
    family: 'automation_management',
    summary: 'Run targeted event-driven logic when you need custom behavior that does not belong inside a static route.',
    whyItMatters: 'Scripts are where complex conditional control, device abstraction, and integration glue can live without rebuilding the backend.',
    prerequisites: [
      'You understand the event payload entering the script.',
      'A safe rollback path exists if the script loops, floods, or misroutes data.',
    ],
    inlineHints: [
      'Keep each script focused on one job so console output remains readable.',
      'Start with a dry-run or one-shot event before binding the script to live performance traffic.',
    ],
    example: 'Example: Mirror one incoming controller move into several destination CCs with per-destination scaling and offset.',
    recovery: [
      'If output floods, stop timers and disable the script before editing the logic.',
      'Use the script console and traffic monitor together; one without the other hides half the story.',
    ],
  },
  macros: {
    id: 'macros',
    title: 'Macro Sequencing',
    family: 'automation_management',
    summary: 'Bundle cross-device actions into one deterministic trigger for scene changes, recovery moves, and repetitive setup chores.',
    whyItMatters: 'Macros collapse multi-device coordination into one trigger and reduce the chance of operators forgetting part of a transition.',
    prerequisites: [
      'Each destination action works by itself.',
      'Trigger conditions and order of operations are explicitly defined.',
    ],
    inlineHints: [
      'Name macros after the outcome, not the trigger source, so the library stays intelligible.',
      'Test for loops whenever a macro sends messages back into a routed input path.',
    ],
    example: 'Example: One trigger recalls a preset, starts clock, and sends patch changes to two devices in a controlled order.',
    recovery: [
      'If a macro only partly succeeds, confirm reachability and action ordering before changing the trigger.',
      'Disable the macro immediately if you see repeated re-triggering or doubled program changes.',
    ],
  },
  scheduler: {
    id: 'scheduler',
    title: 'Scheduled Actions',
    family: 'automation_management',
    summary: 'Queue delayed or time-specific MIDI events for show automation, failover handling, and repeatable test sequences.',
    whyItMatters: 'A scheduler helps separate transport health from timing logic by making event timing observable and cancelable.',
    prerequisites: [
      'The destination endpoint is already reachable.',
      'The message bytes or event payload have been validated manually at least once.',
    ],
    inlineHints: [
      'Use explicit schedule IDs so you can cancel the right event under pressure.',
      'Clear completed entries often so stale automation does not confuse operators.',
    ],
    example: 'Example: Fire a program change 250 ms after preset recall to let the target device settle first.',
    recovery: [
      'If a scheduled action misses, verify that the destination path still exists before adjusting timing values.',
      'Cancel old entries before recreating them, otherwise two queued actions may race each other.',
    ],
  },
  clock: {
    id: 'clock',
    title: 'Clock & Sync',
    family: 'sync_validate',
    summary: 'Choose the master, fan clock safely, and verify downstream devices follow before scaling to more transports or rooms.',
    whyItMatters: 'Clocking mistakes usually show up as jitter, drift, duplicate starts, or transport-wide chaos, so the master role must stay obvious.',
    prerequisites: [
      'One clear clock master has been chosen for the current rig.',
      'You know whether the destination expects MIDI Clock, MTC, transport messages, or a bridge to another sync domain.',
    ],
    inlineHints: [
      'Do not enable multiple masters just because more than one device can generate clock.',
      'Use live traffic inspection to confirm real-time messages are present instead of assuming the clock is flowing.',
    ],
    example: 'Example: Internal 120 BPM clock distributed to a drum machine and looper after all external masters are disabled.',
    recovery: [
      'If tempo drifts, verify source mode first and then check the route path that carries the real-time messages.',
      'Restart the clock after major routing changes so downstream devices see a clean transport state.',
    ],
  },
  recorder: {
    id: 'recorder',
    title: 'Capture & Replay',
    family: 'sync_validate',
    summary: 'Record traffic, replay it to destinations, and create evidence for transform regressions, routing faults, or timing checks.',
    whyItMatters: 'Recorded evidence removes guesswork when a human performance is too inconsistent to reproduce a fault reliably.',
    prerequisites: [
      'The expected input traffic can already be observed in the monitor.',
      'You know whether playback should target the original route or an override destination.',
    ],
    inlineHints: [
      'Short, named takes are easier to compare than one huge session dump.',
      'Replay to one destination first to separate recording quality from multi-destination routing issues.',
    ],
    example: 'Example: Record a short controller sweep, replay it to a second destination, and confirm the transform behavior stayed intact.',
    recovery: [
      'If a recording is empty, confirm ingress in the traffic monitor before trying another take.',
      'If playback sounds wrong, inspect the destination override before re-recording.',
    ],
  },
  traffic: {
    id: 'traffic',
    title: 'Traffic Monitor',
    family: 'sync_validate',
    summary: 'Inspect live message flow, export evidence, and decide whether the fault is ingress, routing, transform, or destination behavior.',
    whyItMatters: 'Traffic visibility is the fastest way to learn whether the problem is no data, wrong data, or good data reaching the wrong place.',
    prerequisites: [
      'You know which source, destination, or message family should be visible.',
      'The route under test is enabled.',
    ],
    inlineHints: [
      'Pause the stream when you need forensic inspection rather than live confidence.',
      'Filter by message family and source before going broad; it shortens the debug loop dramatically.',
    ],
    example: 'Example: Filter to real-time messages while bringing up MIDI Clock, then export the result as evidence.',
    recovery: [
      'If the monitor is empty, test physical ingress first before changing mapping logic.',
      'If the monitor is too noisy, narrow by source and message family until the fault becomes obvious.',
    ],
  },
  settings: {
    id: 'settings',
    title: 'Operator Profile & Device Intake',
    family: 'discover_connect',
    summary: 'Capture browser-side operator preferences, hardware intake notes, firmware staging details, and support-oriented device descriptors.',
    whyItMatters: 'Some workflows need planning data and support evidence even when the runtime engine has not yet been committed to a change.',
    prerequisites: [
      'The target product, preferred ports, and support workflow are known.',
      'You understand which settings are local planning aids and which actions actually change the runtime hub.',
    ],
    inlineHints: [
      'Use this panel to standardize operator intent before writing live routing or automation.',
      'Treat firmware and device dump actions as support aids unless the underlying service is explicitly wired to runtime APIs.',
    ],
    example: 'Example: Record preferred input/output ports, define the preset-change message plan, and capture USB descriptors for an unrecognized controller.',
    recovery: [
      'If a device fails enumeration, capture the descriptor dump before moving cables or rebooting.',
      'If firmware staging is only partial, document the intended file and rollback path before attempting any update.',
    ],
  },
  midi2: {
    id: 'midi2',
    title: 'MIDI 2.0 Readiness',
    family: 'future_readiness',
    summary: 'Experiment with MIDI-CI discovery, UMP translation, JR timestamps, profiles, and property exchange while preserving a MIDI 1.0 fallback.',
    whyItMatters: 'MIDI 2.0 adds richer capability negotiation and expression, but mixed rigs still need explicit translation and backward compatibility decisions.',
    prerequisites: [
      'The target device actually advertises or documents MIDI-CI/UMP support.',
      'A rollback path to MIDI 1.0 remains available if discovery or property exchange is unstable.',
    ],
    inlineHints: [
      'Prove translation on a small message set first before assuming a whole rig is ready for UMP.',
      'Keep capability negotiation deliberate; automatic translation still needs validation against real hardware.',
    ],
    example: 'Example: Convert one MIDI 1.0 Note On message to UMP, inspect the words, then round-trip back to MIDI 1.0.',
    recovery: [
      'If discovery fails, verify the endpoint speaks MIDI-CI before changing property requests.',
      'If a profile causes instability, return to MIDI 1.0 compatibility mode and capture the evidence.',
    ],
    advanced: true,
  },
  innovation: {
    id: 'innovation',
    title: 'Labs, Discovery, and Mesh',
    family: 'future_readiness',
    summary: 'Use AI-assisted learn suggestions, mesh forwarding, and shadow-state diagnostics only after the core operator path is stable.',
    whyItMatters: 'These tools accelerate discovery and distributed experiments, but they should not become the first thing you touch during setup.',
    prerequisites: [
      'Base routing, presets, and diagnostics are already healthy.',
      'A rollback plan exists if automated suggestions or mesh publication behave unexpectedly.',
    ],
    inlineHints: [
      'Use labs features to confirm or accelerate a plan you already understand.',
      'Keep experiments isolated from the production route graph until they are reproducible.',
    ],
    example: 'Example: Generate learn suggestions for a parameter, review them, then publish only the accepted route changes.',
    recovery: [
      'Disable forwarding before debugging unexpected distributed behavior.',
      'Clear stale shadow events so drift diagnostics describe the current state instead of yesterday’s state.',
    ],
    advanced: true,
  },
}

export const MIDI_HUB_WIZARD_STEPS: MidiHubWizardStep[] = [
  {
    id: 'inventory',
    label: 'Inventory',
    title: 'Inventory interfaces and choose the primary transport',
    description: 'Identify the live endpoints, decide which transport owns the baseline path, and avoid scaling before one interface is healthy.',
    guidance: 'Official guidance converges on a simple rule: start with one trusted path. Apple’s network/Bluetooth setup flow expects explicit session and pairing choices, and Web MIDI requires secure context plus permission before browser access is available.',
    motionCue: 'Use short, purposeful step changes. Move only after the next workspace is in view and the previous decision is clear.',
    recommendations: [
      'USB host/device is the easiest baseline for class-compliant controllers and interfaces.',
      'DIN or TRS is still the safest choice for legacy hardware and unambiguous point-to-point troubleshooting.',
      'Use BLE for portable control surfaces, not as the first choice for dense timing-critical traffic.',
    ],
    pitfalls: [
      'Do not configure multiple transports in parallel before one endpoint path is proven.',
      'Do not rely on Web MIDI until you have confirmed browser permission and secure-context constraints.',
    ],
    relatedPanels: ['routing', 'network', 'settings'],
    validationKeys: ['has_ports'],
  },
  {
    id: 'route',
    label: 'Route',
    title: 'Create one deterministic route and prove ingress',
    description: 'Build the smallest useful route, then confirm ingress and destination behavior with the traffic monitor.',
    guidance: 'Routing first and transforming later keeps the fault domain small. You want to know that the transport works before you spend time shaping messages.',
    motionCue: 'Treat each route enable as a visible state change. Confirm it, then advance instead of stacking several edits at once.',
    recommendations: [
      'Use a plain pass-through route first.',
      'Inspect live traffic before adding filters, smoothing, or conditional logic.',
      'Keep the route graph readable by naming outcomes and avoiding unnecessary branches early.',
    ],
    pitfalls: [
      'Do not merge sources until each source has been validated individually.',
      'Do not assume the destination is listening on the default channel.',
    ],
    relatedPanels: ['routing', 'traffic'],
    validationKeys: ['has_route', 'traffic_active'],
  },
  {
    id: 'shape',
    label: 'Shape',
    title: 'Add filtering, mapping, and automation only where the route needs them',
    description: 'Translate the destination contract into selective filtering, value processing, macros, and scripts instead of editing blindly.',
    guidance: 'Modern mixed-device rigs win by being explicit: block only what should never pass, transform only what the destination cannot already understand, and keep automation observable.',
    motionCue: 'Reveal advanced shaping progressively. Keep the baseline route visible while a filter, mapper, or script is being designed.',
    recommendations: [
      'Capture example traffic before deciding on filters or curves.',
      'Separate suppression, mapping, and automation concerns so each can be validated independently.',
      'Use macros and schedules for orchestration; use scripts when the behavior is truly conditional or computed.',
    ],
    pitfalls: [
      'Do not hide a transport fault behind a filter or script change.',
      'Do not stack several transforms before validating the first one.',
    ],
    relatedPanels: ['filters', 'mapper', 'scripts', 'macros', 'scheduler'],
  },
  {
    id: 'sync',
    label: 'Sync',
    title: 'Lock clock ownership and bring up network sessions deliberately',
    description: 'Choose one clock master, verify real-time traffic, and add network or distributed transport layers only after the local path is stable.',
    guidance: 'Whether the rig uses MIDI Clock, MTC, RTP-MIDI, or Web tooling, ownership and observability matter more than raw feature count.',
    motionCue: 'Promote only one transport or clock source at a time. Pause and validate before the next timing-sensitive change.',
    recommendations: [
      'Prefer wired RTP-MIDI for multi-host musical timing when possible.',
      'Confirm clock messages in the traffic monitor instead of trusting a running flag alone.',
      'Treat Wi-Fi and BLE as convenience layers until latency and jitter are measured in context.',
    ],
    pitfalls: [
      'Do not allow several devices to believe they are the master.',
      'Do not assume a network session is ready just because it was previously saved.',
    ],
    relatedPanels: ['clock', 'network', 'traffic'],
    validationKeys: ['clock_running', 'network_session'],
  },
  {
    id: 'publish',
    label: 'Publish',
    title: 'Validate, capture evidence, and publish a recallable state',
    description: 'Record the behavior, save the known-good preset, and preserve a rollback path before expanding the rig.',
    guidance: 'The final stage is not just “save preset”. It is proof that the state can be replayed, recalled, and understood by the next operator.',
    motionCue: 'Let the page settle into review mode: compare, capture, save, then move on. Avoid hidden state changes during sign-off.',
    recommendations: [
      'Record a short evidence take and export or retain it for future regression work.',
      'Map program slots only after preset behavior is trustworthy.',
      'If you are piloting MIDI 2.0, keep the MIDI 1.0 fallback path documented and ready.',
    ],
    pitfalls: [
      'Do not bless a preset that has not survived at least one manual recall.',
      'Do not treat advanced MIDI 2.0 negotiation as production-ready until the devices have actually been validated.',
    ],
    relatedPanels: ['recorder', 'traffic', 'presets', 'midi2'],
    validationKeys: ['has_preset'],
  },
]

export const MIDI_HUB_GUIDED_FLOWS: MidiHubGuidedFlow[] = [
  {
    id: 'legacy_hardware_bridge',
    title: 'Bridge a legacy DIN/TRS instrument into a modern USB or network rig',
    objective: 'Keep MIDI 1.0 compatibility intact while translating only the pieces that need adaptation.',
    riskNote: 'Do not enable aggressive transforms until Note On/Off and program changes are visible end-to-end.',
    steps: [
      {
        id: 'legacy_ports',
        title: 'Confirm endpoint visibility',
        instruction: 'Verify both the legacy hardware port and the modern destination are visible before creating any transforms.',
        successCriteria: 'At least one source and one destination are listed in the hub.',
        panel: 'routing',
        validationKey: 'has_ports',
      },
      {
        id: 'legacy_route',
        title: 'Create a plain compatibility route',
        instruction: 'Build a single pass-through route and test note traffic without filtering or scripts.',
        successCriteria: 'The route is enabled and ingress is visible in the monitor.',
        panel: 'routing',
        validationKey: 'has_route',
      },
      {
        id: 'legacy_filter',
        title: 'Suppress the traffic the destination should never receive',
        instruction: 'Use the filtering blueprint to identify clock, active sensing, or SysEx rules before encoding them elsewhere.',
        successCriteria: 'A clear pass/block plan exists for the route.',
        panel: 'filters',
      },
      {
        id: 'legacy_publish',
        title: 'Capture and publish the approved bridge state',
        instruction: 'Record a short test and save the working bridge as a preset for future recall.',
        successCriteria: 'A baseline preset exists for the bridge.',
        panel: 'presets',
        validationKey: 'has_preset',
      },
    ],
  },
  {
    id: 'controller_expression_map',
    title: 'Translate expressive controller data for a destination that speaks a different control dialect',
    objective: 'Use mapping, smoothing, and automation surfaces to make one controller feel native on another device.',
    riskNote: 'Expression faults are often range or polarity faults first, not algorithm faults.',
    steps: [
      {
        id: 'controller_capture',
        title: 'Observe the raw controller stream',
        instruction: 'Inspect live messages so you know the source message family, channel, and value ranges before mapping.',
        successCriteria: 'Traffic data is visible for the controller under test.',
        panel: 'traffic',
        validationKey: 'traffic_active',
      },
      {
        id: 'controller_mapper',
        title: 'Draft the transform shape',
        instruction: 'Use the mapper blueprint to define message conversion, scaling, inversion, and whether the original data should survive.',
        successCriteria: 'A destination-oriented transform plan exists.',
        panel: 'mapper',
      },
      {
        id: 'controller_script',
        title: 'Escalate to macro or script only if static routing cannot express the behavior',
        instruction: 'Choose the simplest mechanism that still explains the behavior clearly.',
        successCriteria: 'The intended runtime mechanism is chosen and justified.',
        panel: 'scripts',
      },
      {
        id: 'controller_preset',
        title: 'Save the mapped control surface',
        instruction: 'Publish a preset after the destination responds correctly to the controller.',
        successCriteria: 'The mapped state is recallable.',
        panel: 'presets',
        validationKey: 'has_preset',
      },
    ],
  },
  {
    id: 'network_studio_session',
    title: 'Launch a wired network MIDI session for a multi-host or browser-assisted studio',
    objective: 'Bring up one RTP or OSC path on a known-good host before scaling to more peers or rooms.',
    riskNote: 'Network MIDI that is “configured” but not reachable is worse than no session at all because it hides the real fault domain.',
    steps: [
      {
        id: 'network_create',
        title: 'Create one session',
        instruction: 'Define one session with the correct mode, host, and port instead of creating several speculative peers.',
        successCriteria: 'At least one network session exists.',
        panel: 'network',
        validationKey: 'network_session',
      },
      {
        id: 'network_test',
        title: 'Send a small test payload',
        instruction: 'Trigger a small message or OSC event so the peer and direction can be verified explicitly.',
        successCriteria: 'The peer confirms receipt or the fault domain is isolated.',
        panel: 'network',
      },
      {
        id: 'network_route',
        title: 'Attach the session to the route graph',
        instruction: 'Tie the network endpoint into a route only after the session itself has been proven.',
        successCriteria: 'The route graph contains the intended network path.',
        panel: 'routing',
        validationKey: 'has_route',
      },
      {
        id: 'network_capture',
        title: 'Capture a support trace',
        instruction: 'Export traffic or record a short take so you have evidence if the session regresses later.',
        successCriteria: 'The session has supporting evidence.',
        panel: 'traffic',
      },
    ],
  },
  {
    id: 'clock_master_takeover',
    title: 'Take over clock master cleanly and prove downstream sync',
    objective: 'Move clock ownership to MIDI Hub without creating a competing-master situation.',
    riskNote: 'Double masters and hidden external clock sources are the fastest path to drift, swing, and transport confusion.',
    steps: [
      {
        id: 'clock_config',
        title: 'Set source mode and outputs deliberately',
        instruction: 'Choose internal or external mode, define the distribution outputs, and document who owns master status.',
        successCriteria: 'Clock configuration is explicit and saved.',
        panel: 'clock',
      },
      {
        id: 'clock_start',
        title: 'Start clock and confirm running state',
        instruction: 'Bring the clock online only after conflicting masters have been disabled.',
        successCriteria: 'Clock status reports running.',
        panel: 'clock',
        validationKey: 'clock_running',
      },
      {
        id: 'clock_monitor',
        title: 'Inspect real-time traffic',
        instruction: 'Use the monitor to confirm that real-time messages are actually moving to the expected destinations.',
        successCriteria: 'Traffic indicates active clock-related messages.',
        panel: 'traffic',
        validationKey: 'traffic_active',
      },
      {
        id: 'clock_publish',
        title: 'Save the sync posture',
        instruction: 'Capture the working clock ownership state as a preset before the next rehearsal or show.',
        successCriteria: 'The sync state is recallable.',
        panel: 'presets',
        validationKey: 'has_preset',
      },
    ],
  },
  {
    id: 'midi2_translation_probe',
    title: 'Probe MIDI 2.0 readiness while preserving MIDI 1.0 fallback',
    objective: 'Test UMP and MIDI-CI features without losing a proven legacy path.',
    riskNote: 'Treat MIDI 2.0 as an opt-in capability check, not a blanket assumption across mixed hardware.',
    steps: [
      {
        id: 'midi2_status',
        title: 'Confirm MIDI 2.0 posture',
        instruction: 'Check whether MIDI 2.0 is enabled and whether any device discovery data already exists.',
        successCriteria: 'The page shows a clear readiness state.',
        panel: 'midi2',
        validationKey: 'midi2_ready',
      },
      {
        id: 'midi2_discovery',
        title: 'Trigger discovery and inspect the response',
        instruction: 'Use MIDI-CI discovery with a known device ID and confirm the endpoint actually responds.',
        successCriteria: 'Discovery has either succeeded or failed clearly enough to classify the device.',
        panel: 'midi2',
      },
      {
        id: 'midi2_translate',
        title: 'Round-trip one message through translation',
        instruction: 'Translate one representative MIDI 1.0 message to UMP and back before considering broader adoption.',
        successCriteria: 'Translation results are visible and intelligible.',
        panel: 'midi2',
      },
      {
        id: 'midi2_document',
        title: 'Record the fallback plan',
        instruction: 'Keep the validated MIDI 1.0 route and preset documented in case a device fails MIDI 2.0 features later.',
        successCriteria: 'The fallback is explicit and stored.',
        panel: 'presets',
        validationKey: 'has_preset',
      },
    ],
  },
]

export const MIDI_HUB_TRANSPORT_BRIEFS: MidiHubTransportBrief[] = [
  {
    id: 'usb',
    title: 'USB host / USB device',
    summary: 'Best default for class-compliant modern controllers, pad devices, and desktop integrations.',
    interfaces: ['USB Host MIDI', 'USB Device MIDI', 'Virtual ports'],
    bestFor: 'Fast single-rig bring-up where power, enumeration, and channel plan are all under local control.',
    watchFor: 'Hub power limits, duplicate device names, and assuming host/device mode without confirming the endpoint role.',
    mapRecommendation: 'Start your baseline route here when possible, then export the known-good endpoint plan into presets and program slots.',
  },
  {
    id: 'legacy',
    title: '5-pin DIN / TRS MIDI',
    summary: 'Still the clearest transport for legacy synths, pedals, and point-to-point troubleshooting.',
    interfaces: ['5-pin DIN', 'TRS MIDI', 'Serial/UART variants'],
    bestFor: 'Legacy hardware, simple controller-to-device links, and any moment where you need unmistakable directionality.',
    watchFor: 'TRS type-A/type-B mismatches, hidden soft-thru behavior in hardware, and assuming legacy devices ignore clock or active sensing.',
    mapRecommendation: 'Use DIN or TRS to prove the musical path first, then bridge it to USB, network, or MIDI 2.0 only if required.',
  },
  {
    id: 'ble',
    title: 'Bluetooth LE MIDI',
    summary: 'Useful for mobile, roaming, and utility control surfaces when cable-free setup matters more than absolute determinism.',
    interfaces: ['BLE MIDI', 'Group connectivity', 'Roaming controllers'],
    bestFor: 'Tablet control, lightweight utility controllers, and cable-free rehearsal tools.',
    watchFor: 'Latency variance, pairing drift, roaming behavior, and using BLE as the primary timing master for dense traffic.',
    mapRecommendation: 'Keep BLE in the control lane first and validate it against the traffic monitor before trusting it for anything rhythmic.',
  },
  {
    id: 'rtp',
    title: 'RTP-MIDI / Ethernet / Wi-Fi transport',
    summary: 'The modern answer for multi-host rigs, networked studios, and distributed MIDI services, especially on wired LAN.',
    interfaces: ['RTP-MIDI', 'Ethernet MIDI', 'Wi-Fi MIDI', 'Session discovery'],
    bestFor: 'Multi-room or multi-computer systems where one chassis is not enough.',
    watchFor: 'Firewall rules, stale sessions, and assuming Wi-Fi behavior is good enough for timing-critical master duties without measurement.',
    mapRecommendation: 'Bring up one wired peer, confirm reachability and latency, then expand to more peers only after traffic evidence exists.',
  },
  {
    id: 'browser',
    title: 'Web MIDI / OSC bridge',
    summary: 'Ideal for browser operators, support consoles, and lightweight remote control workflows.',
    interfaces: ['Web MIDI', 'OSC bridging', 'Browser access'],
    bestFor: 'Operator dashboards, educational tools, browser UI prototypes, and remote automation surfaces.',
    watchFor: 'Web MIDI permission and secure-context requirements, SysEx opt-in constraints, and overloading a browser path with mission-critical timing.',
    mapRecommendation: 'Use browser-facing transports as observability and control layers that complement, not replace, your proven baseline route.',
  },
  {
    id: 'midi2',
    title: 'MIDI 2.0 / UMP',
    summary: 'Use when the endpoint and workflow genuinely benefit from higher resolution, profile exchange, and capability negotiation.',
    interfaces: ['MIDI 2.0 UMP', 'JR Timestamp', 'MIDI-CI', 'Profile & Property Exchange'],
    bestFor: 'Future-facing rigs, expressive controllers, and staged migrations where mixed MIDI 1.0 and MIDI 2.0 need translation.',
    watchFor: 'Assuming capability support before discovery succeeds and losing a known-good MIDI 1.0 fallback too early.',
    mapRecommendation: 'Probe capability, test translation, and keep the backward-compatible path documented until the device proves itself in context.',
  },
]

export const MIDI_HUB_CAPABILITY_BRIEFS: MidiHubCapabilityBrief[] = [
  {
    id: 'compatibility',
    title: 'Compatibility and endpoint scale',
    summary: 'The page is designed around full MIDI 1.0 compatibility with a migration path toward modern transports and large internal topologies.',
    highlights: [
      'Channel voice, system common, real-time, SysEx, MTC, and quarter/full frame workflows.',
      'Legacy hardware compatibility, endpoint virtualization, logical port grouping, and device abstraction planning.',
      'Scalable operator thinking for many ports, many channels, and mixed local/remote endpoints.',
    ],
  },
  {
    id: 'transports',
    title: 'Transport and interface coverage',
    summary: 'The guidance and workbench cover local, wireless, browser, and network delivery patterns without pretending every transport behaves the same.',
    highlights: [
      'USB host/device, DIN, TRS, BLE, RTP-MIDI, Ethernet, Wi-Fi, Web MIDI, OSC, and distributed session planning.',
      'Rate, ordering, latency, and congestion considerations folded into the wizard recommendations.',
      'Support-oriented device intake tools for identifying awkward controllers and ambiguous transport roles.',
    ],
  },
  {
    id: 'routing',
    title: 'Routing, filtering, and transformation',
    summary: 'The merged workbench supports direct routing actions plus design surfaces for the filter and mapper ideas that previously lived on `midi-hub-2`.',
    highlights: [
      'Any-input to any-output reasoning, merge and split planning, route reset/clear controls, and topology inspection.',
      'Message-type, channel, note, velocity, SysEx, clock, and duplicate/noise filtering strategies.',
      'Note/CC/program/pitch/aftertouch translation patterns with scaling, inversion, clamp, and curve planning.',
    ],
  },
  {
    id: 'sync',
    title: 'Clock, diagnostics, and resilience',
    summary: 'Clock ownership, network session health, traffic evidence, and replayable captures are treated as first-class operator tasks.',
    highlights: [
      'Clock master selection, tempo smoothing strategy, real-time message inspection, and sync validation order.',
      'Traffic export, latency and jitter observation, capture/replay loops, and repeatable evidence for regressions.',
      'Failover thinking, rollback presets, and staged expansion from one working path to a larger rig.',
    ],
  },
  {
    id: 'automation',
    title: 'Automation and future readiness',
    summary: 'Automation and MIDI 2.0 are exposed as deliberate workflow layers instead of hidden extras or magical black boxes.',
    highlights: [
      'Preset chains, scheduled actions, macros, conditional scripts, and device-intake support capture.',
      'MIDI 1.0 ↔ MIDI 2.0 translation, profile/property exchange, and capability negotiation experiments.',
      'A clear expectation that advanced labs features follow proven routing, not replace it.',
    ],
  },
]
