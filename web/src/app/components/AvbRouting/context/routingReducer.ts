/**
 * Routing State Machine Reducer
 *
 * Pure reducer function that handles all state mutations for the AVB routing matrix.
 *
 * Architecture:
 * - All state changes go through this reducer (single source of truth)
 * - Safe patch mode stages changes in `pendingRoutes` before applying
 * - History tracked via `past`/`future` stacks for undo/redo
 * - Audit log captures all user actions with timestamps
 *
 * State Flow:
 *   User Action → Reducer → State Update → API Call (side effect in hook)
 *                                        ↓
 *                              WebSocket Update → State Sync
 */

import type {
  RoutingState,
  RoutingAction,
  Route,
  Endpoint,
  AuditLogEntry,
  SceneDiffPreset,
} from '../types';
import {
  hasDuplicateSceneName,
  normalizeAndValidateSceneMetadata,
} from '../utils/sceneValidation';

function generateId(): string {
  if (typeof globalThis !== 'undefined' && globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  const timestamp = Date.now().toString(36);
  const randomA = Math.random().toString(36).slice(2, 10);
  const randomB = Math.random().toString(36).slice(2, 10);
  return `${timestamp}-${randomA}-${randomB}`;
}

function normalizeSelectedNodeIds(nodeIds: string[]): string[] {
  return Array.from(new Set(nodeIds)).sort((a, b) => a.localeCompare(b));
}

const DEFAULT_ACTOR_ID = 'user';

function getCurrentActorId(): string {
  if (typeof globalThis === 'undefined') {
    return DEFAULT_ACTOR_ID;
  }

  const runtime = globalThis as typeof globalThis & {
    __MAP2_AVB_ACTOR__?: unknown;
  };
  const runtimeActor = runtime.__MAP2_AVB_ACTOR__;
  if (typeof runtimeActor === 'string') {
    const normalized = runtimeActor.trim();
    if (normalized.length > 0) {
      return normalized;
    }
  }

  return DEFAULT_ACTOR_ID;
}

function getSceneDiffPresets(state: RoutingState): SceneDiffPreset[] {
  return state.sceneDiff.presets || [];
}

function isConflictResolutionMode(
  value: unknown
): value is NonNullable<SceneDiffPreset['preferred_conflict_action']> {
  return value === 'upsert' || value === 'rename' || value === 'skip';
}

function sortSceneDiffPresets(presets: SceneDiffPreset[]): SceneDiffPreset[] {
  return presets
    .slice()
    .sort((a, b) => {
      const byName = a.name.localeCompare(b.name);
      return byName !== 0 ? byName : a.id.localeCompare(b.id);
    });
}

function buildSceneDiffPreview(
  baselineScene: { id: string; name: string; routes: Route[] },
  compareScene: { id: string; name: string; routes: Route[] },
  endpoints: Record<string, Endpoint>
): RoutingState['sceneDiff']['preview'] {
  const baselineById = new Map(baselineScene.routes.map((route) => [route.id, route]));
  const compareById = new Map(compareScene.routes.map((route) => [route.id, route]));

  const toAdd = compareScene.routes
    .filter((route) => !baselineById.has(route.id))
    .map((route) => ({
      talker_id: route.talker_id,
      listener_id: route.listener_id,
      talker_name: endpoints[route.talker_id]?.device_name,
      listener_name: endpoints[route.listener_id]?.device_name,
    }))
    .sort((a, b) => `${a.talker_id}→${a.listener_id}`.localeCompare(`${b.talker_id}→${b.listener_id}`));

  const toRemove = baselineScene.routes
    .filter((route) => !compareById.has(route.id))
    .map((route) => ({
      route_id: route.id,
      talker_id: route.talker_id,
      listener_id: route.listener_id,
      talker_name: endpoints[route.talker_id]?.device_name,
      listener_name: endpoints[route.listener_id]?.device_name,
    }))
    .sort((a, b) => a.route_id.localeCompare(b.route_id));

  const unchanged = compareScene.routes
    .filter((route) => baselineById.has(route.id))
    .map((route) => route.id)
    .sort((a, b) => a.localeCompare(b));

  return {
    scene_id: compareScene.id,
    scene_name: compareScene.name,
    to_add: toAdd,
    to_remove: toRemove,
    unchanged,
    total_changes: toAdd.length + toRemove.length,
  };
}

/**
 * Create a new audit log entry
 */
function createAuditEntry(
  type: AuditLogEntry['event_type'],
  payload: Record<string, unknown>,
  summary: string,
  outcome: AuditLogEntry['validation_outcome'] = 'success'
): AuditLogEntry {
  return {
    id: generateId(),
    timestamp: new Date().toISOString(),
    event_type: type,
    actor: getCurrentActorId(),
    payload,
    diff_summary: summary,
    validation_outcome: outcome,
  };
}

/**
 * Save state to history (for undo/redo)
 */
function saveToHistory(previousState: RoutingState, nextState: RoutingState): RoutingState {
  return {
    ...nextState,
    history: {
      past: [...previousState.history.past, previousState],
      future: [], // Clear redo stack on new action
    },
  };
}

/**
 * Routing Reducer
 *
 * Handles all state mutations in a predictable, type-safe manner.
 */
export function routingReducer(
  state: RoutingState,
  action: RoutingAction
): RoutingState {
  switch (action.type) {
    // ========================================================================
    // Connection Actions
    // ========================================================================

    case 'PATCH': {
      const { talker_id, listener_id } = action.payload;
      const route_id = `${talker_id}→${listener_id}`;
      const talkerNodeId = state.endpoints[talker_id]?.node_id;
      const listenerNodeId = state.endpoints[listener_id]?.node_id;
      const crossNode = !!talkerNodeId && !!listenerNodeId && talkerNodeId !== listenerNodeId;

      // Check if route already exists
      const existingRoute = state.liveRoutes[route_id];
      if (existingRoute?.state === 'connected') {
        return state; // Already connected, no-op
      }

      // In safe patch mode, stage the connection
      if (state.safePatchMode) {
        const newState = {
          ...state,
          pendingRoutes: {
            ...state.pendingRoutes,
            [route_id]: {
              id: route_id,
              talker_id,
              listener_id,
              state: 'connecting' as const,
              established_time: null,
              error_message: null,
              connection_count: 0,
              srp_reservation_id: null,
              srp_admission_id: null,
              locked: false,
              valid: true,
              messages: [],
              talker_node_id: talkerNodeId,
              listener_node_id: listenerNodeId,
              cross_node: crossNode,
            },
          },
          auditLog: [
            ...state.auditLog,
            createAuditEntry('PATCH', action.payload, `Staged connection: ${route_id}`),
          ],
        };

        return saveToHistory(state, newState);
      }

      // Direct patch (API call handled by side effect)
      const newState = {
        ...state,
        liveRoutes: {
          ...state.liveRoutes,
          [route_id]: {
            id: route_id,
            talker_id,
            listener_id,
            state: 'connecting' as const,
            established_time: null,
            error_message: null,
            connection_count: 0,
            srp_reservation_id: null,
            srp_admission_id: null,
            locked: false,
            valid: true,
            messages: [],
            talker_node_id: talkerNodeId,
            listener_node_id: listenerNodeId,
            cross_node: crossNode,
          },
        },
        auditLog: [
          ...state.auditLog,
          createAuditEntry('PATCH', action.payload, `Connecting: ${route_id}`),
        ],
      };

      return saveToHistory(state, newState);
    }

    case 'UNPATCH': {
      const { route_id } = action.payload;

      // Check if route is locked
      const route = state.liveRoutes[route_id];
      if (!route) {
        return {
          ...state,
          error: `Route not found: ${route_id}`,
        };
      }
      if (route?.locked) {
        return {
          ...state,
          error: `Cannot disconnect locked route: ${route_id}`,
        };
      }

      // In safe patch mode, stage the disconnection
      if (state.safePatchMode) {
        const newState = {
          ...state,
          pendingRoutes: {
            ...state.pendingRoutes,
            [route_id]: {
              ...route,
              state: 'disconnecting' as const,
            } as Route,
          },
          auditLog: [
            ...state.auditLog,
            createAuditEntry('UNPATCH', action.payload, `Staged disconnection: ${route_id}`),
          ],
        };

        return saveToHistory(state, newState);
      }

      // Direct unpatch
      const newLiveRoutes = { ...state.liveRoutes };
      delete newLiveRoutes[route_id];

      const newState = {
        ...state,
        liveRoutes: newLiveRoutes,
        auditLog: [
          ...state.auditLog,
          createAuditEntry('UNPATCH', action.payload, `Disconnected: ${route_id}`),
        ],
      };

      return saveToHistory(state, newState);
    }

    case 'BATCH_PATCH': {
      const { operations } = action.payload;

      // Apply all operations
      let newState = state;
      for (const op of operations) {
        if (op.action === 'connect') {
          newState = routingReducer(newState, {
            type: 'PATCH',
            payload: { talker_id: op.talker_id, listener_id: op.listener_id },
          });
        } else if (op.action === 'disconnect') {
          const route_id = `${op.talker_id}→${op.listener_id}`;
          newState = routingReducer(newState, {
            type: 'UNPATCH',
            payload: { route_id },
          });
        }
      }

      return {
        ...newState,
        auditLog: [
          ...newState.auditLog,
          createAuditEntry(
            'BATCH_PATCH',
            action.payload,
            `Batch operation: ${operations.length} changes`
          ),
        ],
      };
    }

    // ========================================================================
    // Locking Actions
    // ========================================================================

    case 'LOCK_ROUTE': {
      const { route_id, reason } = action.payload;
      const route = state.liveRoutes[route_id];
      const actorId = getCurrentActorId();

      if (!route) {
        return { ...state, error: `Route not found: ${route_id}` };
      }

      const newState = {
        ...state,
        liveRoutes: {
          ...state.liveRoutes,
          [route_id]: {
            ...route,
            locked: true,
            lock_reason: reason,
            locked_by: actorId,
            locked_at: new Date().toISOString(),
          },
        },
        auditLog: [
          ...state.auditLog,
          createAuditEntry(
            'LOCK_ROUTE',
            action.payload,
            `Locked route: ${route_id} (${reason})`
          ),
        ],
      };

      return saveToHistory(state, newState);
    }

    case 'UNLOCK_ROUTE': {
      const { route_id } = action.payload;
      const route = state.liveRoutes[route_id];

      if (!route) {
        return { ...state, error: `Route not found: ${route_id}` };
      }

      const newState = {
        ...state,
        liveRoutes: {
          ...state.liveRoutes,
          [route_id]: {
            ...route,
            locked: false,
            lock_reason: undefined,
            locked_by: undefined,
            locked_at: undefined,
          },
        },
        auditLog: [
          ...state.auditLog,
          createAuditEntry('UNLOCK_ROUTE', action.payload, `Unlocked route: ${route_id}`),
        ],
      };

      return saveToHistory(state, newState);
    }

    case 'LOCK_ENDPOINT': {
      const { endpoint_id, reason } = action.payload;
      const endpoint = state.endpoints[endpoint_id];

      if (!endpoint) {
        return { ...state, error: `Endpoint not found: ${endpoint_id}` };
      }

      return {
        ...state,
        endpoints: {
          ...state.endpoints,
          [endpoint_id]: {
            ...endpoint,
            locked: true,
          },
        },
        auditLog: [
          ...state.auditLog,
          createAuditEntry(
            'LOCK_ENDPOINT',
            action.payload,
            `Locked endpoint: ${endpoint_id} (${reason})`
          ),
        ],
      };
    }

    case 'UNLOCK_ENDPOINT': {
      const { endpoint_id } = action.payload;
      const endpoint = state.endpoints[endpoint_id];

      if (!endpoint) {
        return { ...state, error: `Endpoint not found: ${endpoint_id}` };
      }

      return {
        ...state,
        endpoints: {
          ...state.endpoints,
          [endpoint_id]: {
            ...endpoint,
            locked: false,
          },
        },
        auditLog: [
          ...state.auditLog,
          createAuditEntry(
            'UNLOCK_ENDPOINT',
            action.payload,
            `Unlocked endpoint: ${endpoint_id}`
          ),
        ],
      };
    }

    // ========================================================================
    // Safe Patch Mode
    // ========================================================================

    case 'ENTER_SAFE_MODE': {
      return {
        ...state,
        safePatchMode: true,
        pendingRoutes: {},
        auditLog: [
          ...state.auditLog,
          createAuditEntry('ENTER_SAFE_MODE', {}, 'Entered safe patch mode'),
        ],
      };
    }

    case 'APPLY_SAFE_CHANGES': {
      // Apply pending routes to live routes, translating staged disconnects
      // into deletions and staged connects into connected state.
      const nextLiveRoutes: Record<string, Route> = { ...state.liveRoutes };
      const nowIso = new Date().toISOString();

      for (const [routeId, pendingRoute] of Object.entries(state.pendingRoutes)) {
        if (pendingRoute.state === 'disconnecting') {
          delete nextLiveRoutes[routeId];
          continue;
        }

        if (pendingRoute.state === 'connecting') {
          nextLiveRoutes[routeId] = {
            ...pendingRoute,
            state: 'connected',
            established_time: pendingRoute.established_time ?? nowIso,
            error_message: null,
          };
          continue;
        }

        nextLiveRoutes[routeId] = pendingRoute;
      }

      const newState = {
        ...state,
        liveRoutes: nextLiveRoutes,
        pendingRoutes: {},
        safePatchMode: false,
        auditLog: [
          ...state.auditLog,
          createAuditEntry(
            'APPLY_SAFE_CHANGES',
            { count: Object.keys(state.pendingRoutes).length },
            `Applied ${Object.keys(state.pendingRoutes).length} pending changes`
          ),
        ],
      };

      return saveToHistory(state, newState);
    }

    case 'DISCARD_SAFE_CHANGES': {
      const newState = {
        ...state,
        pendingRoutes: {},
        safePatchMode: false,
        auditLog: [
          ...state.auditLog,
          createAuditEntry(
            'DISCARD_SAFE_CHANGES',
            { count: Object.keys(state.pendingRoutes).length },
            `Discarded ${Object.keys(state.pendingRoutes).length} pending changes`
          ),
        ],
      };

      return saveToHistory(state, newState);
    }

    // ========================================================================
    // Scene Management
    // ========================================================================

    case 'SAVE_SCENE': {
      const { name, description, tags } = action.payload;
      const validation = normalizeAndValidateSceneMetadata(
        { name, description, tags },
        { requireName: true }
      );
      if (validation.errors.length > 0) {
        return {
          ...state,
          error: validation.errors[0],
        };
      }
      const normalized = validation.normalized;
      const duplicateName = hasDuplicateSceneName(
        normalized.name,
        Object.values(state.scenes).map((scene) => ({ id: scene.id, name: scene.name }))
      );
      const scene_id = generateId();
      const actorId = getCurrentActorId();

      const scene = {
        id: scene_id,
        name: normalized.name,
        description: normalized.description,
        tags: normalized.tags,
        routes: Object.values(state.liveRoutes),
        timestamp: new Date().toISOString(),
        created_by: actorId,
      };

      const newState = {
        ...state,
        error: null,
        scenes: {
          ...state.scenes,
          [scene_id]: scene,
        },
        auditLog: [
          ...state.auditLog,
          createAuditEntry(
            'SAVE_SCENE',
            {
              scene_id,
              name: normalized.name,
              description: normalized.description,
              tags: normalized.tags,
              duplicate_name: duplicateName,
            },
            `Saved scene: ${normalized.name} (${Object.keys(state.liveRoutes).length} routes)`,
            duplicateName ? 'warning' : 'success'
          ),
        ],
      };

      return saveToHistory(state, newState);
    }

    case 'RECALL_SCENE': {
      const { scene_id } = action.payload;
      const scene = state.scenes[scene_id];

      if (!scene) {
        return { ...state, error: `Scene not found: ${scene_id}` };
      }

      // Replace live routes with scene routes
      const newLiveRoutes: Record<string, Route> = {};
      for (const route of scene.routes) {
        newLiveRoutes[route.id] = route;
      }

      const newState = {
        ...state,
        liveRoutes: newLiveRoutes,
        auditLog: [
          ...state.auditLog,
          createAuditEntry(
            'RECALL_SCENE',
            action.payload,
            `Recalled scene: ${scene.name} (${scene.routes.length} routes)`
          ),
        ],
      };

      return saveToHistory(state, newState);
    }

    case 'DELETE_SCENE': {
      const { scene_id } = action.payload;
      const scene = state.scenes[scene_id];

      if (!scene) {
        return state;
      }

      const newScenes = { ...state.scenes };
      delete newScenes[scene_id];
      const baselineSceneId =
        state.sceneDiff.baseline_scene_id === scene_id ? null : state.sceneDiff.baseline_scene_id;
      const compareSceneId =
        state.sceneDiff.compare_scene_id === scene_id ? null : state.sceneDiff.compare_scene_id;
      const previewReferencesDeletedScene =
        state.sceneDiff.preview?.scene_id === scene_id ||
        state.sceneDiff.baseline_scene_id === scene_id ||
        state.sceneDiff.compare_scene_id === scene_id;
      const retainedPresets = getSceneDiffPresets(state).filter((preset) => (
        preset.baseline_scene_id !== scene_id &&
        preset.compare_scene_id !== scene_id
      ));
      const retainedActivePresetId =
        state.sceneDiff.active_preset_id &&
        retainedPresets.some((preset) => preset.id === state.sceneDiff.active_preset_id)
          ? state.sceneDiff.active_preset_id
          : null;

      return {
        ...state,
        scenes: newScenes,
        sceneDiff: {
          ...state.sceneDiff,
          baseline_scene_id: baselineSceneId,
          compare_scene_id: compareSceneId,
          preview: previewReferencesDeletedScene ? null : state.sceneDiff.preview,
          presets: retainedPresets,
          active_preset_id: retainedActivePresetId,
        },
        auditLog: [
          ...state.auditLog,
          createAuditEntry('DELETE_SCENE', action.payload, `Deleted scene: ${scene.name}`),
        ],
      };
    }

    case 'UPDATE_SCENE_METADATA': {
      const { scene_id, name, description, tags } = action.payload;
      const scene = state.scenes[scene_id];

      if (!scene) {
        return { ...state, error: `Scene not found: ${scene_id}` };
      }

      const validation = normalizeAndValidateSceneMetadata(
        { name, description, tags },
        { requireName: true }
      );
      if (validation.errors.length > 0) {
        return {
          ...state,
          error: validation.errors[0],
        };
      }
      const nextName = validation.normalized.name;
      const nextDescription = validation.normalized.description;
      const nextTags = validation.normalized.tags;
      const duplicateName = hasDuplicateSceneName(
        nextName,
        Object.values(state.scenes).map((existingScene) => ({ id: existingScene.id, name: existingScene.name })),
        { excludeSceneId: scene_id }
      );
      const modifiedAt = new Date().toISOString();
      const updatedScene = {
        ...scene,
        name: nextName,
        description: nextDescription,
        tags: nextTags,
        modified_at: modifiedAt,
        modified_by: 'user',
      };

      const updatedPreview =
        state.sceneDiff.preview?.scene_id === scene_id
          ? {
              ...state.sceneDiff.preview,
              scene_name: nextName,
            }
          : state.sceneDiff.preview;

      const newState = {
        ...state,
        error: null,
        scenes: {
          ...state.scenes,
          [scene_id]: updatedScene,
        },
        sceneDiff: {
          ...state.sceneDiff,
          preview: updatedPreview,
        },
        auditLog: [
          ...state.auditLog,
          createAuditEntry(
            'UPDATE_SCENE',
            {
              scene_id,
              name: nextName,
              description: nextDescription,
              tags: nextTags,
              duplicate_name: duplicateName,
            },
            `Updated scene metadata: ${scene.name} -> ${nextName}`,
            duplicateName ? 'warning' : 'success'
          ),
        ],
      };

      return saveToHistory(state, newState);
    }

    case 'SET_SCENE_DIFF_BASELINE': {
      const matchingPreset =
        action.payload && state.sceneDiff.compare_scene_id
          ? getSceneDiffPresets(state).find((preset) => (
              preset.baseline_scene_id === action.payload &&
              preset.compare_scene_id === state.sceneDiff.compare_scene_id
            ))
          : null;

      return {
        ...state,
        sceneDiff: {
          ...state.sceneDiff,
          baseline_scene_id: action.payload,
          preview: null,
          active_preset_id: matchingPreset ? matchingPreset.id : null,
        },
      };
    }

    case 'SET_SCENE_DIFF_COMPARE': {
      const matchingPreset =
        state.sceneDiff.baseline_scene_id && action.payload
          ? getSceneDiffPresets(state).find((preset) => (
              preset.baseline_scene_id === state.sceneDiff.baseline_scene_id &&
              preset.compare_scene_id === action.payload
            ))
          : null;

      return {
        ...state,
        sceneDiff: {
          ...state.sceneDiff,
          compare_scene_id: action.payload,
          preview: null,
          active_preset_id: matchingPreset ? matchingPreset.id : null,
        },
      };
    }

    case 'GENERATE_SCENE_DIFF': {
      const { baseline_scene_id, compare_scene_id } = state.sceneDiff;
      if (!baseline_scene_id || !compare_scene_id) {
        return {
          ...state,
          error: 'Scene diff requires both baseline and compare scene selections',
        };
      }

      const baselineScene = state.scenes[baseline_scene_id];
      const compareScene = state.scenes[compare_scene_id];
      if (!baselineScene || !compareScene) {
        return {
          ...state,
          error: 'Scene diff scene selection is invalid',
        };
      }

      return {
        ...state,
        error: null,
        sceneDiff: {
          ...state.sceneDiff,
          preview: buildSceneDiffPreview(baselineScene, compareScene, state.endpoints),
        },
      };
    }

    case 'CLEAR_SCENE_DIFF': {
      return {
        ...state,
        sceneDiff: {
          ...state.sceneDiff,
          baseline_scene_id: null,
          compare_scene_id: null,
          preview: null,
          active_preset_id: null,
        },
      };
    }

    case 'SAVE_SCENE_DIFF_PRESET': {
      const baselineSceneId = state.sceneDiff.baseline_scene_id;
      const compareSceneId = state.sceneDiff.compare_scene_id;
      if (!baselineSceneId || !compareSceneId) {
        return {
          ...state,
          error: 'Scene diff preset requires both baseline and compare scene selections',
        };
      }

      const baselineScene = state.scenes[baselineSceneId];
      const compareScene = state.scenes[compareSceneId];
      if (!baselineScene || !compareScene) {
        return {
          ...state,
          error: 'Scene diff preset scene selection is invalid',
        };
      }

      const fallbackName = `${baselineScene.name} vs ${compareScene.name}`;
      const requestedNotes = typeof action.payload.notes === 'string' ? action.payload.notes : '';
      const validation = normalizeAndValidateSceneMetadata(
        { name: action.payload.name || fallbackName, description: requestedNotes, tags: [] },
        { requireName: true }
      );
      if (validation.errors.length > 0) {
        return {
          ...state,
          error: validation.errors[0],
        };
      }

      const normalizedPresetName = validation.normalized.name;
      const normalizedPresetNotes = validation.normalized.description;
      const normalizedPresetNameLower = normalizedPresetName.toLowerCase();
      const existingPresets = getSceneDiffPresets(state);
      const existingPreset = existingPresets.find(
        (preset) => preset.name.toLowerCase() === normalizedPresetNameLower
      );
      const incomingVersion = action.payload.preset_version;
      const normalizedPresetVersion =
        typeof incomingVersion === 'number' && Number.isFinite(incomingVersion) && incomingVersion > 0
          ? Math.floor(incomingVersion)
          : existingPreset?.preset_version || 1;
      const normalizedPreferredConflictAction =
        isConflictResolutionMode(action.payload.preferred_conflict_action)
          ? action.payload.preferred_conflict_action
          : existingPreset?.preferred_conflict_action;
      const presetId = existingPreset ? existingPreset.id : generateId();
      const mode = existingPreset ? 'updated' : 'created';
      const nextPreset = {
        id: presetId,
        name: normalizedPresetName,
        baseline_scene_id: baselineSceneId,
        compare_scene_id: compareSceneId,
        updated_at: new Date().toISOString(),
        preset_version: normalizedPresetVersion,
        notes: normalizedPresetNotes || undefined,
        preferred_conflict_action: normalizedPreferredConflictAction,
      };
      const nextPresets = sortSceneDiffPresets(
        existingPreset
          ? existingPresets.map((preset) => (preset.id === presetId ? nextPreset : preset))
          : [...existingPresets, nextPreset]
      );

      const newState = {
        ...state,
        error: null,
        sceneDiff: {
          ...state.sceneDiff,
          presets: nextPresets,
          active_preset_id: presetId,
        },
        auditLog: [
          ...state.auditLog,
          createAuditEntry(
            'SCENE_DIFF',
            {
              preset_id: presetId,
              preset_name: normalizedPresetName,
              baseline_scene_id: baselineSceneId,
              compare_scene_id: compareSceneId,
              notes: normalizedPresetNotes,
              preset_version: normalizedPresetVersion,
              preferred_conflict_action: normalizedPreferredConflictAction,
              mode,
            },
            `${mode === 'created' ? 'Saved' : 'Updated'} scene diff preset: ${normalizedPresetName}`
          ),
        ],
      };

      return saveToHistory(state, newState);
    }

    case 'APPLY_SCENE_DIFF_PRESET': {
      const existingPresets = getSceneDiffPresets(state);
      const preset = existingPresets.find(
        (entry) => entry.id === action.payload.preset_id
      );
      if (!preset) {
        return {
          ...state,
          error: `Scene diff preset not found: ${action.payload.preset_id}`,
        };
      }
      if (!state.scenes[preset.baseline_scene_id] || !state.scenes[preset.compare_scene_id]) {
        const retainedPresets = existingPresets.filter((entry) => entry.id !== preset.id);
        const newState = {
          ...state,
          error: `Scene diff preset "${preset.name}" references missing scenes and was removed`,
          sceneDiff: {
            ...state.sceneDiff,
            presets: retainedPresets,
            active_preset_id:
              state.sceneDiff.active_preset_id === preset.id
                ? null
                : state.sceneDiff.active_preset_id || null,
          },
          auditLog: [
            ...state.auditLog,
            createAuditEntry(
              'SCENE_DIFF',
              {
                preset_id: preset.id,
                preset_name: preset.name,
                mode: 'stale_removed',
              },
              `Removed stale scene diff preset: ${preset.name}`,
              'warning'
            ),
          ],
        };

        return saveToHistory(state, newState);
      }

      return {
        ...state,
        error: null,
        sceneDiff: {
          ...state.sceneDiff,
          baseline_scene_id: preset.baseline_scene_id,
          compare_scene_id: preset.compare_scene_id,
          preview: null,
          active_preset_id: preset.id,
        },
      };
    }

    case 'DELETE_SCENE_DIFF_PRESET': {
      const existingPresets = getSceneDiffPresets(state);
      const preset = existingPresets.find((entry) => entry.id === action.payload.preset_id);
      if (!preset) {
        return state;
      }

      const nextPresets = existingPresets.filter((entry) => entry.id !== preset.id);
      const newState = {
        ...state,
        error: null,
        sceneDiff: {
          ...state.sceneDiff,
          presets: nextPresets,
          active_preset_id:
            state.sceneDiff.active_preset_id === preset.id
              ? null
              : state.sceneDiff.active_preset_id || null,
        },
        auditLog: [
          ...state.auditLog,
          createAuditEntry(
            'SCENE_DIFF',
            {
              preset_id: preset.id,
              preset_name: preset.name,
              mode: 'deleted',
            },
            `Deleted scene diff preset: ${preset.name}`
          ),
        ],
      };

      return saveToHistory(state, newState);
    }

    case 'IMPORT_SCENE_DIFF_PRESETS': {
      const existingPresets = getSceneDiffPresets(state);
      let nextPresets = existingPresets.slice();
      const nameToPresetId = new Map(
        existingPresets.map((preset) => [preset.name.toLowerCase(), preset.id])
      );

      let importedCount = 0;
      let skippedCount = 0;

      action.payload.presets.forEach((presetInput) => {
        if (!state.scenes[presetInput.baseline_scene_id] || !state.scenes[presetInput.compare_scene_id]) {
          skippedCount += 1;
          return;
        }

        const hasNotesField = typeof presetInput.notes === 'string';
        const rawNotes = hasNotesField ? presetInput.notes : '';
        const validation = normalizeAndValidateSceneMetadata(
          { name: presetInput.name, description: rawNotes, tags: [] },
          { requireName: true }
        );
        if (validation.errors.length > 0) {
          skippedCount += 1;
          return;
        }

        const normalizedName = validation.normalized.name;
        const normalizedNotes = validation.normalized.description;
        const normalizedNameLower = normalizedName.toLowerCase();
        const existingId = nameToPresetId.get(normalizedNameLower);
        const existingPreset = existingId
          ? nextPresets.find((preset) => preset.id === existingId)
          : null;
        const incomingVersion = presetInput.preset_version;
        const normalizedVersion =
          typeof incomingVersion === 'number' && Number.isFinite(incomingVersion) && incomingVersion > 0
            ? Math.floor(incomingVersion)
            : existingPreset?.preset_version || 1;
        const preferredConflictAction = isConflictResolutionMode(presetInput.preferred_conflict_action)
          ? presetInput.preferred_conflict_action
          : existingPreset?.preferred_conflict_action;
        const nextPreset = {
          id: existingId || generateId(),
          name: normalizedName,
          baseline_scene_id: presetInput.baseline_scene_id,
          compare_scene_id: presetInput.compare_scene_id,
          updated_at: new Date().toISOString(),
          preset_version: normalizedVersion,
          notes: hasNotesField
            ? (normalizedNotes || undefined)
            : existingPreset?.notes,
          preferred_conflict_action: preferredConflictAction,
        };

        if (existingId) {
          nextPresets = nextPresets.map((preset) => (preset.id === existingId ? nextPreset : preset));
        } else {
          nextPresets = [...nextPresets, nextPreset];
          nameToPresetId.set(normalizedNameLower, nextPreset.id);
        }
        importedCount += 1;
      });

      if (importedCount === 0) {
        return {
          ...state,
          error: 'No valid scene diff presets to import',
        };
      }

      const sortedPresets = sortSceneDiffPresets(nextPresets);
      const nextActivePresetId =
        state.sceneDiff.active_preset_id &&
        sortedPresets.some((preset) => preset.id === state.sceneDiff.active_preset_id)
          ? state.sceneDiff.active_preset_id
          : null;
      const newState = {
        ...state,
        error: null,
        sceneDiff: {
          ...state.sceneDiff,
          presets: sortedPresets,
          active_preset_id: nextActivePresetId,
        },
        auditLog: [
          ...state.auditLog,
          createAuditEntry(
            'SCENE_DIFF',
            {
              mode: 'import',
              imported_count: importedCount,
              skipped_count: skippedCount,
            },
            `Imported ${importedCount} scene diff preset${importedCount === 1 ? '' : 's'}`
          ),
        ],
      };

      return saveToHistory(state, newState);
    }

    case 'SWAP_SCENE_DIFF_SELECTION': {
      const baselineSceneId = state.sceneDiff.baseline_scene_id;
      const compareSceneId = state.sceneDiff.compare_scene_id;
      if (!baselineSceneId || !compareSceneId) {
        return {
          ...state,
          error: 'Scene diff swap requires both baseline and compare scene selections',
        };
      }

      return {
        ...state,
        error: null,
        sceneDiff: {
          ...state.sceneDiff,
          baseline_scene_id: compareSceneId,
          compare_scene_id: baselineSceneId,
          preview: null,
          active_preset_id: null,
        },
      };
    }

    case 'LOG_SCENE_DIFF_PRESET_PREVIEW': {
      const { phase } = action.payload;
      const sourceCount =
        typeof action.payload.source_count === 'number' && Number.isFinite(action.payload.source_count)
          ? Math.floor(action.payload.source_count)
          : null;
      const summaryPrefix =
        phase === 'opened'
          ? 'Opened'
          : phase === 'refreshed'
            ? 'Refreshed'
            : 'Cancelled';
      const summary = sourceCount === null
        ? `${summaryPrefix} scene diff preset import preview`
        : `${summaryPrefix} scene diff preset import preview (${sourceCount} row${sourceCount === 1 ? '' : 's'})`;

      return {
        ...state,
        auditLog: [
          ...state.auditLog,
          createAuditEntry(
            'SCENE_DIFF',
            {
              ...action.payload,
              mode: `preset_import_preview_${phase}`,
            },
            summary,
            phase === 'cancelled' ? 'warning' : 'success'
          ),
        ],
      };
    }

    // ========================================================================
    // UI State Actions
    // ========================================================================

    case 'SET_FILTERS': {
      return {
        ...state,
        filters: {
          ...state.filters,
          ...action.payload,
        },
      };
    }

    case 'SET_SEARCH': {
      return {
        ...state,
        search: action.payload,
      };
    }

    case 'SET_BANK': {
      return {
        ...state,
        bank: {
          ...state.bank,
          ...action.payload,
        },
      };
    }

    case 'SELECT_ENDPOINT': {
      const endpoint_id = action.payload;
      const isSelected = state.selection.selectedEndpoints.includes(endpoint_id);

      return {
        ...state,
        selection: {
          ...state.selection,
          selectedEndpoints: isSelected
            ? state.selection.selectedEndpoints.filter(id => id !== endpoint_id)
            : [...state.selection.selectedEndpoints, endpoint_id],
        },
      };
    }

    case 'SELECT_ROUTE': {
      const route_id = action.payload;
      const isSelected = state.selection.selectedRoutes.includes(route_id);

      return {
        ...state,
        selection: {
          ...state.selection,
          selectedRoutes: isSelected
            ? state.selection.selectedRoutes.filter(id => id !== route_id)
            : [...state.selection.selectedRoutes, route_id],
        },
      };
    }

    case 'CLEAR_SELECTION': {
      return {
        ...state,
        selection: {
          selectedEndpoints: [],
          selectedRoutes: [],
          hoveredCell: null,
          focusedCell: null,
        },
      };
    }

    case 'HOVER_CELL': {
      return {
        ...state,
        selection: {
          ...state.selection,
          hoveredCell: action.payload,
        },
      };
    }

    case 'FOCUS_CELL': {
      return {
        ...state,
        selection: {
          ...state.selection,
          focusedCell: action.payload,
        },
      };
    }

    // ========================================================================
    // Endpoint Metadata Actions
    // ========================================================================

    case 'UPDATE_ENDPOINT_LABEL': {
      const { endpoint_id, label } = action.payload;
      const endpoint = state.endpoints[endpoint_id];

      if (!endpoint) {
        return state;
      }

      return {
        ...state,
        endpoints: {
          ...state.endpoints,
          [endpoint_id]: {
            ...endpoint,
            device_name: label, // Update display name
          },
        },
        auditLog: [
          ...state.auditLog,
          createAuditEntry(
            'ENDPOINT_LABEL_CHANGE',
            action.payload,
            `Renamed endpoint: ${endpoint_id} → "${label}"`
          ),
        ],
      };
    }

    case 'UPDATE_ENDPOINT_TAGS': {
      const { endpoint_id, tags } = action.payload;
      const endpoint = state.endpoints[endpoint_id];

      if (!endpoint) {
        return state;
      }

      return {
        ...state,
        endpoints: {
          ...state.endpoints,
          [endpoint_id]: {
            ...endpoint,
            tags,
          },
        },
      };
    }

    case 'UPDATE_ENDPOINT_COLOR': {
      const { endpoint_id, color } = action.payload;
      const endpoint = state.endpoints[endpoint_id];

      if (!endpoint) {
        return state;
      }

      return {
        ...state,
        endpoints: {
          ...state.endpoints,
          [endpoint_id]: {
            ...endpoint,
            color,
          },
        },
      };
    }

    // ========================================================================
    // Data Sync Actions (from API/WebSocket)
    // ========================================================================

    case 'ENDPOINTS_UPDATED': {
      const endpoints = action.payload;
      const newEndpoints: Record<string, Endpoint> = {};

      for (const endpoint of endpoints) {
        // Preserve UI metadata if endpoint already exists
        const existing = state.endpoints[endpoint.endpoint_id];
        newEndpoints[endpoint.endpoint_id] = {
          ...endpoint,
          tags: existing?.tags || [],
          color: existing?.color || '#ffffff',
          group: existing?.group || 'Default',
          bank: existing?.bank || 0,
          pinned: existing?.pinned || false,
          locked: existing?.locked || false,
        };
      }

      return {
        ...state,
        endpoints: newEndpoints,
        lastSync: new Date().toISOString(),
      };
    }

    case 'CONNECTIONS_UPDATED': {
      const routes = action.payload;
      const newRoutes: Record<string, Route> = {};

      for (const route of routes) {
        // Preserve UI metadata if route already exists
        const existing = state.liveRoutes[route.id];
        newRoutes[route.id] = {
          ...route,
          locked: existing?.locked || false,
          lock_reason: existing?.lock_reason,
          locked_by: existing?.locked_by,
          locked_at: existing?.locked_at,
          valid: existing?.valid ?? true,
          messages: existing?.messages || [],
        };
      }

      return {
        ...state,
        liveRoutes: newRoutes,
        lastSync: new Date().toISOString(),
      };
    }

    case 'STATUS_UPDATE': {
      const { endpoint_id, available } = action.payload;
      const endpoint = state.endpoints[endpoint_id];

      if (!endpoint) {
        return state;
      }

      return {
        ...state,
        endpoints: {
          ...state.endpoints,
          [endpoint_id]: {
            ...endpoint,
            available,
            last_seen: new Date().toISOString(),
          },
        },
      };
    }

    case 'CONNECTION_STATE_CHANGE': {
      const { route_id, state: newState, error_message } = action.payload;
      const route = state.liveRoutes[route_id];

      if (!route) {
        return state;
      }

      return {
        ...state,
        liveRoutes: {
          ...state.liveRoutes,
          [route_id]: {
            ...route,
            state: newState,
            error_message: error_message || null,
            established_time: newState === 'connected' ? new Date().toISOString() : route.established_time,
          },
        },
        auditLog: [
          ...state.auditLog,
          createAuditEntry(
            'CONNECTION_STATE_CHANGE',
            { route_id, state: newState, error_message },
            `Connection state changed: ${route_id} → ${newState}`
          ),
        ],
      };
    }

    // ========================================================================
    // History Actions
    // ========================================================================

    case 'UNDO': {
      if (state.history.past.length === 0) {
        return state;
      }

      const previous = state.history.past[state.history.past.length - 1];
      const newPast = state.history.past.slice(0, -1);

      return {
        ...previous,
        history: {
          past: newPast,
          future: [state, ...state.history.future],
        },
      };
    }

    case 'REDO': {
      if (state.history.future.length === 0) {
        return state;
      }

      const next = state.history.future[0];
      const newFuture = state.history.future.slice(1);

      return {
        ...next,
        history: {
          past: [...state.history.past, state],
          future: newFuture,
        },
      };
    }

    case 'CLEAR_HISTORY': {
      return {
        ...state,
        history: {
          past: [],
          future: [],
        },
      };
    }

    // ========================================================================
    // Loading/Error Actions
    // ========================================================================

    case 'SET_LOADING': {
      return {
        ...state,
        loading: action.payload,
      };
    }

    case 'SET_ERROR': {
      return {
        ...state,
        error: action.payload,
      };
    }

    // ========================================================================
    // Network/Node Actions (Multi-Node Support)
    // ========================================================================

    case 'NODES_UPDATED': {
      const nodes = action.payload;
      const nodesById = nodes.reduce(
        (acc, node) => {
          acc[node.node_id] = node;
          return acc;
        },
        {} as Record<string, typeof nodes[0]>
      );

      return {
        ...state,
        network: {
          ...state.network,
          nodes: nodesById,
        },
      };
    }

    case 'SELECT_NODE': {
      return {
        ...state,
        network: {
          ...state.network,
          nodeSelection: {
            ...state.network.nodeSelection,
            current_node_id: action.payload,
          },
        },
      };
    }

    case 'SET_VIEW_MODE': {
      return {
        ...state,
        network: {
          ...state.network,
          nodeSelection: {
            ...state.network.nodeSelection,
            view_mode: action.payload,
            selected_node_ids: normalizeSelectedNodeIds(state.network.nodeSelection.selected_node_ids),
          },
        },
      };
    }

    case 'TOGGLE_NODE_SELECTION': {
      const nodeId = action.payload;
      const selected = normalizeSelectedNodeIds(state.network.nodeSelection.selected_node_ids);
      const isSelected = selected.includes(nodeId);

      return {
        ...state,
        network: {
          ...state.network,
          nodeSelection: {
            ...state.network.nodeSelection,
            selected_node_ids: isSelected
              ? selected.filter((id) => id !== nodeId)
              : normalizeSelectedNodeIds([...selected, nodeId]),
          },
        },
      };
    }

    case 'SET_SHOW_OFFLINE_NODES': {
      return {
        ...state,
        network: {
          ...state.network,
          nodeSelection: {
            ...state.network.nodeSelection,
            show_offline: action.payload,
            selected_node_ids: normalizeSelectedNodeIds(state.network.nodeSelection.selected_node_ids),
          },
        },
      };
    }

    case 'TOPOLOGY_UPDATED': {
      return {
        ...state,
        network: {
          ...state.network,
          topology: action.payload,
        },
      };
    }

    case 'SYNC_STATUS_UPDATED': {
      return {
        ...state,
        network: {
          ...state.network,
          syncStatus: action.payload,
        },
      };
    }

    case 'CROSS_NODE_ROUTE_UPDATED': {
      const route = action.payload;
      return {
        ...state,
        network: {
          ...state.network,
          crossNodeRoutes: {
            ...state.network.crossNodeRoutes,
            [route.route_id]: route,
          },
        },
      };
    }

    case 'CROSS_NODE_ROUTES_SYNCED': {
      const crossNodeRoutes = action.payload.reduce(
        (acc, route) => {
          acc[route.route_id] = route;
          return acc;
        },
        {} as Record<string, typeof action.payload[number]>
      );

      return {
        ...state,
        network: {
          ...state.network,
          crossNodeRoutes,
        },
      };
    }

    case 'SET_LOCAL_NODE_ID': {
      return {
        ...state,
        network: {
          ...state.network,
          nodeSelection: {
            ...state.network.nodeSelection,
            local_node_id: action.payload,
          },
        },
      };
    }

    default:
      return state;
  }
}
