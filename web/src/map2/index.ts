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

// ChainBuilder module (still in use by JUCE engine integration)
export * from './components/ChainBuilder/index';

// MIDI Learn Mode Module
export * from './components/MIDI';
