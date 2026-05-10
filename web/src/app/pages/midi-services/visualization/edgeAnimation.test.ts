/**
 * T2500-MV-D2 — edge animation helpers tests.
 */

import {
  PARTICLE_CAP_PER_EDGE,
  PARTICLE_LIFESPAN_MS,
  edgeVisualState,
  particleProgress,
  pruneParticles,
  pushParticle,
  rateToHeatmapColor,
  rateToThickness,
  totalParticleCount,
} from './edgeAnimation'

function makeEvent(
  source: string,
  target: string,
  ts: number,
  kind: 'raw' | 'dispatched' = 'raw',
) {
  return {
    kind,
    source_node_id: source,
    target_node_id: target,
    ts_ms: ts,
  }
}

describe('pushParticle / pruneParticles', () => {
  it('adds particles and prunes after lifespan', () => {
    const lanes = new Map()
    pushParticle(lanes, makeEvent('a', 'b', 0), 0)
    pushParticle(lanes, makeEvent('a', 'b', 100), 100)
    expect(totalParticleCount(lanes)).toBe(2)

    pruneParticles(lanes, PARTICLE_LIFESPAN_MS + 50)
    // Both particles older than lifespan from t=PARTICLE_LIFESPAN_MS+50
    // (oldest spawned at 0, age = lifespan+50; second spawned at 100,
    // age = lifespan-50 → still alive).
    expect(totalParticleCount(lanes)).toBe(1)
  })

  it('drops the oldest particle when the per-edge cap fills', () => {
    const lanes = new Map()
    for (let i = 0; i < PARTICLE_CAP_PER_EDGE + 5; i += 1) {
      pushParticle(lanes, makeEvent('a', 'b', i), i)
    }
    expect(totalParticleCount(lanes)).toBe(PARTICLE_CAP_PER_EDGE)
    const queue = lanes.get('a=>b')!
    // First five particles got dropped.
    expect(queue[0].spawnedAt).toBe(5)
  })

  it('removes empty lanes during prune', () => {
    const lanes = new Map()
    pushParticle(lanes, makeEvent('a', 'b', 0), 0)
    pruneParticles(lanes, PARTICLE_LIFESPAN_MS + 1)
    expect(lanes.size).toBe(0)
  })
})

describe('particleProgress', () => {
  it('returns 0 at spawn and 1 at end of lifespan', () => {
    const p = { spawnedAt: 1000, sourceId: 'a', targetId: 'b', kind: 'raw' as const }
    expect(particleProgress(p, 1000)).toBe(0)
    expect(particleProgress(p, 1000 + PARTICLE_LIFESPAN_MS)).toBe(1)
    expect(particleProgress(p, 1000 + PARTICLE_LIFESPAN_MS / 2)).toBeCloseTo(0.5)
  })

  it('clamps below zero and above one', () => {
    const p = { spawnedAt: 1000, sourceId: 'a', targetId: 'b', kind: 'raw' as const }
    expect(particleProgress(p, 999)).toBe(0)
    expect(particleProgress(p, 1000 + PARTICLE_LIFESPAN_MS * 5)).toBe(1)
  })
})

describe('rateToThickness', () => {
  it('grows monotonically with rate up to 16 Hz', () => {
    expect(rateToThickness(0, 1)).toBe(1)
    expect(rateToThickness(16, 1)).toBe(6)
    expect(rateToThickness(8, 1)).toBeGreaterThan(rateToThickness(2, 1))
  })

  it('damps with intensity in [0..1]', () => {
    expect(rateToThickness(16, 0)).toBe(1)
    expect(rateToThickness(16, 0.5)).toBeLessThan(rateToThickness(16, 1))
  })
})

describe('rateToHeatmapColor', () => {
  it('is cool at zero rate and warm at high rate', () => {
    const cold = rateToHeatmapColor(0, 1)
    const hot = rateToHeatmapColor(16, 1)
    expect(cold.b).toBeGreaterThan(hot.b)  // less blue when hot
    expect(hot.r).toBeGreaterThan(cold.r)  // more red when hot
    expect(hot.a).toBeGreaterThan(cold.a)  // more opaque when hot
  })
})

describe('edgeVisualState', () => {
  it('handles undefined edge activity gracefully', () => {
    const out = edgeVisualState(undefined, 1)
    expect(out.thickness).toBe(1)
    expect(out.color.a).toBeGreaterThan(0)
  })
})
