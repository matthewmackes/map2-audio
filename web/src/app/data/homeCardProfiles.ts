import type { HardwareInterfaceMenuItem, NavigationMaturityState, ShellNavigationItem } from './advancedMenuItems'

type HomeItem = ShellNavigationItem | HardwareInterfaceMenuItem

export interface HomeCardProfile {
  summary: string
  capabilities: string[]
  learnMore: string
  bestFor: string
}

const PROFILE_BY_KEY: Record<string, HomeCardProfile> = {
  '/overview': {
    summary: 'Operational readiness center for validating MAP2 host, network, and AVB baseline before deeper workflow changes.',
    capabilities: [
      'Host readiness and platform health snapshots',
      'Network-share and infrastructure status visibility',
      'AVB and transport health at a glance',
      'Cross-domain status framing across core services',
      'Fast preflight confirmation before sessions',
      'Early warning context for unstable subsystems',
    ],
    learnMore: 'Use this page first when bringing a node online, validating deployment health, or triaging broad platform instability.',
    bestFor: 'Preflight and first-response operations',
  },
  '/engine': {
    summary: 'Realtime engine command surface for core audio runtime state, metering, and processing-path confidence checks.',
    capabilities: [
      'Realtime engine running-state monitoring',
      'Signal-path health and processing visibility',
      'Live metering and activity confirmation',
      'Runtime controls for active processing path',
      'Operational checks before stage use',
      'Issue triage for engine-level instability',
    ],
    learnMore: 'Open this page whenever audio behavior is uncertain and you need direct confidence in engine state before changing chain content.',
    bestFor: 'Core audio runtime control',
  },
  '/host-machine': {
    summary: 'System-level machine diagnostics focused on latency-sensitive reliability and host resource headroom.',
    capabilities: [
      'CPU and memory readiness visibility',
      'Storage and machine health context',
      'Low-latency risk signal detection',
      'Host stability checks for realtime workloads',
      'Node-level operating condition snapshots',
      'Resource-pressure troubleshooting context',
    ],
    learnMore: 'Use Host Machine when audio symptoms may be caused by OS/resource pressure rather than plugin or routing changes.',
    bestFor: 'Host-level performance triage',
  },
  '/perform': {
    summary: 'Stage-focused full-screen performance surface optimized for speed, confidence, and reduced operational friction.',
    capabilities: [
      'Full-screen stage operation workflow',
      'Fast preset access and recall behavior',
      'Rapid bypass and control-state access',
      'Tempo-focused actions for live use',
      'Low-distraction layout for performance',
      'Quick transition between active sounds',
    ],
    learnMore: 'This interface prioritizes decision speed and visual clarity in live contexts where error-free control is more important than edit depth.',
    bestFor: 'Live performance execution',
  },
  '/welcome': {
    summary: 'Operator guide and workflow orientation center that explains MAP2 concepts, structure, and intended usage patterns.',
    capabilities: [
      'Core operating-concept orientation',
      'Workflow onboarding for new operators',
      'MAP2 information architecture framing',
      'Cross-page navigation guidance',
      'Context for route responsibilities',
      'Shared mental model for teams',
    ],
    learnMore: 'Open Guide when onboarding operators or aligning team expectations on how MAP2 surfaces are meant to be used.',
    bestFor: 'Onboarding and workflow alignment',
  },
  '/about': {
    summary: 'Build and runtime identity reference for verification, support workflows, and release-traceability checks.',
    capabilities: [
      'Build and version identity details',
      'Runtime environment visibility',
      'System metadata for support workflows',
      'Release-traceability reference points',
      'Deployment verification context',
      'Node identity and audit support',
    ],
    learnMore: 'Use About when validating deployment provenance or collecting support-grade context for bug reports and escalation.',
    bestFor: 'Versioning and support traceability',
  },
  '/multi-system': {
    summary: 'Comparative operations view for understanding differences and coordination across multiple MAP2 systems.',
    capabilities: [
      'Side-by-side system state comparison',
      'Cross-node metric correlation',
      'Distributed rig behavior visibility',
      'Difference spotting across environments',
      'Shared operational situational awareness',
      'Multi-node troubleshooting acceleration',
    ],
    learnMore: 'Use Multi-System to validate consistency between rigs, compare behavior during rollout, and isolate node-specific faults.',
    bestFor: 'Cross-system operations',
  },
  '/presets': {
    summary: 'Preset lifecycle management for storing, organizing, sharing, and restoring stable rig states quickly.',
    capabilities: [
      'Save and recall tone/session states',
      'Organize preset libraries for retrieval',
      'Import and export preset payloads',
      'Rapid restoration of known-good setups',
      'Consistency across repeated workflows',
      'Preset portability between environments',
    ],
    learnMore: 'Use Presets as the operational backbone for repeatability, rollback, and reliable transitions between working sounds.',
    bestFor: 'Repeatable sound state management',
  },
  '/plugins': {
    summary: 'LV2 inventory and catalog management surface for understanding and organizing available processing blocks.',
    capabilities: [
      'Browse installed LV2 inventory',
      'Inspect plugin availability and scope',
      'Organize effect catalog access',
      'Validate plugin presence for workflows',
      'Support chain-design planning',
      'Reduce plugin selection ambiguity',
    ],
    learnMore: 'Use LV2 Plugins when curating your processing toolbox, validating plugin footprint, or planning chain revisions.',
    bestFor: 'Plugin catalog operations',
  },
  '/grid': {
    summary: 'Experimental Cortex-style grid editor for advanced routing and non-default signal-flow exploration.',
    capabilities: [
      'Experimental grid-based flow editing',
      'Non-default signal-graph prototyping',
      'Advanced routing concept iteration',
      'Topology experimentation workspace',
      'Rapid structure exploration workflows',
      'Sandbox for emerging flow patterns',
    ],
    learnMore: 'Grid is intended for exploratory design and advanced experimentation where conventional route pages are too constrained.',
    bestFor: 'Experimental flow architecture',
  },
  '/grid-3d': {
    summary: 'Spatial graph view for visualizing signal relationships in three-dimensional context.',
    capabilities: [
      '3D signal graph visualization',
      'Spatial relationship inspection',
      'Topology comprehension beyond 2D maps',
      'Alternative perspective for complex graphs',
      'Visual context for route relationships',
      'Exploratory graph navigation patterns',
    ],
    learnMore: 'Use 3D Grid when graph complexity makes 2D understanding difficult and you need spatial separation cues.',
    bestFor: 'Complex graph visualization',
  },
  '/library': {
    summary: 'IR and NAM asset workflows for acquiring, curating, and validating model-based tone resources.',
    capabilities: [
      'Impulse-response library browsing',
      'NAM model-management workflows',
      'Asset acquisition and curation support',
      'Tone-resource organization and retrieval',
      'Validation context for model assets',
      'Consistent model/IR lifecycle handling',
    ],
    learnMore: 'Use IR & NAM Library to centralize model content operations and keep tone assets organized across projects.',
    bestFor: 'Tone asset lifecycle management',
  },
  '/midi': {
    summary: 'Primary MIDI operations center for mappings, device control, command workflows, and live activity visibility.',
    capabilities: [
      'MIDI device and endpoint operations',
      'Mapping and command configuration',
      'Live MIDI activity monitoring',
      'Control-surface workflow coordination',
      'Core MIDI diagnostics and status context',
      'Bridge between devices and engine actions',
    ],
    learnMore: 'Open MIDI for day-to-day controller and routing operations where stability and direct control are required.',
    bestFor: 'Core MIDI command workflows',
  },
  '/expression': {
    summary: 'Expression-control mapping surface connecting pedals and MIDI CC to realtime engine parameters.',
    capabilities: [
      'Expression pedal mapping workflows',
      'MIDI CC-to-parameter assignments',
      'Live visual feedback for control changes',
      'Fine-grained performance-control shaping',
      'Centralized expression configuration',
      'Realtime interaction confidence checks',
    ],
    learnMore: 'Use Expression to design and validate dynamic control mappings that must behave predictably during performance.',
    bestFor: 'Realtime performance control mapping',
  },
  '/midi-cluster': {
    summary: 'Distributed MIDI orchestration surface for discovering nodes, linking remote ports, and validating cluster clock behavior.',
    capabilities: [
      'MIDI cluster node discovery workflows',
      'Remote port connection operations',
      'Distributed clock-health monitoring',
      'Cross-node MIDI topology awareness',
      'Operational visibility across cluster links',
      'Troubleshooting context for node-to-node MIDI',
    ],
    learnMore: 'Use MIDI Cluster whenever MIDI behavior spans multiple nodes and local-only views are insufficient.',
    bestFor: 'Distributed MIDI operations',
  },
  '/mpx1': {
    summary: 'Lexicon MPX-1 control environment for editing, program operations, diagnostics, and integration workflows.',
    capabilities: [
      'MPX-1 editor and runtime control',
      'Live program change operations',
      'Device diagnostics and status insights',
      'Library and preset task handling',
      'MIDI mapping support for hardware control',
      'Integrated rack-focused operation path',
    ],
    learnMore: 'Use MPX1 Rack for direct hardware operations when you need deep Lexicon device control from within MAP2.',
    bestFor: 'Lexicon rack integration',
  },
  '/intelfx': {
    summary: 'Rocktron Intellifex control surface for signal-flow edits, scene handling, and realtime parameter workflows.',
    capabilities: [
      'Intellifex signal-flow editing',
      'Preset library management operations',
      'MIDI mapping for external control',
      'Scene-oriented workflow support',
      'Realtime parameter interaction path',
      'Hardware-connected rack state visibility',
    ],
    learnMore: 'Use IntelFX Rack when Rocktron workflows require both library control and live parameter operations in one place.',
    bestFor: 'Rocktron rack control',
  },
  '/tesira': {
    summary: 'Biamp Tesira AVB operations surface for fleet management, device-level control, and DSP/AVB context.',
    capabilities: [
      'Fleet-level Tesira visibility',
      'Per-device operational pages',
      'DSP surface access for Tesira workflows',
      'AVB context and transport awareness',
      'Multi-device control and coordination',
      'Operational support for Tesira deployments',
    ],
    learnMore: 'Use Tesira AVB for centralized management of Biamp device fleets and associated AVB/DSP operating workflows.',
    bestFor: 'Tesira fleet operations',
  },
  '/lcd': {
    summary: 'Dedicated LCD console workflow for external display surfaces and hardware-panel interaction paths.',
    capabilities: [
      'External LCD console access path',
      'Hardware-panel-focused workflow surface',
      'Dedicated display interaction model',
      'Operational context for LCD-linked systems',
      'Specialized hardware integration handling',
      'Qualification-sensitive feature exposure',
    ],
    learnMore: 'LCD Console is intended for dedicated hardware display workflows and should be validated against hardware readiness requirements.',
    bestFor: 'External panel/display workflows',
  },
  '/edirol-ua1000': {
    summary: 'Interface-specific control page for Edirol UA-1000 status visibility and hardware-aware operations.',
    capabilities: [
      'UA-1000 connection-state visibility',
      'Interface-specific control entry points',
      'Hardware detection-aware UI behavior',
      'Operational status when online or offline',
      'Audio-path context for UA-1000 workflows',
      'Targeted diagnostics for this interface class',
    ],
    learnMore: 'Use this page to confirm UA-1000 presence, inspect status, and execute interface-specific operations from one surface.',
    bestFor: 'UA-1000 hardware operations',
  },
  '/hotone-jogg::HoTone JoGG': {
    summary: 'Device profile for HoTone JoGG connection-state awareness and interface-specific operational controls.',
    capabilities: [
      'HoTone JoGG connection-state visibility',
      'Profile-specific interface controls',
      'Active hardware detection context',
      'Interface behavior monitoring from MAP2',
      'Operational readiness checks per device',
      'Direct access to JoGG-specific workflows',
    ],
    learnMore: 'Use HoTone JoGG card when this specific interface profile is active and you need focused operational controls.',
    bestFor: 'HoTone-specific interface management',
  },
  '/hotone-jogg::Generic Interface': {
    summary: 'Fallback interface profile for experimental and profile-based hardware testing workflows.',
    capabilities: [
      'Generic profile fallback operations',
      'Shared HoTone-page integration path',
      'Experimental interface behavior testing',
      'Profile-driven workflow validation',
      'Connection-state context for fallback paths',
      'Non-default hardware experimentation support',
    ],
    learnMore: 'Use Generic Interface when testing alternate hardware profiles or validating fallback behavior on shared interface pages.',
    bestFor: 'Experimental interface profiling',
  },
}

function fallbackCapabilities(item: HomeItem): string[] {
  return [
    'Route-specific operations surface',
    'Status and workflow visibility for this domain',
    'Action-oriented controls mapped to interface scope',
    'Operator-focused context for rapid decisions',
    'MAP2-integrated navigation and control behavior',
    'Consistent shell-level action affordances',
  ]
}

function maturityBestFor(maturity: NavigationMaturityState): string {
  if (maturity === 'production') return 'Production-ready daily operation'
  if (maturity === 'qualified-with-waiver') return 'Qualified operation with documented caveats'
  if (maturity === 'beta') return 'Advanced workflow validation and iterative use'
  if (maturity === 'experimental') return 'Exploration, prototyping, and non-default flows'
  return 'Hardware-dependent and qualification-sensitive operation'
}

function getProfileKey(item: HomeItem): string {
  return `${item.to}::${item.label}`
}

export function resolveHomeCardProfile(item: HomeItem): HomeCardProfile {
  const exact = PROFILE_BY_KEY[getProfileKey(item)]
  if (exact) {
    return exact
  }

  const byRoute = PROFILE_BY_KEY[item.to]
  if (byRoute) {
    return byRoute
  }

  return {
    summary: item.description,
    capabilities: fallbackCapabilities(item),
    learnMore: 'Open this interface for deeper route-specific controls and context-driven operational actions.',
    bestFor: maturityBestFor(item.maturity),
  }
}
