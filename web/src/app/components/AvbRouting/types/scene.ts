/**
 * AVB Scene Type Definitions
 *
 * Scenes (salvos) are snapshots of the routing matrix state that can be
 * saved, recalled, and compared.
 */

import type { Route } from './route';

/**
 * Scene snapshot
 *
 * A scene captures the complete routing state at a point in time.
 */
export interface Scene {
  id: string;                    // UUID
  name: string;
  description: string;
  routes: Route[];               // Snapshot of all routes
  timestamp: string;             // ISO 8601 creation timestamp
  tags: string[];                // Searchable tags

  // Metadata
  created_by?: string;           // User who created scene
  modified_at?: string;          // Last modification timestamp
  modified_by?: string;          // Last modifier
}

/**
 * Scene diff result
 *
 * Compares current routing state with a scene to show what would change.
 */
export interface SceneDiff {
  scene_id: string;
  scene_name: string;

  // Routes to add (connect)
  to_add: Array<{
    talker_id: string;
    listener_id: string;
    talker_name?: string;
    listener_name?: string;
  }>;

  // Routes to remove (disconnect)
  to_remove: Array<{
    route_id: string;
    talker_id: string;
    listener_id: string;
    talker_name?: string;
    listener_name?: string;
  }>;

  // Routes that match (no change)
  unchanged: string[];

  // Summary
  total_changes: number;
}

/**
 * Scene metadata for listing
 */
export interface SceneSummary {
  id: string;
  name: string;
  description: string;
  timestamp: string;
  tags: string[];
  route_count: number;
}
