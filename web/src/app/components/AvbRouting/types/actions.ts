/**
 * Routing Action Type Definitions
 *
 * All state mutations are represented as actions dispatched to the reducer.
 * This ensures predictability, debuggability, and time-travel capabilities.
 */

import type { Endpoint } from './endpoint';
import type { Route } from './route';
import type { Scene } from './scene';
import type { FilterState } from './state';
import type { PatchOperation } from './route';

/**
 * Connection actions
 */
export type PatchAction = {
  type: 'PATCH';
  payload: {
    talker_id: string;
    listener_id: string;
  };
};

export type UnpatchAction = {
  type: 'UNPATCH';
  payload: {
    route_id: string;
  };
};

export type BatchPatchAction = {
  type: 'BATCH_PATCH';
  payload: {
    operations: PatchOperation[];
  };
};

/**
 * Locking actions
 */
export type LockRouteAction = {
  type: 'LOCK_ROUTE';
  payload: {
    route_id: string;
    reason: string;
  };
};

export type UnlockRouteAction = {
  type: 'UNLOCK_ROUTE';
  payload: {
    route_id: string;
  };
};

export type LockEndpointAction = {
  type: 'LOCK_ENDPOINT';
  payload: {
    endpoint_id: string;
    reason: string;
  };
};

export type UnlockEndpointAction = {
  type: 'UNLOCK_ENDPOINT';
  payload: {
    endpoint_id: string;
  };
};

/**
 * Safe patch actions
 */
export type EnterSafeModeAction = {
  type: 'ENTER_SAFE_MODE';
};

export type ApplySafeChangesAction = {
  type: 'APPLY_SAFE_CHANGES';
};

export type DiscardSafeChangesAction = {
  type: 'DISCARD_SAFE_CHANGES';
};

/**
 * Scene actions
 */
export type SaveSceneAction = {
  type: 'SAVE_SCENE';
  payload: {
    name: string;
    description: string;
    tags: string[];
  };
};

export type RecallSceneAction = {
  type: 'RECALL_SCENE';
  payload: {
    scene_id: string;
  };
};

export type DeleteSceneAction = {
  type: 'DELETE_SCENE';
  payload: {
    scene_id: string;
  };
};

/**
 * UI state actions
 */
export type SetFiltersAction = {
  type: 'SET_FILTERS';
  payload: Partial<FilterState>;
};

export type SetSearchAction = {
  type: 'SET_SEARCH';
  payload: string;
};

export type SetBankAction = {
  type: 'SET_BANK';
  payload: {
    talkers?: number;
    listeners?: number;
  };
};

export type SelectEndpointAction = {
  type: 'SELECT_ENDPOINT';
  payload: string; // endpoint_id
};

export type SelectRouteAction = {
  type: 'SELECT_ROUTE';
  payload: string; // route_id
};

export type ClearSelectionAction = {
  type: 'CLEAR_SELECTION';
};

export type HoverCellAction = {
  type: 'HOVER_CELL';
  payload: {
    talker_id: string;
    listener_id: string;
  } | null;
};

export type FocusCellAction = {
  type: 'FOCUS_CELL';
  payload: {
    talker_id: string;
    listener_id: string;
  } | null;
};

/**
 * Endpoint metadata actions
 */
export type UpdateEndpointLabelAction = {
  type: 'UPDATE_ENDPOINT_LABEL';
  payload: {
    endpoint_id: string;
    label: string;
  };
};

export type UpdateEndpointTagsAction = {
  type: 'UPDATE_ENDPOINT_TAGS';
  payload: {
    endpoint_id: string;
    tags: string[];
  };
};

export type UpdateEndpointColorAction = {
  type: 'UPDATE_ENDPOINT_COLOR';
  payload: {
    endpoint_id: string;
    color: string;
  };
};

/**
 * Data sync actions (from API/WebSocket)
 */
export type EndpointsUpdatedAction = {
  type: 'ENDPOINTS_UPDATED';
  payload: Endpoint[];
};

export type ConnectionsUpdatedAction = {
  type: 'CONNECTIONS_UPDATED';
  payload: Route[];
};

export type StatusUpdateAction = {
  type: 'STATUS_UPDATE';
  payload: {
    endpoint_id: string;
    available: boolean;
  };
};

export type ConnectionStateChangeAction = {
  type: 'CONNECTION_STATE_CHANGE';
  payload: {
    route_id: string;
    state: import('./route').ConnectionState;
    error_message?: string;
  };
};

/**
 * History actions
 */
export type UndoAction = {
  type: 'UNDO';
};

export type RedoAction = {
  type: 'REDO';
};

export type ClearHistoryAction = {
  type: 'CLEAR_HISTORY';
};

/**
 * Loading/error actions
 */
export type SetLoadingAction = {
  type: 'SET_LOADING';
  payload: boolean;
};

export type SetErrorAction = {
  type: 'SET_ERROR';
  payload: string | null;
};

/**
 * Union of all action types
 */
export type RoutingAction =
  | PatchAction
  | UnpatchAction
  | BatchPatchAction
  | LockRouteAction
  | UnlockRouteAction
  | LockEndpointAction
  | UnlockEndpointAction
  | EnterSafeModeAction
  | ApplySafeChangesAction
  | DiscardSafeChangesAction
  | SaveSceneAction
  | RecallSceneAction
  | DeleteSceneAction
  | SetFiltersAction
  | SetSearchAction
  | SetBankAction
  | SelectEndpointAction
  | SelectRouteAction
  | ClearSelectionAction
  | HoverCellAction
  | FocusCellAction
  | UpdateEndpointLabelAction
  | UpdateEndpointTagsAction
  | UpdateEndpointColorAction
  | EndpointsUpdatedAction
  | ConnectionsUpdatedAction
  | StatusUpdateAction
  | ConnectionStateChangeAction
  | UndoAction
  | RedoAction
  | ClearHistoryAction
  | SetLoadingAction
  | SetErrorAction;
