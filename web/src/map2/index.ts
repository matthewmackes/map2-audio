// ============================================================================
// MAP2 Audio Platform - Component and API Exports
// Central export file for all MAP2-specific functionality
// ============================================================================

// API Client
export * from './api';
export * from './mpx1Api';

// Type Definitions
export * from './types';

// WebSocket Client
export * from './websocket';
export * from './hooks/useWebSocket';

// Real-Time Parameter Client (<10ms latency)
export * from './realtimeParams';
export * from './hooks/useRTParameter';

// Components
export { default as IRManager } from './components/IRManager';
export { default as NAMManager } from './components/NAMManager';
export { default as AutomationEditor } from './components/AutomationEditor';
export { default as SettingsPanel } from './components/SettingsPanel';
export { default as PluginBrowser } from './components/PluginBrowser';
export { default as PresetManager } from './components/PresetManager';
export { default as MIDIMapper } from './components/MIDIMapper';
export { default as AudioEngine } from './components/AudioEngine';

// New Feature Components (10 Recommended Features)
export { default as PluginCpuIndicator, PluginCpuBadge, PluginCpuBar, useCpuStats } from './components/PluginCpuIndicator';
export { default as LatencyDisplay, LatencyBadge, useLatencyStatus } from './components/LatencyDisplay';
export { default as LFOQuickButton, LFOIndicator } from './components/LFOQuickButton';
export { default as EnvelopeFollowerPanel, EnvelopeIndicator } from './components/EnvelopeFollowerPanel';
export { default as ABQuickToggle, ABModeIndicator } from './components/ABQuickToggle';
export * from './components/ChainBuilder/index';

// Audio Configuration Module
export * from './components/Audio';

// MIDI Learn Mode Module
export * from './components/MIDI';

// Automation Timeline Module (selective exports to avoid conflicts with ./types)
export { TransportControls, AutomationLane as AutomationLaneComponent, AutomationTimeline } from './components/Automation';
export type { TransportControlsProps, AutomationLaneProps, AutomationLaneData, AutomationTimelineProps } from './components/Automation';
