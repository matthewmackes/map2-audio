/**
 * T2503 Set 10 — local DAW project store.
 *
 * Mirrors the engine-side project model from Set 5 (app/schemas/daw.py +
 * project.json schema) for the React UI. The store is in-memory only —
 * the WebSocket /api/v1/daw/events stream is the eventual hydration source
 * (Sets 7+); for now mutations are mirrored locally after the verb succeeds
 * so every sub-area shares the same view of tracks / clips / plugins /
 * automation.
 *
 * Persistence: project state lives engine-side under ~/.map2/daw/<project>/.
 * Reload restores from there via daw.project.load.
 */
import { create } from 'zustand'

import type { TrackType } from '../../map2/clients/daw'

export type DawTrackType = TrackType

export interface DawPluginInstance {
  slot_index: number
  uri: string
  display_name: string
  bypass: boolean
  params: Record<string, number>
}

export interface DawClip {
  id: number
  track_id: number
  start_samples: number
  length_samples: number
  source: string
}

export interface DawAutomationPoint {
  position_beats: number
  value: number
}

export interface DawAutomationLane {
  id: number
  target_kind: string
  target_id: string
  points: DawAutomationPoint[]
}

export interface DawTrack {
  id: number
  type: DawTrackType
  name: string
  armed: boolean
  muted: boolean
  solo: boolean
  plugins: DawPluginInstance[]
}

export interface DawProjectState {
  active_project: string | null
  tracks: DawTrack[]
  clips: DawClip[]
  automation_lanes: DawAutomationLane[]
  next_track_id: number
  next_clip_id: number
  next_lane_id: number

  setActiveProject: (name: string | null) => void
  createTrack: (type: DawTrackType, name?: string) => DawTrack
  deleteTrack: (trackId: number) => void
  setTrackArm: (trackId: number, armed: boolean) => void
  setTrackMute: (trackId: number, muted: boolean) => void
  setTrackSolo: (trackId: number, solo: boolean) => void
  renameTrack: (trackId: number, name: string) => void

  addClip: (clip: Omit<DawClip, 'id'>) => DawClip
  removeClip: (clipId: number) => void

  addPlugin: (trackId: number, uri: string, displayName: string) => DawPluginInstance | null
  removePlugin: (trackId: number, slotIndex: number) => void
  setPluginParam: (trackId: number, slotIndex: number, paramKey: string, value: number) => void
  setPluginBypass: (trackId: number, slotIndex: number, bypass: boolean) => void

  upsertAutomationLane: (targetKind: string, targetId: string) => DawAutomationLane
  setAutomationPoint: (laneId: number, position_beats: number, value: number) => void

  reset: () => void
}

function makeDefaultName(type: DawTrackType, index: number): string {
  return type === 'audio' ? `Audio ${index + 1}` : `MIDI ${index + 1}`
}

export const useDawProjectStore = create<DawProjectState>((set, get) => ({
  active_project: null,
  tracks: [],
  clips: [],
  automation_lanes: [],
  next_track_id: 0,
  next_clip_id: 0,
  next_lane_id: 0,

  setActiveProject: (name) => set({ active_project: name }),

  createTrack: (type, name) => {
    const state = get()
    const track: DawTrack = {
      id: state.next_track_id,
      type,
      name: name?.trim() || makeDefaultName(type, state.tracks.length),
      armed: false,
      muted: false,
      solo: false,
      plugins: [],
    }
    set({
      tracks: [...state.tracks, track],
      next_track_id: state.next_track_id + 1,
    })
    return track
  },

  deleteTrack: (trackId) => set((state) => ({
    tracks: state.tracks.filter((t) => t.id !== trackId),
    clips: state.clips.filter((c) => c.track_id !== trackId),
  })),

  setTrackArm: (trackId, armed) => set((state) => ({
    tracks: state.tracks.map((t) => (t.id === trackId ? { ...t, armed } : t)),
  })),

  setTrackMute: (trackId, muted) => set((state) => ({
    tracks: state.tracks.map((t) => (t.id === trackId ? { ...t, muted } : t)),
  })),

  setTrackSolo: (trackId, solo) => set((state) => ({
    tracks: state.tracks.map((t) => (t.id === trackId ? { ...t, solo } : t)),
  })),

  renameTrack: (trackId, name) => set((state) => ({
    tracks: state.tracks.map((t) => (t.id === trackId ? { ...t, name: name.trim() || t.name } : t)),
  })),

  addClip: (clip) => {
    const state = get()
    const created: DawClip = { ...clip, id: state.next_clip_id }
    set({ clips: [...state.clips, created], next_clip_id: state.next_clip_id + 1 })
    return created
  },

  removeClip: (clipId) => set((state) => ({
    clips: state.clips.filter((c) => c.id !== clipId),
  })),

  addPlugin: (trackId, uri, displayName) => {
    const state = get()
    const track = state.tracks.find((t) => t.id === trackId)
    if (!track) {
      return null
    }
    const slotIndex = track.plugins.length
    const instance: DawPluginInstance = {
      slot_index: slotIndex,
      uri,
      display_name: displayName,
      bypass: false,
      params: {},
    }
    set({
      tracks: state.tracks.map((t) =>
        t.id === trackId ? { ...t, plugins: [...t.plugins, instance] } : t,
      ),
    })
    return instance
  },

  removePlugin: (trackId, slotIndex) => set((state) => ({
    tracks: state.tracks.map((t) =>
      t.id === trackId
        ? {
            ...t,
            plugins: t.plugins
              .filter((p) => p.slot_index !== slotIndex)
              .map((p, idx) => ({ ...p, slot_index: idx })),
          }
        : t,
    ),
  })),

  setPluginParam: (trackId, slotIndex, paramKey, value) => set((state) => ({
    tracks: state.tracks.map((t) =>
      t.id === trackId
        ? {
            ...t,
            plugins: t.plugins.map((p) =>
              p.slot_index === slotIndex
                ? { ...p, params: { ...p.params, [paramKey]: value } }
                : p,
            ),
          }
        : t,
    ),
  })),

  setPluginBypass: (trackId, slotIndex, bypass) => set((state) => ({
    tracks: state.tracks.map((t) =>
      t.id === trackId
        ? {
            ...t,
            plugins: t.plugins.map((p) =>
              p.slot_index === slotIndex ? { ...p, bypass } : p,
            ),
          }
        : t,
    ),
  })),

  upsertAutomationLane: (targetKind, targetId) => {
    const state = get()
    const existing = state.automation_lanes.find(
      (l) => l.target_kind === targetKind && l.target_id === targetId,
    )
    if (existing) {
      return existing
    }
    const lane: DawAutomationLane = {
      id: state.next_lane_id,
      target_kind: targetKind,
      target_id: targetId,
      points: [],
    }
    set({
      automation_lanes: [...state.automation_lanes, lane],
      next_lane_id: state.next_lane_id + 1,
    })
    return lane
  },

  setAutomationPoint: (laneId, position_beats, value) => set((state) => ({
    automation_lanes: state.automation_lanes.map((lane) => {
      if (lane.id !== laneId) {
        return lane
      }
      const existingIndex = lane.points.findIndex(
        (p) => Math.abs(p.position_beats - position_beats) < 1e-6,
      )
      const points = existingIndex >= 0
        ? lane.points.map((p, i) => (i === existingIndex ? { position_beats, value } : p))
        : [...lane.points, { position_beats, value }].sort(
            (a, b) => a.position_beats - b.position_beats,
          )
      return { ...lane, points }
    }),
  })),

  reset: () => set({
    active_project: null,
    tracks: [],
    clips: [],
    automation_lanes: [],
    next_track_id: 0,
    next_clip_id: 0,
    next_lane_id: 0,
  }),
}))
