/**
 * T2500-MV-D2 — pure helpers for the canvas particle/heatmap overlay.
 *
 * These are split from the canvas component so they can be unit-tested
 * without a DOM. The canvas component owns the rAF loop + drawing
 * primitives; this module owns the particle math + color/thickness
 * mapping.
 */

import { edgeKey, type MidiVisualizationEdgeData } from './midiVisualizationLayout'
import type { MidiVisualizationEvent } from './midiVisualizationTypes'

/** Time in ms a particle takes to traverse its edge end to end. */
export const PARTICLE_LIFESPAN_MS = 1_000
/** Maximum live particles per edge. Anything above is dropped. */
export const PARTICLE_CAP_PER_EDGE = 50
/** Rolling window for the heatmap saturation calc, in ms. */
export const HEATMAP_WINDOW_MS = 5_000

export interface Particle {
  /** Spawn time, ms epoch. */
  spawnedAt: number
  /** Source node id (one end of the edge). */
  sourceId: string
  /** Target node id (other end of the edge). */
  targetId: string
  /** Event kind drives color (raw=blue, dispatched=magenta). */
  kind: 'raw' | 'dispatched'
}

export type ParticleLane = Map<string, Particle[]>

/** Append a particle onto its edge's lane, enforcing the per-edge cap. */
export function pushParticle(
  lanes: ParticleLane,
  event: MidiVisualizationEvent,
  spawnedAt: number,
): void {
  const key = edgeKey(event.source_node_id, event.target_node_id)
  let queue = lanes.get(key)
  if (!queue) {
    queue = []
    lanes.set(key, queue)
  }
  if (queue.length >= PARTICLE_CAP_PER_EDGE) {
    // Drop the oldest particle to make room — keeps the visual density
    // bounded under sustained burst.
    queue.shift()
  }
  queue.push({
    spawnedAt,
    sourceId: event.source_node_id,
    targetId: event.target_node_id,
    kind: event.kind,
  })
}

/** Drop particles whose lifespan has elapsed and lanes that go empty. */
export function pruneParticles(lanes: ParticleLane, now: number): void {
  const cutoff = now - PARTICLE_LIFESPAN_MS
  const emptyKeys: string[] = []
  for (const [key, queue] of lanes.entries()) {
    while (queue.length > 0 && queue[0].spawnedAt < cutoff) {
      queue.shift()
    }
    if (queue.length === 0) emptyKeys.push(key)
  }
  for (const k of emptyKeys) lanes.delete(k)
}

/** Map rolling rate → stroke width in px. Linear ramp 0..16 evt/s. */
export function rateToThickness(
  rateHz: number,
  intensity: number,
): number {
  const clamped = Math.max(0, Math.min(rateHz, 16))
  const t = clamped / 16
  // Base 1.0 → max 6.0 px stroke. Intensity damps the upper range.
  return 1 + 5 * t * Math.max(0, Math.min(intensity, 1))
}

/** Map rolling rate → heatmap rgba color. Cool blue → warm magenta. */
export function rateToHeatmapColor(
  rateHz: number,
  intensity: number,
): { r: number; g: number; b: number; a: number } {
  const t = Math.max(0, Math.min(rateHz / 16, 1))
  const a = 0.25 + 0.55 * t * Math.max(0, Math.min(intensity, 1))
  // Lerp blue (#0f62fe) → magenta (#ee5396).
  const r = Math.round(15 + (238 - 15) * t)
  const g = Math.round(98 + (83 - 98) * t)
  const b = Math.round(254 + (150 - 254) * t)
  return { r, g, b, a }
}

/** Linear progress 0..1 for a particle on its edge at time `now`. */
export function particleProgress(
  particle: Particle,
  now: number,
): number {
  const elapsed = now - particle.spawnedAt
  if (elapsed <= 0) return 0
  if (elapsed >= PARTICLE_LIFESPAN_MS) return 1
  return elapsed / PARTICLE_LIFESPAN_MS
}

/** Lerp helper for canvas point math. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Total particle count across all lanes — useful for tests. */
export function totalParticleCount(lanes: ParticleLane): number {
  let n = 0
  for (const q of lanes.values()) n += q.length
  return n
}

/** Convenience: map an edge activity record to its visible state vector. */
export function edgeVisualState(
  data: MidiVisualizationEdgeData | undefined,
  intensity: number,
): {
  thickness: number
  color: { r: number; g: number; b: number; a: number }
} {
  const rate = data?.rateHz ?? 0
  return {
    thickness: rateToThickness(rate, intensity),
    color: rateToHeatmapColor(rate, intensity),
  }
}
