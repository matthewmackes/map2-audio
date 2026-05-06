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

// ChainBuilder module — retired (T2477 cycle 23 dead-code purge,
// 2026-05-06). The 22 files had zero incoming references outside
// the directory; cycle 22's regression guard pinned that state and
// cycle 23 deletes the directory + this re-export line. The
// retirement is tracked by tests/ChainBuilderRetired.test.ts.

// MIDI Learn Mode Module
export * from './components/MIDI';
