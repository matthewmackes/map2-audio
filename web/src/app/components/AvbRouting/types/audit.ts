/**
 * Audit Log Type Definitions
 *
 * Tracks all user actions and system events for accountability and debugging.
 */

/**
 * Audit event types
 */
export type AuditEventType =
  // Connection events
  | 'PATCH'
  | 'UNPATCH'
  | 'BATCH_PATCH'

  // Locking events
  | 'LOCK_ROUTE'
  | 'UNLOCK_ROUTE'
  | 'LOCK_ENDPOINT'
  | 'UNLOCK_ENDPOINT'

  // Scene events
  | 'SAVE_SCENE'
  | 'RECALL_SCENE'
  | 'DELETE_SCENE'
  | 'UPDATE_SCENE'
  | 'SCENE_DIFF'

  // Endpoint events
  | 'ENDPOINT_LABEL_CHANGE'
  | 'ENDPOINT_TAG_CHANGE'
  | 'ENDPOINT_COLOR_CHANGE'
  | 'ENDPOINT_DISCOVERED'
  | 'ENDPOINT_LOST'

  // Safe patch events
  | 'ENTER_SAFE_MODE'
  | 'APPLY_SAFE_CHANGES'
  | 'DISCARD_SAFE_CHANGES'

  // System events
  | 'CONNECTION_STATE_CHANGE'
  | 'VALIDATION_WARNING'
  | 'VALIDATION_ERROR'
  | 'SRP_ADMISSION'
  | 'SRP_DENIED';

/**
 * Validation outcome
 */
export type ValidationOutcome = 'success' | 'warning' | 'error';

/**
 * Audit log entry
 *
 * Every user action and significant system event is logged with full context.
 */
export interface AuditLogEntry {
  id: string;                          // UUID
  timestamp: string;                   // ISO 8601 timestamp
  event_type: AuditEventType;
  actor: string;                       // User or 'system'
  payload: Record<string, unknown>;    // Event-specific data
  diff_summary: string;                // Human-readable summary
  validation_outcome: ValidationOutcome;

  // Optional context
  session_id?: string;
  ip_address?: string;
  user_agent?: string;
}

/**
 * Audit log filter criteria
 */
export interface AuditLogFilter {
  event_types?: AuditEventType[];
  actor?: string;
  start_time?: string;
  end_time?: string;
  validation_outcome?: ValidationOutcome;
  search?: string;                     // Text search in diff_summary
  limit?: number;
  offset?: number;
}

/**
 * Audit log query response
 */
export interface AuditLogResponse {
  entries: AuditLogEntry[];
  total: number;
  has_more: boolean;
}
